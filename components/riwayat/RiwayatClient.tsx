'use client';

import { useMemo, useState } from 'react';
import { Search, Download, History } from 'lucide-react';
import { Card, Input, ToggleGroup, EmptyState } from '@/components/ui';
import { getSalesHistory, getStockInHistory } from '@/lib/actions/sales';
import { downloadCsv } from '@/lib/csv';
import { rupiah, formatTanggal, formatTanggalWaktu, formatQty } from '@/lib/format';
import type { SaleRow, StockInHistoryRow } from '@/lib/types';

export function RiwayatClient({ initialSales, initialStockIn }: { initialSales: SaleRow[]; initialStockIn: StockInHistoryRow[] }) {
  const [sub, setSub] = useState<'masuk' | 'keluar'>('keluar');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sales, setSales] = useState(initialSales);
  const [stockIn, setStockIn] = useState(initialStockIn);
  const [loading, setLoading] = useState(false);

  async function applyFilter() {
    setLoading(true);
    try {
      if (sub === 'keluar') setSales(await getSalesHistory({ from, to, search }));
      else setStockIn(await getStockInHistory({ from, to, search }));
    } finally {
      setLoading(false);
    }
  }

  const filteredSales = useMemo(() => {
    if (!search.trim()) return sales;
    const q = search.trim().toLowerCase();
    return sales.filter((s) => s.product_name_snapshot.toLowerCase().includes(q) || (s.trx_id || '').toLowerCase().includes(q));
  }, [sales, search]);

  const filteredStockIn = useMemo(() => {
    if (!search.trim()) return stockIn;
    const q = search.trim().toLowerCase();
    return stockIn.filter((s) => s.product_name_snapshot.toLowerCase().includes(q));
  }, [stockIn, search]);

  const totalQty = sub === 'keluar' ? filteredSales.reduce((s, r) => s + r.qty, 0) : filteredStockIn.reduce((s, r) => s + r.qty, 0);
  const totalNilai =
    sub === 'keluar'
      ? filteredSales.reduce((s, r) => s + r.total, 0)
      : filteredStockIn.reduce((s, r) => s + r.qty * (r.buy_price || 0), 0);

  function exportCsv() {
    if (sub === 'keluar') {
      const rows: (string | number)[][] = [['Tanggal', 'Produk', 'Pembeli', 'Qty', 'Harga', 'Total', 'Trx ID']];
      filteredSales.forEach((r) => rows.push([formatTanggalWaktu(r.sold_at), r.product_name_snapshot, r.buyer_name || '', r.qty, r.unit_price, r.total, r.trx_id]));
      downloadCsv('riwayat-penjualan.csv', rows);
    } else {
      const rows: (string | number)[][] = [['Tanggal', 'Produk', 'Qty', 'Harga Modal', 'Harga Jual']];
      filteredStockIn.forEach((r) => rows.push([formatTanggal(r.received_at), r.product_name_snapshot, r.qty, r.buy_price || 0, r.sell_price || 0]));
      downloadCsv('riwayat-barang-masuk.csv', rows);
    }
  }

  return (
    <div className="animate-slide-up">
      <div className="mb-4">
        <h1 className="font-display text-2xl font-extrabold text-ink">Riwayat</h1>
        <p className="text-sm text-ink-soft">Catatan transaksi barang masuk &amp; penjualan</p>
      </div>

      <div className="mb-4"><ToggleGroup value={sub} onChange={(v) => setSub(v as any)} options={[{ value: 'keluar', label: 'Penjualan' }, { value: 'masuk', label: 'Barang Masuk' }]} /></div>

      <Card tight className="mb-4">
        <div className="mb-2 flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
            <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama produk..." />
          </div>
        </div>
        <div className="flex gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <button onClick={applyFilter} className="flex-none rounded-xl bg-ink px-4 text-xs font-bold text-cream">
            {loading ? '...' : 'Terapkan'}
          </button>
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Card tight><p className="text-[11px] font-bold uppercase text-ink-soft">Total Qty</p><p className="font-mono text-lg font-bold text-ink">{totalQty.toLocaleString('id-ID')}</p></Card>
        <Card tight><p className="text-[11px] font-bold uppercase text-ink-soft">{sub === 'keluar' ? 'Total Omzet' : 'Total Nilai Modal'}</p><p className="font-mono text-lg font-bold text-peach-500">{rupiah(totalNilai)}</p></Card>
      </div>

      {sub === 'keluar' ? (
        filteredSales.length === 0 ? (
          <EmptyState icon={<History size={26} />} title="Tidak ada catatan penjualan" />
        ) : (
          <div className="space-y-2">
            {filteredSales.map((r) => (
              <Card key={r.id} tight className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{r.product_name_snapshot}</p>
                  <p className="text-[11px] text-ink-soft">{formatTanggalWaktu(r.sold_at)} {r.buyer_name ? `· ${r.buyer_name}` : ''}</p>
                </div>
                <div className="flex-none text-right">
                  <p className="font-mono text-sm font-bold text-ink">{rupiah(r.total)}</p>
                  <p className="font-mono text-[11px] text-ink-soft">{r.qty} x {rupiah(r.unit_price)}</p>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : filteredStockIn.length === 0 ? (
        <EmptyState icon={<History size={26} />} title="Tidak ada catatan barang masuk" />
      ) : (
        <div className="space-y-2">
          {filteredStockIn.map((r) => (
            <Card key={r.id} tight className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{r.product_name_snapshot}</p>
                <p className="text-[11px] text-ink-soft">{formatTanggal(r.received_at)}</p>
              </div>
              <div className="flex-none text-right">
                <p className="font-mono text-sm font-bold text-mint-600">+{r.qty}</p>
                <p className="font-mono text-[11px] text-ink-soft">modal {rupiah(r.buy_price)}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      <button onClick={exportCsv} className="mt-5 flex items-center gap-1.5 text-xs font-bold text-ink-soft hover:text-ink">
        <Download size={14} /> Unduh Riwayat (CSV)
      </button>
    </div>
  );
}
