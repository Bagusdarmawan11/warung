'use client';

import { useEffect } from 'react';
import { BarcodeCanvas } from './BarcodeCanvas';
import { rupiah } from '@/lib/format';

export interface PrintItem {
  code: string;
  name: string;
  price: number;
}

export function PrintLabelSheet({ items, onDone }: { items: PrintItem[] | null; onDone: () => void }) {
  useEffect(() => {
    if (!items || !items.length) return;
    const t = setTimeout(() => window.print(), 200);
    function handleAfterPrint() { onDone(); }
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  if (!items || !items.length) return null;

  return (
    <div id="print-area" className="hidden">
      {items.map((it, i) => (
        <div
          key={i}
          className="print-label"
          style={{
            display: 'inline-block',
            width: '38mm',
            minHeight: '26mm',
            border: '1px dashed #999',
            padding: '2mm',
            margin: '1.5mm',
            textAlign: 'center',
            pageBreakInside: 'avoid',
            verticalAlign: 'top',
          }}
        >
          <div style={{ fontSize: '8.5px', fontWeight: 700, fontFamily: 'Arial, sans-serif', lineHeight: 1.15, maxHeight: 19, overflow: 'hidden' }}>
            {it.name}
          </div>
          <div style={{ fontSize: '10.5px', fontWeight: 700, fontFamily: 'monospace', margin: '1mm 0' }}>{rupiah(it.price)}</div>
          <BarcodeCanvas code={it.code} width={1.3} height={32} />
        </div>
      ))}
    </div>
  );
}
