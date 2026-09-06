'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Search, Download, History, FileText, ChevronLeft, ChevronRight, User, Clock, TrendingUp, Package, Edit2, Save, Users, Receipt } from 'lucide-react';
import { Card, Input, ToggleGroup, EmptyState, Badge, Field, Button } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { getSalesHistory, getStockInHistory, getProductStockById, updateSaleTransaction } from '@/lib/actions/sales';
import { downloadCsv } from '@/lib/csv';
import { exportSalesToPdf } from '@/lib/pdf';
import { rupiah, formatTanggal, formatTanggalWaktu, formatQty, pricePerKgFromPerGram, pricePerGramFromPerKg, combineDateWithNowTime } from '@/lib/format';
import type { SaleRow, StockInHistoryRow } from '@/lib/types';

const PAGE_SIZE = 20;

interface BuyerDayGroup {
  key: string;
  buyerName: string;
  dateKey: string;
  items: SaleRow[];
  totalOmzet: number;
  totalUntung: number;
  latestSoldAt: string;
}

function groupSalesByBuyerDay(sales: SaleRow[]): BuyerDayGroup[] {
  const map = new Map<string, BuyerDayGroup>();
  for (const s of sales) {
    const buyerName = s.buyer_name?.trim() || 'Tanpa Nama Pembeli';
    const dateKey = s.sold_at.slice(0, 10);
    const key = `${buyerName}__${dateKey}`;
    let g = map.get(key);
    if (!g) {
      g = { key, buyerName, dateKey, items: [], totalOmzet: 0, totalUntung: 0, latestSoldAt: s.sold_at };
      map.set(key, g);
    }
    g.items.push(s);
    g.totalOmzet += s.total;
    g.totalUntung += (s.unit_price - s.unit_cost) * s.qty;
    if (s.sold_at > g.latestSoldAt) g.latestSoldAt = s.sold_at;
  }
  return [...map.values()].sort((a, b) => b.latestSoldAt.localeCompare(a.latestSoldAt));
}

