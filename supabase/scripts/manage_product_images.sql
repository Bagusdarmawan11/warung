-- ============================================================================
-- WARUNG KASIR - Lihat & Hapus Semua Foto Produk (Storage)
-- ============================================================================
--
-- Jalankan bagian LIHAT dulu untuk cek apa saja yang ada. Bagian HAPUS
-- PERMANEN menghapus file aslinya dari Supabase Storage - tidak bisa
-- dibatalkan. Pastikan sudah backup pakai scripts/backup-product-images.mjs
-- dulu kalau masih perlu fotonya.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- LIHAT: daftar semua file foto produk yang ada (nama file, ukuran, kapan
-- diupload). Ini CUMA metadata (nama & info), bukan isi gambarnya - untuk
-- benar-benar mengunduh isi gambarnya, pakai script backup-product-images.mjs
-- (SQL Editor tidak bisa mengunduh file, cuma database biasa).
-- ----------------------------------------------------------------------------
select
  name as path,
  (metadata->>'size')::bigint as ukuran_bytes,
  created_at
from storage.objects
where bucket_id = 'product-images'
order by created_at desc;

-- ----------------------------------------------------------------------------
-- HAPUS: hapus SEMUA file di bucket "product-images". Uncomment (hapus tanda
-- "--" di depan baris di bawah) baru jalankan kalau sudah yakin & sudah backup.
-- ----------------------------------------------------------------------------
-- delete from storage.objects where bucket_id = 'product-images';
