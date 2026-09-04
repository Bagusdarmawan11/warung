// scripts/backup-product-images.mjs
//
// Mengunduh SEMUA foto produk dari Supabase Storage (bucket "product-images")
// ke folder lokal, sebagai backup SEBELUM menjalankan reset_data.sql.
//
// Cara pakai (dari folder project, di komputer kamu):
//   node --env-file=.env.local scripts/backup-product-images.mjs
//
// Butuh SUPABASE_SERVICE_ROLE_KEY di .env.local (sama seperti script import).
// Hasil unduhan akan tersimpan di folder "backup-foto-produk/" di dalam
// folder project ini, dengan nama file memuat nama produknya supaya gampang
// dikenali (bukan cuma kode acak).

import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'product-images';
const OUT_DIR = 'backup-foto-produk';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib ada di .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9\-_ ]/gi, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'produk';
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  console.log('Mengambil daftar produk (untuk nama file yang gampang dibaca)...');
  const { data: products, error: prodErr } = await supabase.from('products').select('id, name, code');
  if (prodErr) { console.error('Gagal ambil daftar produk:', prodErr.message); process.exit(1); }
  const productMap = new Map((products || []).map((p) => [p.id, p]));
  console.log(`  ${products?.length || 0} produk ditemukan di database.`);

  console.log('\nMengambil daftar folder (per produk) di bucket "product-images"...');
  const { data: folders, error: listErr } = await supabase.storage.from(BUCKET).list('', { limit: 5000 });
  if (listErr) { console.error('Gagal membuka bucket:', listErr.message); process.exit(1); }

  const productFolders = folders || [];
  console.log(`  ${productFolders.length} folder ditemukan.\n`);

  let totalFiles = 0;
  let totalDownloaded = 0;
  let totalFailed = 0;

  for (const folder of productFolders) {
    const productId = folder.name;
    const { data: files, error: fileListErr } = await supabase.storage.from(BUCKET).list(productId, { limit: 100 });
    if (fileListErr || !files || !files.length) continue;

    const product = productMap.get(productId);
    const label = product ? `${sanitizeFilename(product.name)}_${product.code}` : `produk-tidak-dikenal_${productId.slice(0, 8)}`;

    for (const file of files) {
      totalFiles++;
      const path = `${productId}/${file.name}`;
      const { data: blob, error: downloadErr } = await supabase.storage.from(BUCKET).download(path);
      if (downloadErr || !blob) {
        console.error(`  GAGAL unduh: ${path} (${downloadErr?.message || 'tidak diketahui'})`);
        totalFailed++;
        continue;
      }
      const buffer = Buffer.from(await blob.arrayBuffer());
      const finalName = `${label}__${file.name}`;
      writeFileSync(join(OUT_DIR, finalName), buffer);
      totalDownloaded++;
      console.log(`  OK: ${finalName}`);
    }
  }

  console.log(`\nSelesai. ${totalDownloaded} dari ${totalFiles} foto berhasil diunduh ke folder "${OUT_DIR}/".`);
  if (totalFailed) console.log(`${totalFailed} foto gagal diunduh (lihat log di atas).`);
  if (totalFiles === 0) console.log('Tidak ada foto ditemukan di bucket ini (mungkin belum pernah upload foto produk).');
}

main().catch((e) => { console.error(e); process.exit(1); });
