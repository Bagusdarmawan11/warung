import { Store } from 'lucide-react';

export function Footer() {
  return (
    <footer className="mx-auto w-full max-w-6xl px-4 pb-8 pt-2 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-gradient-to-br from-lilac-100 via-peach-50 to-mint-50 px-6 py-7 text-center shadow-soft">
        <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/40 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-12 -left-10 h-32 w-32 rounded-full bg-white/30 blur-2xl" />

        <div className="relative mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-ink text-butter-300 shadow-soft">
          <Store size={17} />
        </div>
        <p className="relative font-display text-[15px] font-bold text-ink">Warung Mama Indah</p>
        <p className="relative mt-1 text-[11px] text-ink-soft">Copyright © 2026 by PT. Catindo Bagus Perkasa</p>
      </div>
    </footer>
  );
}
