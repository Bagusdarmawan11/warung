'use client';

import { useEffect, useState } from 'react';
import { Edit2, Printer, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { Badge, ToggleGroup } from '@/components/ui';
import { getProductMovements, type ProductMovement } from '@/lib/actions/products';
import { downloadBarcodeAsPng } from '@/components/BarcodeCanvas';
import { ImageLightbox } from '@/components/ImageLightbox';
import { rupiah, formatTanggalWaktu, formatQty } from '@/lib/format';
import type { ProductStockSummary } from '@/lib/types';

export function ProductViewModal({
  product,
  onClose,
  onEditClick,
}: {
  product: ProductStockSummary | null;
  onClose: () => void;
  onEditClick: (p: ProductStockSummary) => void;
}) {
  const [tab, setTab] = useState<'info' | 'riwayat'>('info');
  const [movements, setMovements] = useState<ProductMovement[] | null>(null);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    setTab('info');
    setMovements(null);
  }, [product]);

  useEffect(() => {
    if (tab === 'riwayat' && product && movements === null) {
      setLoadingMovements(true);
      getProductMovements(product.product_id).then(setMovements).finally(() => setLoadingMovements(false));
    }
  }, [tab, product, movements]);

  if (!product) return null;

  const modal = product.harga_modal_aktif || 0;
  const jual = product.harga_jual_aktif || 0;
  const untungPerUnit = jual - modal;
  const nilaiModalStok = product.stok * modal;
  const potensiUntung = product.stok * untungPerUnit;

  return (
    <>
      <Modal open={!!product} onClose={onClose} title="Detail Produk">
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={() => product.image_url && setLightbox(product.image_url)}
            className={`flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-2xl bg-lilac-50 text-lilac-300 ${product.image_url ? 'cursor-zoom-in' : ''}`}
          >
            {product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-lg font-bold">{product.name.charAt(0).toUpperCase()}</span>
            )}
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs text-ink-soft">{product.code} &middot; {product.unit_type === 'gram' ? 'Timbangan (gram)' : 'Satuan (pcs)'}{product.category ? ` · ${product.category}` : ''}</p>
            <p className="truncate font-display text-lg font-bold text-ink">{product.name}</p>
          </div>
          <button
            onClick={() => downloadBarcodeAsPng(product.code)}
            className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-lilac-100 text-ink-soft hover:bg-lilac-200"
            title="Unduh barcode"
          >
            <Printer size={15} />
          </button>
        </div>

        <div className="mb-4">
          <ToggleGroup value={tab} onChange={(v) => setTab(v as any)} options={[{ value: 'info', label: 'Info Detail' }, { value: 'riwayat', label: 'Riwayat Transaksi' }]} />
        </div>

        {tab === 'info' ? (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2.5">
              <Stat label="Sisa Stok" value={formatQty(product.stok, product.unit_type)} tone={product.stok <= 0 ? 'bad' : product.stok <= product.low_stock_threshold ? 'warn' : 'good'} />
              <Stat label="Harga Modal" value={rupiah(modal) + (product.unit_type === 'gram' ? '/gr' : '')} />
              <Stat label="Harga Jual" value={rupiah(jual) + (product.unit_type === 'gram' ? '/gr' : '')} />
              <Stat label="Untung / Unit" value={rupiah(untungPerUnit) + (product.unit_type === 'gram' ? '/gr' : '')} tone={untungPerUnit >= 0 ? 'good' : 'bad'} />
            </div>
            <div className="mb-2 grid grid-cols-2 gap-2.5">
              <Stat label="Nilai Modal Stok" value={rupiah(nilaiModalStok)} sub />
              <Stat label="Potensi Untung Stok" value={rupiah(potensiUntung)} sub tone={potensiUntung >= 0 ? 'good' : 'bad'} />
            </div>
            {product.kadaluwarsa_terdekat && (
              <p className="mb-4 text-xs text-ink-soft">Kadaluwarsa terdekat: <span className="font-semibold text-ink">{formatTanggalWaktu(product.kadaluwarsa_terdekat)}</span></p>
            )}

            <button
              onClick={() => onEditClick(product)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3 text-sm font-bold text-cream shadow-soft active:scale-[0.98]"
            >
              <Edit2 size={15} /> Edit Produk Ini
            </button>
          </>
        ) : (
          <MovementList movements={movements} loading={loadingMovements} unitType={product.unit_type} />
        )}
      </Modal>

      <ImageLightbox src={lightbox} alt={product.name} onClose={() => setLightbox(null)} />
    </>
  );
}

function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: 'good' | 'bad' | 'warn'; sub?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${sub ? 'border-lilac-100 bg-lilac-50/50' : 'border-lilac-100 bg-white'}`}>
      <p className="text-[10px] font-bold uppercase text-ink-soft">{label}</p>
      <p className={`font-mono font-bold ${sub ? 'text-sm' : 'text-base'} ${tone === 'good' ? 'text-mint-600' : tone === 'bad' ? 'text-rose-500' : tone === 'warn' ? 'text-butter-500' : 'text-ink'}`}>{value}</p>
    </div>
  );
}

function MovementList({ movements, loading, unitType }: { movements: ProductMovement[] | null; loading: boolean; unitType: 'pcs' | 'gram' }) {
  if (loading || movements === null) return <p className="py-6 text-center text-xs text-ink-soft">Memuat riwayat...</p>;
  if (movements.length === 0) return <p className="py-6 text-center text-xs text-ink-soft">Belum ada riwayat transaksi untuk produk ini.</p>;

  return (
    <div className="max-h-[50vh] space-y-2 overflow-y-auto">
      {movements.map((m) => (
        <div key={m.id} className="flex items-center gap-3 rounded-xl border border-lilac-100 p-3">
          <div className={`flex h-9 w-9 flex-none items-center justify-center rounded-full ${m.type === 'masuk' ? 'bg-mint-100 text-mint-600' : 'bg-peach-100 text-peach-500'}`}>
            {m.type === 'masuk' ? <ArrowDownCircle size={16} /> : <ArrowUpCircle size={16} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-ink">{m.type === 'masuk' ? 'Barang Masuk' : 'Terjual'}</span>
              <Badge tone={m.type === 'masuk' ? 'good' : 'info'}>{formatQty(m.qty, unitType)}</Badge>
            </div>
            <p className="text-[11px] text-ink-soft">
              {formatTanggalWaktu(m.date)}
              {m.type === 'keluar' && m.buyerName ? ` · Pembeli: ${m.buyerName}` : ''}
            </p>
          </div>
          <div className="flex-none text-right">
            <p className="font-mono text-xs font-bold text-ink">{rupiah(m.unitPrice)}</p>
            {m.type === 'keluar' && m.unitCost != null && (
              <p className="font-mono text-[10px] text-mint-600">+{rupiah((m.unitPrice || 0) - m.unitCost)}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
