'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Search, Boxes, Plus, UploadCloud, X, Trash2, Download, Combine, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, Input, Chip, Badge, Button, EmptyState } from '@/components/ui';
import { ConfirmDialog } from '@/components/Modal';
import { downloadBarcodesAsPng } from '@/components/BarcodeCanvas';
import { ProductViewModal } from '@/components/produk/ProductViewModal';
import { ProductEditModal } from '@/components/produk/ProductEditModal';
import { MergeProductsModal } from '@/components/produk/MergeProductsModal';
import { getProductSummaries, deleteProduct } from '@/lib/actions/products';
import { useLongPress } from '@/lib/hooks/useLongPress';
import { rupiah, formatTanggal, formatQty, daysUntil } from '@/lib/format';
import type { ProductStockSummary } from '@/lib/types';
import Link from 'next/link';

type StatusFilter = 'all' | 'menipis' | 'habis' | 'bermasalah' | 'expired';
const PAGE_SIZE = 20;

export function ProdukClient({ initialProducts }: { initialProducts: ProductStockSummary[] }) {
  const searchParams = useSearchParams();
  const initialStatus = (searchParams.get('status') as StatusFilter) || 'all';
  const initialDays = Number(searchParams.get('days')) || 30;

  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>(
    ['all', 'menipis', 'habis', 'bermasalah', 'expired'].includes(initialStatus) ? initialStatus : 'all'
  );
  const [expiryDays, setExpiryDays] = useState(initialDays > 0 ? initialDays : 30);
  const [page, setPage] = useState(1);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<ProductStockSummary | null>(null);
  const [editing, setEditing] = useState<ProductStockSummary | null>(null);
  const [merging, setMerging] = useState<ProductStockSummary[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ProductStockSummary | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  async function refresh() {
    const fresh = await getProductSummaries();
    setProducts(fresh);
  }

  const filtered = useMemo(() => {
    let list = products;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
    }
    if (status === 'menipis') list = list.filter((p) => p.stok > 0 && p.stok <= p.low_stock_threshold);
    else if (status === 'habis') list = list.filter((p) => p.stok <= 0);
    else if (status === 'bermasalah') list = list.filter((p) => p.stok <= 0 || (p.stok > 0 && p.stok <= p.low_stock_threshold));
    else if (status === 'expired') list = list.filter((p) => { const d = daysUntil(p.kadaluwarsa_terdekat); return d !== null && d <= expiryDays; });
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [products, search, status, expiryDays]);

  useEffect(() => { setPage(1); }, [search, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paged = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  function toggleSelect(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  }
  function enterSelection(id: string) {
    setSelectionMode(true);
    setSelected(new Set([id]));
  }
  function cancelSelection() {
    setSelectionMode(false);
    setSelected(new Set());
  }

  function downloadSelectedBarcodes() {
    const items = products.filter((p) => selected.has(p.product_id)).map((p) => ({ code: p.code, filename: `${p.code}.png` }));
    if (!items.length) return;
    downloadBarcodesAsPng(items);
  }

  function openMergeModal() {
    const items = products.filter((p) => selected.has(p.product_id));
    if (items.length < 2) { toast.error('Pilih minimal 2 produk untuk digabung'); return; }
    setMerging(items);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await deleteProduct(deleteTarget.product_id);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(res.data.archived ? 'Produk diarsipkan (punya riwayat transaksi lama)' : 'Produk dihapus');
    setDeleteTarget(null);
    refresh();
  }

  async function handleBulkDelete() {
    const ids = [...selected];
    let archived = 0, deleted = 0, failed = 0;
    for (const id of ids) {
      const res = await deleteProduct(id);
      if (!res.ok) failed++;
      else if (res.data.archived) archived++;
      else deleted++;
    }
    setBulkDeleteConfirm(false);
    cancelSelection();
    await refresh();
    if (failed) toast.error(`${failed} produk gagal dihapus`);
    toast.success(`${deleted + archived} produk diproses${archived ? ` (${archived} diarsipkan karena punya riwayat)` : ''}`);
  }

  return (
    <div className="animate-slide-up">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink">Daftar Barang</h1>
          <p className="text-sm text-ink-soft">{products.length} produk terdaftar</p>
        </div>
        {!selectionMode && (
          <div className="flex flex-none gap-2">
            <Link href="/import">
              <Button variant="ghost" size="sm"><UploadCloud size={15} /> Import CSV</Button>
            </Link>
            <Link href="/barang-masuk">
              <Button variant="dark" size="sm"><Plus size={15} /> Produk Baru</Button>
            </Link>
          </div>
        )}
      </div>

      {selectionMode ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-ink px-4 py-3 text-cream">
          <button onClick={cancelSelection} className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
            <X size={15} />
          </button>
          <span className="flex-1 text-sm font-bold">{selected.size} dipilih</span>
          <Button variant="secondary" size="sm" onClick={openMergeModal}><Combine size={13} /> Gabung</Button>
          <Button variant="secondary" size="sm" onClick={downloadSelectedBarcodes}><Download size={13} /> Barcode</Button>
          <Button variant="danger" size="sm" onClick={() => setBulkDeleteConfirm(true)}><Trash2 size={13} /> Hapus</Button>
        </div>
      ) : (
        <>
          <div className="mb-3">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
              <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama atau kode..." />
            </div>
          </div>
          <div className="mb-4 flex gap-2 overflow-x-auto no-scrollbar">
            <Chip active={status === 'all'} onClick={() => setStatus('all')}>Semua</Chip>
            <Chip active={status === 'bermasalah'} onClick={() => setStatus('bermasalah')}>Stok Bermasalah</Chip>
            <Chip active={status === 'menipis'} onClick={() => setStatus('menipis')}>Stok Menipis</Chip>
            <Chip active={status === 'habis'} onClick={() => setStatus('habis')}>Stok Habis</Chip>
            <Chip active={status === 'expired'} onClick={() => setStatus('expired')}>Segera Kadaluwarsa</Chip>
          </div>
          {status === 'expired' && (
            <div className="mb-4 flex gap-2 overflow-x-auto no-scrollbar">
              {[30, 90, 180, 365].map((d) => (
                <Chip key={d} active={expiryDays === d} onClick={() => setExpiryDays(d)}>
                  {d === 30 ? '1 Bulan' : d === 90 ? '3 Bulan' : d === 180 ? '6 Bulan' : '1 Tahun'}
                </Chip>
              ))}
            </div>
          )}
        </>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon={<Boxes size={28} />} title="Tidak ada produk yang cocok" />
      ) : (
        <>
          <p className="mb-2 text-[11px] font-semibold text-ink-soft">Tekan nama produk untuk lihat detail. Tekan &amp; tahan untuk pilih banyak (bisa gabung produk juga).</p>
          <div className="space-y-2">
            {paged.map((p, idx) => (
              <ProductRow
                key={p.product_id}
                number={(pageSafe - 1) * PAGE_SIZE + idx + 1}
                product={p}
                selected={selected.has(p.product_id)}
                selectionMode={selectionMode}
                onTap={() => setViewing(p)}
                onToggleSelect={() => toggleSelect(p.product_id)}
                onLongPress={() => enterSelection(p.product_id)}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                disabled={pageSafe <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-lilac-200 bg-white text-ink disabled:opacity-30"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-bold text-ink-soft">Halaman {pageSafe} dari {totalPages}</span>
              <button
                disabled={pageSafe >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-lilac-200 bg-white text-ink disabled:opacity-30"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}

      <ProductViewModal
        product={viewing}
        onClose={() => setViewing(null)}
        onEditClick={(p) => { setViewing(null); setEditing(p); }}
      />

      <ProductEditModal
        product={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { refresh(); }}
        onDeleted={() => { setEditing(null); refresh(); }}
      />

      <MergeProductsModal
        products={merging}
        onClose={() => setMerging([])}
        onMerged={() => { setMerging([]); cancelSelection(); refresh(); }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Hapus Produk"
        message={`Hapus "${deleteTarget?.name}" dari daftar barang?`}
        danger
      />
      <ConfirmDialog
        open={bulkDeleteConfirm}
        onClose={() => setBulkDeleteConfirm(false)}
        onConfirm={handleBulkDelete}
        title="Hapus Produk Terpilih"
        message={`Hapus ${selected.size} produk terpilih? Produk yang punya riwayat transaksi akan diarsipkan, bukan dihapus total.`}
        danger
      />
    </div>
  );
}

function ProductRow({
  number,
  product: p,
  selected,
  selectionMode,
  onTap,
  onToggleSelect,
  onLongPress,
}: {
  number: number;
  product: ProductStockSummary;
  selected: boolean;
  selectionMode: boolean;
  onTap: () => void;
  onToggleSelect: () => void;
  onLongPress: () => void;
}) {
  const lp = useLongPress(onLongPress, () => (selectionMode ? onToggleSelect() : onTap()));
  const expDays = daysUntil(p.kadaluwarsa_terdekat);

  return (
    <Card
      tight
      {...lp}
      className={`flex cursor-pointer select-none items-center gap-3 transition ${selected ? '!border-peach-400 !bg-peach-50' : ''}`}
    >
      <span className="w-6 flex-none text-center font-mono text-[11px] text-ink-soft">{number}</span>

      {selectionMode ? (
        <div className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 ${selected ? 'border-peach-400 bg-peach-400' : 'border-lilac-300'}`}>
          {selected && <div className="h-2 w-2 rounded-full bg-white" />}
        </div>
      ) : p.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.image_url} alt={p.name} className="h-10 w-10 flex-none rounded-xl object-cover" />
      ) : (
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-lilac-50 text-[10px] font-bold text-lilac-300">
          {p.name.charAt(0).toUpperCase()}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink">{p.name}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-ink-soft">
          <span>{p.code}</span>
          <span>&middot;</span>
          <span>{rupiah(p.harga_jual_aktif)}{p.unit_type === 'gram' ? '/gr' : ''}</span>
          {p.kadaluwarsa_terdekat && (
            <Badge tone={expDays !== null && expDays <= 30 ? (expDays < 0 ? 'bad' : 'warn') : 'neutral'}>
              {formatTanggal(p.kadaluwarsa_terdekat)}
            </Badge>
          )}
        </div>
      </div>
      <Badge tone={p.stok <= 0 ? 'bad' : p.stok <= p.low_stock_threshold ? 'warn' : 'good'}>
        {formatQty(p.stok, p.unit_type)}
      </Badge>
    </Card>
  );
}
