'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ImageDown, Loader2 } from 'lucide-react';
import { getProductsWithImages } from '@/lib/actions/products';

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9\-_ ]/gi, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'produk';
}

export function BackupImagesButton() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');

  async function handleBackup() {
    setLoading(true);
    setProgress('Mengambil daftar produk...');
    try {
      const products = await getProductsWithImages();
      if (!products.length) {
        toast.error('Belum ada foto produk yang tersimpan.');
        setLoading(false);
        return;
      }

      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      let ok = 0;
      let failed = 0;

      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        setProgress(`Mengunduh foto ${i + 1} dari ${products.length}...`);
        try {
          const res = await fetch(p.image_url);
          if (!res.ok) throw new Error('fetch gagal');
          const blob = await res.blob();
          const ext = p.image_url.split('.').pop()?.split('?')[0] || 'jpg';
          const filename = `${sanitizeFilename(p.name)}_${p.code}.${ext}`;
          zip.file(filename, blob);
          ok++;
        } catch {
          failed++;
        }
      }

      if (ok === 0) {
        toast.error('Semua foto gagal diunduh. Coba lagi.');
        setLoading(false);
        return;
      }

      setProgress('Menyusun file ZIP...');
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-foto-produk-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast.success(`${ok} foto berhasil di-backup ke file ZIP${failed ? ` (${failed} gagal)` : ''}`);
    } catch (e: any) {
      toast.error('Gagal backup: ' + e.message);
    } finally {
      setLoading(false);
      setProgress('');
    }
  }

  return (
    <button
      onClick={handleBackup}
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-lilac-200 bg-lilac-50/50 py-3 text-sm font-bold text-ink-soft transition hover:border-peach-300 hover:text-ink disabled:opacity-60"
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : <ImageDown size={16} />}
      {loading ? progress || 'Memproses...' : 'Backup Semua Foto Produk (ZIP)'}
    </button>
  );
}
