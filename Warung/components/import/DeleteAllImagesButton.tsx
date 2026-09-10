'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Trash2, Loader2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/Modal';
import { createClient } from '@/lib/supabase/client';

const BUCKET = 'product-images';

export function DeleteAllImagesButton() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleDelete() {
    setConfirmOpen(false);
    setLoading(true);
    setProgress('Mencari semua folder foto...');
    const supabase = createClient();

    try {
      const { data: folders, error: listErr } = await supabase.storage.from(BUCKET).list('', { limit: 5000 });
      if (listErr) throw new Error(listErr.message);

      const allPaths: string[] = [];
      for (const folder of folders || []) {
        const { data: files } = await supabase.storage.from(BUCKET).list(folder.name, { limit: 200 });
        for (const f of files || []) {
          allPaths.push(`${folder.name}/${f.name}`);
        }
      }

      if (!allPaths.length) {
        toast.error('Tidak ada foto ditemukan di Storage.');
        setLoading(false);
        return;
      }

      let deleted = 0;
      // hapus per 100 file supaya tidak kena limit request
      for (let i = 0; i < allPaths.length; i += 100) {
        const batch = allPaths.slice(i, i + 100);
        setProgress(`Menghapus foto ${i + 1}-${Math.min(i + 100, allPaths.length)} dari ${allPaths.length}...`);
        const { error } = await supabase.storage.from(BUCKET).remove(batch);
        if (error) throw new Error(error.message);
        deleted += batch.length;
      }

      toast.success(`${deleted} foto berhasil dihapus dari Storage.`);
    } catch (e: any) {
      toast.error('Gagal menghapus: ' + e.message);
    } finally {
      setLoading(false);
      setProgress('');
    }
  }

  return (
    <>
      <button
        onClick={() => setConfirmOpen(true)}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-rose-200 bg-rose-50/50 py-3 text-sm font-bold text-rose-500 transition hover:border-rose-300 disabled:opacity-60"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
        {loading ? progress || 'Menghapus...' : 'Hapus Semua Foto dari Storage'}
      </button>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Hapus Semua Foto"
        message="Ini menghapus PERMANEN semua file foto produk dari Supabase Storage (bukan cuma dari database). Pastikan kamu sudah backup dulu pakai tombol di atas. Lanjutkan?"
        confirmLabel="Ya, Hapus Semua"
        danger
      />
    </>
  );
}
