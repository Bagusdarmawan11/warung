'use client';

import { useMemo, useState } from 'react';
import { Sparkles, TrendingUp, Trophy, PackageSearch, Loader2 } from 'lucide-react';
import { Card, ToggleGroup, Badge, EmptyState } from '@/components/ui';
import { TrendChart } from '@/components/TrendChart';
import { BestSellerChart } from '@/components/analitik/BestSellerChart';
import { aggregateByPeriod, bestSellers, restockPrediction, summarize } from '@/lib/analytics';
import { rupiah, formatQty } from '@/lib/format';
import type { SaleRow, ProductStockSummary } from '@/lib/types';

export function AnalitikClient({ sales, products }: { sales: SaleRow[]; products: ProductStockSummary[] }) {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [aiState, setAiState] = useState<{ loading: boolean; text: string | null; reason: string | null }>({
    loading: false,
    text: null,
    reason: null,
  });

  const trend = useMemo(() => aggregateByPeriod(sales, period), [sales, period]);
  const best = useMemo(() => bestSellers(sales, 8), [sales]);
  const restock = useMemo(() => restockPrediction(sales, products), [sales, products]);
  const totals = useMemo(() => summarize(sales), [sales]);

  async function generateAiInsight() {
    setAiState({ loading: true, text: null, reason: null });
    try {
      const payload = {
        periode_hari: 120,
        total_omzet: totals.omzet,
        total_untung: totals.untung,
        total_transaksi: totals.jumlahTrx,
        tren_mingguan: aggregateByPeriod(sales, 'week').slice(-8),
        produk_terlaris: best.slice(0, 5),
        rekomendasi_restock: restock.slice(0, 8).map((r) => ({ nama: r.name, stok: r.stok, hari_lagi_habis: r.days_left, saran_qty: r.suggested_qty, urgensi: r.urgency })),
        produk_stok_habis: products.filter((p) => p.stok <= 0).map((p) => p.name),
      };
      const res = await fetch('/api/ai-insight', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.ok) setAiState({ loading: false, text: data.text, reason: null });
      else setAiState({ loading: false, text: null, reason: data.reason || 'error' });
    } catch {
      setAiState({ loading: false, text: null, reason: 'error' });
    }
  }

  return (
    <div className="animate-slide-up">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-extrabold text-ink">Analitik</h1>
        <p className="text-sm text-ink-soft">Analisis transaksi &amp; prediksi kebutuhan stok</p>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card tight><p className="text-[11px] font-bold uppercase text-ink-soft">Omzet (120 hr)</p><p className="font-mono text-lg font-bold text-ink">{rupiah(totals.omzet)}</p></Card>
        <Card tight><p className="text-[11px] font-bold uppercase text-ink-soft">Untung (120 hr)</p><p className="font-mono text-lg font-bold text-mint-600">{rupiah(totals.untung)}</p></Card>
        <Card tight><p className="text-[11px] font-bold uppercase text-ink-soft">Transaksi</p><p className="font-mono text-lg font-bold text-ink">{totals.jumlahTrx}</p></Card>
      </div>

      {/* AI Insight */}
      <Card className="mb-6 !bg-gradient-to-br !from-lilac-100 !to-peach-50 !border-lilac-200">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles size={18} className="text-lilac-500" />
          <h2 className="font-display text-base font-bold text-ink">Ringkasan AI</h2>
        </div>
        {aiState.text ? (
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{aiState.text}</p>
        ) : aiState.reason === 'not_configured' ? (
          <p className="text-sm text-ink-soft">
            Fitur ini butuh <code className="rounded bg-white/70 px-1 py-0.5 font-mono text-xs">ANTHROPIC_API_KEY</code> di environment variable.
            Tanpa itu, analitik statistik di bawah tetap berjalan normal. Lihat README bagian &quot;AI Insight&quot; untuk cara mengaktifkan.
          </p>
        ) : (
          <p className="text-sm text-ink-soft">Buat ringkasan bahasa natural dari data 120 hari terakhir: kondisi bisnis + rekomendasi tindakan.</p>
        )}
        <button
          onClick={generateAiInsight}
          disabled={aiState.loading}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-xs font-bold text-cream disabled:opacity-60"
        >
          {aiState.loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {aiState.loading ? 'Menganalisis...' : aiState.text ? 'Buat Ulang' : 'Buat Ringkasan AI'}
        </button>
      </Card>

      {/* Trend */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 font-display text-base font-bold text-ink"><TrendingUp size={17} className="text-peach-400" /> Tren Omzet</h2>
        <ToggleGroup value={period} onChange={(v) => setPeriod(v as any)} options={[{ value: 'day', label: 'Harian' }, { value: 'week', label: 'Mingguan' }, { value: 'month', label: 'Bulanan' }]} />
      </div>
      <Card className="mb-6">
        {trend.length === 0 ? <EmptyState title="Belum ada data penjualan" /> : <TrendChart data={trend.map((t) => ({ label: t.label, omzet: t.omzet }))} />}
      </Card>

      {/* Best sellers */}
      <h2 className="mb-3 flex items-center gap-1.5 font-display text-base font-bold text-ink"><Trophy size={17} className="text-butter-500" /> Produk Terlaris</h2>
      <Card className="mb-6">
        {best.length === 0 ? <EmptyState title="Belum ada penjualan" /> : <BestSellerChart data={best} />}
      </Card>

      {/* Restock prediction */}
      <h2 className="mb-3 flex items-center gap-1.5 font-display text-base font-bold text-ink"><PackageSearch size={17} className="text-sky-500" /> Prediksi Kebutuhan Restock</h2>
      {restock.length === 0 ? (
        <EmptyState title="Belum cukup data untuk memprediksi" hint="Data akan makin akurat seiring bertambahnya transaksi." />
      ) : (
        <div className="space-y-2">
          {restock.map((r) => (
            <Card key={r.product_id} tight className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{r.name}</p>
                <p className="text-[11px] text-ink-soft">
                  Stok {formatQty(r.stok, r.unit_type)} &middot; rata-rata {r.avg_per_day.toFixed(1)}/hari
                  {r.days_left !== null && <> &middot; ~{Math.max(0, Math.round(r.days_left))} hari lagi habis</>}
                </p>
              </div>
              <div className="flex-none text-right">
                <Badge tone={r.urgency === 'tinggi' ? 'bad' : r.urgency === 'sedang' ? 'warn' : 'good'}>
                  {r.urgency === 'tinggi' ? 'Segera' : r.urgency === 'sedang' ? 'Perhatikan' : 'Aman'}
                </Badge>
                {r.suggested_qty > 0 && <p className="mt-1 font-mono text-[11px] text-ink-soft">saran +{formatQty(r.suggested_qty, r.unit_type)}</p>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
