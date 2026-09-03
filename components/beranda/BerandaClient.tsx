'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  TrendingUp, Trophy, PackageSearch, Sparkles, Loader2, AlertTriangle,
  LineChart as LineChartIcon, BarChart3, Boxes, Wallet, ArrowDownCircle, ArrowUpCircle,
} from 'lucide-react';
import { Card, Badge, EmptyState, ToggleGroup } from '@/components/ui';
import { TrendChartToggle } from '@/components/beranda/TrendChartToggle';
import { BestSellerChart } from '@/components/beranda/BestSellerChart';
import { aggregateByPeriod, bestSellers, restockPrediction, summarize } from '@/lib/analytics';
import { rupiah, formatTanggal, todayISO, daysUntil } from '@/lib/format';
import type { SaleRow, StockInHistoryRow, ProductStockSummary } from '@/lib/types';

export function BerandaClient({
  products,
  sales,
  stockIn,
}: {
  products: ProductStockSummary[];
  sales: SaleRow[];
  stockIn: StockInHistoryRow[];
}) {
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [aiState, setAiState] = useState<{ loading: boolean; text: string | null; reason: string | null }>({ loading: false, text: null, reason: null });

  const today = todayISO();
  const salesToday = sales.filter((s) => s.sold_at.slice(0, 10) === today);
  const { omzet: omzetToday, untung: untungToday, jumlahItem: itemToday } = summarize(salesToday);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const sales30 = sales.filter((s) => s.sold_at.slice(0, 10) >= thirtyDaysAgo);
  const stockIn30 = stockIn.filter((r) => (r.received_at || '') >= thirtyDaysAgo);
  const pemasukan30 = sales30.reduce((s, r) => s + r.total, 0);
  const pengeluaran30 = stockIn30.reduce((s, r) => s + r.qty * (r.buy_price || 0), 0);
  const profit30 = pemasukan30 - pengeluaran30;

  const totalModal = products.reduce((s, p) => s + p.stok * (p.harga_modal_aktif || 0), 0);
  const stokMenipis = products.filter((p) => p.stok > 0 && p.stok <= p.low_stock_threshold).sort((a, b) => a.stok - b.stok);
  const stokHabis = products.filter((p) => p.stok <= 0);
  const akanExpired = products
    .filter((p) => { const d = daysUntil(p.kadaluwarsa_terdekat); return d !== null && d <= 30; })
    .sort((a, b) => (daysUntil(a.kadaluwarsa_terdekat) ?? 0) - (daysUntil(b.kadaluwarsa_terdekat) ?? 0));

  const trend = useMemo(() => aggregateByPeriod(sales, period).map((t) => ({ label: t.label, omzet: t.omzet })), [sales, period]);
  const best = useMemo(() => bestSellers(sales, 8), [sales]);
  const restock = useMemo(() => restockPrediction(sales, products), [sales, products]);
  const totals120 = useMemo(() => summarize(sales), [sales]);

  async function generateAiInsight() {
    setAiState({ loading: true, text: null, reason: null });
    try {
      const payload = {
        periode_hari: 120,
        total_omzet: totals120.omzet,
        total_untung: totals120.untung,
        total_transaksi: totals120.jumlahTrx,
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
        <h1 className="font-display text-2xl font-extrabold text-ink">Beranda</h1>
        <p className="text-sm text-ink-soft">Kondisi warung hari ini, {formatTanggal(today)}</p>
      </div>

      {/* Hari ini */}
      <div className="mb-5 rounded-xl3 bg-gradient-to-br from-ink to-[#3D3653] p-5 text-cream shadow-pop">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-butter-300">Hari Ini</p>
        <div className="flex flex-wrap gap-6">
          <div><p className="font-mono text-2xl font-bold">{rupiah(omzetToday)}</p><p className="text-[11px] text-cream/60">Omzet</p></div>
          <div><p className="font-mono text-2xl font-bold text-mint-200">{rupiah(untungToday)}</p><p className="text-[11px] text-cream/60">Estimasi Untung</p></div>
          <div><p className="font-mono text-2xl font-bold">{itemToday}</p><p className="text-[11px] text-cream/60">Item Terjual</p></div>
        </div>
      </div>

      {/* Pemasukan / Pengeluaran / Profit - 30 hari */}
      <div className="mb-2 flex items-center gap-1.5"><Wallet size={15} className="text-peach-400" /><h2 className="font-display text-sm font-bold text-ink">Keuangan 30 Hari Terakhir</h2></div>
      <div className="mb-5 grid grid-cols-3 gap-2.5">
        <Card tight className="!bg-mint-50 !border-mint-100">
          <div className="mb-1 flex items-center gap-1 text-mint-600"><ArrowDownCircle size={13} /><p className="text-[10px] font-bold uppercase">Pemasukan</p></div>
          <p className="font-mono text-sm font-bold text-ink sm:text-base">{rupiah(pemasukan30)}</p>
        </Card>
        <Card tight className="!bg-peach-50 !border-peach-100">
          <div className="mb-1 flex items-center gap-1 text-peach-500"><ArrowUpCircle size={13} /><p className="text-[10px] font-bold uppercase">Pengeluaran</p></div>
          <p className="font-mono text-sm font-bold text-ink sm:text-base">{rupiah(pengeluaran30)}</p>
        </Card>
        <Card tight className="!bg-lilac-50 !border-lilac-100">
          <div className="mb-1 flex items-center gap-1 text-lilac-500"><TrendingUp size={13} /><p className="text-[10px] font-bold uppercase">Profit</p></div>
          <p className={`font-mono text-sm font-bold sm:text-base ${profit30 >= 0 ? 'text-ink' : 'text-rose-500'}`}>{rupiah(profit30)}</p>
        </Card>
      </div>

      {/* Info produk */}
      <div className="mb-6 grid grid-cols-3 gap-2.5">
        <Card tight><p className="text-[10px] font-bold uppercase text-ink-soft">Total Produk</p><p className="font-mono text-lg font-bold text-ink">{products.length}</p></Card>
        <Card tight><p className="text-[10px] font-bold uppercase text-ink-soft">Stok Kosong</p><p className="font-mono text-lg font-bold text-rose-500">{stokHabis.length}</p></Card>
        <Card tight><p className="text-[10px] font-bold uppercase text-ink-soft">Segera Kadaluwarsa</p><p className="font-mono text-lg font-bold text-butter-500">{akanExpired.length}</p></Card>
      </div>

      {/* Chart */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-display text-base font-bold text-ink"><TrendingUp size={17} className="text-peach-400" /> Tren Penjualan</h2>
        <div className="flex flex-wrap gap-2">
          <ToggleGroup value={period} onChange={(v) => setPeriod(v as any)} options={[{ value: 'day', label: 'Harian' }, { value: 'week', label: 'Mingguan' }, { value: 'month', label: 'Bulanan' }]} />
          <div className="inline-flex gap-1 rounded-2xl bg-lilac-50 p-1">
            <button onClick={() => setChartType('line')} className={`flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold ${chartType === 'line' ? 'bg-white text-ink shadow-soft' : 'text-ink-soft'}`}><LineChartIcon size={13} /></button>
            <button onClick={() => setChartType('bar')} className={`flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold ${chartType === 'bar' ? 'bg-white text-ink shadow-soft' : 'text-ink-soft'}`}><BarChart3 size={13} /></button>
          </div>
        </div>
      </div>
      <Card className="mb-6">
        {trend.length === 0 ? <EmptyState title="Belum ada data penjualan" /> : <TrendChartToggle data={trend} type={chartType} />}
      </Card>

      {/* AI Insight */}
      <Card className="mb-6 !border-lilac-200 !bg-gradient-to-br !from-lilac-100 !to-peach-50">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles size={18} className="text-lilac-500" />
          <h2 className="font-display text-base font-bold text-ink">Analisis AI</h2>
        </div>
        {aiState.text ? (
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{aiState.text}</p>
        ) : aiState.reason === 'not_configured' ? (
          <p className="text-sm text-ink-soft">
            Fitur ini butuh <code className="rounded bg-white/70 px-1 py-0.5 font-mono text-xs">ANTHROPIC_API_KEY</code> di environment variable. Lihat README bagian &quot;AI Insight&quot;.
          </p>
        ) : (
          <p className="text-sm text-ink-soft">Minta AI merangkum kondisi bisnis 120 hari terakhir + rekomendasi tindakan, berdasarkan grafik &amp; data di halaman ini.</p>
        )}
        <button onClick={generateAiInsight} disabled={aiState.loading} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-xs font-bold text-cream disabled:opacity-60">
          {aiState.loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {aiState.loading ? 'Menganalisis...' : aiState.text ? 'Buat Ulang' : 'Analisis dengan AI'}
        </button>
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
        <div className="mb-6 space-y-2">
          {restock.slice(0, 8).map((r) => (
            <Card key={r.product_id} tight className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{r.name}</p>
                <p className="text-[11px] text-ink-soft">
                  Stok {r.stok} &middot; rata-rata {r.avg_per_day.toFixed(1)}/hari
                  {r.days_left !== null && <> &middot; ~{Math.max(0, Math.round(r.days_left))} hari lagi habis</>}
                </p>
              </div>
              <div className="flex-none text-right">
                <Badge tone={r.urgency === 'tinggi' ? 'bad' : r.urgency === 'sedang' ? 'warn' : 'good'}>
                  {r.urgency === 'tinggi' ? 'Segera' : r.urgency === 'sedang' ? 'Perhatikan' : 'Aman'}
                </Badge>
                {r.suggested_qty > 0 && <p className="mt-1 font-mono text-[11px] text-ink-soft">saran +{r.suggested_qty}</p>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Stok menipis & habis */}
      <SectionList
        title="Stok Menipis & Habis"
        count={stokMenipis.length + stokHabis.length}
        items={[...stokHabis, ...stokMenipis].slice(0, 8).map((p) => ({
          key: p.product_id, name: p.name, code: p.code,
          right: p.stok <= 0 ? <Badge tone="bad">Habis</Badge> : <Badge tone="warn">Sisa {p.stok}</Badge>,
        }))}
        emptyText="Aman, tidak ada stok menipis maupun habis."
      />

      {/* Segera kadaluwarsa */}
      <SectionList
        title="Segera Kadaluwarsa (30 hari)"
        count={akanExpired.length}
        items={akanExpired.slice(0, 8).map((p) => {
          const d = daysUntil(p.kadaluwarsa_terdekat) ?? 0;
          return { key: p.product_id, name: p.name, code: p.code, right: <Badge tone={d < 0 ? 'bad' : d <= 7 ? 'warn' : 'good'}>{d < 0 ? `Lewat ${Math.abs(d)} hr` : `${d} hari lagi`}</Badge> };
        })}
        emptyText="Tidak ada produk yang akan kadaluwarsa dalam 30 hari."
      />

      <Link href="/produk" className="inline-flex items-center gap-1.5 text-xs font-bold text-peach-500 hover:underline"><Boxes size={13} /> Lihat semua produk →</Link>
    </div>
  );
}

function SectionList({ title, count, items, emptyText }: { title: string; count: number; items: { key: string; name: string; code: string; right: React.ReactNode }[]; emptyText: string }) {
  return (
    <div className="mb-6">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="font-display text-base font-bold text-ink">{title}</h2>
        <span className="font-mono text-xs text-ink-soft">{count} produk</span>
      </div>
      {items.length === 0 ? (
        <EmptyState icon={<AlertTriangle size={26} />} title={emptyText} />
      ) : (
        <Card tight className="divide-y divide-lilac-100 !p-0 overflow-hidden">
          {items.map((it) => (
            <div key={it.key} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{it.name}</p>
                <p className="font-mono text-[11px] text-ink-soft">{it.code}</p>
              </div>
              {it.right}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
