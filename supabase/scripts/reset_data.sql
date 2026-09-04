-- ============================================================================
-- WARUNG KASIR - Reset / Bersihkan Semua Data
-- ============================================================================
--
-- ⚠️  PERINGATAN: Script ini MENGHAPUS PERMANEN semua data produk, stok,
--     riwayat barang masuk, dan riwayat penjualan — termasuk yang kamu
--     tambahkan manual lewat aplikasi (bukan cuma hasil import CSV).
--     Data yang TIDAK ikut terhapus: akun login kamu (Supabase Auth) dan
--     foto produk yang sudah terlanjur ter-upload ke Storage (lihat catatan
--     di paling bawah file ini kalau mau bersihkan itu juga).
--
--     Jalankan ini HANYA kalau kamu memang mau mulai dari nol lagi, misalnya
--     setelah memperbarui logika import dan mau re-import ulang 2 file CSV
--     kamu supaya nama pembeli & urutan waktunya ikut ter-perbaiki.
--
-- Cara pakai: Supabase Dashboard → SQL Editor → New query → paste semua
-- isi file ini → Run. Butuh migration sampai 0010 sudah dijalankan.
-- ============================================================================

truncate table sales, stock_in_history, product_batches, products
  restart identity cascade;

-- Kosongkan juga penanda "sudah pernah import" (tabel ini baru ada mulai
-- migration 0010) supaya Barang Masuk & Penjualan bisa diimport ulang.
truncate table import_flags;

-- Reset penomoran kode produk supaya mulai lagi dari BR0001 (bukan
-- lanjut dari nomor terakhir sebelum di-reset).
alter sequence product_code_seq restart with 1;

-- Reset penanda "riwayat penjualan sudah pernah diimpor" (sudah otomatis
-- ikut kosong karena tabel sales ikut di-truncate di atas, baris ini cuma
-- verifikasi/dokumentasi saja, tidak perlu dijalankan terpisah):
-- select exists(select 1 from sales where trx_id like 'LEGACY-IMPORT-%'); -- harus FALSE setelah reset

-- ============================================================================
-- OPSIONAL: Bersihkan juga foto produk yang sudah ter-upload
-- ============================================================================
-- Kalau kamu juga mau menghapus semua foto produk yang sempat ter-upload
-- (supaya storage tidak menumpuk file yatim/tidak terpakai), jalankan baris
-- di bawah ini SETELAH truncate di atas. Ini menghapus SEMUA isi bucket
-- "product-images", jadi hanya jalankan kalau memang yakin.
--
-- delete from storage.objects where bucket_id = 'product-images';
