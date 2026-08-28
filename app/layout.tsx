import type { Metadata, Viewport } from 'next';
import { Baloo_2, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

const display = Baloo_2({ subsets: ['latin'], variable: '--font-display', weight: ['600', '700', '800'] });
const body = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-body', weight: ['400', '500', '600', '700'] });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', weight: ['400', '500', '600'] });

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_NAMA_WARUNG || 'Warung Kasir',
  description: 'Aplikasi kasir & manajemen stok warung',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#FFFBF3',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="font-body antialiased">
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
