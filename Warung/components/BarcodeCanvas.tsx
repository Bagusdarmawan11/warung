'use client';

import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

export function BarcodeCanvas({
  code,
  className,
  width = 1.3,
  height = 30,
}: {
  code: string;
  className?: string;
  width?: number;
  height?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ref.current || !code) return;
    try {
      JsBarcode(ref.current, code, {
        format: 'CODE128',
        width,
        height,
        displayValue: true,
        fontSize: 10,
        margin: 6,
        background: '#ffffff',
        lineColor: '#2E2A3D',
      });
    } catch (e) {
      console.error('gagal membuat barcode', e);
    }
  }, [code, width, height]);

  return <canvas ref={ref} className={className} data-barcode-code={code} />;
}

export function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string) {
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Unduh SATU barcode sebagai file gambar PNG kecil — polos tanpa nama/harga,
 * persis seperti stiker barcode yang biasa nempel di kemasan produk asli.
 * Ukuran gambar mengikuti ukuran barcode-nya sendiri (tidak dibungkus
 * halaman A4), jadi hemat ruang kalau ditempel di kemasan kecil.
 */
export function downloadBarcodeAsPng(code: string, filename?: string) {
  const canvas = document.createElement('canvas');
  try {
    JsBarcode(canvas, code, {
      format: 'CODE128',
      width: 1.4,
      height: 26,
      displayValue: true,
      fontSize: 9,
      margin: 4,
      background: '#ffffff',
      lineColor: '#000000',
    });
  } catch (e) {
    console.error('gagal membuat barcode untuk diunduh', e);
    return;
  }
  downloadCanvasPng(canvas, filename || `${code}.png`);
}

/** Unduh beberapa barcode sekaligus (diberi jeda kecil antar unduhan supaya browser tidak memblokir unduhan beruntun). */
export async function downloadBarcodesAsPng(items: { code: string; filename?: string }[]) {
  for (let i = 0; i < items.length; i++) {
    downloadBarcodeAsPng(items[i].code, items[i].filename);
    if (i < items.length - 1) await new Promise((r) => setTimeout(r, 300));
  }
}
