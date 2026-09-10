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
  batchesCreated?: number;
  productsSkipped?: { name: string; reason: string }[];
  productsTotal?: number;
  productsAlreadyImported?: boolean;
  salesCreated?: number;
  salesSkipped?: { name: string; reason: string }[];
  salesTotal?: number;
  salesAlreadyImported?: boolean;
}

/**
 * Format khusus template warung ini. Melakukan 2 hal:
 *
 * 1. Barang Masuk: SETIAP BARIS di file jadi BATCH-nya SENDIRI (bukan
 *    digabung jadi 1 per nama produk) - persis seperti restock manual
 *    berkali-kali lewat aplikasi. Produk dengan nama yang sama (huruf
 *    besar/kecil diabaikan) otomatis dianggap satu produk, baris
 *    berikutnya jadi batch/restock tambahan untuk produk itu. Cuma bisa
 *    dijalankan SEKALI untuk seluruh database (baris kedua & seterusnya
 *    otomatis dilewati kalau diulang, supaya tidak dobel stok).
 *
 * 2. Penjualan: setiap baris di file Penjualan BENAR-BENAR memotong stok
 *    dari batch FIFO yang tepat (mesin yang sama dengan transaksi Kasir
 *    asli) - bukan cuma dicatat sebagai riwayat. Harga yang dicatat tetap
 *    memakai angka ASLI dari file CSV kamu, supaya laporan untung/rugi
 *    historis akurat. Nama pembeli yang kosong otomatis "diwariskan" dari
 *    baris terakhir yang ada namanya.
 */
export async function importLegacyCsv(masukCsvText: string, jualCsvText: string, gramProductNamesRaw: string = ''): Promise<ImportResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Kamu harus login untuk melakukan import.' };

  try {
    const masukRows = readCsvAsObjects(masukCsvText, 3).filter((r) => cleanName(r['Nama Barang']));
    const jualRows = jualCsvText.trim() ? readCsvAsObjects(jualCsvText, 3).filter((r) => cleanName(r['Nama Produk'])) : [];

    if (!masukRows.length && !jualRows.length) {
      return { ok: false, error: 'Upload minimal salah satu file (Barang Masuk atau Penjualan) dengan format yang sesuai.' };
    }

    // Nama produk yang harus dianggap satuan GRAM (timbangan), bukan pcs.
    // Untuk produk ini, kolom Qty di CSV dibaca sebagai GRAM langsung (misal
    // 1000 = 1 kg), dan kolom harga dianggap harga per KILOGRAM (dikonversi
    // otomatis jadi per-gram untuk disimpan).
    const gramNames = new Set(
      gramProductNamesRaw
        .split(/[\n,]/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    );
    function isGramProduct(name: string): boolean {
      return gramNames.has(name.toLowerCase());
    }

    // ---------- 1. Barang Masuk: satu item per BARIS (bukan digabung) ----------
    const masukSeenNames = new Set<string>(); // buat deteksi produk "terjual tapi tidak pernah masuk"
    const masukDateKeys = masukRows.map((r) => cleanDate(r['Tanggal Masuk']) || new Date().toISOString().slice(0, 10));
    const masukTimes = assignSyntheticTimes(masukDateKeys, 7); // barang masuk: mulai jam 07:00

    const productItems: any[] = masukRows.map((r, i) => {
      const name = cleanName(r['Nama Barang'])!;
      masukSeenNames.add(name.toLowerCase());
      const gram = isGramProduct(name);
      const buy = cleanMoney(r['Harga Modal']) || 0;
      const sell = cleanMoney(r['Harga Jual']) || 0;
      return {
        name,
        unit_type: gram ? 'gram' : 'pcs',
        qty: cleanQty(r['Qty']),
        buy_price: gram ? buy / 1000 : buy,
        sell_price: gram ? sell / 1000 : sell,
        expiry_date: cleanDate(r['Tanggal Expired']),
        received_at: masukTimes[i],
      };
    });

    // Produk yang tercatat terjual tapi tidak pernah ada riwayat masuk di data lama
    // -> tetap dibuat (stok 0) supaya penjualannya bisa direkam & tidak hilang.
    const terjualNamesSeen = new Set<string>();
    for (const r of jualRows) {
      const name = cleanName(r['Nama Produk']);
      if (!name) continue;
      const key = name.toLowerCase();
      if (!terjualNamesSeen.has(key) && !masukSeenNames.has(key)) {
        terjualNamesSeen.add(key);
        productItems.push({ name, unit_type: isGramProduct(name) ? 'gram' : 'pcs', qty: 0, buy_price: 0, sell_price: 0 });
      }
    }

    let productResult: any = { created_products: 0, created_batches: 0, skipped: [], already_imported: false };
    if (productItems.length) {
      const { data, error } = await supabase.rpc('bulk_import_products', { p_items: productItems });
      if (error) return { ok: false, error: error.message };
      productResult = data;
    }

    // ---------- 2. Import riwayat penjualan (baris asli, memotong stok FIFO) ----------
    let salesResult: { created?: number; skipped?: any[]; already_imported?: boolean } | null = null;
    if (jualRows.length) {
      let lastBuyer: string | null = null;
      const buyers = jualRows.map((r) => {
        const explicit = cleanName(r['Nama Pembeli']);
        if (explicit) lastBuyer = explicit;
        return explicit || lastBuyer;
      });

      const saleDateKeys = jualRows.map((r) => cleanDate(r['Tanggal Keluar']));
      const saleTimes = assignSyntheticTimes(saleDateKeys, 9); // penjualan: mulai jam 09:00

      const salesItems = jualRows
        .map((r, i) => {
          const name = cleanName(r['Nama Produk']) || '';
          const gram = isGramProduct(name);
          const price = cleanMoney(r['Harga Jual']) || 0;
          const cost = cleanMoney(r['Harga Modal']) || 0;
          return {
            product_name: name,
            qty: cleanQty(r['Qty']),
            unit_price: gram ? price / 1000 : price,
            unit_cost: gram ? cost / 1000 : cost,
            buyer_name: buyers[i],
            sold_at: saleTimes[i],
          };
        })
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
      productsCreated: productResult.created_products,
      batchesCreated: productResult.created_batches,
      productsSkipped: productResult.skipped,
      productsTotal: productItems.length,
      productsAlreadyImported: productResult.already_imported,
      salesCreated: salesResult?.created ?? 0,
      salesSkipped: salesResult?.skipped ?? [],
      salesTotal: jualRows.length,
      salesAlreadyImported: salesResult?.already_imported ?? false,
    };
  } catch (e: any) {
    return { ok: false, error: 'Gagal memproses file: ' + (e?.message || 'error tidak diketahui') };
  }
}
