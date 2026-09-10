-- ============================================================================
-- WARUNG KASIR - Lihat Daftar Foto Produk (Storage)
-- ============================================================================
--
-- Query ini CUMA untuk MELIHAT daftar file (nama, ukuran, kapan diupload) -
-- bukan untuk mengunduh isi gambarnya (SQL Editor tidak bisa mengunduh file).
--
-- CATATAN: Supabase sengaja MEMBLOKIR perintah `delete from storage.objects`
-- langsung lewat SQL Editor (akan muncul error "Direct deletion from storage
-- tables is not allowed"), supaya file tidak sengaja terhapus dari luar jalur
-- resminya. Untuk BACKUP dan HAPUS foto produk, pakai tombol yang sudah
-- disediakan di halaman /import aplikasi ini ("Backup Semua Foto Produk" dan
-- "Hapus Semua Foto dari Storage") - keduanya lewat Storage API yang benar.
-- ============================================================================

select
  name as path,
  (metadata->>'size')::bigint as ukuran_bytes,
  created_at
from storage.objects
where bucket_id = 'product-images'
order by created_at desc;
