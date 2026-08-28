'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Save, PlusCircle, MinusCircle, Layers } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { Button, Field, Input, Badge } from '@/components/ui';
import { getBatchesForProduct, updateProduct, updateBatchPrice, adjustStock } from '@/lib/actions/products';
import { rupiah, formatTanggal, formatQty } from '@/lib/format';
import type { ProductBatch, ProductStockSummary } from '@/lib/types';

export function ProductEditModal({
  product,
  onClose,
  onSaved,
}: {
  product: ProductStockSummary | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustNote, setAdjustNote] = useState('');

  useEffect(() => {
    if (!product) return;
    setLoadingBatches(true);
    getBatchesForProduct(product.product_id)
      .then(setBatches)
      .finally(() => setLoadingBatches(false));
  }, [product]);

  if (!product) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    const res = await updateProduct({
      productId: product!.product_id,
      name: String(fd.get('name') || ''),
      category: String(fd.get('category') || ''),
      lowStockThreshold: parseFloat(String(fd.get('threshold') || '0')) || 0,
    });
    setSaving(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success('Perubahan disimpan');
    onSaved();
  }

  async function handleBatchPriceSave(batch: ProductBatch, buy: number, sell: number, expiry: string) {
    const res = await updateBatchPrice(batch.id, buy, sell, expiry || null);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success('Harga batch diperbarui');
    const fresh = await getBatchesForProduct(product!.product_id);
    setBatches(fresh);
    onSaved();
  }

  async function handleAdjust(sign: 1 | -1) {
    const delta = parseFloat(adjustDelta);
    if (!delta || delta <= 0) { toast.error('Isi jumlah koreksi'); return; }
    const res = await adjustStock(product!.product_id, delta * sign, adjustNote);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success('Stok dikoreksi');
    setAdjustDelta('');
    setAdjustNote('');
    const fresh = await getBatchesForProduct(product!.product_id);
    setBatches(fresh);
    onSaved();
  }

  return (
    <Modal open={!!product} onClose={onClose} title="Edit Produk">
      <p className="mb-4 -mt-2 font-mono text-xs text-ink-soft">{product.code} &middot; {product.unit_type === 'gram' ? 'Timbangan (gram)' : 'Satuan (pcs)'}</p>

      <form onSubmit={handleSubmit} className="mb-5 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        <Field label="Nama Barang *" full>
          <Input name="name" required defaultValue={product.name} />
        </Field>
        <Field label="Kategori">
          <Input name="category" defaultValue={product.category || ''} />
        </Field>
        <Field label="Batas Stok Menipis">
          <Input name="threshold" type="number" step="any" defaultValue={product.low_stock_threshold} />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" full disabled={saving}>
            <Save size={16} /> {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </Button>
        </div>
      </form>

      <div className="mb-5 rounded-2xl bg-lilac-50 p-3.5">
        <p className="mb-2 text-xs font-bold text-ink-soft">Koreksi Stok Manual (stok opname)</p>
        <div className="mb-2 flex gap-2">
          <Input placeholder={`Jumlah (${product.unit_type})`} type="number" value={adjustDelta} onChange={(e) => setAdjustDelta(e.target.value)} />
        </div>
        <Input placeholder="Catatan (opsional)" value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} className="mb-2" />
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" full onClick={() => handleAdjust(1)}><PlusCircle size={14} /> Tambah</Button>
          <Button variant="danger" size="sm" full onClick={() => handleAdjust(-1)}><MinusCircle size={14} /> Kurangi</Button>
        </div>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-ink-soft"><Layers size={14} /> Riwayat Batch (FIFO — batch paling atas dipakai duluan)</p>
        {loadingBatches ? (
          <p className="text-xs text-ink-soft">Memuat...</p>
        ) : batches.length === 0 ? (
          <p className="text-xs text-ink-soft">Belum ada batch.</p>
        ) : (
          <div className="space-y-2">
            {batches.map((b) => (
              <BatchRow key={b.id} batch={b} unitType={product.unit_type} onSave={handleBatchPriceSave} />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function BatchRow({
  batch,
  unitType,
  onSave,
}: {
  batch: ProductBatch;
  unitType: 'pcs' | 'gram';
  onSave: (batch: ProductBatch, buy: number, sell: number, expiry: string) => void;
}) {
  const [buy, setBuy] = useState(String(batch.buy_price));
  const [sell, setSell] = useState(String(batch.sell_price));
  const [expiry, setExpiry] = useState(batch.expiry_date || '');
  const [editing, setEditing] = useState(false);

  return (
    <div className="rounded-xl border border-lilac-100 p-3 text-sm">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-mono text-[11px] text-ink-soft">{formatTanggal(batch.received_at)}</span>
        <Badge tone={batch.status === 'active' ? 'good' : 'neutral'}>
          {batch.status === 'active' ? `Sisa ${formatQty(batch.qty_remaining, unitType)}` : 'Habis'}
        </Badge>
      </div>
      {editing ? (
        <div className="grid grid-cols-2 gap-2">
          <Input type="number" value={buy} onChange={(e) => setBuy(e.target.value)} placeholder="Harga modal" />
          <Input type="number" value={sell} onChange={(e) => setSell(e.target.value)} placeholder="Harga jual" />
          <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="col-span-2" />
          <Button size="sm" className="col-span-2" onClick={() => { onSave(batch, parseFloat(buy) || 0, parseFloat(sell) || 0, expiry); setEditing(false); }}>
            Simpan Harga Batch
          </Button>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="flex w-full items-center justify-between text-left">
          <span className="text-ink-soft">Modal {rupiah(batch.buy_price)} &middot; Jual {rupiah(batch.sell_price)}</span>
          <span className="text-[11px] font-bold text-peach-500">Ubah</span>
        </button>
      )}
    </div>
  );
}
