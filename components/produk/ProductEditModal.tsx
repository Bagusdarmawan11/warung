'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Save, PlusCircle, MinusCircle, Layers, ImagePlus, Trash2, Camera } from 'lucide-react';
import { Modal, ConfirmDialog } from '@/components/Modal';
import { Button, Field, Input, Badge, Select } from '@/components/ui';
import { getBatchesForProduct, updateProduct, updateBatchPrice, adjustStock, deleteProduct, deleteProductBatch } from '@/lib/actions/products';
import { ProductBarcodesManager } from '@/components/produk/ProductBarcodesManager';
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
  const [unitType, setUnitType] = useState<'pcs' | 'gram'>('pcs');
  const [confirmUnitChange, setConfirmUnitChange] = useState(false);
  const pendingFormData = useRef<FormData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!product) return;
    setImagePreview(product.image_url);
    setUnitType(product.unit_type);
    setLoadingBatches(true);
    getBatchesForProduct(product.product_id).then(setBatches).finally(() => setLoadingBatches(false));
  }, [product]);

  if (!product) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (unitType !== product!.unit_type) {
      pendingFormData.current = fd;
      setConfirmUnitChange(true);
      return;
    }
    await doSave(fd);
  }

  async function doSave(fd: FormData) {
    setSaving(true);
    const res = await updateProduct({
      productId: product!.product_id,
      name: String(fd.get('name') || ''),
      category: String(fd.get('category') || ''),
      lowStockThreshold: parseFloat(String(fd.get('threshold') || '0')) || 0,
      unitType,
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

  async function handleDeleteBatch(batchId: string, withSales: boolean) {
    if (withSales) {
      // Hapus semua transaksi di batch ini dulu, lalu hapus batch
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      // Kembalikan stok dari semua sales batch ini
      const { data: sales } = await supabase.from('sales').select('id').eq('batch_id', batchId);
      if (sales) {
        for (const s of sales) {
          await import('@/lib/actions/sales').then(m => m.deleteSaleTransaction(s.id));
        }
      }
    }
    const res = await deleteProductBatch(batchId);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(withSales ? 'Batch dan semua transaksinya dihapus' : 'Batch dihapus');
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
      <div className="mb-4 flex items-start gap-3">
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
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleImagePick(e.target.files?.[0] || null)} />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex gap-1.5">
            <button type="button" onClick={() => cameraInputRef.current?.click()}
              className="flex items-center gap-1 rounded-lg bg-butter-100 px-2 py-1 text-[10px] font-bold text-ink">
              <Camera size={11} /> Kamera
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 rounded-lg bg-lilac-100 px-2 py-1 text-[10px] font-bold text-ink">
              <ImagePlus size={11} /> Galeri
            </button>
          </div>
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
        <Field label="Jenis Satuan" full hint={unitType !== product.unit_type ? '⚠️ Mengubah ini TIDAK mengonversi angka stok yang sudah ada — pastikan angka stok saat ini memang sudah sesuai arti satuan barunya.' : 'Ubah kalau produk ini salah dibuat sebagai pcs/gram sebelumnya.'}>
          <Select value={unitType} onChange={(e) => setUnitType(e.target.value as 'pcs' | 'gram')}>
            <option value="pcs">Satuan / Pack (pcs)</option>
            <option value="gram">Timbangan (gram)</option>
          </Select>
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

      <ProductBarcodesManager productId={product.product_id} />

      <div className="mb-5">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-ink-soft"><Layers size={14} /> Riwayat Batch (FIFO — batch paling atas dipakai duluan)</p>
        {loadingBatches ? (
          <p className="text-xs text-ink-soft">Memuat...</p>
        ) : batches.length === 0 ? (
          <p className="text-xs text-ink-soft">Belum ada batch.</p>
        ) : (
          <div className="space-y-2">
            {batches.map((b) => (
              <BatchRow key={b.id} batch={b} unitType={product.unit_type} onSave={handleBatchPriceSave} onDelete={handleDeleteBatch} />
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

      <ConfirmDialog
        open={confirmUnitChange}
        onClose={() => { setConfirmUnitChange(false); setUnitType(product.unit_type); }}
        onConfirm={() => { setConfirmUnitChange(false); if (pendingFormData.current) doSave(pendingFormData.current); }}
        title="Ubah Jenis Satuan"
        message={`Ubah jenis satuan produk ini jadi "${unitType === 'gram' ? 'Timbangan (gram)' : 'Satuan (pcs)'}"? Angka stok yang sudah ada TIDAK ikut dikonversi — hanya cara sistem membaca angkanya yang berubah. Pastikan angka stok saat ini memang sudah sesuai (misal kalau diubah ke gram, pastikan angka stoknya memang gramasi, bukan jumlah pcs).`}
        confirmLabel="Ya, Ubah"
        danger
      />
    </Modal>
  );
}

function BatchRow({
  batch,
  unitType,
  onSave,
  onDelete,
}: {
  batch: ProductBatch;
  unitType: 'pcs' | 'gram';
  onSave: (batch: ProductBatch, buy: number, sell: number, expiry: string) => void;
  onDelete: (batchId: string, withSales: boolean) => void;
}) {
  const isGram = unitType === 'gram';
  const [buy, setBuy] = useState(String(isGram ? pricePerKgFromPerGram(batch.buy_price) : batch.buy_price));
  const [sell, setSell] = useState(String(isGram ? pricePerKgFromPerGram(batch.sell_price) : batch.sell_price));
  const [expiry, setExpiry] = useState(batch.expiry_date || '');
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleSave() {
    const buyVal = parseFloat(buy) || 0;
    const sellVal = parseFloat(sell) || 0;
    onSave(batch, isGram ? pricePerGramFromPerKg(buyVal) : buyVal, isGram ? pricePerGramFromPerKg(sellVal) : sellVal, expiry);
    setEditing(false);
  }

  return (
    <div className="rounded-xl border border-lilac-100 p-3 text-sm">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-ink-soft">{formatTanggal(batch.received_at)}</span>
        <div className="flex items-center gap-1.5">
          <Badge tone={batch.status === 'active' ? 'good' : 'neutral'}>
            {batch.status === 'active' ? `Sisa ${formatQty(batch.qty_remaining, unitType)}` : 'Habis'}
          </Badge>
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex h-5 w-5 items-center justify-center rounded bg-rose-100 text-rose-500 hover:bg-rose-200"
            title="Hapus batch ini"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {confirmDelete ? (
        <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
          <p className="mb-2 text-[11px] font-bold text-rose-600">Hapus batch ini?</p>
          <p className="mb-3 text-[11px] text-rose-500">
            Qty masuk: {formatQty(batch.qty_initial, unitType)} &middot; Sisa: {formatQty(batch.qty_remaining, unitType)}
          </p>
          <div className="space-y-1.5">
            <button
              onClick={() => { setConfirmDelete(false); onDelete(batch.id, false); }}
              className="w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-[11px] font-bold text-rose-600"
            >
              Hapus batch saja (transaksi penjualan tetap ada di Riwayat)
            </button>
            <button
              onClick={() => { setConfirmDelete(false); onDelete(batch.id, true); }}
              className="w-full rounded-lg bg-rose-500 px-3 py-2 text-[11px] font-bold text-white"
            >
              Hapus batch + semua transaksi penjualannya (stok dikembalikan)
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="w-full py-1.5 text-[11px] text-ink-soft"
            >
              Batal
            </button>
          </div>
        </div>
      ) : editing ? (
        <div className="grid grid-cols-2 gap-2">
          <Input type="number" value={buy} onChange={(e) => setBuy(e.target.value)} placeholder={isGram ? 'Modal /kg' : 'Modal'} />
          <Input type="number" value={sell} onChange={(e) => setSell(e.target.value)} placeholder={isGram ? 'Jual /kg' : 'Jual'} />
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
