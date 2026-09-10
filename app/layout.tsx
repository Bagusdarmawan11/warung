import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import './globals.css';
export const metadata: Metadata = { title: 'Warung Kasir', description: 'x', icons: { icon: '/favicon.png' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, minimumScale: 1, userScalable: false, themeColor: '#FFFBF3' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="id"><body className="font-body antialiased">{children}<Toaster position="top-center" richColors closeButton /></body></html>);
}
