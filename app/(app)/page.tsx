import Link from 'next/link';
import { getProductSummaries } from '@/lib/actions/products';
import { getSalesHistory } from '@/lib/actions/sales';
import { aggregateByPeriod, summarize } from '@/lib/analytics';
import { rupiah, formatTanggal, todayISO, daysUntil } from '@/lib/format';
import { Card, Badge, EmptyState } from '@/components/ui';
import { TrendChart } from '@/components/TrendChart';
import { AlertTriangle, PackageX, CalendarClock, TrendingUp } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [products, sales30] = await Promise.all([
    getProductSummaries(),
    getSalesHistory({ from: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10) }),
  ]);

  const today = todayISO();
  const salesToday = sales30.filter((s) => s.sold_at.slice(0, 10) === today);
  const { omzet: omzetToday, untung: untungToday, jumlahItem: itemToday } = summarize(salesToday);

  const totalModal = products.reduce((s, p) => s + p.stok * (p.harga_modal_aktif || 0), 0);
  const stokMenipis = products.filter((p) => p.stok > 0 && p.stok <= p.low_stock_threshold).sort((a, b) => a.stok - b.stok);
  const stokHabis = products.filter((p) => p.stok <= 0);
  const akanExpired = products
    .filter((p) => {
      const d = daysUntil(p.kadaluwarsa_terdekat);
      return d !== null && d <= 30;
    })
    .sort((a, b) => (daysUntil(a.kadaluwarsa_terdekat) ?? 0) - (daysUntil(b.kadaluwarsa_terdekat) ?? 0));

  const trendDaily = aggregateByPeriod(
    sales30.filter((s) => new Date(s.sold_at).getTime() >= Date.now() - 7 * 86400000),
    'day'
  ).map((d) => ({ label: d.label, omzet: d.omzet }));

  return (
    <div className="animate-slide-up">
      <div className="mb-5 flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink">Ringkasan</h1>
          <p className="text-sm text-ink-soft">Kondisi warung hari ini, {formatTanggal(today)}</p>
        </div>
      </div>

      <div className="mb-5 rounded-xl3 bg-gradient-to-br from-ink to-[#3D3653] p-5 text-cream shadow-pop">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-butter-300">Hari Ini</p>
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="font-mono text-2xl font-bold">{rupiah(omzetToday)}</p>
            <p className="text-[11px] text-cream/60">Omzet</p>
          </div>
          <div>
            <p className="font-mono text-2xl font-bold text-mint-200">{rupiah(untungToday)}</p>
            <p className="text-[11px] text-cream/60">Estimasi Untung</p>
          </div>
          <div>
            <p className="font-mono text-2xl font-bold">{itemToday}</p>
            <p className="text-[11px] text-cream/60">Item Terjual</p>
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card tight><p className="text-[11px] font-bold uppercase text-ink-soft">Total Produk</p><p className="font-mono text-xl font-bold text-ink">{products.length}</p></Card>
        <Card tight><p className="text-[11px] font-bold uppercase text-ink-soft">Nilai Modal Stok</p><p className="font-mono text-xl font-bold text-peach-500">{rupiah(totalModal)}</p></Card>
        <Card tight><p className="text-[11px] font-bold uppercase text-ink-soft">Stok Menipis</p><p className="font-mono text-xl font-bold text-ink">{stokMenipis.length}</p></Card>
        <Card tight><p className="text-[11px] font-bold uppercase text-ink-soft">Segera Kadaluwarsa</p><p className="font-mono text-xl font-bold text-ink">{akanExpired.length}</p></Card>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 font-display text-base font-bold text-ink"><TrendingUp size={17} className="text-peach-400" /> Tren Penjualan 7 Hari</h2>
        <Link href="/analitik" className="text-xs font-bold text-peach-500 hover:underline">Lihat analitik lengkap →</Link>
      </div>
      <Card className="mb-6">
        <TrendChart data={trendDaily} />
      </Card>

      <SectionList
        title="Stok Menipis & Habis"
        icon={<PackageX size={16} className="text-rose-400" />}
        count={stokMenipis.length + stokHabis.length}
        items={[...stokHabis, ...stokMenipis].slice(0, 8).map((p) => ({
          key: p.product_id,
          name: p.name,
          code: p.code,
          right: p.stok <= 0 ? <Badge tone="bad">Habis</Badge> : <Badge tone="warn">Sisa {p.stok}</Badge>,
        }))}
        emptyText="Aman, tidak ada stok menipis maupun habis."
      />

      <SectionList
        title="Segera Kadaluwarsa (30 hari)"
        icon={<CalendarClock size={16} className="text-butter-500" />}
        count={akanExpired.length}
        items={akanExpired.slice(0, 8).map((p) => {
          const d = daysUntil(p.kadaluwarsa_terdekat) ?? 0;
          return {
            key: p.product_id,
            name: p.name,
            code: p.code,
            right: <Badge tone={d < 0 ? 'bad' : d <= 7 ? 'warn' : 'good'}>{d < 0 ? `Lewat ${Math.abs(d)} hr` : `${d} hari lagi`}</Badge>,
          };
        })}
        emptyText="Tidak ada produk yang akan kadaluwarsa dalam 30 hari."
      />
    </div>
  );
}

function SectionList({
  title,
  icon,
  count,
  items,
  emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  items: { key: string; name: string; code: string; right: React.ReactNode }[];
  emptyText: string;
}) {
  return (
    <div className="mb-6">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 font-display text-base font-bold text-ink">{icon}{title}</h2>
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
