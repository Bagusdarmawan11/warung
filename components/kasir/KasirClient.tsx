'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ScanLine, Plus, Minus, Trash2, Camera, CheckCircle2, ShoppingCart, ImageIcon, CalendarClock } from 'lucide-react';
import { Button, Card, Input, Field, EmptyState } from '@/components/ui';
import { Modal, ConfirmDialog } from '@/components/Modal';
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal';
import { ImageLightbox } from '@/components/ImageLightbox';
import { getProductByCode, getProductSummaries } from '@/lib/actions/products';
import { checkoutCart } from '@/lib/actions/sales';
import { rupiah, formatQty, todayISO, combineDateWithNowTime, pricePerKgFromPerGram, pricePerGramFromPerKg } from '@/lib/format';
import type { ProductStockSummary } from '@/lib/types';

interface CartLine {
  product_id: string;
  code: string;
  name: string;
  unit_type: 'pcs' | 'gram';
  qty: number;
  unit_price: number;
  stok_tersedia: number;
  image_url: string | null;
}

function Thumb({ url, onClick, size = 'h-11 w-11' }: { url: string | null; onClick?: () => void; size?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { if (url && onClick) { e.stopPropagation(); onClick(); } }}
      className={`flex ${size} flex-none items-center justify-center overflow-hidden rounded-xl bg-lilac-50 text-lilac-300 ${url ? 'cursor-zoom-in' : 'cursor-default'}`}
      title={url ? 'Lihat foto' : undefined}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <ImageIcon size={16} />
      )}
    </button>
  );
}

