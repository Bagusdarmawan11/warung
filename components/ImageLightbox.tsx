'use client';

import { X } from 'lucide-react';

export function ImageLightbox({ src, alt, onClose }: { src: string | null; alt?: string; onClose: () => void }) {
  if (!src) return null;
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/80 p-6 backdrop-blur-sm animate-pop-in"
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt || 'Foto produk'} className="max-h-[80vh] max-w-full rounded-2xl object-contain shadow-pop" />
      <button
        onClick={onClose}
        className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-ink shadow-soft"
      >
        <X size={18} />
      </button>
    </div>
  );
}
