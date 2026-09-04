'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Combine } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { Button, Field, Input, Select } from '@/components/ui';
import { mergeProducts } from '@/lib/actions/products';
import type { ProductStockSummary, UnitType } from '@/lib/types';

export function MergeProductsModal({
  products,
  onClose,
  onMerged,
}: {
  products: ProductStockSummary[];
  onClose: () => void;
  onMerged: () => void;
}) {
  const [unitType, setUnitType] = useState<UnitType>('gram');
  const [saving, setSaving] = useState(false);

  if (!products.length) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') || '').trim();
    const qty = parseFloat(String(fd.get('qty') || '0'));
    if (!name || !qty || qty <= 0) { toast.error('Lengkapi nama & total stok gabungan'); return; }

    setSaving(true);
    const res = await mergeProducts({
      name,
      category: String(fd.get('category') || ''),
      unitType,
      lowStockThreshold: parseFloat(String(fd.get('threshold') || '3')) || 3,
      qty,
      buyPrice: parseFloat(String(fd.get('buyPrice') || '0')) || 0,
      sellPrice: parseFloat(String(fd.get('sellPrice') || '0')) || 0,
      expiryDate: String(fd.get('expiryDate') || '') || null,
      sourceIds: products.map((p) => p.product_id),
    });
    setSaving(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(`${products.length} produk berhasil digabung jadi "${name}"`);
    onMerged();
  }

  return (
    <Modal open={products.length > 0} onClose={onClose} title="Gabung Jadi 1 Produk">
      <div className="mb-4 rounded-xl bg-lilac-50 p-3">
        <p className="mb-1.5 text-xs font-bold text-ink-soft">Produk yang akan digabung ({products.length}):</p>
        <div className="flex flex-wrap gap-1.5">
          {products.map((p) => (
            <span key={p.product_id} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-ink shadow-soft">{p.name}</span>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-ink-soft">
          Produk-produk di atas akan diarsipkan (bukan dihapus — riwayat transaksi lama tetap aman) dan digantikan satu produk baru di bawah ini.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        <Field label="Nama Produk Baru *" full>
          <Input name="name" required placeholder="Cth: Telur Ayam" defaultValue={products[0]?.name} />
        </Field>
        <Field label="Jenis Satuan *">
          <Select value={unitType} onChange={(e) => setUnitType(e.target.value as UnitType)}>
            <option value="gram">Timbangan (gram)</option>
            <option value="pcs">Satuan / Pack (pcs)</option>
          </Select>
        </Field>
        <Field label="Kategori (opsional)">
          <Input name="category" placeholder="Cth: Sembako" />
        </Field>
        <Field label={unitType === 'gram' ? 'Total Stok Gabungan Sekarang (gram) *' : 'Total Stok Gabungan Sekarang (pcs) *'} full hint="Berat/jumlah fisik yang benar-benar ada sekarang, gabungan dari semua produk di atas.">
          <Input name="qty" type="number" step="any" min={0} required placeholder={unitType === 'gram' ? 'Cth: 2500' : 'Cth: 30'} />
        </Field>
        <Field label="Batas Stok Menipis">
          <Input name="threshold" type="number" defaultValue={unitType === 'gram' ? 200 : 3} />
        </Field>
        <Field label="Tanggal Kadaluwarsa">
          <Input name="expiryDate" type="date" />
        </Field>
        <Field label={unitType === 'gram' ? 'Harga Modal /gram *' : 'Harga Modal *'}>
          <Input name="buyPrice" type="number" step="any" min={0} required placeholder="0" />
        </Field>
        <Field label={unitType === 'gram' ? 'Harga Jual /gram *' : 'Harga Jual *'}>
          <Input name="sellPrice" type="number" step="any" min={0} required placeholder="0" />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" full disabled={saving}>
            <Combine size={16} /> {saving ? 'Menggabungkan...' : `Gabung ${products.length} Produk`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
