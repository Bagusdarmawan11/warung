'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, Info, PackagePlus, Receipt, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui';
import { importLegacyCsv, type ImportResult } from '@/lib/actions/import';

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsText(file, 'utf-8');
  });
}

export function ImportClient() {
  const [masukFile, setMasukFile] = useState<File | null>(null);
  const [jualFile, setJualFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const canImport = !!masukFile || !!jualFile;

  async function handleImport() {
    if (!canImport) { toast.error('Pilih minimal satu file (Barang Masuk atau Penjualan)'); return; }
    setLoading(true);
    setResult(null);
    try {
      const masukText = masukFile ? await readFileAsText(masukFile) : '';
      const jualText = jualFile ? await readFileAsText(jualFile) : '';
      const res = await importLegacyCsv(masukText, jualText);
      setResult(res);
      if (res.ok) toast.success('Import selesai');
      else toast.error(res.error || 'Import gagal');
    } catch (e: any) {
      toast.error('Gagal: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl animate-slide-up">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-peach-400 to-lilac-400 text-white shadow-pop">
          <UploadCloud size={24} />
        </div>
        <h1 className="font-display text-2xl font-extrabold text-ink">Import Data Lama</h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
          Upload catatan lama kamu langsung dari browser — tidak perlu komputer atau terminal.
        </p>
      </div>

      <Card className="mb-4 !p-4 sm:!p-5">
        <FileDropField
          icon={<PackagePlus size={18} />}
          title="Barang Masuk"
          hint="Data stok & harga produk"
          file={masukFile}
          onChange={setMasukFile}
          accent="mint"
        />
        <div className="my-3 flex items-center gap-3">
          <div className="h-px flex-1 bg-lilac-100" />
          <span className="text-[10px] font-bold uppercase tracking-wide text-ink-soft/60">dan / atau</span>
          <div className="h-px flex-1 bg-lilac-100" />
        </div>
        <FileDropField
          icon={<Receipt size={18} />}
          title="Penjualan"
          hint="Jadi riwayat transaksi"
          file={jualFile}
          onChange={setJualFile}
          accent="peach"
        />

        <button
          onClick={handleImport}
          disabled={loading || !canImport}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-peach-400 to-peach-500 py-3.5 text-sm font-bold text-white shadow-soft transition active:scale-[0.98] disabled:opacity-40"
        >
          {loading ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={17} />}
          {loading ? 'Memproses...' : 'Mulai Import'}
        </button>

        <div className="mt-4 flex items-start gap-2 rounded-xl bg-lilac-50/70 p-3">
          <Info size={14} className="mt-0.5 flex-none text-lilac-400" />
          <p className="text-[11px] leading-relaxed text-ink-soft">
            Cukup upload salah satu kalau memang cuma itu yang kamu punya. Semua produk hasil import jadi satuan <b>pcs</b> —
            produk timbangan (telur, kemiri, dll) bisa digabung jadi satu lewat fitur <b>Gabung Produk</b> di halaman Produk setelah import.
            Tiap baris restock di file Barang Masuk dicatat sebagai riwayat sendiri (bukan digabung), dan file ini hanya bisa
            diimport <b>satu kali</b> per jenis data — aman dari dobel, tapi kalau memang perlu ulang, reset dulu lewat
            <code className="mx-1 rounded bg-white px-1">supabase/scripts/reset_data.sql</code>.
          </p>
        </div>
      </Card>

      {result && <ResultCard result={result} />}
    </div>
  );
}

function FileDropField({
  icon,
  title,
  hint,
  file,
  onChange,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  file: File | null;
  onChange: (f: File | null) => void;
  accent: 'mint' | 'peach';
}) {
  const accentClasses = accent === 'mint'
    ? { icon: 'bg-mint-100 text-mint-600', border: 'border-mint-300', bg: 'bg-mint-50/60' }
    : { icon: 'bg-peach-100 text-peach-500', border: 'border-peach-300', bg: 'bg-peach-50/60' };

  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-3.5 transition ${
        file ? `${accentClasses.border} ${accentClasses.bg}` : 'border-lilac-200 bg-lilac-50/40 hover:border-lilac-300'
      }`}
    >
      <div className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${file ? accentClasses.icon : 'bg-lilac-100 text-ink-soft'}`}>
        {file ? <CheckCircle2 size={18} /> : icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">{title} <span className="font-normal text-ink-soft/60">(opsional)</span></p>
        <p className="truncate text-xs text-ink-soft">{file ? file.name : hint}</p>
      </div>
      <span className="flex-none rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-bold text-ink-soft shadow-soft">
        {file ? 'Ganti' : 'Pilih'}
      </span>
      <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onChange(e.target.files?.[0] || null)} />
    </label>
  );
}

function ResultCard({ result }: { result: ImportResult }) {
  if (!result.ok) {
    return (
      <Card className="!border-rose-200 animate-pop-in">
        <div className="flex items-center gap-2 text-rose-500">
          <AlertTriangle size={18} />
          <p className="font-semibold">{result.error}</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="animate-pop-in space-y-3">
      {result.productsTotal ? (
        <Card className={result.productsAlreadyImported ? '!border-butter-300' : '!border-mint-200'}>
          {result.productsAlreadyImported ? (
            <div className="flex items-start gap-2 text-butter-500">
              <Info size={18} className="mt-0.5 flex-none" />
              <div>
                <p className="font-bold text-ink">Barang Masuk dilewati</p>
                <p className="mt-1 text-xs text-ink-soft">
                  Sistem mendeteksi data Barang Masuk SEBELUMNYA sudah pernah diimport, jadi file ini tidak diproses lagi (mencegah stok dobel).
                  Kalau memang perlu impor ulang dari nol, jalankan <code className="rounded bg-white/60 px-1">supabase/scripts/reset_data.sql</code> dulu.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2 text-mint-600">
                <CheckCircle2 size={18} />
                <p className="font-bold">{result.productsCreated} produk baru, {result.batchesCreated} riwayat restock dicatat (dari {result.productsTotal} baris)</p>
              </div>
              {!!result.productsSkipped?.length && (
                <SkippedList title={`Baris bermasalah (${result.productsSkipped.length}):`} items={result.productsSkipped} />
              )}
            </>
          )}
        </Card>
      ) : null}

      {result.salesTotal ? (
        <Card className={result.salesAlreadyImported ? '!border-butter-300' : '!border-mint-200'}>
          {result.salesAlreadyImported ? (
            <div className="flex items-start gap-2 text-butter-500">
              <Info size={18} className="mt-0.5 flex-none" />
              <div>
                <p className="font-bold text-ink">Riwayat penjualan dilewati</p>
                <p className="mt-1 text-xs text-ink-soft">
                  Sistem mendeteksi riwayat hasil import SEBELUMNYA sudah ada, jadi file ini tidak diproses lagi (mencegah data dobel).
                  Kalau memang perlu impor ulang dari nol, jalankan <code className="rounded bg-white/60 px-1">supabase/scripts/reset_data.sql</code> dulu.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2 text-mint-600">
                <CheckCircle2 size={18} />
                <p className="font-bold">Riwayat Penjualan: {result.salesCreated} dari {result.salesTotal} baris berhasil dicatat</p>
              </div>
              {!!result.salesSkipped?.length && (
                <SkippedList title={`Dilewati (${result.salesSkipped.length}):`} items={result.salesSkipped} />
              )}
            </>
          )}
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <a href="/produk" className="inline-flex items-center gap-1 text-xs font-bold text-peach-500 hover:underline">Lihat Daftar Barang <ArrowRight size={12} /></a>
        <span className="text-ink-soft/30">&middot;</span>
        <a href="/riwayat" className="inline-flex items-center gap-1 text-xs font-bold text-peach-500 hover:underline">Lihat Riwayat Penjualan <ArrowRight size={12} /></a>
      </div>
    </div>
  );
}

function SkippedList({ title, items }: { title: string; items: { name: string; reason: string }[] }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-ink-soft">
        <AlertTriangle size={13} className="text-butter-500" /> {title}
      </p>
      <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg bg-lilac-50 p-2.5">
        {items.map((s, i) => (
          <p key={i} className="text-[11px] text-ink-soft">
            <span className="font-semibold text-ink">{s.name}</span> — {s.reason}
          </p>
        ))}
      </div>
    </div>
  );
}
