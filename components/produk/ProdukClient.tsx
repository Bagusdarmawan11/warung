'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Search, Printer, Edit2, Trash2, Barcode as BarcodeIcon, Boxes, Plus, UploadCloud } from 'lucide-react';
import { Card, Input, Chip, Badge, Button, EmptyState } from '@/components/ui';
import { ConfirmDialog } from '@/components/Modal';
import { PrintLabelSheet, type PrintItem } from '@/components/PrintLabelSheet';
import { ProductEditModal } from '@/components/produk/ProductEditModal';
import { getProductSummaries, deleteProduct } from '@/lib/actions/products';
import { rupiah, formatTanggal, formatQty, daysUntil } from '@/lib/format';
import type { ProductStockSummary } from '@/lib/types';
import Link from 'next/link';

type StatusFilter = 'all' | 'menipis' | 'habis' | 'expired';

export function ProdukClient({ initialProducts }: { initialProducts: ProductStockSummary[] }) {
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ProductStockSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductStockSummary | null>(null);
  const [printQueue, setPrintQueue] = useState<PrintItem[] | null>(null);

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
    else if (status === 'expired') list = list.filter((p) => { const d = daysUntil(p.kadaluwarsa_terdekat); return d !== null && d <= 30; });
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [products, search, status]);

  function toggleSelect(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function printSelected() {
    const items = products.filter((p) => selected.has(p.product_id)).map((p) => ({ code: p.code, name: p.name, price: p.harga_jual_aktif || 0 }));
    if (!items.length) { toast.error('Pilih minimal satu produk'); return; }
    setPrintQueue(items);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await deleteProduct(deleteTarget.product_id);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(res.data.archived ? 'Produk diarsipkan (punya riwayat transaksi lama)' : 'Produk dihapus');
    setDeleteTarget(null);
    refresh();
  }

  return (
    <div className="animate-slide-up">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink">Daftar Barang</h1>
          <p className="text-sm text-ink-soft">{products.length} produk terdaftar</p>
        </div>
        <div className="flex flex-none gap-2">
          <Link href="/import">
            <Button variant="ghost" size="sm"><UploadCloud size={15} /> Import CSV</Button>
          </Link>
          <Link href="/barang-masuk">
            <Button variant="dark" size="sm"><Plus size={15} /> Produk Baru</Button>
          </Link>
        </div>
      </div>

      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
          <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama atau kode..." />
        </div>
        {selected.size > 0 && (
          <Button size="sm" onClick={printSelected}><Printer size={14} /> Cetak Label ({selected.size})</Button>
        )}
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto no-scrollbar">
        <Chip active={status === 'all'} onClick={() => setStatus('all')}>Semua</Chip>
        <Chip active={status === 'menipis'} onClick={() => setStatus('menipis')}>Stok Menipis</Chip>
        <Chip active={status === 'habis'} onClick={() => setStatus('habis')}>Stok Habis</Chip>
        <Chip active={status === 'expired'} onClick={() => setStatus('expired')}>Segera Kadaluwarsa</Chip>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Boxes size={28} />} title="Tidak ada produk yang cocok" />
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => {
            const expDays = daysUntil(p.kadaluwarsa_terdekat);
            return (
              <Card key={p.product_id} tight className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(p.product_id)}
                  onChange={() => toggleSelect(p.product_id)}
                  className="h-4 w-4 flex-none accent-peach-400"
                />
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
                <div className="flex flex-none gap-1">
                  <button onClick={() => setPrintQueue([{ code: p.code, name: p.name, price: p.harga_jual_aktif || 0 }])} className="flex h-8 w-8 items-center justify-center rounded-lg bg-lilac-50 text-ink-soft hover:bg-lilac-100" title="Cetak barcode">
                    <BarcodeIcon size={15} />
                  </button>
                  <button onClick={() => setEditing(p)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-lilac-50 text-ink-soft hover:bg-lilac-100" title="Edit">
                    <Edit2 size={15} />
                  </button>
                  <button onClick={() => setDeleteTarget(p)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-500 hover:bg-rose-100" title="Hapus">
                    <Trash2 size={15} />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ProductEditModal product={editing} onClose={() => setEditing(null)} onSaved={() => { refresh(); setEditing(null); }} />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Hapus Produk"
        message={`Hapus "${deleteTarget?.name}" dari daftar barang? Kalau produk ini punya riwayat transaksi, produk akan diarsipkan (bukan dihapus total) supaya laporan lama tetap akurat.`}
        danger
      />

      <PrintLabelSheet items={printQueue} onDone={() => setPrintQueue(null)} />
    </div>
  );
}
