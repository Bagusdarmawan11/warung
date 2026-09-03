import { Store, Heart } from 'lucide-react';

export function Footer() {
  return (
    <footer className="mt-10 border-t border-lilac-100 bg-gradient-to-b from-transparent to-lilac-50/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-8 text-center sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-peach-400 text-white shadow-soft">
            <Store size={15} />
          </div>
          <span className="font-display text-sm font-bold text-ink">Warung Mama Indah</span>
        </div>
        <p className="flex items-center gap-1 text-[11px] text-ink-soft">
          Dibuat dengan <Heart size={11} className="fill-peach-400 text-peach-400" /> &middot; Copyright © 2026 by PT. Catindo Bagus Perkasa
        </p>
      </div>
    </footer>
  );
}
