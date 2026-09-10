'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { SaleRow, StockInHistoryRow } from '@/lib/types';

function revalidateAll() {
  revalidatePath('/', 'layout');
  revalidatePath('/produk');
  revalidatePath('/kasir');
  revalidatePath('/riwayat');
  revalidatePath('/barang-masuk');
}

export interface CheckoutItem {
  productId: string;
  qty: number;
  unitPriceOverride?: number | null;
}

export type CheckoutResult =
  | { ok: true; trxId: string }
  | { ok: false; error: string; kind: 'INSUFFICIENT_STOCK' | 'OTHER' };

export async function checkoutCart(items: CheckoutItem[], buyerName: string, allowOversell = false, soldAt?: string | null): Promise<CheckoutResult> {
  if (!items.length) return { ok: false, error: 'Keranjang kosong.', kind: 'OTHER' };

  const supabase = await createClient();
  const payload = items.map((i) => ({
    product_id: i.productId,
    qty: i.qty,
    unit_price_override: i.unitPriceOverride ?? null,
  }));

  const { data, error } = await supabase.rpc('checkout_cart', {
    p_items: payload,
    p_buyer_name: buyerName || null,
    p_allow_oversell: allowOversell,
    p_sold_at: soldAt || null,
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('INSUFFICIENT_STOCK')) {
      return { ok: false, error: 'Stok tidak cukup untuk salah satu barang di keranjang.', kind: 'INSUFFICIENT_STOCK' };
    }
    return { ok: false, error: msg.replace(/^.*?:\s*/, ''), kind: 'OTHER' };
  }

  revalidateAll();
  return { ok: true, trxId: (data as any)?.trx_id || '' };
}

export interface HistoryRange {
  from?: string;
  to?: string;
  search?: string;
}

export async function getSalesHistory(range?: HistoryRange): Promise<SaleRow[]> {
  const supabase = await createClient();
  let q = supabase.from('sales').select('*, batch:product_batches(received_at), product:products(unit_type)').order('sold_at', { ascending: false }).limit(2000);
  if (range?.from) q = q.gte('sold_at', range.from);
  if (range?.to) q = q.lte('sold_at', range.to + 'T23:59:59');
  if (range?.search) q = q.ilike('product_name_snapshot', `%${range.search}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as any as SaleRow[]) || [];
}

export async function getStockInHistory(range?: HistoryRange): Promise<StockInHistoryRow[]> {
  const supabase = await createClient();
  let q = supabase.from('stock_in_history').select('*, product:products(unit_type)').order('received_at', { ascending: false }).limit(3000);
  if (range?.from) q = q.gte('received_at', range.from);
  if (range?.to) q = q.lte('received_at', range.to + 'T23:59:59');
  if (range?.search) q = q.ilike('product_name_snapshot', `%${range.search}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as any as StockInHistoryRow[]) || [];
}

export async function getProductStockById(productId: string): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('product_stock_summary').select('stok').eq('product_id', productId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? (data as any).stok : null;
}

export interface UpdateSaleInput {
  saleId: string;
  qty: number;
  unitPrice: number;
  buyerName: string;
  soldAt: string; // ISO timestamp
}

/**
 * Perbaiki transaksi penjualan yang salah input (misal salah ketik qty,
 * harga, tanggal, atau nama pembeli). Kalau qty berubah, stok produk
 * otomatis disesuaikan (dikembalikan/dipotong lagi) di batch yang sama
 * persis dengan transaksi aslinya - jadi tidak perlu utak-atik database
 * manual sama sekali.
 */
export async function updateSaleTransaction(input: UpdateSaleInput): Promise<{ ok: true; data: SaleRow } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('update_sale_transaction', {
    p_sale_id: input.saleId,
    p_qty: input.qty,
    p_unit_price: input.unitPrice,
    p_buyer_name: input.buyerName || null,
    p_sold_at: input.soldAt,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as SaleRow };
}

/** Hapus satu transaksi penjualan. Stok otomatis dikembalikan ke batch aslinya. */
export async function deleteSaleTransaction(saleId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('delete_sale_transaction', { p_sale_id: saleId });
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true };
}

/** Ubah nama pembeli untuk SEMUA transaksi dalam satu grup (pembeli + tanggal yang sama). */
export async function renameBuyerForGroup(
  oldBuyerName: string,
  dateKey: string,
  newBuyerName: string
): Promise<{ ok: boolean; count?: number; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('rename_buyer_for_group', {
    p_old_buyer_name: oldBuyerName,
    p_date_key: dateKey,
    p_new_buyer_name: newBuyerName,
  });
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true, count: data as number };
}

/** Ganti produk di transaksi ke produk lain. Stok produk lama dikembalikan,
 * stok produk baru dipotong via FIFO. */
export async function changeSaleProduct(
  saleId: string,
  newProductId: string,
  allowOversell = false
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('change_sale_product', {
    p_sale_id: saleId,
    p_new_product_id: newProductId,
    p_new_unit_price: null,
    p_allow_oversell: allowOversell,
  });
  if (error) {
    if (error.message.includes('INSUFFICIENT_STOCK')) {
      return { ok: false, error: 'Stok produk tujuan tidak cukup. Pastikan produknya masih ada stok.' };
    }
    return { ok: false, error: error.message };
  }
  revalidateAll();
  return { ok: true };
}

/** Ubah tanggal untuk SEMUA transaksi dalam satu grup (pembeli + tanggal yang sama). */
export async function rescheduleGroupDate(
  buyerName: string,
  oldDateKey: string,
  newDateKey: string
): Promise<{ ok: boolean; count?: number; error?: string }> {
  const supabase = await createClient();
  // Buat timestamp baru dengan jam 12:00 WIB supaya tidak ada date shift
  const newTimestamp = `${newDateKey}T12:00:00+07:00`;
  const { data, error } = await supabase.rpc('reschedule_buyer_group', {
    p_old_buyer_name: buyerName,
    p_old_date_key: oldDateKey,
    p_new_date: newTimestamp,
  });
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true, count: data as number };
}
