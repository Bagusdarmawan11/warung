import { TopNav, BottomNav } from '@/components/Nav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const nama = process.env.NEXT_PUBLIC_NAMA_WARUNG || 'Warung Saya';
  return (
    <div className="min-h-screen bg-cream">
      <TopNav namaWarung={nama} />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-5 sm:px-6 md:pb-10">{children}</main>
      <BottomNav />
    </div>
  );
}