export function RiwayatClient({
  initialSales,
  initialStockIn,
  namaWarung,
}: {
  initialSales: SaleRow[];
  initialStockIn: StockInHistoryRow[];
  namaWarung: string;
}) {
  const [sub, setSub] = useState<'masuk' | 'keluar'>('keluar');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sales, setSales] = useState(initialSales);
  const [stockIn, setStockIn] = useState(initialStockIn);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [openGroup, setOpenGroup] = useState<BuyerDayGroup | null>(null);
  const [detailSale, setDetailSale] = useState<SaleRow | null>(null);

  async function reloadSales() {
    const fresh = await getSalesHistory({ from, to, search });
    setSales(fresh);
    // refresh grup yang sedang dibuka & sale yang sedang dilihat, kalau ada
    if (openGroup) {
      const stillThere = fresh.filter((s) => (s.buyer_name?.trim() || 'Tanpa Nama Pembeli') + '__' + s.sold_at.slice(0, 10) === openGroup.key);
      if (stillThere.length) {
        setOpenGroup({ ...openGroup, items: stillThere });
      } else {
        setOpenGroup(null);
      }
    }
    if (detailSale) {
      const updated = fresh.find((s) => s.id === detailSale.id);
      setDetailSale(updated || null);
    }
  }

  async function applyFilter() {
    setLoading(true);
    try {
      if (sub === 'keluar') setSales(await getSalesHistory({ from, to, search }));
      else setStockIn(await getStockInHistory({ from, to, search }));
      setPage(1);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { setPage(1); }, [sub, search]);

  const filteredSales = useMemo(() => {
    if (!search.trim()) return sales;
    const q = search.trim().toLowerCase();
    return sales.filter((s) => s.product_name_snapshot.toLowerCase().includes(q) || (s.buyer_name || '').toLowerCase().includes(q));
  }, [sales, search]);

  const filteredStockIn = useMemo(() => {
    if (!search.trim()) return stockIn;
    const q = search.trim().toLowerCase();
    return stockIn.filter((s) => s.product_name_snapshot.toLowerCase().includes(q));
  }, [stockIn, search]);

  const groups = useMemo(() => groupSalesByBuyerDay(filteredSales), [filteredSales]);

  const totalQty = sub === 'keluar' ? filteredSales.reduce((s, r) => s + r.qty, 0) : filteredStockIn.reduce((s, r) => s + r.qty, 0);
  const totalNilai =
    sub === 'keluar'
      ? filteredSales.reduce((s, r) => s + r.total, 0)
      : filteredStockIn.reduce((s, r) => s + r.qty * (r.buy_price || 0), 0);

  const totalPages = Math.max(1, Math.ceil((sub === 'keluar' ? groups.length : filteredStockIn.length) / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pagedGroups = groups.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);
  const pagedStockIn = filteredStockIn.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  function exportCsv() {
    const rows: (string | number)[][] = [['Tanggal', 'Produk', 'Qty', 'Harga Modal', 'Harga Jual']];
    filteredStockIn.forEach((r) => rows.push([formatTanggal(r.received_at), r.product_name_snapshot, r.qty, r.buy_price || 0, r.sell_price || 0]));
    downloadCsv('riwayat-barang-masuk.csv', rows);
  }

  function exportPdf() {
    exportSalesToPdf(filteredSales, { from, to, namaWarung });
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
            <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={sub === 'keluar' ? 'Cari nama produk / pembeli...' : 'Cari nama produk...'} />
          </div>
        </div>
        <div className="flex gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="mt-2 flex gap-2">
          <button onClick={applyFilter} className="flex-1 rounded-xl bg-ink py-2.5 text-xs font-bold text-cream">
            {loading ? 'Memuat...' : 'Terapkan'}
          </button>
          {sub === 'keluar' ? (
            <button onClick={exportPdf} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-peach-200 bg-peach-50 py-2.5 text-xs font-bold text-peach-600">
              <FileText size={14} /> Unduh PDF
            </button>
          ) : (
            <button onClick={exportCsv} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-lilac-200 bg-lilac-50 py-2.5 text-xs font-bold text-ink-soft">
              <Download size={14} /> Unduh CSV
            </button>
          )}
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Card tight><p className="text-[11px] font-bold uppercase text-ink-soft">Total Qty</p><p className="font-mono text-lg font-bold text-ink">{totalQty.toLocaleString('id-ID')}</p></Card>
        <Card tight><p className="text-[11px] font-bold uppercase text-ink-soft">{sub === 'keluar' ? 'Total Omzet' : 'Total Nilai Modal'}</p><p className="font-mono text-lg font-bold text-peach-500">{rupiah(totalNilai)}</p></Card>
      </div>

      {sub === 'keluar' ? (
        groups.length === 0 ? (
          <EmptyState icon={<History size={26} />} title="Tidak ada catatan penjualan" />
        ) : (
          <>
            <p className="mb-2 text-[11px] font-semibold text-ink-soft">Tekan nama pembeli untuk lihat semua belanjaannya di hari itu.</p>
            <div className="space-y-2">
              {pagedGroups.map((g) => (
                <button key={g.key} onClick={() => setOpenGroup(g)} className="block w-full text-left">
                  <Card tight className="flex items-center gap-3 transition hover:border-peach-200">
                    <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-lilac-100 text-lilac-400">
                      <Users size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug text-ink">{g.buyerName}</p>
                      <p className="text-[11px] text-ink-soft">{formatTanggal(g.dateKey)} &middot; {g.items.length} produk</p>
                    </div>
                    <div className="flex-none text-right">
                      <p className="font-mono text-sm font-bold text-ink">{rupiah(g.totalOmzet)}</p>
                      <p className="font-mono text-[11px] text-mint-600">+{rupiah(g.totalUntung)}</p>
                    </div>
                  </Card>
                </button>
              ))}
            </div>
          </>
        )
      ) : filteredStockIn.length === 0 ? (
        <EmptyState icon={<History size={26} />} title="Tidak ada catatan barang masuk" />
      ) : (
        <div className="space-y-2">
          {pagedStockIn.map((r, idx) => (
            <Card key={r.id} tight className="flex items-center gap-3">
              <span className="w-6 flex-none text-center font-mono text-[11px] text-ink-soft">{(pageSafe - 1) * PAGE_SIZE + idx + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-snug text-ink">{r.product_name_snapshot}</p>
                <p className="text-[11px] text-ink-soft">{formatTanggal(r.received_at)}</p>
              </div>
              <div className="flex-none text-right">
                <p className="font-mono text-sm font-bold text-mint-600">+{formatQty(r.qty, r.product?.unit_type || 'pcs')}</p>
                <p className="font-mono text-[11px] text-ink-soft">modal {rupiah(r.buy_price)}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3">
          <button disabled={pageSafe <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="flex h-9 w-9 items-center justify-center rounded-full border border-lilac-200 bg-white text-ink disabled:opacity-30">
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-bold text-ink-soft">Halaman {pageSafe} dari {totalPages}</span>
          <button disabled={pageSafe >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="flex h-9 w-9 items-center justify-center rounded-full border border-lilac-200 bg-white text-ink disabled:opacity-30">
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      <BuyerDayModal
        group={openGroup}
        onClose={() => setOpenGroup(null)}
        onSelectItem={(s) => setDetailSale(s)}
      />

      <SaleDetailModal
        sale={detailSale}
        onClose={() => setDetailSale(null)}
        onUpdated={reloadSales}
      />
    </div>
  );
}

function BuyerDayModal({ group, onClose, onSelectItem }: { group: BuyerDayGroup | null; onClose: () => void; onSelectItem: (s: SaleRow) => void }) {
  if (!group) return null;
  return (
    <Modal open={!!group} onClose={onClose} title={group.buyerName}>
      <p className="mb-4 text-xs text-ink-soft">{formatTanggal(group.dateKey)} &middot; {group.items.length} produk dibeli &middot; total <span className="font-bold text-ink">{rupiah(group.totalOmzet)}</span></p>
      <div className="space-y-2">
        {group.items
          .slice()
          .sort((a, b) => b.sold_at.localeCompare(a.sold_at))
          .map((s) => (
            <button key={s.id} onClick={() => onSelectItem(s)} className="block w-full text-left">
              <Card tight className="flex items-center gap-3 transition hover:border-peach-200">
                <Receipt size={16} className="flex-none text-lilac-300" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug text-ink">{s.product_name_snapshot}</p>
                  <p className="text-[11px] text-ink-soft">{formatQty(s.qty, s.product?.unit_type || 'pcs')} &middot; {formatTanggalWaktu(s.sold_at).split(' ').slice(-1)[0]}</p>
                </div>
                <div className="flex-none font-mono text-sm font-bold text-ink">{rupiah(s.total)}</div>
              </Card>
            </button>
          ))}
      </div>
    </Modal>
  );
}

function SaleDetailModal({ sale, onClose, onUpdated }: { sale: SaleRow | null; onClose: () => void; onUpdated: () => void }) {
  const [stok, setStok] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setEditing(false);
    if (!sale) { setStok(null); return; }
    getProductStockById(sale.product_id).then(setStok).catch(() => setStok(null));
  }, [sale]);

  if (!sale) return null;

  const isGram = sale.product?.unit_type === 'gram';
  const profit = (sale.unit_price - sale.unit_cost) * sale.qty;
  const durasi = sale.batch?.received_at
    ? Math.round((new Date(sale.sold_at).getTime() - new Date(sale.batch.received_at).getTime()) / 86400000)
    : null;

  if (editing) {
    return <SaleEditForm sale={sale} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); onUpdated(); }} />;
  }

  return (
    <Modal open={!!sale} onClose={onClose} title="Detail Transaksi">
      <p className="mb-1 font-display text-lg font-bold text-ink">{sale.product_name_snapshot}</p>
      <p className="mb-4 text-xs text-ink-soft">{formatTanggalWaktu(sale.sold_at)}</p>

      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <DetailStat label="Qty Terjual" value={formatQty(sale.qty, sale.product?.unit_type || 'pcs')} />
        <DetailStat label="Harga Satuan" value={rupiah(isGram ? pricePerKgFromPerGram(sale.unit_price) : sale.unit_price) + (isGram ? '/kg' : '')} />
        <DetailStat label="Total" value={rupiah(sale.total)} highlight />
        <DetailStat label="Keuntungan" value={rupiah(profit)} good />
      </div>

      <div className="mb-4 space-y-2.5 rounded-2xl bg-lilac-50 p-3.5">
        <InfoLine icon={<User size={14} />} label="Pembeli" value={sale.buyer_name || 'Tidak dicatat'} />
        {durasi !== null && (
          <InfoLine icon={<Clock size={14} />} label="Lama di stok sebelum terjual" value={durasi <= 0 ? 'Hari yang sama' : `${durasi} hari`} />
        )}
        <InfoLine icon={<TrendingUp size={14} />} label="Harga Modal Saat Itu" value={rupiah(isGram ? pricePerKgFromPerGram(sale.unit_cost) : sale.unit_cost) + (isGram ? '/kg' : '')} />
        <InfoLine icon={<Package size={14} />} label="Sisa Stok Produk Ini Sekarang" value={stok === null ? 'Memuat...' : formatQty(stok, sale.product?.unit_type || 'pcs')} />
      </div>

      <button
        onClick={() => setEditing(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3 text-sm font-bold text-cream shadow-soft active:scale-[0.98]"
      >
        <Edit2 size={15} /> Edit Transaksi Ini
      </button>
    </Modal>
  );
}

function SaleEditForm({ sale, onCancel, onSaved }: { sale: SaleRow; onCancel: () => void; onSaved: () => void }) {
  const isGram = sale.product?.unit_type === 'gram';
  const [qty, setQty] = useState(String(sale.qty));
  const [priceDisplay, setPriceDisplay] = useState(String(isGram ? pricePerKgFromPerGram(sale.unit_price) : sale.unit_price));
  const [buyerName, setBuyerName] = useState(sale.buyer_name || '');
  const [dateStr, setDateStr] = useState(sale.sold_at.slice(0, 10));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const qtyNum = parseFloat(qty);
    const priceNum = parseFloat(priceDisplay);
    if (!qtyNum || qtyNum <= 0) { toast.error('Qty harus lebih dari 0'); return; }
    if (isNaN(priceNum) || priceNum < 0) { toast.error('Harga tidak valid'); return; }
    if (!dateStr) { toast.error('Tanggal wajib diisi'); return; }

    setSaving(true);
    const res = await updateSaleTransaction({
      saleId: sale.id,
      qty: qtyNum,
      unitPrice: isGram ? pricePerGramFromPerKg(priceNum) : priceNum,
      buyerName,
      soldAt: combineDateWithNowTime(dateStr),
    });
    setSaving(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success('Transaksi berhasil diperbarui');
    onSaved();
  }

  return (
    <Modal open onClose={onCancel} title="Edit Transaksi">
      <p className="mb-4 font-display text-base font-bold text-ink">{sale.product_name_snapshot}</p>

      <div className="mb-2 rounded-xl bg-butter-50 p-3 text-[11px] leading-relaxed text-ink-soft">
        Kalau qty diubah, stok produk otomatis disesuaikan (ditambah/dikurangi sesuai selisihnya) dari batch yang sama dengan transaksi aslinya.
      </div>

      <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        <Field label="Tanggal Transaksi">
          <Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
        </Field>
        <Field label="Nama Pembeli">
          <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Cth: Bu Lubis" />
        </Field>
        <Field label={isGram ? 'Qty (gram)' : 'Qty'}>
          <Input type="number" step="any" min={0} value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label={isGram ? 'Harga Jual /kg' : 'Harga Jual'}>
          <Input type="number" step="any" min={0} value={priceDisplay} onChange={(e) => setPriceDisplay(e.target.value)} />
        </Field>
      </div>

      <div className="mt-4 flex gap-2">
        <Button variant="ghost" full onClick={onCancel} disabled={saving}>Batal</Button>
        <Button full onClick={handleSave} disabled={saving}>
          <Save size={16} /> {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
        </Button>
      </div>
    </Modal>
  );
}

function DetailStat({ label, value, highlight, good }: { label: string; value: string; highlight?: boolean; good?: boolean }) {
  return (
    <div className="rounded-xl border border-lilac-100 p-3">
      <p className="text-[10px] font-bold uppercase text-ink-soft">{label}</p>
      <p className={`font-mono text-base font-bold ${good ? 'text-mint-600' : highlight ? 'text-peach-500' : 'text-ink'}`}>{value}</p>
    </div>
  );
}
function InfoLine({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <span className="text-ink-soft">{icon}</span>
      <span className="flex-1 text-ink-soft">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
  );
}
