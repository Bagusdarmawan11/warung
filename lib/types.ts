export type UnitType = 'pcs' | 'gram';
export type BatchStatus = 'active' | 'depleted';

export interface Product {
  id: string;
  code: string;
  name: string;
  category: string | null;
  unit_type: UnitType;
  low_stock_threshold: number;
  is_active: boolean;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductBatch {
  id: string;
  product_id: string;
  qty_initial: number;
  qty_remaining: number;
  buy_price: number;
  sell_price: number;
  expiry_date: string | null;
  received_at: string;
  status: BatchStatus;
  note: string | null;
  created_at: string;
}

export interface StockInHistoryRow {
  id: string;
  product_id: string;
  batch_id: string | null;
  product_name_snapshot: string;
  qty: number;
  buy_price: number | null;
  sell_price: number | null;
  received_at: string;
  created_at: string;
}

export interface SaleRow {
  id: string;
  trx_id: string;
  product_id: string;
  batch_id: string | null;
  product_name_snapshot: string;
  qty: number;
  unit_price: number;
  unit_cost: number;
  total: number;
  buyer_name: string | null;
  sold_at: string;
  batch?: { received_at: string } | null;
}

// Ringkasan stok gabungan (dari view product_stock_summary)
export interface ProductStockSummary {
  product_id: string;
  code: string;
  name: string;
  category: string | null;
  unit_type: UnitType;
  low_stock_threshold: number;
  is_active: boolean;
  stok: number;
  harga_jual_aktif: number | null;
  harga_modal_aktif: number | null;
  kadaluwarsa_terdekat: string | null;
  image_url: string | null;
}

export interface CartItem {
  product_id: string;
  code: string;
  name: string;
  unit_type: UnitType;
  qty: number;
  unit_price: number;
  stok_tersedia: number;
}
