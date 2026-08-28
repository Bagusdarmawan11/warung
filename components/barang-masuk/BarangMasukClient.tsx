'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { PackagePlus, Download, Printer, Plus, Search } from 'lucide-react';
import { Button, Card, Field, Input, Select, ToggleGroup } from '@/components/ui';
import { BarcodeCanvas, downloadCanvasPng } from '@/components/BarcodeCanvas';
import { PrintLabelSheet, type PrintItem } from '@/components/PrintLabelSheet';
import { createProduct, addBatch } from '@/lib/actions/products';
import { getProductSummaries } from '@/lib/actions/products';
import { rupiah, todayISO } from '@/lib/format';
import type { Product, ProductStockSummary, UnitType } from '@/lib/types';

export function BarangMasukClient() {
  const [mode, setMode] = useState<'baru' | 'restock'>('baru');

  return (
    <div className="animate-slide-up">
      <div className="mb-4">
        <h1 className="font-display text-2xl font-extrabold text-ink">Barang Masuk</h1>
        <p className="text-sm text-ink-soft">Tambah produk baru atau tambah stok produk lama</p>
      </div>
      <div className="mb-5">
        <ToggleGroup
          value={mode}
          onChange={(v) => setMode(v as any)}
          options={[
            { value: 'baru', label: 'Produk Baru' },
            { value: 'restock', label: 'Tambah Stok' },
          ]}
        />
      </div>
      {mode === 'baru' ? <ProdukBaruForm /> : <RestockForm />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PRODUK BARU
// ---------------------------------------------------------------------------
function ProdukBaruForm() {
  const [unitType, setUnitType] = useState<UnitType>('pcs');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<Product | null>(null);
  const [printQueue, setPrintQueue] = useState<PrintItem[] | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') || '').trim();
    const qty = parseFloat(String(fd.get('qty') || '0'));
    const buyPrice = parseFloat(String(fd.get('buyPrice') || '0'));
    const sellPrice = parseFloat(String(fd.get('sellPrice') || '0'));
    if (!name || !qty || qty <= 0) { toast.error('Lengkapi nama & jumlah barang'); return; }

    setSaving(true);
    const res = await createProduct({
      name,
      category: String(fd.get('category') || ''),
      unitType,
      lowStockThreshold: parseFloat(String(fd.get('threshold') || '3')) || 3,
      qty,
      buyPrice,
      sellPrice,
      expiryDate: String(fd.get('expiryDate') || '') || null,
      receivedAt: todayISO(),
    });
    setSaving(false);

    if (!res.ok) { toast.error(res.error); return; }
    setCreated(res.data);
    toast.success('Produk baru ditambahkan: ' + res.data.code);
  }

  if (created) {
    return (
      <Card className="mx-auto max-w-sm text-center">
        <span className="mb-3 inline-flex items-center gap-1 rounded-full bg-mint-100 px-3 py-1 text-xs font-bold text-mint-600">
          Produk tersimpan
        </span>
        <h3 className="font-display text-xl font-bold text-ink">{created.name}</h3>
        <p className="mb-4 text-sm text-ink-soft">
          Kode <span className="font-mono font-bold text-ink">{created.code}</span>
        </p>
        <div className="mx-auto max-w-[260px] rounded-2xl border-2 border-dashed border-lilac-200 bg-white p-4">
          <BarcodeCanvas code={created.code} />
        </div>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => {
            const canvas = document.querySelector<HTMLCanvasElement>(`canvas[data-barcode-code="${created.code}"]`);
            if (canvas) downloadCanvasPng(canvas, `${created.code}-${created.name}.png`);
          }}>
            <Download size={14} /> Unduh PNG
          </Button>
          <Button variant="dark" size="sm" onClick={() => setPrintQueue([{ code: created.code, name: created.name, price: 0 }])}>
            <Printer size={14} /> Cetak Label
          </Button>
        </div>
        <Button full className="mt-4" onClick={() => setCreated(null)}>
          <Plus size={16} /> Tambah Produk Lain
        </Button>
        <PrintLabelSheet items={printQueue} onDone={() => setPrintQueue(null)} />
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        <Field label="Nama Barang *" full>
          <Input name="name" required placeholder="Cth: Indomie Goreng" />
        </Field>
        <Field label="Jenis Satuan *">
          <Select value={unitType} onChange={(e) => setUnitType(e.target.value as UnitType)}>
            <option value="pcs">Satuan / Pack (pcs)</option>
            <option value="gram">Timbangan (gram)</option>
          </Select>
        </Field>
        <Field label="Kategori (opsional)">
          <Input name="category" placeholder="Cth: Sembako, Bumbu, Minuman" />
        </Field>
        <Field label={unitType === 'gram' ? 'Berat Masuk (gram) *' : 'Qty Masuk *'}>
          <Input name="qty" type="number" step="any" min={0} required placeholder={unitType === 'gram' ? 'Cth: 500' : 'Cth: 12'} />
        </Field>
        <Field label="Batas Stok Menipis" hint="Peringatan muncul kalau stok ≤ angka ini">
          <Input name="threshold" type="number" defaultValue={unitType === 'gram' ? 100 : 3} />
        </Field>
        <Field label={unitType === 'gram' ? 'Harga Modal /gram *' : 'Harga Modal (beli) *'}>
          <Input name="buyPrice" type="number" step="any" min={0} required placeholder="0" />
        </Field>
        <Field label={unitType === 'gram' ? 'Harga Jual /gram *' : 'Harga Jual *'}>
          <Input name="sellPrice" type="number" step="any" min={0} required placeholder="0" />
        </Field>
        <Field label="Tanggal Kadaluwarsa" full>
          <Input name="expiryDate" type="date" />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" full disabled={saving}>
            <PackagePlus size={17} /> {saving ? 'Menyimpan...' : 'Simpan & Buat Kode Barcode'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// RESTOCK (TAMBAH STOK)
// ---------------------------------------------------------------------------
function RestockForm() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ProductStockSummary[]>([]);
  const [picked, setPicked] = useState<ProductStockSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSearchChange(v: string) {
    setSearch(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (v.trim().length < 2) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      const r = await getProductSummaries({ search: v.trim() });
      setResults(r.slice(0, 8));
    }, 200);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!picked) return;
    const fd = new FormData(e.currentTarget);
    const qty = parseFloat(String(fd.get('qty') || '0'));
    if (!qty || qty <= 0) { toast.error('Isi jumlah tambahan stok'); return; }

    setSaving(true);
    const res = await addBatch({
      productId: picked.product_id,
      qty,
      buyPrice: parseFloat(String(fd.get('buyPrice') || '0')) || picked.harga_modal_aktif || 0,
      sellPrice: parseFloat(String(fd.get('sellPrice') || '0')) || picked.harga_jual_aktif || 0,
      expiryDate: String(fd.get('expiryDate') || '') || null,
      receivedAt: todayISO(),
    });
    setSaving(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success('Stok berhasil ditambahkan');
    setPicked(null);
    setSearch('');
    setResults([]);
  }

  return (
    <div>
      <Card className="mb-4">
        <Field label="Cari produk (nama atau kode)">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
            <Input className="pl-9" value={search} onChange={(e) => handleSearchChange(e.target.value)} placeholder="Ketik nama produk..." />
          </div>
        </Field>
        {results.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-lilac-100">
            {results.map((p) => (
              <button
                key={p.product_id}
                onClick={() => { setPicked(p); setResults([]); setSearch(p.name); }}
                className="flex w-full items-center justify-between border-t border-lilac-100 px-3 py-2.5 text-left text-sm first:border-t-0 hover:bg-lilac-50"
              >
                <span className="font-medium">{p.name}</span>
                <span className="font-mono text-[11px] text-ink-soft">{p.code} &middot; stok {p.stok}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {picked && (
        <Card>
          <div className="mb-4 rounded-xl bg-lilac-50 p-3">
            <p className="font-bold text-ink">{picked.name}</p>
            <p className="font-mono text-xs text-ink-soft">
              {picked.code} &middot; stok sekarang: {picked.stok} &middot; {rupiah(picked.harga_jual_aktif)}
            </p>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <Field label={picked.unit_type === 'gram' ? 'Berat Tambahan (gram) *' : 'Qty Tambahan *'}>
              <Input name="qty" type="number" step="any" min={0} required placeholder="0" />
            </Field>
            <Field label="Tanggal Kadaluwarsa Baru">
              <Input name="expiryDate" type="date" />
            </Field>
            <Field label="Harga Modal Baru (opsional)">
              <Input name="buyPrice" type="number" step="any" min={0} placeholder={String(picked.harga_modal_aktif || 0)} />
            </Field>
            <Field label="Harga Jual Baru (opsional)">
              <Input name="sellPrice" type="number" step="any" min={0} placeholder={String(picked.harga_jual_aktif || 0)} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" full disabled={saving}>
                <PackagePlus size={17} /> {saving ? 'Menyimpan...' : 'Tambah Stok'}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
