import { LoginForm } from '@/components/LoginForm';
import { Footer } from '@/components/Footer';
import { Store } from 'lucide-react';

export default function LoginPage() {
  const nama = process.env.NEXT_PUBLIC_NAMA_WARUNG || 'Warung Saya';
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-cream via-lilac-50 to-peach-50">
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-3xl bg-peach-400 text-white shadow-pop">
              <Store size={26} />
            </div>
            <h1 className="font-display text-2xl font-extrabold text-ink">{nama}</h1>
            <p className="text-sm text-ink-soft">Masuk untuk mengelola kasir &amp; stok</p>
          </div>
          <div className="rounded-xl3 border border-lilac-100 bg-white p-6 shadow-soft">
            <LoginForm />
          </div>
          <p className="mt-4 text-center text-[11px] text-ink-soft/70">
            Belum punya akun? Buat lewat Supabase Dashboard → Authentication → Add user.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
