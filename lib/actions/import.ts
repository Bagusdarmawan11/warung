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

export interface ImportResult {
  ok: boolean;
  error?: string;
  created?: number;
  skipped?: { name: string; reason: string }[];
  totalDiproses?: number;
}

/**
 * Format 1: format khusus template warung ini (kolom "Nama Barang"/"Nama
 * Produk", "Qty", "Harga Modal", "Harga Jual", dst, dengan 3 baris judul di
 * atas sebelum header). Semua produk dibuat sebagai satuan pcs — produk
 * timbangan sebaiknya ditambah ulang manual dengan satuan gram.
 */
export async function importLegacyCsv(masukCsvText: string, jualCsvText: string): Promise<ImportResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Kamu harus login untuk melakukan import.' };

  try {
    const masukRows = readCsvAsObjects(masukCsvText, 3).filter((r) => cleanName(r['Nama Barang']));
    const jualRows = jualCsvText ? readCsvAsObjects(jualCsvText, 3).filter((r) => cleanName(r['Nama Produk'])) : [];

    if (!masukRows.length) {
      return { ok: false, error: 'File Barang Masuk kosong atau formatnya tidak dikenali. Pastikan ini file CSV export dari template yang sama.' };
    }

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

    const items: any[] = [];
    for (const name of order) {
      const a = agg.get(name)!;
      const terjual = terjualPerProduk.get(name) || 0;
      const stokAwal = Math.max(0, a.totalQty - terjual);
      items.push({
        name,
        unit_type: 'pcs',
        qty: stokAwal,
        buy_price: a.buy || 0,
        sell_price: a.sell || 0,
        expiry_date: a.expiry,
        received_at: a.receivedAt,
      });
    }
    // Produk yang tercatat terjual tapi tidak pernah ada riwayat masuk di data lama
    for (const name of terjualPerProduk.keys()) {
      if (!agg.has(name)) {
        items.push({ name, unit_type: 'pcs', qty: 0, buy_price: 0, sell_price: 0 });
      }
    }

    const { data, error } = await supabase.rpc('bulk_import_products', { p_items: items });
    if (error) return { ok: false, error: error.message };

    revalidatePath('/');
    revalidatePath('/produk');
    revalidatePath('/kasir');
    revalidatePath('/riwayat');

    return { ok: true, created: data.created, skipped: data.skipped, totalDiproses: items.length };
  } catch (e: any) {
    return { ok: false, error: 'Gagal memproses file: ' + (e?.message || 'error tidak diketahui') };
  }
}
