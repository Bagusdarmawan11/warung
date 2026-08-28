'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { Modal } from './Modal';
import { ScanLine } from 'lucide-react';

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
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setReady(false);
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;

    (async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        if (!devices.length) {
          setError('Kamera tidak ditemukan di perangkat ini. Gunakan input kode manual di bawah.');
          return;
        }
        const backCam =
          devices.find((d) => /back|belakang|environment|rear/i.test(d.label)) || devices[devices.length - 1];

        const controls = await reader.decodeFromVideoDevice(
          backCam.deviceId,
          videoRef.current!,
          (result) => {
            if (cancelled || !result) return;
            const text = result.getText();
            const now = Date.now();
            const last = lastCodeRef.current;
            if (last && last.code === text && now - last.at < 1500) return; // debounce duplikat
            lastCodeRef.current = { code: text, at: now };
            onDetected(text);
          }
        );
        if (!cancelled) {
          controlsRef.current = controls;
          setReady(true);
        } else {
          controls.stop();
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
      try { controlsRef.current?.stop(); } catch {}
      controlsRef.current = null;
    };
  }, [open, onDetected]);

  return (
    <Modal open={open} onClose={onClose} title="Scan Barcode">
      <div className="relative overflow-hidden rounded-2xl bg-ink aspect-[4/3]">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        {ready && !error && (
          <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-butter-300/80">
            <ScanLine className="absolute -top-4 left-1/2 -translate-x-1/2 text-butter-300" size={20} />
          </div>
        )}
      </div>
      {error ? (
        <p className="mt-3 text-sm text-rose-500">{error}</p>
      ) : (
        <p className="mt-3 text-center text-xs text-ink-soft">Arahkan kamera ke barcode produk. Kode akan terdeteksi otomatis.</p>
      )}
    </Modal>
  );
}
