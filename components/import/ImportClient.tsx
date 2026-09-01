'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, Info } from 'lucide-react';
import { Card, Button, Field } from '@/components/ui';
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

  async function handleImport() {
    if (!masukFile) { toast.error('Pilih dulu file Barang Masuk (.csv)'); return; }
    setLoading(true);
    setResult(null);
    try {
      const masukText = await readFileAsText(masukFile);
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
    <div className="animate-slide-up">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-extrabold text-ink">Import Data Lama</h1>
        <p className="text-sm text-ink-soft">Upload file CSV Barang Masuk &amp; Penjualan dari catatan lama kamu — langsung dari browser, tanpa perlu komputer/terminal.</p>
      </div>

      <Card className="mb-4">
        <FileField label="File Barang Masuk (.csv) — wajib" file={masukFile} onChange={setMasukFile} />
        <FileField label="File Penjualan (.csv) — opsional, akan tercatat sebagai riwayat transaksi" file={jualFile} onChange={setJualFile} />
        <Button full disabled={loading || !masukFile} onClick={handleImport}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
          {loading ? 'Memproses...' : 'Mulai Import'}
        </Button>
        <p className="mt-3 text-[11px] text-ink-soft">
          Semua produk hasil import dibuat sebagai satuan <b>pcs</b>. Produk timbangan (telur, kemiri, lada, dll) sebaiknya
          ditambahkan ulang manual lewat menu <b>Barang Masuk → Produk Baru</b> dengan satuan gram. Produk yang namanya sudah
          ada di sistem akan otomatis dilewati (tidak dibuat dobel) — aman kalau kamu tidak sengaja import file Barang Masuk 2 kali.
          Riwayat penjualan juga otomatis diproteksi dari dobel — kalau sebelumnya sudah pernah berhasil diimpor, percobaan
          berikutnya akan otomatis dilewati (lihat catatan di bawah kalau ini terjadi).
        </p>
      </Card>

      {result && (
        <div className="space-y-3">
          {!result.ok ? (
            <Card className="!border-rose-200">
              <div className="flex items-center gap-2 text-rose-500">
                <AlertTriangle size={18} />
                <p className="font-semibold">{result.error}</p>
              </div>
            </Card>
          ) : (
            <>
              {/* Hasil produk / barang masuk */}
              <Card className="!border-mint-200">
                <div className="mb-3 flex items-center gap-2 text-mint-600">
                  <CheckCircle2 size={18} />
                  <p className="font-bold">
                    Produk: {result.productsCreated} dari {result.productsTotal} berhasil dibuat baru
                  </p>
                </div>
                {!!result.productsSkipped?.length && (
                  <SkippedList title={`Dilewati (${result.productsSkipped.length}) — biasanya karena produk dengan nama ini sudah ada:`} items={result.productsSkipped} />
                )}
              </Card>

              {/* Hasil riwayat penjualan */}
              {result.salesTotal ? (
                <Card className={result.salesAlreadyImported ? '!border-butter-300' : '!border-mint-200'}>
                  {result.salesAlreadyImported ? (
                    <div className="flex items-start gap-2 text-butter-500">
                      <Info size={18} className="mt-0.5 flex-none" />
                      <div>
                        <p className="font-bold text-ink">Riwayat penjualan dilewati</p>
                        <p className="mt-1 text-xs text-ink-soft">
                          Sistem mendeteksi riwayat penjualan hasil import SEBELUMNYA sudah ada di database, jadi file ini
                          tidak diproses lagi (mencegah data dobel). Kalau memang belum pernah berhasil masuk sebelumnya dan
                          ini murni percobaan pertama, cek menu Riwayat → Penjualan dulu. Kalau memang perlu impor ulang dari
                          nol, hapus baris lama di Supabase (Table Editor → tabel <code className="rounded bg-white/60 px-1">sales</code>,
                          cari baris dengan trx_id berawalan <code className="rounded bg-white/60 px-1">LEGACY-IMPORT-</code>) baru coba lagi.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mb-3 flex items-center gap-2 text-mint-600">
                        <CheckCircle2 size={18} />
                        <p className="font-bold">
                          Riwayat Penjualan: {result.salesCreated} dari {result.salesTotal} baris berhasil dicatat
                        </p>
                      </div>
                      {!!result.salesSkipped?.length && (
                        <SkippedList title={`Dilewati (${result.salesSkipped.length}):`} items={result.salesSkipped} />
                      )}
                    </>
                  )}
                </Card>
              ) : (
                masukFile && !jualFile && (
                  <Card className="!border-lilac-200">
                    <div className="flex items-center gap-2 text-ink-soft">
                      <Info size={16} />
                      <p className="text-xs">Tidak ada file Penjualan yang diupload, jadi tidak ada riwayat transaksi yang dibuat — hanya data produk & stok.</p>
                    </div>
                  </Card>
                )
              )}

              <a href="/produk" className="inline-block text-xs font-bold text-peach-500 hover:underline">Lihat Daftar Barang →</a>
              {' '}
              <a href="/riwayat" className="inline-block text-xs font-bold text-peach-500 hover:underline">Lihat Riwayat Penjualan →</a>
            </>
          )}
        </div>
      )}
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

function FileField({ label, file, onChange }: { label: string; file: File | null; onChange: (f: File | null) => void }) {
  return (
    <Field label={label}>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-lilac-200 bg-lilac-50/50 px-4 py-3.5 transition hover:border-peach-300">
        <FileSpreadsheet size={20} className={file ? 'text-mint-500' : 'text-ink-soft'} />
        <span className="flex-1 truncate text-sm text-ink-soft">{file ? file.name : 'Ketuk untuk pilih file .csv'}</span>
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onChange(e.target.files?.[0] || null)} />
      </label>
    </Field>
  );
}
