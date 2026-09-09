'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ScanLine, Plus, Trash2, Loader2, Camera, X, Check } from 'lucide-react';
import { getProductBarcodes, addProductBarcode, deleteProductBarcode, type ProductBarcode } from '@/lib/actions/products';

export function ProductBarcodesManager({ productId }: { productId: string }) {
  const [barcodes, setBarcodes] = useState<ProductBarcode[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newBarcode, setNewBarcode] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [pendingScan, setPendingScan] = useState<string | null>(null);
  const [scanError, setScanError] = useState('');
  const [scanReady, setScanReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  // Lock: setelah deteksi berhasil, stop semua scanning
  const hasDetectedRef = useRef(false);

  async function refresh() {
    setLoading(true);
    try { setBarcodes(await getProductBarcodes(productId)); }
    finally { setLoading(false); }
  }

  useEffect(() => { refresh(); }, [productId]);
  useEffect(() => {
    if (showForm && !scannerOpen && !pendingScan) setTimeout(() => inputRef.current?.focus(), 50);
  }, [showForm, scannerOpen, pendingScan]);
  useEffect(() => { return () => { stopCamera(); }; }, []);

  async function startCamera() {
    setScanError('');
    // Reset semua state scan sebelumnya
    setPendingScan(null);
    hasDetectedRef.current = false;
    setScanReady(false);

    // Stop kamera lama kalau masih jalan
    stopCamera();

    setScannerOpen(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setScanReady(true);
      }

      const hasBarcodeDetector = 'BarcodeDetector' in window;

      if (hasBarcodeDetector) {
        // BarcodeDetector native — sangat cepat dan akurat
        // @ts-ignore
        const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'] });
        const scan = async () => {
          // Stop kalau sudah deteksi atau kamera sudah ditutup
          if (hasDetectedRef.current || !streamRef.current || !videoRef.current) return;
          if (videoRef.current.readyState >= 2) {
            try {
              const results = await detector.detect(videoRef.current);
              if (results.length > 0 && !hasDetectedRef.current) {
                hasDetectedRef.current = true;
                const code = results[0].rawValue;
                stopCamera();
                setPendingScan(code);
                return; // Berhenti total, tidak schedule frame berikutnya
              }
            } catch { /* frame belum siap */ }
          }
          // Schedule frame berikutnya hanya kalau belum deteksi
          if (!hasDetectedRef.current) {
            rafRef.current = requestAnimationFrame(scan);
          }
        };
        rafRef.current = requestAnimationFrame(scan);
      } else {
        // Fallback ZXing untuk browser yang tidak support BarcodeDetector
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();

        const scanFallback = () => {
          if (hasDetectedRef.current || !streamRef.current || !videoRef.current) return;
          reader.decodeFromVideoElement(videoRef.current, (result) => {
            if (result && !hasDetectedRef.current) {
              hasDetectedRef.current = true;
              const code = result.getText();
              stopCamera();
              setPendingScan(code);
            }
          }).catch(() => {});
        };
        // ZXing: jalankan sekali, callbacks akan terus datang sampai stopCamera
        scanFallback();
      }
    } catch {
      setScanError('Tidak bisa akses kamera. Pastikan izin kamera sudah diberikan.');
      setScannerOpen(false);
    }
  }

  function stopCamera() {
    // Stop semua RAF
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // Stop semua track kamera
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setScannerOpen(false);
    setScanReady(false);
  }

  function confirmScan() {
    if (pendingScan) { setNewBarcode(pendingScan); setPendingScan(null); }
  }

  async function retryScan() {
    // Reset semua state sebelum scan ulang
    setPendingScan(null);
    hasDetectedRef.current = false;
    // Tunggu sebentar supaya state bersih
    await new Promise((r) => setTimeout(r, 100));
    startCamera();
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newBarcode.trim()) { toast.error('Isi barcode terlebih dahulu'); return; }
    setAdding(true);
    const res = await addProductBarcode(productId, newBarcode.trim(), newLabel.trim());
    setAdding(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success('Barcode berhasil ditambahkan');
    setNewBarcode(''); setNewLabel(''); setShowForm(false);
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
        <button type="button" onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 rounded-lg bg-lilac-100 px-2.5 py-1 text-[11px] font-bold text-ink hover:bg-lilac-200">
          <Plus size={12} /> Tambah
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="mb-3 rounded-xl bg-lilac-50 p-3">
          <p className="mb-2 text-[11px] text-ink-soft">Scan atau ketik barcode dari kemasan produk ini.</p>

          {scannerOpen && (
            <div className="mb-2">
              <div className="relative overflow-hidden rounded-xl bg-black">
                <video ref={videoRef} className="w-full rounded-xl" playsInline muted style={{ maxHeight: '200px', objectFit: 'cover' }} />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-12 w-48 rounded-lg border-2 border-butter-400" />
                </div>
                {!scanReady && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                    <Loader2 size={20} className="animate-spin text-white" />
                  </div>
                )}
                <button type="button" onClick={stopCamera}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white">
                  <X size={14} />
                </button>
              </div>
              <p className="mt-1 text-center text-[11px] text-ink-soft">Arahkan ke barcode — berhenti otomatis setelah terbaca</p>
            </div>
          )}

          {pendingScan && (
            <div className="mb-2 rounded-xl border-2 border-butter-300 bg-butter-50 p-3">
              <p className="mb-1 text-[11px] font-bold text-ink-soft">Barcode terdeteksi — cocokkan dengan angka di kemasan:</p>
              <p className="mb-3 break-all font-mono text-base font-bold text-ink">{pendingScan}</p>
              <div className="flex gap-2">
                <button type="button" onClick={retryScan}
                  className="flex-1 rounded-xl border border-lilac-200 py-2 text-[11px] font-bold text-ink-soft">
                  Scan Ulang
                </button>
                <button type="button" onClick={confirmScan}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink py-2 text-[11px] font-bold text-cream">
                  <Check size={13} /> Ya, Pakai Ini
                </button>
              </div>
            </div>
          )}

          {!scannerOpen && !pendingScan && (
            <div className="mb-2 flex gap-2">
              <input ref={inputRef} type="text" value={newBarcode}
                onChange={(e) => setNewBarcode(e.target.value)}
                placeholder="Ketik atau scan barcode..."
                className="min-w-0 flex-1 rounded-xl border border-lilac-200 bg-white px-3 py-2 font-mono text-sm text-ink outline-none focus:border-peach-400 focus:ring-2 focus:ring-peach-100" />
              <button type="button" onClick={startCamera}
                className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-xl bg-butter-300 text-ink" title="Scan pakai kamera">
                <Camera size={18} />
              </button>
            </div>
          )}

          {scanError && <p className="mb-2 text-[11px] text-rose-500">{scanError}</p>}

          {!scannerOpen && !pendingScan && (
            <>
              <input type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Keterangan (opsional, cth: Varian 85gr)"
                className="mb-2 w-full rounded-xl border border-lilac-200 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-peach-400 focus:ring-2 focus:ring-peach-100" />
              <div className="flex gap-2">
                <button type="button"
                  onClick={() => { setShowForm(false); setNewBarcode(''); setNewLabel(''); stopCamera(); setPendingScan(null); }}
                  className="flex-1 rounded-xl border border-lilac-200 py-2 text-xs font-bold text-ink-soft">
                  Batal
                </button>
                <button type="submit" disabled={adding}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink py-2 text-xs font-bold text-cream disabled:opacity-50">
                  {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  Simpan Barcode
                </button>
              </div>
            </>
          )}
        </form>
      )}

      {loading ? (
        <p className="text-[11px] text-ink-soft">Memuat...</p>
      ) : barcodes.length === 0 ? (
        <p className="text-[11px] text-ink-soft">Belum ada barcode kemasan. Klik "+ Tambah" lalu scan atau ketik.</p>
      ) : (
        <div className="space-y-1.5">
          {barcodes.map((b) => (
            <div key={b.id} className="flex items-center gap-2 rounded-xl border border-lilac-100 bg-lilac-50/40 px-3 py-2">
              <ScanLine size={13} className="flex-none text-lilac-300" />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs font-bold text-ink">{b.barcode}</p>
                {b.label && <p className="text-[11px] text-ink-soft">{b.label}</p>}
              </div>
              <button type="button" onClick={() => handleDelete(b)}
                className="flex h-6 w-6 flex-none items-center justify-center rounded-lg bg-rose-100 text-rose-500 hover:bg-rose-200">
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
