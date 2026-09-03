'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { SaleRow, StockInHistoryRow } from '@/lib/types';

function revalidateAll() {
  revalidatePath('/');
  revalidatePath('/produk');
  revalidatePath('/kasir');
  revalidatePath('/riwayat');
  revalidatePath('/analitik');
}

export interface CheckoutItem {
  productId: string;
  qty: number;
  unitPriceOverride?: number | null;
}

export type CheckoutResult =
  | { ok: true; trxId: string }
  | { ok: false; error: string; kind: 'INSUFFICIENT_STOCK' | 'OTHER' };

export async function checkoutCart(items: CheckoutItem[], buyerName: string, allowOversell = false): Promise<CheckoutResult> {
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
  let q = supabase.from('sales').select('*, batch:product_batches(received_at)').order('sold_at', { ascending: false }).limit(2000);
  if (range?.from) q = q.gte('sold_at', range.from);
  if (range?.to) q = q.lte('sold_at', range.to + 'T23:59:59');
  if (range?.search) q = q.ilike('product_name_snapshot', `%${range.search}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as any as SaleRow[]) || [];
}

export async function getStockInHistory(range?: HistoryRange): Promise<StockInHistoryRow[]> {
  const supabase = await createClient();
  let q = supabase.from('stock_in_history').select('*').order('received_at', { ascending: false }).limit(3000);
  if (range?.from) q = q.gte('received_at', range.from);
  if (range?.to) q = q.lte('received_at', range.to + 'T23:59:59');
  if (range?.search) q = q.ilike('product_name_snapshot', `%${range.search}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as StockInHistoryRow[]) || [];
}

export async function getProductStockById(productId: string): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('product_stock_summary').select('stok').eq('product_id', productId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? (data as any).stok : null;
}
