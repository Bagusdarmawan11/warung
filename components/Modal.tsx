'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/40 backdrop-blur-[2px] sm:items-center sm:p-5"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-xl3 bg-cream p-5 pb-7 shadow-pop animate-slide-up sm:rounded-xl3 sm:animate-pop-in">
        <div className="mb-4 flex items-start justify-between gap-3">
          {title && <h3 className="font-display text-xl font-bold text-ink">{title}</h3>}
          <button
            onClick={onClose}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-lilac-100 text-ink-soft hover:bg-lilac-200"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Ya, Lanjutkan',
  danger,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="mb-5 text-sm text-ink-soft">{message}</p>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 rounded-2xl border border-lilac-200 bg-white py-2.5 text-sm font-semibold text-ink hover:bg-lilac-50">
          Batal
        </button>
        <button
          onClick={() => { onConfirm(); }}
          className={`flex-1 rounded-2xl py-2.5 text-sm font-semibold text-white ${danger ? 'bg-rose-500 hover:bg-rose-600' : 'bg-peach-400 hover:bg-peach-500'}`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
