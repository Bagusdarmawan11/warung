'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  TrendingUp, Trophy, PackageSearch, Sparkles, Loader2, AlertTriangle,
  LineChart as LineChartIcon, BarChart3, Wallet, ArrowDownCircle, ArrowUpCircle, Crown,
} from 'lucide-react';
import { Card, Badge, EmptyState, ToggleGroup, Input } from '@/components/ui';
import { TrendChartToggle } from '@/components/beranda/TrendChartToggle';
import { BestSellerChart } from '@/components/beranda/BestSellerChart';
import { aggregateByPeriod, bestSellers, restockPrediction, summarize, topBuyers } from '@/lib/analytics';
import { getSalesHistory, getStockInHistory } from '@/lib/actions/sales';
import { rupiah, formatTanggal, todayISO, daysUntil, startOfWeekISO, startOfMonthISO, startOfYearISO } from '@/lib/format';
import type { SaleRow, StockInHistoryRow, ProductStockSummary } from '@/lib/types';

type FinancePeriod = 'today' | 'week' | 'month' | 'year' | 'custom';

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

  // ---------------------------------------------------------------------
  // Keuangan periode (bisa dipilih: hari ini / minggu ini / bulan ini /
  // tahun ini / kustom) - ambil data segar sesuai rentang yang dipilih.
  // ---------------------------------------------------------------------
  const [financePeriod, setFinancePeriod] = useState<FinancePeriod>('month');
  const [customFrom, setCustomFrom] = useState(startOfMonthISO());
  const [customTo, setCustomTo] = useState(today);
  const [financeSales, setFinanceSales] = useState<SaleRow[]>(sales.filter((s) => s.sold_at.slice(0, 10) >= startOfMonthISO()));
  const [financeStockIn, setFinanceStockIn] = useState<StockInHistoryRow[]>(stockIn.filter((r) => (r.received_at || '').slice(0, 10) >= startOfMonthISO()));
  const [financeLoading, setFinanceLoading] = useState(false);

  function rangeFor(p: FinancePeriod): { from: string; to: string } {
    if (p === 'today') return { from: today, to: today };
    if (p === 'week') return { from: startOfWeekISO(), to: today };
    if (p === 'month') return { from: startOfMonthISO(), to: today };
    if (p === 'year') return { from: startOfYearISO(), to: today };
    return { from: customFrom, to: customTo };
  }

  async function reloadFinance(p: FinancePeriod, from?: string, to?: string) {
    const range = p === 'custom' ? { from: from || customFrom, to: to || customTo } : rangeFor(p);
    setFinanceLoading(true);
    try {
      const [s, si] = await Promise.all([getSalesHistory(range), getStockInHistory(range)]);
      setFinanceSales(s);
      setFinanceStockIn(si);
    } finally {
      setFinanceLoading(false);
    }
  }

  function handlePeriodChange(p: FinancePeriod) {
    setFinancePeriod(p);
    if (p !== 'custom') reloadFinance(p);
  }

  const financeSummary = useMemo(() => summarize(financeSales), [financeSales]);
  const pemasukan = financeSummary.omzet;
  // Profit = keuntungan RIIL dari tiap barang yang benar-benar terjual
  // ((harga jual - harga modal) x qty), BUKAN pemasukan dikurangi
  // pengeluaran — karena barang masuk (belanja stok) belum tentu semuanya
  // laku di periode yang sama, jadi menghitungnya dengan cara itu akan
  // selalu kelihatan minus walau bisnisnya sehat.
  const profit = financeSummary.untung;
  const pengeluaran = financeStockIn.reduce((s, r) => s + r.qty * (r.buy_price || 0), 0);

  const totalModal = products.reduce((s, p) => s + p.stok * (p.harga_modal_aktif || 0), 0);
  const stokMenipis = products.filter((p) => p.stok > 0 && p.stok <= p.low_stock_threshold).sort((a, b) => a.stok - b.stok);
  const stokHabis = products.filter((p) => p.stok <= 0);

  const [expiryDays, setExpiryDays] = useState(30);
  const akanExpired = products
    .filter((p) => { const d = daysUntil(p.kadaluwarsa_terdekat); return d !== null && d <= expiryDays; })
    .sort((a, b) => (daysUntil(a.kadaluwarsa_terdekat) ?? 0) - (daysUntil(b.kadaluwarsa_terdekat) ?? 0));

  const [bestSortBy, setBestSortBy] = useState<'omzet' | 'untung' | 'frekuensi'>('omzet');

  const trend = useMemo(() => aggregateByPeriod(sales, period).map((t) => ({ label: t.label, omzet: t.omzet })), [sales, period]);
  const best = useMemo(() => bestSellers(sales, 8, bestSortBy), [sales, bestSortBy]);
  const topCustomers = useMemo(() => topBuyers(sales, 8), [sales]);
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

  const financePeriodLabel: Record<FinancePeriod, string> = {
    today: 'Hari Ini', week: 'Minggu Ini', month: 'Bulan Ini', year: 'Tahun Ini', custom: 'Periode Kustom',
  };

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

      {/* Pemasukan / Pengeluaran / Profit - periode bisa dipilih */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5"><Wallet size={15} className="text-peach-400" /><h2 className="font-display text-sm font-bold text-ink">Keuangan &middot; {financePeriodLabel[financePeriod]}</h2></div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {(['today', 'week', 'month', 'year', 'custom'] as FinancePeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => handlePeriodChange(p)}
              className={`flex-none rounded-full border px-3 py-1.5 text-[11px] font-bold whitespace-nowrap ${financePeriod === p ? 'border-ink bg-ink text-cream' : 'border-lilac-200 bg-white text-ink-soft'}`}
            >
              {financePeriodLabel[p]}
            </button>
          ))}
        </div>
      </div>

      {financePeriod === 'custom' && (
        <div className="mb-3 flex items-center gap-2">
          <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <span className="text-xs text-ink-soft">s/d</span>
          <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          <button onClick={() => reloadFinance('custom', customFrom, customTo)} className="flex-none rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-cream">
            Terapkan
          </button>
        </div>
      )}

      <div className={`mb-5 grid grid-cols-3 gap-2.5 transition-opacity ${financeLoading ? 'opacity-50' : ''}`}>
        <Card tight className="!bg-mint-50 !border-mint-100">
          <div className="mb-1 flex items-center gap-1 text-mint-600"><ArrowDownCircle size={13} /><p className="text-[10px] font-bold uppercase">Pemasukan</p></div>
          <p className="font-mono text-sm font-bold text-ink sm:text-base">{rupiah(pemasukan)}</p>
        </Card>
        <Card tight className="!bg-peach-50 !border-peach-100">
          <div className="mb-1 flex items-center gap-1 text-peach-500"><ArrowUpCircle size={13} /><p className="text-[10px] font-bold uppercase">Pengeluaran</p></div>
          <p className="font-mono text-sm font-bold text-ink sm:text-base">{rupiah(pengeluaran)}</p>
        </Card>
        <Card tight className="!bg-lilac-50 !border-lilac-100">
          <div className="mb-1 flex items-center gap-1 text-lilac-500"><TrendingUp size={13} /><p className="text-[10px] font-bold uppercase">Profit</p></div>
          <p className={`font-mono text-sm font-bold sm:text-base ${profit >= 0 ? 'text-ink' : 'text-rose-500'}`}>{rupiah(profit)}</p>
        </Card>
      </div>
      <p className="mb-6 -mt-3 text-[10px] text-ink-soft/70">Profit dihitung dari untung riil tiap barang yang terjual (harga jual − harga modal), bukan sekadar pemasukan dikurangi pengeluaran — karena stok yang baru dibeli belum tentu langsung laku semua di periode yang sama.</p>

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
          <AiText text={aiState.text} />
        ) : aiState.reason === 'not_configured' ? (
          <p className="text-sm text-ink-soft">
            Fitur ini butuh <code className="rounded bg-white/70 px-1 py-0.5 font-mono text-xs">GEMINI_API_KEY</code> di environment variable. Lihat README bagian &quot;AI Insight&quot;.
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-display text-base font-bold text-ink"><Trophy size={17} className="text-butter-500" /> Produk Terlaris</h2>
        <ToggleGroup
          value={bestSortBy}
          onChange={(v) => setBestSortBy(v as any)}
          options={[{ value: 'omzet', label: 'Omzet' }, { value: 'untung', label: 'Untung' }, { value: 'frekuensi', label: 'Frekuensi' }]}
        />
      </div>
      <Card className="mb-6">
        {best.length === 0 ? <EmptyState title="Belum ada penjualan" /> : <BestSellerChart data={best} sortBy={bestSortBy} />}
      </Card>

      {/* Top pelanggan */}
      <h2 className="mb-3 flex items-center gap-1.5 font-display text-base font-bold text-ink"><Crown size={17} className="text-butter-500" /> Top Pelanggan</h2>
      {topCustomers.length === 0 ? (
        <EmptyState title="Belum ada data pembeli" hint="Nama pembeli tercatat otomatis dari transaksi kasir & import." />
      ) : (
        <div className="mb-6 space-y-2">
          {topCustomers.map((c, i) => (
            <Card key={c.buyer_name} tight className="flex items-center gap-3">
              <div className={`flex h-8 w-8 flex-none items-center justify-center rounded-full font-mono text-xs font-bold ${
                i === 0 ? 'bg-butter-300 text-ink' : i === 1 ? 'bg-lilac-200 text-ink' : i === 2 ? 'bg-peach-200 text-ink' : 'bg-lilac-50 text-ink-soft'
              }`}>
                {i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{c.buyer_name}</p>
                <p className="text-[11px] text-ink-soft">{c.jumlah_transaksi} transaksi &middot; terakhir {formatTanggal(c.terakhir_belanja.slice(0, 10))}</p>
              </div>
              <p className="flex-none font-mono text-sm font-bold text-peach-500">{rupiah(c.total_belanja)}</p>
            </Card>
          ))}
        </div>
      )}

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
        viewAllHref="/produk?status=bermasalah"
      />

      {/* Segera kadaluwarsa */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-bold text-ink">Segera Kadaluwarsa</h2>
        <ToggleGroup
          value={String(expiryDays)}
          onChange={(v) => setExpiryDays(Number(v))}
          options={[{ value: '30', label: '1 Bln' }, { value: '90', label: '3 Bln' }, { value: '180', label: '6 Bln' }, { value: '365', label: '1 Thn' }]}
        />
      </div>
      <SectionList
        hideTitle
        title={`Segera Kadaluwarsa (${expiryDays} hari)`}
        count={akanExpired.length}
        items={akanExpired.slice(0, 8).map((p) => {
          const d = daysUntil(p.kadaluwarsa_terdekat) ?? 0;
          return { key: p.product_id, name: p.name, code: p.code, right: <Badge tone={d < 0 ? 'bad' : d <= 7 ? 'warn' : 'good'}>{d < 0 ? `Lewat ${Math.abs(d)} hr` : `${d} hari lagi`}</Badge> };
        })}
        emptyText={`Tidak ada produk yang akan kadaluwarsa dalam ${expiryDays} hari.`}
        viewAllHref={`/produk?status=expired&days=${expiryDays}`}
      />
    </div>
  );
}

function AiText({ text }: { text: string }) {
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  return (
    <div className="space-y-2 text-sm leading-relaxed text-ink">
      {lines.map((line, i) => {
        const headingMatch = /^\*\*(.+)\*\*$/.exec(line.trim());
        if (headingMatch) {
          return <p key={i} className="mt-3 font-display text-[15px] font-bold text-ink first:mt-0">{headingMatch[1]}</p>;
        }
        const cleaned = line.replace(/^[-•]\s*/, '');
        const isBullet = /^[-•]\s/.test(line);
        const parts = cleaned.split(/\*\*(.+?)\*\*/g);
        const rendered = parts.map((part, j) => (j % 2 === 1 ? <strong key={j}>{part}</strong> : part));
        return isBullet ? (
          <div key={i} className="flex gap-2 pl-1">
            <span className="text-peach-400">•</span>
            <p className="flex-1">{rendered}</p>
          </div>
        ) : (
          <p key={i}>{rendered}</p>
        );
      })}
    </div>
  );
}

function SectionList({
  title,
  count,
  items,
  emptyText,
  viewAllHref,
  hideTitle,
}: {
  title: string;
  count: number;
  items: { key: string; name: string; code: string; right: React.ReactNode }[];
  emptyText: string;
  viewAllHref?: string;
  hideTitle?: boolean;
}) {
  return (
    <div className="mb-6">
      {!hideTitle && (
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-ink">{title}</h2>
          <span className="font-mono text-xs text-ink-soft">{count} produk</span>
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState icon={<AlertTriangle size={26} />} title={emptyText} />
      ) : (
        <>
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
          {viewAllHref && count > 0 && (
            <Link href={viewAllHref} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-peach-500 hover:underline">
              Lihat semua ({count}) <ArrowRightIcon />
            </Link>
          )}
        </>
      )}
    </div>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
