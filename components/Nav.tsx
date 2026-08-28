'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, ScanLine, PackagePlus, Boxes, History, Sparkles, LogOut } from 'lucide-react';
import { signOut } from '@/lib/actions/auth';

const NAV_ITEMS = [
  { href: '/', label: 'Ringkasan', icon: LayoutGrid },
  { href: '/kasir', label: 'Kasir', icon: ScanLine },
  { href: '/barang-masuk', label: 'Barang Masuk', icon: PackagePlus },
  { href: '/produk', label: 'Produk', icon: Boxes },
  { href: '/riwayat', label: 'Riwayat', icon: History },
  { href: '/analitik', label: 'Analitik', icon: Sparkles },
];

export function TopNav({ namaWarung }: { namaWarung: string }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-lilac-100 bg-cream/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-peach-400 font-display text-lg font-extrabold text-white shadow-soft">
            {namaWarung.trim().charAt(0).toUpperCase() || 'W'}
          </div>
          <div className="leading-tight">
            <p className="font-display text-[15px] font-bold text-ink">{namaWarung}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">Kasir &amp; Stok</p>
          </div>
        </div>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors ${
                  active ? 'bg-ink text-cream' : 'text-ink-soft hover:bg-lilac-100 hover:text-ink'
                }`}
              >
                <Icon size={15} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <form action={signOut}>
          <button
            type="submit"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-lilac-200 bg-white text-ink-soft hover:bg-lilac-50"
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
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-lilac-100 bg-white/95 backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-6xl justify-between px-1 pb-[env(safe-area-inset-bottom)]">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold transition-colors ${
                active ? 'text-peach-500' : 'text-ink-soft/70'
              }`}
            >
              <Icon size={19} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
