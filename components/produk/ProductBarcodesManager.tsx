'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ScanLine, Plus, Trash2, Loader2 } from 'lucide-react';
import { getProductBarcodes, addProductBarcode, deleteProductBarcode, type ProductBarcode } from '@/lib/actions/products';

export function ProductBarcodesManager({ productId }: { productId: string }) {
  const [barcodes, setBarcodes] = useState<ProductBarcode[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newBarcode, setNewBarcode] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [showForm, setShowForm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setLoading(true);
    try {
      setBarcodes(await getProductBarcodes(productId));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [productId]);

  useEffect(() => {
    if (showForm) setTimeout(() => inputRef.current?.focus(), 50);
  }, [showForm]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newBarcode.trim()) { toast.error('Isi barcode terlebih dahulu'); return; }
    setAdding(true);
    const res = await addProductBarcode(productId, newBarcode.trim(), newLabel.trim());
    setAdding(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success('Barcode berhasil ditambahkan');
    setNewBarcode('');
    setNewLabel('');
    setShowForm(false);
    refresh();
  }

  async function handleDelete(b: ProductBarcode) {
    const res = await deleteProductBarcode(b.id);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success('Barcode dihapus');
    refresh();
  }

  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-bold text-ink-soft">
          <ScanLine size={14} /> Barcode Kemasan
        </p>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 rounded-lg bg-lilac-100 px-2.5 py-1 text-[11px] font-bold text-ink hover:bg-lilac-200"
        >
          <Plus size={12} /> Tambah
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="mb-3 rounded-xl bg-lilac-50 p-3">
          <p className="mb-2 text-[11px] text-ink-soft">
            Scan atau ketik barcode yang sudah ada di kemasan produknya, lalu tambahkan.
          </p>
          <input
            ref={inputRef}
            type="text"
            value={newBarcode}
            onChange={(e) => setNewBarcode(e.target.value)}
            placeholder="Scan atau ketik barcode kemasan..."
            className="mb-2 w-full rounded-xl border border-lilac-200 bg-white px-3 py-2 font-mono text-sm text-ink outline-none focus:border-peach-400 focus:ring-2 focus:ring-peach-100"
          />
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Keterangan (opsional, cth: Varian 85gr)"
            className="mb-2 w-full rounded-xl border border-lilac-200 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-peach-400 focus:ring-2 focus:ring-peach-100"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setShowForm(false); setNewBarcode(''); setNewLabel(''); }}
              className="flex-1 rounded-xl border border-lilac-200 py-2 text-xs font-bold text-ink-soft"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={adding}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink py-2 text-xs font-bold text-cream disabled:opacity-50"
            >
              {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Simpan Barcode
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-[11px] text-ink-soft">Memuat...</p>
      ) : barcodes.length === 0 ? (
        <p className="text-[11px] text-ink-soft">
          Belum ada barcode kemasan. Klik "+ Tambah" untuk menambahkan barcode yang sudah tercetak di kemasan produk ini.
        </p>
      ) : (
        <div className="space-y-1.5">
          {barcodes.map((b) => (
            <div key={b.id} className="flex items-center gap-2 rounded-xl border border-lilac-100 bg-lilac-50/40 px-3 py-2">
              <ScanLine size={13} className="flex-none text-lilac-300" />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs font-bold text-ink">{b.barcode}</p>
                {b.label && <p className="text-[11px] text-ink-soft">{b.label}</p>}
              </div>
              <button
                type="button"
                onClick={() => handleDelete(b)}
                className="flex h-6 w-6 flex-none items-center justify-center rounded-lg bg-rose-100 text-rose-500 hover:bg-rose-200"
                title="Hapus barcode ini"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
