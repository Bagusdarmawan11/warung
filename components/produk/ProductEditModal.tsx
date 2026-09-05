'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Save, PlusCircle, MinusCircle, Layers, ImagePlus, Trash2 } from 'lucide-react';
import { Modal, ConfirmDialog } from '@/components/Modal';
import { Button, Field, Input, Badge } from '@/components/ui';
import { getBatchesForProduct, updateProduct, updateBatchPrice, adjustStock, deleteProduct } from '@/lib/actions/products';
import { uploadProductImage } from '@/lib/uploadImage';
import { rupiah, formatTanggal, formatQty, pricePerKgFromPerGram, pricePerGramFromPerKg } from '@/lib/format';
import type { ProductBatch, ProductStockSummary } from '@/lib/types';

export function ProductEditModal({
  product,
  onClose,
  onSaved,
  onDeleted,
}: {
  product: ProductStockSummary | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!product) return;
    setImagePreview(product.image_url);
    setLoadingBatches(true);
    getBatchesForProduct(product.product_id).then(setBatches).finally(() => setLoadingBatches(false));
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

  async function handleImagePick(file: File | null) {
    if (!file || !product) return;
    setUploadingImage(true);
    const res = await uploadProductImage(file, product.product_id);
    setUploadingImage(false);
    if (res.url) {
      setImagePreview(res.url);
      toast.success('Foto produk diperbarui');
      onSaved();
    } else if (res.error) {
      toast.error(res.error);
    }
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

  async function handleDelete() {
    const res = await deleteProduct(product!.product_id);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(res.data.archived ? 'Produk diarsipkan (punya riwayat transaksi lama)' : 'Produk dihapus');
    setConfirmDelete(false);
    onDeleted();
  }

  return (
    <Modal open={!!product} onClose={onClose} title="Edit Produk">
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="relative flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-lilac-200 bg-lilac-50/50 text-ink-soft"
        >
          {imagePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagePreview} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <ImagePlus size={20} />
          )}
          {uploadingImage && <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-[9px] font-bold">...</div>}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleImagePick(e.target.files?.[0] || null)} />
        <div className="min-w-0">
          <p className="font-mono text-xs text-ink-soft">{product.code} &middot; ketuk foto untuk ganti</p>
          <p className="truncate font-display text-base font-bold text-ink">{product.name}</p>
        </div>
      </div>

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

      <div className="mb-5">
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

      <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 text-xs font-bold text-rose-500 hover:underline">
        <Trash2 size={13} /> Hapus Produk Ini
      </button>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Hapus Produk"
        message={`Hapus "${product.name}" dari daftar barang? Kalau produk ini punya riwayat transaksi, produk akan diarsipkan (bukan dihapus total) supaya laporan lama tetap akurat.`}
        danger
      />
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
  const isGram = unitType === 'gram';
  const [buy, setBuy] = useState(String(isGram ? pricePerKgFromPerGram(batch.buy_price) : batch.buy_price));
  const [sell, setSell] = useState(String(isGram ? pricePerKgFromPerGram(batch.sell_price) : batch.sell_price));
  const [expiry, setExpiry] = useState(batch.expiry_date || '');
  const [editing, setEditing] = useState(false);

  function handleSave() {
    const buyVal = parseFloat(buy) || 0;
    const sellVal = parseFloat(sell) || 0;
    onSave(batch, isGram ? pricePerGramFromPerKg(buyVal) : buyVal, isGram ? pricePerGramFromPerKg(sellVal) : sellVal, expiry);
    setEditing(false);
  }

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
          <Input type="number" value={buy} onChange={(e) => setBuy(e.target.value)} placeholder={isGram ? 'Harga modal /kg' : 'Harga modal'} />
          <Input type="number" value={sell} onChange={(e) => setSell(e.target.value)} placeholder={isGram ? 'Harga jual /kg' : 'Harga jual'} />
          <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="col-span-2" />
          <Button size="sm" className="col-span-2" onClick={handleSave}>
            Simpan Harga Batch
          </Button>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="flex w-full items-center justify-between text-left">
          <span className="text-ink-soft">
            Modal {rupiah(isGram ? pricePerKgFromPerGram(batch.buy_price) : batch.buy_price)}{isGram ? '/kg' : ''} &middot; Jual {rupiah(isGram ? pricePerKgFromPerGram(batch.sell_price) : batch.sell_price)}{isGram ? '/kg' : ''}
          </span>
          <span className="text-[11px] font-bold text-peach-500">Ubah</span>
        </button>
      )}
    </div>
  );
}
