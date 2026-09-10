'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Search, Download, History, FileText, ChevronLeft, ChevronRight, Users, Receipt, Edit2, Save, Trash2, RefreshCw, X, Package } from 'lucide-react';
import { Card, Input, ToggleGroup, EmptyState, Field, Button } from '@/components/ui';
import { Modal, ConfirmDialog } from '@/components/Modal';
import { getSalesHistory, getStockInHistory, getProductStockById, updateSaleTransaction, deleteSaleTransaction, renameBuyerForGroup, changeSaleProduct, rescheduleGroupDate } from '@/lib/actions/sales';
import { getProductSummaries, deleteProductBatch } from '@/lib/actions/products';
import { downloadCsv } from '@/lib/csv';
import { exportSalesToPdf } from '@/lib/pdf';
import { rupiah, formatTanggal, formatTanggalWaktu, formatQty, pricePerKgFromPerGram, pricePerGramFromPerKg, combineDateWithNowTime } from '@/lib/format';
import type { SaleRow, StockInHistoryRow, ProductStockSummary } from '@/lib/types';

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

export function RiwayatClient({ initialSales, initialStockIn, namaWarung }: {
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

  async function reloadSales(fromVal = from, toVal = to, searchVal = search) {
    const fresh = await getSalesHistory({ from: fromVal, to: toVal, search: searchVal });
    setSales(fresh);
    if (openGroup) {
      const stillThere = fresh.filter((s) =>
        (s.buyer_name?.trim() || 'Tanpa Nama Pembeli') + '__' + s.sold_at.slice(0, 10) === openGroup.key
      );
      setOpenGroup(stillThere.length ? { ...openGroup, items: stillThere } : null);
    }
    if (detailSale) setDetailSale(fresh.find((s) => s.id === detailSale.id) || null);
  }

  async function applyFilter() {
    setLoading(true);
    try {
      if (sub === 'keluar') await reloadSales();
      else setStockIn(await getStockInHistory({ from, to, search }));
      setPage(1);
    } finally { setLoading(false); }
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
  const totalOmzet = filteredSales.reduce((s, r) => s + r.total, 0);
  const totalNilaiMasuk = filteredStockIn.reduce((s, r) => s + r.qty * (r.buy_price || 0), 0);
  const totalPages = Math.max(1, Math.ceil((sub === 'keluar' ? groups.length : filteredStockIn.length) / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pagedGroups = groups.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);
  const pagedStockIn = filteredStockIn.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

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
            <button onClick={() => exportSalesToPdf(filteredSales, { from, to, namaWarung })}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-peach-200 bg-peach-50 py-2.5 text-xs font-bold text-peach-600">
              <FileText size={14} /> Unduh PDF
            </button>
          ) : (
            <button onClick={() => {
              const rows: (string | number)[][] = [['Tanggal', 'Produk', 'Qty', 'Harga Modal', 'Harga Jual']];
              filteredStockIn.forEach((r) => rows.push([formatTanggal(r.received_at), r.product_name_snapshot, r.qty, r.buy_price || 0, r.sell_price || 0]));
              downloadCsv('riwayat-barang-masuk.csv', rows);
            }} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-lilac-200 bg-lilac-50 py-2.5 text-xs font-bold text-ink-soft">
              <Download size={14} /> Unduh CSV
            </button>
          )}
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Card tight>
          <p className="text-[11px] font-bold uppercase text-ink-soft">{sub === 'keluar' ? 'Transaksi' : 'Item Masuk'}</p>
          <p className="font-mono text-lg font-bold text-ink">{sub === 'keluar' ? groups.length : filteredStockIn.length}</p>
        </Card>
        <Card tight>
          <p className="text-[11px] font-bold uppercase text-ink-soft">{sub === 'keluar' ? 'Total Omzet' : 'Nilai Modal'}</p>
          <p className="font-mono text-lg font-bold text-peach-500">{rupiah(sub === 'keluar' ? totalOmzet : totalNilaiMasuk)}</p>
        </Card>
      </div>

      {sub === 'keluar' ? (
        groups.length === 0 ? <EmptyState icon={<History size={26} />} title="Tidak ada penjualan" /> : (
          <>
            <p className="mb-2 text-[11px] font-semibold text-ink-soft">Ketuk untuk lihat detail. Edit/hapus dari popup detail produknya.</p>
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
      ) : (
        filteredStockIn.length === 0 ? <EmptyState icon={<History size={26} />} title="Tidak ada barang masuk" /> : (
          <div className="space-y-2">
            {pagedStockIn.map((r, idx) => (
              <StockInRow
                key={r.id}
                r={r}
                idx={(pageSafe - 1) * PAGE_SIZE + idx}
                onDeleted={async () => {
                  const fresh = await getStockInHistory({ from, to, search });
                  setStockIn(fresh);
                }}
              />
            ))}
          </div>
        )
      )}

      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3">
          <button disabled={pageSafe <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-lilac-200 bg-white text-ink disabled:opacity-30">
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-bold text-ink-soft">Halaman {pageSafe} dari {totalPages}</span>
          <button disabled={pageSafe >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-lilac-200 bg-white text-ink disabled:opacity-30">
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      <BuyerDayModal
        group={openGroup}
        onClose={() => setOpenGroup(null)}
        onSelectItem={(s) => setDetailSale(s)}
        onGroupRenamed={reloadSales}
      />
      <SaleDetailModal
        sale={detailSale}
        onClose={() => setDetailSale(null)}
        onUpdated={reloadSales}
        onDeleted={() => { setDetailSale(null); reloadSales(); }}
      />
    </div>
  );
}

function StockInRow({ r, idx, onDeleted }: { r: StockInHistoryRow; idx: number; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [searchProd, setSearchProd] = useState('');
  const [allProds, setAllProds] = useState<ProductStockSummary[]>([]);
  const [selectedProd, setSelectedProd] = useState<ProductStockSummary | null>(null);
  const [saving, setSaving] = useState(false);

  const filteredProds = useMemo(() => {
    const q = searchProd.trim().toLowerCase();
    if (!q) return allProds.slice(0, 8);
    return allProds.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)).slice(0, 8);
  }, [allProds, searchProd]);

  async function openEdit() {
    setEditing(true);
    if (allProds.length === 0) {
      const prods = await getProductSummaries();
      setAllProds(prods);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    const res = await deleteProductBatch(r.batch_id || r.id);
    setDeleting(false);
    if (!res.ok) { toast.error(res.error); setConfirm(false); return; }
    toast.success('Barang masuk dihapus');
    setConfirm(false);
    onDeleted();
  }

  async function handleChangeProduct() {
    if (!selectedProd) { toast.error('Pilih produk pengganti dulu'); return; }
    setSaving(true);
    // Update product_id di batch dan snapshot nama
    const supabase = (await import('@/lib/supabase/client')).createClient();
    const { error } = await supabase
      .from('product_batches')
      .update({ product_id: selectedProd.product_id })
      .eq('id', r.batch_id || r.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Produk diubah ke "${selectedProd.name}"`);
    setEditing(false);
    onDeleted(); // refresh list
  }

  if (editing) {
    return (
      <Card tight>
        <p className="mb-2 text-[11px] font-bold text-ink">Ganti Produk Barang Masuk</p>
        <p className="mb-2 text-[11px] text-ink-soft">
          Saat ini: <span className="font-bold text-ink">{r.product_name_snapshot}</span> · {formatQty(r.qty, r.product?.unit_type || 'pcs')} · {formatTanggal(r.received_at)}
        </p>
        <Input
          value={searchProd}
          onChange={(e) => { setSearchProd(e.target.value); setSelectedProd(null); }}
          placeholder="Cari produk pengganti..."
          className="mb-2"
          autoFocus
        />
        <div className="mb-2 max-h-40 overflow-y-auto rounded-xl border border-lilac-100">
          {filteredProds.map((p) => (
            <button key={p.product_id} onClick={() => setSelectedProd(p)}
              className={`flex w-full items-center gap-2 border-b border-lilac-50 px-3 py-2 text-left last:border-0 ${selectedProd?.product_id === p.product_id ? 'bg-peach-50' : 'hover:bg-lilac-50'}`}>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-ink">{p.name}</p>
                <p className="font-mono text-[10px] text-ink-soft">{p.code} · stok {formatQty(p.stok, p.unit_type)}</p>
              </div>
            </button>
          ))}
        </div>
        {selectedProd && (
          <p className="mb-2 text-[11px] text-mint-600 font-bold">Dipilih: {selectedProd.name}</p>
        )}
        <div className="flex gap-2">
          <button onClick={() => setEditing(false)} className="flex-1 rounded-xl border border-lilac-200 py-2 text-[11px] font-bold text-ink-soft">Batal</button>
          <button onClick={handleChangeProduct} disabled={saving || !selectedProd}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink py-2 text-[11px] font-bold text-cream disabled:opacity-50">
            <RefreshCw size={12} /> {saving ? 'Menyimpan...' : 'Ganti Produk'}
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card tight>
      {confirm ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
          <p className="mb-1 text-[11px] font-bold text-rose-600">Hapus barang masuk ini?</p>
          <p className="mb-2 text-[11px] text-rose-500">
            {r.product_name_snapshot} · +{formatQty(r.qty, r.product?.unit_type || 'pcs')} · {formatTanggal(r.received_at)}<br />
            Stok produk akan berkurang.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirm(false)} className="flex-1 rounded-xl border border-rose-200 py-2 text-[11px] font-bold text-ink-soft">Batal</button>
            <button onClick={handleDelete} disabled={deleting}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-500 py-2 text-[11px] font-bold text-white disabled:opacity-50">
              <Trash2 size={12} /> {deleting ? 'Menghapus...' : 'Ya, Hapus'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="w-6 flex-none text-center font-mono text-[11px] text-ink-soft">{idx + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-snug text-ink">{r.product_name_snapshot}</p>
            <p className="text-[11px] text-ink-soft">{formatTanggal(r.received_at)}</p>
          </div>
          <div className="flex-none text-right">
            <p className="font-mono text-sm font-bold text-mint-600">+{formatQty(r.qty, r.product?.unit_type || 'pcs')}</p>
            <p className="font-mono text-[11px] text-ink-soft">modal {rupiah(r.buy_price)}</p>
          </div>
          <div className="flex gap-1">
            <button onClick={openEdit} className="flex h-7 w-7 items-center justify-center rounded-lg bg-lilac-100 text-lilac-500">
              <RefreshCw size={12} />
            </button>
            <button onClick={() => setConfirm(true)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100 text-rose-500">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function BuyerDayModal({ group, onClose, onSelectItem, onGroupRenamed }: {
  group: BuyerDayGroup | null;
  onClose: () => void;
  onSelectItem: (s: SaleRow) => void;
  onGroupRenamed: () => void;
}) {
  const [mode, setMode] = useState<'view' | 'editName' | 'editDate'>('view');
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (group) {
      setMode('view');
      setNewName(group.buyerName === 'Tanpa Nama Pembeli' ? '' : group.buyerName);
      setNewDate(group.dateKey);
    }
  }, [group]);

  if (!group) return null;

  async function handleRename() {
    if (!newName.trim()) { toast.error('Nama tidak boleh kosong'); return; }
    setSaving(true);
    const oldName = group!.buyerName === 'Tanpa Nama Pembeli' ? '' : group!.buyerName;
    const res = await renameBuyerForGroup(oldName, group!.dateKey, newName.trim());
    setSaving(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(`${res.count} transaksi berhasil diganti namanya`);
    setMode('view'); onGroupRenamed(); onClose();
  }

  async function handleReschedule() {
    if (!newDate) { toast.error('Pilih tanggal baru'); return; }
    if (newDate === group!.dateKey) { toast.error('Tanggal sama dengan sebelumnya'); return; }
    setSaving(true);
    const oldName = group!.buyerName === 'Tanpa Nama Pembeli' ? '' : group!.buyerName;
    const res = await rescheduleGroupDate(oldName, group!.dateKey, newDate);
    setSaving(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(`${res.count} transaksi dipindah ke ${newDate}`);
    setMode('view'); onGroupRenamed(); onClose();
  }

  return (
    <Modal open={!!group} onClose={onClose} title={group.buyerName}>
      {mode === 'editName' && (
        <div className="mb-4">
          <p className="mb-2 text-[11px] text-ink-soft">Nama baru diterapkan ke semua {group.items.length} transaksi tanggal {formatTanggal(group.dateKey)}.</p>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nama pembeli baru..." autoFocus />
          <div className="mt-2 flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setMode('view')} disabled={saving}>Batal</Button>
            <Button size="sm" onClick={handleRename} disabled={saving} full>
              <Save size={14} /> {saving ? 'Menyimpan...' : 'Simpan Nama'}
            </Button>
          </div>
        </div>
      )}
      {mode === 'editDate' && (
        <div className="mb-4">
          <p className="mb-2 text-[11px] text-ink-soft">Pindahkan semua <strong>{group.items.length} transaksi</strong> dari <strong>{formatTanggal(group.dateKey)}</strong> ke tanggal baru:</p>
          <div className="mb-2 rounded-xl bg-butter-50 p-3 text-[11px] text-ink-soft">
            ⚠️ Semua produk yang dibeli {group.buyerName} pada {formatTanggal(group.dateKey)} akan dipindah sekaligus.
          </div>
          <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
          <div className="mt-2 flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setMode('view')} disabled={saving}>Batal</Button>
            <Button size="sm" onClick={handleReschedule} disabled={saving} full>
              <Save size={14} /> {saving ? 'Memindahkan...' : 'Pindah Tanggal'}
            </Button>
          </div>
        </div>
      )}
      {mode === 'view' && (
        <div className="mb-4">
          <p className="mb-2 text-xs text-ink-soft">{formatTanggal(group.dateKey)} &middot; {group.items.length} produk &middot; total <span className="font-bold text-ink">{rupiah(group.totalOmzet)}</span></p>
          <div className="flex gap-2">
            <button onClick={() => setMode('editName')} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-lilac-100 py-2 text-[11px] font-bold text-ink">
              <Edit2 size={12} /> Edit Nama
            </button>
            <button onClick={() => setMode('editDate')} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-butter-100 py-2 text-[11px] font-bold text-ink">
              <Save size={12} /> Edit Tanggal
            </button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {group.items.slice().sort((a, b) => b.sold_at.localeCompare(a.sold_at)).map((s) => (
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


function SaleDetailModal({ sale, onClose, onUpdated, onDeleted }: {
  sale: SaleRow | null;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
}) {
  const [stok, setStok] = useState<number | null>(null);
  const [mode, setMode] = useState<'view' | 'edit' | 'changeProduct' | 'confirmDelete'>('view');

  useEffect(() => {
    setMode('view');
    if (!sale) { setStok(null); return; }
    getProductStockById(sale.product_id).then(setStok).catch(() => setStok(null));
  }, [sale]);

  if (!sale) return null;
  const isGram = sale.product?.unit_type === 'gram';
  const profit = (sale.unit_price - sale.unit_cost) * sale.qty;

  if (mode === 'edit') return <SaleEditForm sale={sale} onCancel={() => setMode('view')} onSaved={() => { setMode('view'); onUpdated(); }} />;
  if (mode === 'changeProduct') return <SaleChangeProductModal sale={sale} onCancel={() => setMode('view')} onSaved={() => { setMode('view'); onUpdated(); }} />;

  return (
    <Modal open={!!sale} onClose={onClose} title="Detail Transaksi">
      {mode === 'confirmDelete' && (
        <div className="mb-4 rounded-xl border-2 border-rose-200 bg-rose-50 p-3">
          <p className="mb-2 text-sm font-bold text-rose-600">Hapus transaksi ini?</p>
          <p className="mb-3 text-[11px] text-rose-500">Stok {sale.product_name_snapshot} akan dikembalikan sebanyak {formatQty(sale.qty, sale.product?.unit_type || 'pcs')}.</p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setMode('view')}>Batal</Button>
            <button onClick={async () => {
              const res = await deleteSaleTransaction(sale.id);
              if (!res.ok) { toast.error(res.error); return; }
              toast.success('Transaksi dihapus, stok dikembalikan');
              onDeleted();
            }} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-500 py-2.5 text-xs font-bold text-white">
              <Trash2 size={14} /> Ya, Hapus
            </button>
          </div>
        </div>
      )}

      <p className="mb-1 font-display text-lg font-bold text-ink">{sale.product_name_snapshot}</p>
      <p className="mb-4 text-xs text-ink-soft">{formatTanggalWaktu(sale.sold_at)}</p>

      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-lilac-100 p-3">
          <p className="text-[10px] font-bold uppercase text-ink-soft">Qty Terjual</p>
          <p className="font-mono text-base font-bold text-ink">{formatQty(sale.qty, sale.product?.unit_type || 'pcs')}</p>
        </div>
        <div className="rounded-xl border border-lilac-100 p-3">
          <p className="text-[10px] font-bold uppercase text-ink-soft">Harga Satuan</p>
          <p className="font-mono text-base font-bold text-ink">{rupiah(isGram ? pricePerKgFromPerGram(sale.unit_price) : sale.unit_price)}{isGram ? '/kg' : ''}</p>
        </div>
        <div className="rounded-xl border border-lilac-100 p-3">
          <p className="text-[10px] font-bold uppercase text-ink-soft">Total</p>
          <p className="font-mono text-base font-bold text-peach-500">{rupiah(sale.total)}</p>
        </div>
        <div className="rounded-xl border border-lilac-100 p-3">
          <p className="text-[10px] font-bold uppercase text-ink-soft">Keuntungan</p>
          <p className="font-mono text-base font-bold text-mint-600">{rupiah(profit)}</p>
        </div>
      </div>

      <div className="mb-4 space-y-2 rounded-2xl bg-lilac-50 p-3.5 text-sm">
        <div className="flex items-center gap-2.5">
          <span className="text-ink-soft">👤</span>
          <span className="flex-1 text-ink-soft">Pembeli</span>
          <span className="font-semibold text-ink">{sale.buyer_name || 'Tidak dicatat'}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <Package size={14} className="text-ink-soft" />
          <span className="flex-1 text-ink-soft">Sisa Stok Sekarang</span>
          <span className="font-semibold text-ink">{stok === null ? 'Memuat...' : formatQty(stok, sale.product?.unit_type || 'pcs')}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setMode('edit')}
          className="flex items-center justify-center gap-2 rounded-2xl border border-lilac-200 py-3 text-sm font-bold text-ink active:scale-[0.98]">
          <Edit2 size={15} /> Edit Transaksi
        </button>
        <button onClick={() => setMode('changeProduct')}
          className="flex items-center justify-center gap-2 rounded-2xl border border-lilac-200 py-3 text-sm font-bold text-ink active:scale-[0.98]">
          <RefreshCw size={15} /> Ganti Produk
        </button>
        <button onClick={() => setMode('confirmDelete')}
          className="col-span-2 flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 py-3 text-sm font-bold text-rose-500 active:scale-[0.98]">
          <Trash2 size={15} /> Hapus Transaksi Ini
        </button>
      </div>
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
    if (!qtyNum || qtyNum <= 0) { toast.error('Qty harus lebih dari 0'); return; }
    setSaving(true);
    const res = await updateSaleTransaction({
      saleId: sale.id,
      qty: qtyNum,
      unitPrice: isGram ? pricePerGramFromPerKg(parseFloat(priceDisplay)) : parseFloat(priceDisplay),
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
      <p className="mb-3 font-display text-base font-bold text-ink">{sale.product_name_snapshot}</p>
      <div className="mb-3 rounded-xl bg-butter-50 p-3 text-[11px] text-ink-soft">
        Kalau qty diubah, stok produk otomatis disesuaikan dari batch yang sama.
      </div>
      <div className="space-y-3">
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
          <Save size={16} /> {saving ? 'Menyimpan...' : 'Simpan'}
        </Button>
      </div>
    </Modal>
  );
}

function SaleChangeProductModal({ sale, onCancel, onSaved }: { sale: SaleRow; onCancel: () => void; onSaved: () => void }) {
  const [search, setSearch] = useState('');
  const [allProducts, setAllProducts] = useState<ProductStockSummary[]>([]);
  const [selected, setSelected] = useState<ProductStockSummary | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getProductSummaries().then(setAllProducts).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allProducts.slice(0, 10);
    return allProducts.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)).slice(0, 10);
  }, [allProducts, search]);

  async function handleSave() {
    if (!selected) { toast.error('Pilih produk pengganti dulu'); return; }
    setSaving(true);
    const res = await changeSaleProduct(sale.id, selected.product_id);
    setSaving(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success('Produk berhasil diganti');
    onSaved();
  }

  return (
    <Modal open onClose={onCancel} title="Ganti Produk">
      <p className="mb-3 text-[11px] text-ink-soft">
        Transaksi <span className="font-bold text-ink">{sale.product_name_snapshot}</span> ({formatQty(sale.qty, sale.product?.unit_type || 'pcs')}) akan dipindahkan ke produk lain.
        Stok produk lama dikembalikan, stok produk baru dipotong.
      </p>
      <Input
        value={search}
        onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
        placeholder="Cari produk pengganti..."
        className="mb-2"
        autoFocus
      />
      <div className="mb-3 max-h-52 overflow-y-auto rounded-xl border border-lilac-100">
        {filtered.map((p) => (
          <button
            key={p.product_id}
            onClick={() => setSelected(p)}
            className={`flex w-full items-center gap-2.5 border-b border-lilac-50 px-3 py-2.5 text-left last:border-0 ${selected?.product_id === p.product_id ? 'bg-peach-50' : 'hover:bg-lilac-50'}`}
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-snug text-ink">{p.name}</p>
              <p className="font-mono text-[11px] text-ink-soft">{p.code} &middot; stok {formatQty(p.stok, p.unit_type)}</p>
            </div>
            {selected?.product_id === p.product_id && <X size={14} className="flex-none text-peach-500" />}
          </button>
        ))}
      </div>
      {selected && (
        <div className="mb-3 rounded-xl bg-peach-50 p-3 text-[11px]">
          <span className="font-bold text-ink">Dipilih:</span> {selected.name} &middot; stok {formatQty(selected.stok, selected.unit_type)}
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="ghost" full onClick={onCancel} disabled={saving}>Batal</Button>
        <Button full onClick={handleSave} disabled={saving || !selected}>
          <RefreshCw size={15} /> {saving ? 'Mengganti...' : 'Ganti Produk'}
        </Button>
      </div>
    </Modal>
  );
}
