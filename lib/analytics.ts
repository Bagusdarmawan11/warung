import type { SaleRow, ProductStockSummary } from '@/lib/types';

export interface PeriodPoint {
  key: string;
  label: string;
  omzet: number;
  untung: number;
  qty: number;
}

function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function aggregateByPeriod(sales: SaleRow[], period: 'day' | 'week' | 'month'): PeriodPoint[] {
  const map = new Map<string, PeriodPoint>();
  for (const s of sales) {
    const d = new Date(s.sold_at);
    let key: string;
    let label: string;
    if (period === 'day') {
      key = d.toISOString().slice(0, 10);
      label = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
    } else if (period === 'week') {
      key = isoWeek(d);
      label = key;
    } else {
      key = d.toISOString().slice(0, 7);
      label = d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
    }
    const cur = map.get(key) || { key, label, omzet: 0, untung: 0, qty: 0 };
    cur.omzet += s.total;
    cur.untung += (s.unit_price - s.unit_cost) * s.qty;
    cur.qty += s.qty;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export interface BestSellerRow {
  product_name: string;
  qty: number;
  omzet: number;
  untung: number;
  jumlah_transaksi: number;
}

export function bestSellers(sales: SaleRow[], limit = 10): BestSellerRow[] {
  const map = new Map<string, BestSellerRow>();
  for (const s of sales) {
    const cur = map.get(s.product_name_snapshot) || {
      product_name: s.product_name_snapshot,
      qty: 0,
      omzet: 0,
      untung: 0,
      jumlah_transaksi: 0,
    };
    cur.qty += s.qty;
    cur.omzet += s.total;
    cur.untung += (s.unit_price - s.unit_cost) * s.qty;
    cur.jumlah_transaksi += 1;
    map.set(s.product_name_snapshot, cur);
  }
  return [...map.values()].sort((a, b) => b.omzet - a.omzet).slice(0, limit);
}

export interface RestockSuggestion {
  product_id: string;
  code: string;
  name: string;
  unit_type: 'pcs' | 'gram';
  stok: number;
  avg_per_day: number;
  days_left: number | null;
  suggested_qty: number;
  urgency: 'tinggi' | 'sedang' | 'aman';
}

/**
 * Prediksi kebutuhan restock: hitung rata-rata terjual per hari dalam
 * `lookbackDays` terakhir, lalu perkirakan berapa hari lagi stok habis.
 * Saran jumlah restock dihitung untuk menutupi ~14 hari ke depan.
 */
export function restockPrediction(
  sales: SaleRow[],
  products: ProductStockSummary[],
  lookbackDays = 14,
  targetCoverDays = 14
): RestockSuggestion[] {
  const cutoff = Date.now() - lookbackDays * 86400000;
  const perProductQty = new Map<string, number>();
  for (const s of sales) {
    if (new Date(s.sold_at).getTime() < cutoff) continue;
    perProductQty.set(s.product_id, (perProductQty.get(s.product_id) || 0) + s.qty);
  }

  const results: RestockSuggestion[] = products.map((p) => {
    const totalQty = perProductQty.get(p.product_id) || 0;
    const avgPerDay = totalQty / lookbackDays;
    const daysLeft = avgPerDay > 0 ? p.stok / avgPerDay : null;
    const suggestedQty = avgPerDay > 0 ? Math.max(0, Math.ceil(avgPerDay * targetCoverDays - p.stok)) : 0;

    let urgency: RestockSuggestion['urgency'] = 'aman';
    if (p.stok <= 0) urgency = 'tinggi';
    else if (daysLeft !== null && daysLeft <= 3) urgency = 'tinggi';
    else if (daysLeft !== null && daysLeft <= 7) urgency = 'sedang';
    else if (p.stok <= p.low_stock_threshold) urgency = 'sedang';

    return {
      product_id: p.product_id,
      code: p.code,
      name: p.name,
      unit_type: p.unit_type,
      stok: p.stok,
      avg_per_day: avgPerDay,
      days_left: daysLeft,
      suggested_qty: suggestedQty,
      urgency,
    };
  });

  return results
    .filter((r) => r.avg_per_day > 0 || r.stok <= r.suggested_qty)
    .sort((a, b) => {
      const rank = { tinggi: 0, sedang: 1, aman: 2 };
      if (rank[a.urgency] !== rank[b.urgency]) return rank[a.urgency] - rank[b.urgency];
      return (a.days_left ?? Infinity) - (b.days_left ?? Infinity);
    });
}

export function summarize(sales: SaleRow[]) {
  const omzet = sales.reduce((s, r) => s + r.total, 0);
  const untung = sales.reduce((s, r) => s + (r.unit_price - r.unit_cost) * r.qty, 0);
  const jumlahItem = sales.reduce((s, r) => s + r.qty, 0);
  const jumlahTrx = new Set(sales.map((s) => s.trx_id)).size;
  return { omzet, untung, jumlahItem, jumlahTrx };
}

export interface TopBuyerRow {
  buyer_name: string;
  total_belanja: number;
  jumlah_transaksi: number;
  terakhir_belanja: string;
}

/** Pelanggan dengan total belanja terbesar (nama pembeli kosong/"Tidak dicatat" diabaikan). */
export function topBuyers(sales: SaleRow[], limit = 8): TopBuyerRow[] {
  const map = new Map<string, TopBuyerRow>();
  for (const s of sales) {
    const name = (s.buyer_name || '').trim();
    if (!name) continue;
    const cur = map.get(name) || { buyer_name: name, total_belanja: 0, jumlah_transaksi: 0, terakhir_belanja: s.sold_at };
    cur.total_belanja += s.total;
    cur.jumlah_transaksi += 1;
    if (s.sold_at > cur.terakhir_belanja) cur.terakhir_belanja = s.sold_at;
    map.set(name, cur);
  }
  return [...map.values()].sort((a, b) => b.total_belanja - a.total_belanja).slice(0, limit);
}
