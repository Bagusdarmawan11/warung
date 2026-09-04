'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, ScanLine, PackagePlus, Boxes, History, LogOut } from 'lucide-react';
import { signOut } from '@/lib/actions/auth';

const NAV_ITEMS = [
  { href: '/', label: 'Beranda', icon: LayoutGrid },
  { href: '/kasir', label: 'Kasir', icon: ScanLine },
  { href: '/barang-masuk', label: 'Barang Masuk', icon: PackagePlus },
  { href: '/produk', label: 'Produk', icon: Boxes },
  { href: '/riwayat', label: 'Riwayat', icon: History },
];

export function TopNav({ namaWarung }: { namaWarung: string }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-3 z-30 mx-auto w-full max-w-6xl px-3 sm:px-6">
      <div
        className="relative flex items-center justify-between gap-4 overflow-hidden rounded-3xl border border-white/60 bg-white/55 px-4 py-2.5 shadow-[0_8px_32px_-12px_rgba(46,42,61,0.25)] backdrop-blur-2xl backdrop-saturate-150"
      >
        {/* kilau kaca halus di tepi atas */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent" />
        <div className="pointer-events-none absolute -top-10 left-1/4 h-20 w-1/2 rounded-full bg-white/40 blur-2xl" />

        <div className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-peach-400 to-peach-500 font-display text-lg font-extrabold text-white shadow-soft">
            {namaWarung.trim().charAt(0).toUpperCase() || 'W'}
          </div>
          <div className="leading-tight">
            <p className="font-display text-[15px] font-bold text-ink">{namaWarung}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">Kasir &amp; Stok</p>
          </div>
        </div>

        <nav className="relative hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-[13px] font-semibold transition-all ${
                  active ? 'bg-ink text-cream shadow-soft' : 'text-ink-soft hover:bg-white/70 hover:text-ink'
                }`}
              >
                <Icon size={15} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <form action={signOut} className="relative">
          <button
            type="submit"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-white/60 text-ink-soft transition hover:bg-white"
            title="Keluar"
          >
            <LogOut size={16} />
          </button>
        </form>
      </div>
    </header>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-3 bottom-3 z-30 md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="relative mx-auto flex max-w-md items-center justify-between overflow-hidden rounded-[28px] border border-white/60 bg-white/60 px-1.5 py-1.5 shadow-[0_10px_40px_-10px_rgba(46,42,61,0.35)] backdrop-blur-2xl backdrop-saturate-150">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent" />
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[9.5px] font-bold"
            >
              <span className={`flex h-8 w-8 items-center justify-center rounded-2xl transition-all ${active ? 'bg-ink text-butter-300 shadow-soft' : 'text-ink-soft/60'}`}>
                <Icon size={18} />
              </span>
              <span className={active ? 'text-ink' : 'text-ink-soft/50'}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
