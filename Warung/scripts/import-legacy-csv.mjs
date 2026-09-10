// scripts/import-legacy-csv.mjs
//
// Mengimpor data lama (file CSV "Barang Masuk" & "Penjualan") ke Supabase,
// dipakai SEKALI SAJA saat pindahan dari pencatatan manual/Excel ke sistem ini.
//
// Cara pakai:
//   node --env-file=.env.local scripts/import-legacy-csv.mjs <path-barang-masuk.csv> <path-penjualan.csv>
//
// Catatan penting:
// - Semua produk hasil import dibuat sebagai satuan "pcs". Produk yang kamu
//   jual timbangan (telur, kemiri, lada, dst) sebaiknya ditambahkan ULANG
//   secara manual lewat menu "Barang Masuk" > "Produk Baru" dengan jenis
//   satuan "gram", supaya fitur harga per gram jalan dengan benar.
// - Script ini butuh SUPABASE_SERVICE_ROLE_KEY (bukan anon key) karena harus
//   menembus Row Level Security. Jangan pernah taruh service role key di
//   kode frontend / commit ke git.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const [, , masukPath, jualPath] = process.argv;

if (!masukPath || !jualPath) {
  console.error('Pemakaian: node --env-file=.env.local scripts/import-legacy-csv.mjs <barang-masuk.csv> <penjualan.csv>');
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib ada di .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const MONTH_MAP = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', Mei: '05', Jun: '06', Jul: '07', Agu: '08', Sep: '09', Okt: '10', Nov: '11', Des: '12' };

function cleanMoney(v) {
  if (v == null) return null;
  let s = String(v).trim();
  if (s === '' || s === '-') return null;
  const neg = s.startsWith('-');
  s = s.replace(/Rp/gi, '').replace(/\./g, '').replace('-', '').trim();
  if (s === '') return null;
  const n = parseInt(s, 10);
  if (Number.isNaN(n)) return null;
  return neg ? -n : n;
}
function cleanDate(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === '' || s === '-') return null;
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(s);
  if (!m) return null;
  const [, day, mon, year] = m;
  const monNum = MONTH_MAP[mon];
  if (!monNum) return null;
  return `${year}-${monNum}-${day.padStart(2, '0')}`;
}
function cleanName(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s+/g, ' ');
  return s || null;
}
function cleanQty(v) {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isNaN(n) ? 0 : n;
}

/** Parser CSV sederhana yang menangani field bertanda kutip. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c === '\r') {
      // skip
    } else {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function readCsvAsObjects(path, skipRows) {
  const raw = readFileSync(path, 'utf-8');
  const rows = parseCsv(raw).filter((r) => r.length > 1 || (r[0] ?? '').trim() !== '');
  const dataRows = rows.slice(skipRows);
  const header = dataRows[0].map((h) => h.trim());
  return dataRows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = r[i]; });
    return obj;
  });
}

async function main() {
  console.log('Membaca file CSV...');
  const masukRows = readCsvAsObjects(masukPath, 3).filter((r) => cleanName(r['Nama Barang']));
  const jualRows = readCsvAsObjects(jualPath, 3).filter((r) => cleanName(r['Nama Produk']));
  console.log(`  Barang masuk: ${masukRows.length} baris`);
  console.log(`  Penjualan   : ${jualRows.length} baris`);

  // Agregasi barang masuk per nama produk
  const agg = new Map();
  const order = [];
  for (const r of masukRows) {
    const name = cleanName(r['Nama Barang']);
    const qty = cleanQty(r['Qty']);
    const buy = cleanMoney(r['Harga Modal']);
    const sell = cleanMoney(r['Harga Jual']);
    const expiry = cleanDate(r['Tanggal Expired']);
    const receivedAt = cleanDate(r['Tanggal Masuk']) || new Date().toISOString().slice(0, 10);

    if (!agg.has(name)) { agg.set(name, { name, totalQty: 0, buy: 0, sell: 0, expiry: null, receivedAt }); order.push(name); }
    const a = agg.get(name);
    a.totalQty += qty;
    if (buy != null) a.buy = buy;
    if (sell != null) a.sell = sell;
    if (expiry) a.expiry = expiry;
    if (receivedAt) a.receivedAt = receivedAt;
  }

  const terjualPerProduk = new Map();
  for (const r of jualRows) {
    const name = cleanName(r['Nama Produk']);
    const qty = cleanQty(r['Qty']);
    terjualPerProduk.set(name, (terjualPerProduk.get(name) || 0) + qty);
  }

  console.log('\nMembuat produk di Supabase (via RPC create_product_with_batch)...');
  let created = 0;
  let skippedNoStock = 0;
  const nameToProductId = new Map();

  for (const name of order) {
    const a = agg.get(name);
    const terjual = terjualPerProduk.get(name) || 0;
    let stokAwal = a.totalQty - terjual;
    if (stokAwal < 0) stokAwal = 0; // data lama kadang tidak konsisten; jangan buat batch negatif

    const { data, error } = await supabase.rpc('create_product_with_batch', {
      p_name: name,
      p_category: null,
      p_unit_type: 'pcs',
      p_low_stock_threshold: 3,
      p_qty: stokAwal,
      p_buy_price: a.buy || 0,
      p_sell_price: a.sell || 0,
      p_expiry_date: a.expiry,
      p_received_at: a.receivedAt,
    });

    if (error) {
      console.error(`  GAGAL "${name}":`, error.message);
      continue;
    }
    nameToProductId.set(name, data.id);
    created++;
    if (stokAwal === 0 && a.totalQty > 0) skippedNoStock++;
  }

  // Produk yang terjual tapi tidak pernah tercatat masuk (data lama tidak lengkap)
  const extra = [...terjualPerProduk.keys()].filter((n) => !agg.has(n));
  for (const name of extra) {
    const { data, error } = await supabase.rpc('create_product_with_batch', {
      p_name: name,
      p_category: null,
      p_unit_type: 'pcs',
      p_low_stock_threshold: 3,
      p_qty: 0,
      p_buy_price: 0,
      p_sell_price: 0,
      p_expiry_date: null,
      p_received_at: new Date().toISOString().slice(0, 10),
    });
    if (error) { console.error(`  GAGAL "${name}":`, error.message); continue; }
    nameToProductId.set(name, data.id);
    created++;
    console.warn(`  Catatan: "${name}" tercatat terjual (${terjualPerProduk.get(name)}) tapi tidak ada riwayat masuk. Dibuat dengan stok 0 — cek & sesuaikan manual.`);
  }

  console.log(`\nSelesai membuat produk: ${created} produk (${skippedNoStock} di antaranya stok awal disesuaikan ke 0 karena data lama tidak konsisten).`);
  console.log('\nCatatan: Riwayat detail baris-per-baris dari CSV lama TIDAK diimpor satu-satu (hanya diringkas jadi 1 batch awal per produk),');
  console.log('supaya perhitungan stok bersih dan tidak dobel. Riwayat baru akan tercatat rapi mulai dari sekarang lewat aplikasi.');
  console.log('\nSelesai. Buka aplikasi dan cek menu "Produk" untuk memastikan semua data sudah sesuai.');
}

main().catch((e) => { console.error(e); process.exit(1); });
