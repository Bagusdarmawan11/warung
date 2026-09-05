'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Product, ProductBatch, ProductStockSummary, UnitType } from '@/lib/types';

function revalidateAll() {
  revalidatePath('/');
  revalidatePath('/produk');
  revalidatePath('/kasir');
  revalidatePath('/barang-masuk');
  revalidatePath('/riwayat');
  revalidatePath('/analitik');
}

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

function friendlyError(raw: string): string {
  if (raw.includes('QTY_INVALID')) return 'Jumlah tidak valid.';
  if (raw.includes('PRODUCT_NOT_FOUND')) return 'Produk tidak ditemukan.';
  if (raw.includes('UNIT_TYPE_INVALID')) return 'Jenis satuan tidak valid.';
  return raw.replace(/^.*?:\s*/, '') || 'Terjadi kesalahan tak terduga.';
}

/**
 * Meng-escape karakter spesial pada filter PostgREST `.or()` (koma, tanda
 * kurung, backslash). Tanpa ini, input pencarian yang mengandung koma atau
 * kurung bisa merusak query atau menyisipkan kondisi filter yang tidak
 * diinginkan ("filter injection").
 */
function escapeOrFilterValue(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

// ---------------------------------------------------------------------------
// READ
// ---------------------------------------------------------------------------
export async function getProductSummaries(opts?: {
  search?: string;
  status?: 'all' | 'menipis' | 'habis' | 'expired';
}): Promise<ProductStockSummary[]> {
  const supabase = await createClient();
  let query = supabase.from('product_stock_summary').select('*').eq('is_active', true);

  if (opts?.search) {
    const term = escapeOrFilterValue(opts.search.trim());
    query = query.or(`name.ilike.%${term}%,code.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  let rows = (data as ProductStockSummary[]) || [];

  if (opts?.status === 'menipis') rows = rows.filter((p) => p.stok > 0 && p.stok <= p.low_stock_threshold);
  else if (opts?.status === 'habis') rows = rows.filter((p) => p.stok <= 0);
  else if (opts?.status === 'expired') {
    rows = rows.filter((p) => {
      if (!p.kadaluwarsa_terdekat) return false;
      const d = Math.round((new Date(p.kadaluwarsa_terdekat).getTime() - Date.now()) / 86400000);
      return d <= 30;
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name, 'id'));
  return rows;
}

export async function getProductByCode(code: string): Promise<ProductStockSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('product_stock_summary')
    .select('*')
    .eq('code', code.trim().toUpperCase())
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as ProductStockSummary | null;
}

export async function getProductsWithImages(): Promise<{ id: string; name: string; code: string; image_url: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('products').select('id, name, code, image_url').not('image_url', 'is', null);
  if (error) throw new Error(error.message);
  return (data as any[]) || [];
}
export async function getBatchesForProduct(productId: string): Promise<ProductBatch[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('product_batches')
    .select('*')
    .eq('product_id', productId)
    .order('received_at', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as ProductBatch[]) || [];
}

export interface ProductMovement {
  id: string;
  type: 'masuk' | 'keluar';
  date: string;
  qty: number;
  unitPrice: number | null;
  unitCost: number | null;
  buyerName: string | null;
}

/** Riwayat pergerakan (masuk + keluar) untuk satu produk, digabung & diurutkan terbaru dulu. */
export async function getProductMovements(productId: string): Promise<ProductMovement[]> {
  const supabase = await createClient();
  const [masukRes, keluarRes] = await Promise.all([
    supabase.from('stock_in_history').select('*').eq('product_id', productId).order('created_at', { ascending: false }),
    supabase.from('sales').select('*').eq('product_id', productId).order('sold_at', { ascending: false }),
  ]);
  if (masukRes.error) throw new Error(masukRes.error.message);
  if (keluarRes.error) throw new Error(keluarRes.error.message);

  const masuk: ProductMovement[] = (masukRes.data || []).map((m: any) => ({
    id: 'in-' + m.id,
    type: 'masuk',
    date: m.received_at,
    qty: m.qty,
    unitPrice: m.sell_price,
    unitCost: m.buy_price,
    buyerName: null,
  }));
  const keluar: ProductMovement[] = (keluarRes.data || []).map((s: any) => ({
    id: 'out-' + s.id,
    type: 'keluar',
    date: s.sold_at,
    qty: s.qty,
    unitPrice: s.unit_price,
    unitCost: s.unit_cost,
    buyerName: s.buyer_name,
  }));

  return [...masuk, ...keluar].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// ---------------------------------------------------------------------------
// WRITE
// ---------------------------------------------------------------------------
export interface CreateProductInput {
  name: string;
  category?: string;
  unitType: UnitType;
  lowStockThreshold: number;
  qty: number;
  buyPrice: number;
  sellPrice: number;
  expiryDate?: string | null;
  receivedAt?: string;
}

export async function createProduct(input: CreateProductInput): Promise<ActionResult<Product>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_product_with_batch', {
    p_name: input.name,
    p_category: input.category || null,
    p_unit_type: input.unitType,
    p_low_stock_threshold: input.lowStockThreshold,
    p_qty: input.qty,
    p_buy_price: input.buyPrice,
    p_sell_price: input.sellPrice,
    p_expiry_date: input.expiryDate || null,
    p_received_at: input.receivedAt || null,
  });
  if (error) return { ok: false, error: friendlyError(error.message) };
  revalidateAll();
  return { ok: true, data: data as Product };
}

export interface AddBatchInput {
  productId: string;
  qty: number;
  buyPrice: number;
  sellPrice: number;
  expiryDate?: string | null;
  receivedAt?: string;
}

export async function addBatch(input: AddBatchInput): Promise<ActionResult<ProductBatch>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('add_batch', {
    p_product_id: input.productId,
    p_qty: input.qty,
    p_buy_price: input.buyPrice,
    p_sell_price: input.sellPrice,
    p_expiry_date: input.expiryDate || null,
    p_received_at: input.receivedAt || null,
  });
  if (error) return { ok: false, error: friendlyError(error.message) };
  revalidateAll();
  return { ok: true, data: data as ProductBatch };
}

export interface UpdateProductInput {
  productId: string;
  name: string;
  category?: string;
  lowStockThreshold: number;
  unitType?: UnitType;
}

export async function updateProduct(input: UpdateProductInput): Promise<ActionResult> {
  const supabase = await createClient();
  const payload: Record<string, any> = {
    name: input.name.trim(),
    category: input.category?.trim() || null,
    low_stock_threshold: input.lowStockThreshold,
  };
  if (input.unitType) payload.unit_type = input.unitType;
  const { error } = await supabase
    .from('products')
    .update(payload)
    .eq('id', input.productId);
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true, data: undefined };
}

export async function updateBatchPrice(batchId: string, buyPrice: number, sellPrice: number, expiryDate?: string | null): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('product_batches')
    .update({ buy_price: buyPrice, sell_price: sellPrice, expiry_date: expiryDate || null })
    .eq('id', batchId);
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true, data: undefined };
}

/** Koreksi stok manual (stok opname). delta > 0 = tambah (batch baru), delta < 0 = kurangi (FIFO). */
export async function adjustStock(productId: string, delta: number, note: string): Promise<ActionResult> {
  const supabase = await createClient();
  if (delta === 0) return { ok: false, error: 'Jumlah koreksi tidak boleh 0.' };

  if (delta > 0) {
    const { error } = await supabase.rpc('add_batch', {
      p_product_id: productId,
      p_qty: delta,
      p_buy_price: 0,
      p_sell_price: 0,
      p_expiry_date: null,
      p_received_at: null,
    });
    if (error) return { ok: false, error: friendlyError(error.message) };
  } else {
    const trxId = 'ADJ' + Date.now();
    const { error } = await supabase.rpc('sell_product', {
      p_product_id: productId,
      p_qty: Math.abs(delta),
      p_trx_id: trxId,
      p_buyer_name: '[Koreksi Stok] ' + (note || ''),
      p_unit_price_override: 0,
      p_allow_oversell: true,
    });
    if (error) return { ok: false, error: friendlyError(error.message) };
  }
  revalidateAll();
  return { ok: true, data: undefined };
}

export async function deleteProduct(productId: string): Promise<ActionResult<{ archived: boolean }>> {
  const supabase = await createClient();
  const { error } = await supabase.from('products').delete().eq('id', productId);
  if (error) {
    // FK violation (produk punya riwayat transaksi) -> arsipkan saja, jangan hilangkan histori
    const { error: archiveError } = await supabase.from('products').update({ is_active: false }).eq('id', productId);
    if (archiveError) return { ok: false, error: archiveError.message };
    revalidateAll();
    return { ok: true, data: { archived: true } };
  }
  revalidateAll();
  return { ok: true, data: { archived: false } };
}

export interface MergeProductsInput {
  name: string;
  category?: string;
  unitType: UnitType;
  lowStockThreshold: number;
  qty: number;
  buyPrice: number;
  sellPrice: number;
  expiryDate?: string | null;
  sourceIds: string[];
}

/**
 * Gabungkan beberapa produk (misal "Telur Ayam 1 Kg", "Telur Ayam 2 KG", dst)
 * jadi SATU produk baru. Produk-produk lama diarsipkan (is_active=false),
 * bukan dihapus, supaya riwayat transaksi & laporan lama tetap akurat.
 */
export async function mergeProducts(input: MergeProductsInput): Promise<ActionResult<Product>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('merge_products_into_new', {
    p_name: input.name,
    p_category: input.category || null,
    p_unit_type: input.unitType,
    p_low_stock_threshold: input.lowStockThreshold,
    p_qty: input.qty,
    p_buy_price: input.buyPrice,
    p_sell_price: input.sellPrice,
    p_expiry_date: input.expiryDate || null,
    p_source_ids: input.sourceIds,
  });
  if (error) return { ok: false, error: friendlyError(error.message) };
  revalidateAll();
  return { ok: true, data: data as Product };
}
