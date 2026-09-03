'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

const MONTH_MAP: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', Mei: '05', Jun: '06',
  Jul: '07', Agu: '08', Sep: '09', Okt: '10', Nov: '11', Des: '12',
};

function cleanMoney(v: string | undefined): number | null {
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
function cleanDate(v: string | undefined): string | null {
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
function cleanName(v: string | undefined): string | null {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s+/g, ' ');
  return s || null;
}
function cleanQty(v: string | undefined): number {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isNaN(n) ? 0 : n;
}

/** Parser CSV sederhana yang menangani field bertanda kutip. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
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

function readCsvAsObjects(text: string, skipRows: number): Record<string, string>[] {
  const rows = parseCsv(text).filter((r) => r.length > 1 || (r[0] ?? '').trim() !== '');
  const dataRows = rows.slice(skipRows);
  if (!dataRows.length) return [];
  const header = dataRows[0].map((h) => h.trim());
  return dataRows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => { obj[h] = r[i]; });
    return obj;
  });
}

/**
 * Kasih tiap baris jam:menit sintetis berdasarkan urutan baris ASLI di file
 * (baris paling atas = paling lama), supaya kalau ada beberapa baris di
 * tanggal yang sama, urutannya tetap benar walau file sumbernya tidak
 * mencatat jam sama sekali. baseHourOfDay dipakai supaya barang-masuk hari
 * itu (jam mulai pagi) tetap terurut sebelum penjualan hari itu (mulai agak
 * siang) kalau tanggalnya kebetulan sama.
 */
function assignSyntheticTimes(dateKeys: (string | null)[], baseHourOfDay: number): (string | null)[] {
  const counters = new Map<string, number>();
  return dateKeys.map((dateKey) => {
    if (!dateKey) return null;
    const idx = counters.get(dateKey) || 0;
    counters.set(dateKey, idx + 1);
    const totalMinutes = baseHourOfDay * 60 + idx; // +1 menit per baris berikutnya di tanggal yang sama
    const hh = Math.min(23, Math.floor(totalMinutes / 60));
    const mm = totalMinutes % 60;
    return `${dateKey}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
  });
}

export interface ImportResult {
  ok: boolean;
  error?: string;
  productsCreated?: number;
  productsSkipped?: { name: string; reason: string }[];
  productsTotal?: number;
  salesCreated?: number;
  salesSkipped?: { name: string; reason: string }[];
  salesTotal?: number;
  salesAlreadyImported?: boolean;
}

/**
 * Format khusus template warung ini. Melakukan 2 hal:
 * 1. Membuat produk + stok awal bersih (qty masuk dikurangi qty terjual)
 *    lewat bulk_import_products, dengan waktu masuk disusun berdasarkan
 *    urutan baris asli (bukan cuma tanggal).
 * 2. Menyimpan SETIAP baris di file Penjualan sebagai riwayat transaksi asli
 *    lewat bulk_import_sales_history — nama pembeli yang kosong otomatis
 *    "diwariskan" dari baris terakhir yang ada namanya (asumsi: baris tanpa
 *    nama pembeli adalah bagian dari transaksi yang sama dengan baris di
 *    atasnya), dan waktu terjualnya juga disusun berdasarkan urutan baris asli.
 */
export async function importLegacyCsv(masukCsvText: string, jualCsvText: string): Promise<ImportResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Kamu harus login untuk melakukan import.' };

  try {
    const masukRows = readCsvAsObjects(masukCsvText, 3).filter((r) => cleanName(r['Nama Barang']));
    const jualRows = jualCsvText.trim() ? readCsvAsObjects(jualCsvText, 3).filter((r) => cleanName(r['Nama Produk'])) : [];

    if (!masukRows.length) {
      return { ok: false, error: 'File Barang Masuk kosong atau formatnya tidak dikenali. Pastikan ini file CSV export dari template yang sama.' };
    }

    // ---------- 1. Agregasi Barang Masuk -> daftar produk + stok awal ----------
    // Produk dipertahankan dalam urutan KEMUNCULAN PERTAMA di file (dipakai
    // untuk menyusun waktu sintetis di bawah).
    type Agg = { name: string; totalQty: number; buy: number; sell: number; expiry: string | null; receivedAt: string };
    const agg = new Map<string, Agg>();
    const order: string[] = [];

    for (const r of masukRows) {
      const name = cleanName(r['Nama Barang'])!;
      const qty = cleanQty(r['Qty']);
      const buy = cleanMoney(r['Harga Modal']);
      const sell = cleanMoney(r['Harga Jual']);
      const expiry = cleanDate(r['Tanggal Expired']);
      const receivedAt = cleanDate(r['Tanggal Masuk']) || new Date().toISOString().slice(0, 10);

      if (!agg.has(name)) {
        agg.set(name, { name, totalQty: 0, buy: 0, sell: 0, expiry: null, receivedAt });
        order.push(name);
      }
      const a = agg.get(name)!;
      a.totalQty += qty;
      if (buy != null) a.buy = buy;
      if (sell != null) a.sell = sell;
      if (expiry) a.expiry = expiry;
      if (receivedAt) a.receivedAt = receivedAt;
    }

    const terjualPerProduk = new Map<string, number>();
    for (const r of jualRows) {
      const name = cleanName(r['Nama Produk'])!;
      const qty = cleanQty(r['Qty']);
      terjualPerProduk.set(name, (terjualPerProduk.get(name) || 0) + qty);
    }

    // Barang masuk diberi jam mulai 07:00 (pagi) supaya kalau tanggalnya sama
    // dengan penjualan, barang masuk tetap terurut lebih dulu secara logis.
    const productDateKeys = order.map((name) => agg.get(name)!.receivedAt);
    const productTimes = assignSyntheticTimes(productDateKeys, 7);

    const productItems: any[] = order.map((name, i) => {
      const a = agg.get(name)!;
      const terjual = terjualPerProduk.get(name) || 0;
      const stokAwal = Math.max(0, a.totalQty - terjual);
      return {
        name,
        unit_type: 'pcs',
        qty: stokAwal,
        buy_price: a.buy || 0,
        sell_price: a.sell || 0,
        expiry_date: a.expiry,
        received_at: productTimes[i],
      };
    });
    // Produk yang tercatat terjual tapi tidak pernah ada riwayat masuk di data lama
    for (const name of terjualPerProduk.keys()) {
      if (!agg.has(name)) {
        productItems.push({ name, unit_type: 'pcs', qty: 0, buy_price: 0, sell_price: 0 });
      }
    }

    const { data: productResult, error: productError } = await supabase.rpc('bulk_import_products', { p_items: productItems });
    if (productError) return { ok: false, error: productError.message };

    // ---------- 2. Import riwayat penjualan (baris asli, bukan agregat) ----------
    let salesResult: { created?: number; skipped?: any[]; already_imported?: boolean } | null = null;
    if (jualRows.length) {
      // Nama pembeli yang kosong "diwariskan" dari baris terakhir yang ada
      // namanya (baris tanpa nama = masih transaksi yang sama dgn baris di atasnya).
      let lastBuyer: string | null = null;
      const buyers = jualRows.map((r) => {
        const explicit = cleanName(r['Nama Pembeli']);
        if (explicit) lastBuyer = explicit;
        return explicit || lastBuyer;
      });

      // Penjualan diberi jam mulai 09:00 (setelah barang masuk pagi itu).
      const saleDateKeys = jualRows.map((r) => cleanDate(r['Tanggal Keluar']));
      const saleTimes = assignSyntheticTimes(saleDateKeys, 9);

      const salesItems = jualRows
        .map((r, i) => ({
          product_name: cleanName(r['Nama Produk']),
          qty: cleanQty(r['Qty']),
          unit_price: cleanMoney(r['Harga Jual']) || 0,
          unit_cost: cleanMoney(r['Harga Modal']) || 0,
          buyer_name: buyers[i],
          sold_at: saleTimes[i],
        }))
        .filter((it) => it.product_name && it.qty > 0);

      if (salesItems.length) {
        const { data, error } = await supabase.rpc('bulk_import_sales_history', { p_items: salesItems });
        if (error) {
          salesResult = { created: 0, skipped: [{ name: '-', reason: error.message }], already_imported: false };
        } else {
          salesResult = data;
        }
      }
    }

    revalidatePath('/');
    revalidatePath('/produk');
    revalidatePath('/kasir');
    revalidatePath('/riwayat');

    return {
      ok: true,
      productsCreated: productResult.created,
      productsSkipped: productResult.skipped,
      productsTotal: productItems.length,
      salesCreated: salesResult?.created ?? 0,
      salesSkipped: salesResult?.skipped ?? [],
      salesTotal: jualRows.length,
      salesAlreadyImported: salesResult?.already_imported ?? false,
    };
  } catch (e: any) {
    return { ok: false, error: 'Gagal memproses file: ' + (e?.message || 'error tidak diketahui') };
  }
}
