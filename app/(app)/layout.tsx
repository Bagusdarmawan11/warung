import { TopNav, BottomNav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const nama = process.env.NEXT_PUBLIC_NAMA_WARUNG || 'Warung Saya';
  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <TopNav namaWarung={nama} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 sm:px-6 md:pb-10">{children}</main>
      <Footer />
      <BottomNav />
    </div>
  );
}