export function KasirClient() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<ProductStockSummary[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [buyerName, setBuyerName] = useState('');
  const [transactionDate, setTransactionDate] = useState(() => todayISO());
  const [scannerOpen, setScannerOpen] = useState(false);
  const [gramPrompt, setGramPrompt] = useState<ProductStockSummary | null>(null);
  const [gramValue, setGramValue] = useState('');
  const [gramPriceKg, setGramPriceKg] = useState('');
  const [insufficientOpen, setInsufficientOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const results = await getProductSummaries({ search: q });
        setSuggestions(results.slice(0, 6));
      } catch { /* ignore */ }
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  function addPcsToCart(p: ProductStockSummary) {
    setCart((cur) => {
      const existing = cur.find((c) => c.product_id === p.product_id);
      if (existing) {
        return cur.map((c) => (c.product_id === p.product_id ? { ...c, qty: c.qty + 1 } : c));
      }
      return [
        ...cur,
        {
          product_id: p.product_id,
          code: p.code,
          name: p.name,
          unit_type: p.unit_type,
          qty: 1,
          unit_price: p.harga_jual_aktif || 0,
          stok_tersedia: p.stok,
          image_url: p.image_url,
        },
      ];
    });
    toast.success(`Ditambahkan: ${p.name}`);
  }

  function handlePicked(p: ProductStockSummary) {
    setQuery('');
    setSuggestions([]);
    if (p.unit_type === 'gram') {
      setGramPrompt(p);
      setGramValue('');
      setGramPriceKg(String(pricePerKgFromPerGram(p.harga_jual_aktif || 0)));
    } else {
      addPcsToCart(p);
    }
  }

  async function lookupAndAdd(raw: string) {
    const q = raw.trim();
    if (!q) return;
    try {
      let product = await getProductByCode(q);
      if (!product) {
        const results = await getProductSummaries({ search: q });
        if (results.length === 1) product = results[0];
        else if (results.length > 1) {
          setSuggestions(results.slice(0, 6));
          return;
        }
      }
      if (!product) {
        toast.error(`Kode/nama "${q}" tidak ditemukan`);
        return;
      }
      handlePicked(product);
    } catch (e: any) {
      toast.error('Gagal mencari produk: ' + e.message);
    }
  }

  function handleScanDetected(code: string) {
    lookupAndAdd(code);
  }

  function confirmGramAdd() {
    if (!gramPrompt) return;
    const gram = parseFloat(gramValue.replace(',', '.'));
    if (!gram || gram <= 0) { toast.error('Isi berat dalam gram terlebih dahulu'); return; }
    const priceKg = parseFloat(gramPriceKg.replace(',', '.')) || 0;
    const unitPricePerGram = pricePerGramFromPerKg(priceKg);
    setCart((cur) => {
      const existing = cur.find((c) => c.product_id === gramPrompt.product_id);
      if (existing) {
        return cur.map((c) => (c.product_id === gramPrompt.product_id ? { ...c, qty: c.qty + gram } : c));
      }
      return [
        ...cur,
        {
          product_id: gramPrompt.product_id,
          code: gramPrompt.code,
          name: gramPrompt.name,
          unit_type: 'gram',
          qty: gram,
          unit_price: unitPricePerGram,
          stok_tersedia: gramPrompt.stok,
          image_url: gramPrompt.image_url,
        },
      ];
    });
    toast.success(`Ditambahkan: ${gramPrompt.name} (${gram} gr)`);
    setGramPrompt(null);
    setGramValue('');
  }

  function changeQty(productId: string, delta: number) {
    setCart((cur) => cur.map((c) => (c.product_id === productId ? { ...c, qty: Math.max(1, c.qty + delta) } : c)));
  }
  function setQtyDirect(productId: string, value: number) {
    setCart((cur) => cur.map((c) => (c.product_id === productId ? { ...c, qty: Math.max(0.01, value) } : c)));
  }
  function setUnitPrice(productId: string, value: number) {
    setCart((cur) => cur.map((c) => (c.product_id === productId ? { ...c, unit_price: Math.max(0, value) } : c)));
  }
  function removeFromCart(productId: string) {
    setCart((cur) => cur.filter((c) => c.product_id !== productId));
  }

  const total = cart.reduce((s, c) => s + c.qty * c.unit_price, 0);

  async function runCheckout(allowOversell: boolean) {
    setCheckingOut(true);
    try {
      const res = await checkoutCart(
        cart.map((c) => ({ productId: c.product_id, qty: c.qty, unitPriceOverride: c.unit_price })),
        buyerName,
        allowOversell,
        combineDateWithNowTime(transactionDate)
      );
      if (!res.ok) {
        if (res.kind === 'INSUFFICIENT_STOCK') {
          setInsufficientOpen(true);
        } else {
          toast.error(res.error);
        }
        return;
      }
      toast.success('Transaksi berhasil disimpan');
      setCart([]);
      setBuyerName('');
      setTransactionDate(todayISO());
      setInsufficientOpen(false);
    } catch (e: any) {
      toast.error('Gagal checkout: ' + e.message);
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <div className="animate-slide-up pb-6">
      <div className="mb-4">
        <h1 className="font-display text-2xl font-extrabold text-ink">Kasir</h1>
        <p className="text-sm text-ink-soft">Scan barcode, atau ketik kode/nama barang lalu Enter</p>
      </div>

      <Card className="mb-4 !bg-ink !border-ink">
        <label className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-butter-300">Kode barang / barcode</label>
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lookupAndAdd(query); } }}
            placeholder="Scan atau ketik kode / nama..."
            autoComplete="off"
            className="!bg-white font-mono"
          />
          <Button variant="primary" size="icon" onClick={() => lookupAndAdd(query)} title="Tambah">
            <Plus size={18} />
          </Button>
          <Button variant="secondary" size="icon" onClick={() => setScannerOpen(true)} title="Scan pakai kamera" className="!bg-butter-300 !text-ink">
            <Camera size={18} />
          </Button>
        </div>
        {suggestions.length > 0 && (
          <div className="mt-2 overflow-hidden rounded-xl bg-white">
            {suggestions.map((p) => (
              <button
                key={p.product_id}
                onClick={() => handlePicked(p)}
                className="flex w-full items-center gap-2.5 border-t border-lilac-100 px-3 py-2.5 text-left text-sm first:border-t-0 hover:bg-lilac-50"
              >
                <Thumb url={p.image_url} onClick={() => setLightbox(p.image_url)} size="h-8 w-8" />
                <span className="flex-1 truncate font-medium text-ink">{p.name}</span>
                <span className="flex-none font-mono text-[11px] text-ink-soft">
                  {p.code} &middot; {rupiah(p.harga_jual_aktif)} &middot; stok {formatQty(p.stok, p.unit_type)}
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {cart.length === 0 ? (
        <EmptyState icon={<ShoppingCart size={30} />} title="Keranjang masih kosong" hint="Scan barcode produk untuk memulai transaksi." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nama pembeli (opsional)">
              <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Cth: Bu Lubis" />
            </Field>
            <Field label="Tanggal transaksi">
              <Input type="date" max={todayISO()} value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} />
            </Field>
          </div>
          {transactionDate !== todayISO() && (
            <p className="-mt-3 mb-4 flex items-center gap-1.5 text-[11px] font-bold text-butter-500">
              <CalendarClock size={13} /> Transaksi akan dicatat untuk tanggal {transactionDate}, bukan hari ini
            </p>
          )}

          <div className="mb-4 space-y-2">
            {cart.map((item) => (
              <div key={item.product_id} className="flex items-center gap-2 rounded-2xl border border-lilac-100 bg-white p-2.5 shadow-soft">
                <Thumb url={item.image_url} onClick={() => setLightbox(item.image_url)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
                  <div className="flex items-center gap-1 text-[11px] text-ink-soft">
                    <span className="font-mono">{item.code}</span>
                    <span>&middot;</span>
                    <input
                      type="number"
                      value={item.unit_type === 'gram' ? pricePerKgFromPerGram(item.unit_price) : item.unit_price}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value) || 0;
                        setUnitPrice(item.product_id, item.unit_type === 'gram' ? pricePerGramFromPerKg(v) : v);
                      }}
                      className="w-20 rounded border border-lilac-200 bg-lilac-50/60 px-1 py-0.5 font-mono text-[11px]"
                    />
                    <span>/{item.unit_type === 'gram' ? 'kg' : 'pcs'}</span>
                    {item.qty > item.stok_tersedia && <span className="font-bold text-rose-500">stok {formatQty(item.stok_tersedia, item.unit_type)}</span>}
                  </div>
                </div>

                {item.unit_type === 'pcs' ? (
                  <div className="flex flex-none items-center gap-1.5">
                    <button onClick={() => changeQty(item.product_id, -1)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-lilac-100 text-ink"><Minus size={13} /></button>
                    <input
                      type="number"
                      value={item.qty}
                      onChange={(e) => setQtyDirect(item.product_id, parseInt(e.target.value) || 1)}
                      className="w-11 rounded-lg border border-lilac-200 py-1 text-center font-mono text-sm"
                    />
                    <button onClick={() => changeQty(item.product_id, 1)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-lilac-100 text-ink"><Plus size={13} /></button>
                  </div>
                ) : (
                  <div className="flex flex-none items-center gap-1">
                    <input
                      type="number"
                      value={item.qty}
                      onChange={(e) => setQtyDirect(item.product_id, parseFloat(e.target.value) || 0.1)}
                      className="w-16 rounded-lg border border-lilac-200 py-1 text-center font-mono text-sm"
                    />
                    <span className="text-[11px] font-semibold text-ink-soft">gr</span>
                  </div>
                )}

                <div className="w-20 flex-none text-right font-mono text-sm font-bold text-ink">{rupiah(item.qty * item.unit_price)}</div>
                <button onClick={() => removeFromCart(item.product_id)} className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-rose-100 text-rose-500">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          <div className="sticky bottom-24 rounded-2xl border border-lilac-100 bg-white p-4 shadow-pop md:bottom-4">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-xs font-bold text-ink-soft">Total Belanja</span>
              <span className="font-mono text-2xl font-extrabold text-ink">{rupiah(total)}</span>
            </div>
            <Button full size="lg" disabled={checkingOut} onClick={() => runCheckout(false)}>
              <CheckCircle2 size={18} /> {checkingOut ? 'Memproses...' : 'Selesaikan Transaksi'}
            </Button>
          </div>
        </>
      )}

      <BarcodeScannerModal open={scannerOpen} onClose={() => setScannerOpen(false)} onDetected={handleScanDetected} />

      <Modal open={!!gramPrompt} onClose={() => setGramPrompt(null)} title={gramPrompt ? `Berat: ${gramPrompt.name}` : ''}>
        {gramPrompt && (
          <>
            {gramPrompt.image_url && (
              <div className="mb-4 flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={gramPrompt.image_url}
                  alt={gramPrompt.name}
                  className="h-28 w-28 cursor-zoom-in rounded-2xl object-cover shadow-soft"
                  onClick={() => setLightbox(gramPrompt.image_url)}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Berat terjual (gram)">
                <Input
                  type="number"
                  autoFocus
                  value={gramValue}
                  onChange={(e) => setGramValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') confirmGramAdd(); }}
                  placeholder="Cth: 250"
                />
              </Field>
              <Field label="Harga jual /kg" hint="Bisa disesuaikan kalau harga hari ini beda">
                <Input
                  type="number"
                  value={gramPriceKg}
                  onChange={(e) => setGramPriceKg(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') confirmGramAdd(); }}
                  placeholder="Cth: 26000"
                />
              </Field>
            </div>
            <p className="mb-4 text-sm text-ink-soft">
              Perkiraan total:{' '}
              <span className="font-bold text-ink">
                {rupiah((parseFloat(gramValue) || 0) * pricePerGramFromPerKg(parseFloat(gramPriceKg) || 0))}
              </span>
            </p>
            <Button full onClick={confirmGramAdd}>Tambah ke Keranjang</Button>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={insufficientOpen}
        onClose={() => setInsufficientOpen(false)}
        onConfirm={() => runCheckout(true)}
        title="Stok Tidak Cukup"
        message="Salah satu barang di keranjang jumlahnya melebihi stok yang tercatat. Tetap lanjutkan transaksi?"
        confirmLabel="Tetap Lanjutkan"
        danger
      />

      <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}
