'use client';

import { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { ScanLine, Loader2 } from 'lucide-react';

export function BarcodeScannerModal({
  open,
  onClose,
  onDetected,
}: {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const hasDetectedRef = useRef(false);
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [usingNative, setUsingNative] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setReady(false);
    hasDetectedRef.current = false;
    lastCodeRef.current = null;

    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if (!cancelled) setReady(true);

        // Coba BarcodeDetector API (native browser, JAUH lebih cepat dari ZXing)
        const hasBarcodeDetector = 'BarcodeDetector' in window;
        setUsingNative(hasBarcodeDetector);

        if (hasBarcodeDetector) {
          // @ts-ignore
          const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'] });
          const scanNative = async () => {
            if (cancelled || !videoRef.current || videoRef.current.readyState < 2) {
              if (!cancelled) rafRef.current = requestAnimationFrame(scanNative);
              return;
            }
            try {
              const barcodes = await detector.detect(videoRef.current);
              if (!cancelled && barcodes.length > 0) {
                const code = barcodes[0].rawValue;
                // LOCK KETAT: setelah deteksi pertama, stop scanner sepenuhnya
                cancelled = true;
                if (rafRef.current) cancelAnimationFrame(rafRef.current);
                if (streamRef.current) {
                  streamRef.current.getTracks().forEach((t) => t.stop());
                  streamRef.current = null;
                }
                onDetected(code);
                return; // jangan schedule frame berikutnya
              }
            } catch { /* frame belum siap, coba lagi */ }
            if (!cancelled) rafRef.current = requestAnimationFrame(scanNative);
          };
          rafRef.current = requestAnimationFrame(scanNative);
        } else {
          // Fallback: ZXing via canvas — ambil frame setiap 200ms
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          const reader = new BrowserMultiFormatReader();
          const scanZxing = async () => {
            if (cancelled || !videoRef.current || !canvasRef.current) return;
            if (videoRef.current.readyState < 2) {
              if (!cancelled) setTimeout(scanZxing, 200);
              return;
            }
            try {
              const canvas = canvasRef.current;
              const ctx = canvas.getContext('2d');
              if (!ctx) return;
              canvas.width = videoRef.current.videoWidth;
              canvas.height = videoRef.current.videoHeight;
              ctx.drawImage(videoRef.current, 0, 0);
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              // ZXing decode dari ImageData
              const luminance = new Uint8ClampedArray(canvas.width * canvas.height);
              for (let i = 0; i < luminance.length; i++) {
                const r = imageData.data[i * 4];
                const g = imageData.data[i * 4 + 1];
                const b = imageData.data[i * 4 + 2];
                luminance[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
              }
              const { BinaryBitmap, HybridBinarizer, RGBLuminanceSource } = await import('@zxing/library');
              const source = new RGBLuminanceSource(luminance, canvas.width, canvas.height);
              const bitmap = new BinaryBitmap(new HybridBinarizer(source));
              const result = await new (await import('@zxing/library')).MultiFormatReader().decode(bitmap);
              if (!cancelled && result) {
                const code = result.getText();
                const now = Date.now();
                const last = lastCodeRef.current;
                if (!last || last.code !== code || now - last.at > 1500) {
                  lastCodeRef.current = { code, at: now };
                  if (!cancelled) onDetected(code);
                }
              }
            } catch { /* belum ada barcode di frame, coba lagi */ }
            if (!cancelled) setTimeout(scanZxing, 150);
          };
          setTimeout(scanZxing, 500);
        }
      } catch (e: any) {
        if (cancelled) return;
        const msg = String(e?.name || e?.message || '');
        if (/NotAllowedError|Permission/i.test(msg)) {
          setError('Izin kamera ditolak. Aktifkan izin kamera untuk situs ini di pengaturan browser, atau pakai input kode manual.');
        } else if (/NotFoundError/i.test(msg)) {
          setError('Kamera tidak ditemukan. Gunakan input kode manual di bawah.');
        } else {
          setError('Gagal mengakses kamera. Gunakan input kode manual di bawah.');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [open, onDetected]);

  return (
    <Modal open={open} onClose={onClose} title="Scan Barcode">
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">{error}</div>
      ) : (
        <div className="relative overflow-hidden rounded-2xl bg-black">
          <video
            ref={videoRef}
            className="w-full"
            playsInline
            muted
            style={{ display: 'block', maxHeight: '60vh', objectFit: 'cover' }}
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Garis panduan scan */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="h-20 w-64 rounded-xl border-2 border-butter-400 shadow-lg" />
          </div>

          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70">
              <div className="flex flex-col items-center gap-2 text-white">
                <Loader2 size={28} className="animate-spin" />
                <span className="text-sm">Memuat kamera...</span>
              </div>
            </div>
          )}

          {ready && (
            <div className="absolute bottom-3 left-0 right-0 flex justify-center">
              <div className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-[11px] text-white">
                <ScanLine size={12} />
                {usingNative ? 'Mode cepat aktif' : 'Arahkan ke barcode produk'}
              </div>
            </div>
          )}
        </div>
      )}
      <p className="mt-3 text-center text-[11px] text-ink-soft">Kode akan terdeteksi otomatis. Pastikan barcode ada di dalam kotak kuning.</p>
    </Modal>
  );
}
