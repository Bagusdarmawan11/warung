'use client';

import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

export function BarcodeCanvas({
  code,
  className,
  width = 2,
  height = 46,
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
        fontSize: 13,
        margin: 8,
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
