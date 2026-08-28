-- ============================================================================
-- WARUNG KASIR - Perbaikan Keamanan (WAJIB dijalankan)
-- Jalankan SETELAH 0003_checkout.sql
--
-- KENAPA INI PENTING:
-- Fungsi-fungsi di 0002 & 0003 dibuat dengan `security definer`, supaya bisa
-- mengunci baris (FOR UPDATE) dan menulis ke beberapa tabel sekaligus dalam
-- satu transaksi atomik. Konsekuensinya, fungsi SECURITY DEFINER berjalan
-- dengan hak akses PEMILIK fungsi dan MELEWATI Row Level Security tabel biasa.
--
-- Postgres secara default mengizinkan SEMUA role (termasuk "anon" — role
-- yang dipakai anon/public key yang nempel di browser) untuk menjalankan
-- fungsi yang baru dibuat. Tanpa migration ini, siapa pun yang tahu URL
-- Supabase project ini (yang memang publik) bisa memanggil fungsi seperti
-- checkout_cart / create_product_with_batch TANPA LOGIN sama sekali, dan
-- keluar-masuk stok warung dari luar. Migration ini menutup celah tsb.
-- ============================================================================

revoke execute on function next_product_code() from public;
revoke execute on function create_product_with_batch(text, text, text, numeric, numeric, numeric, numeric, date, date) from public;
revoke execute on function add_batch(uuid, numeric, numeric, numeric, date, date) from public;
revoke execute on function sell_product(uuid, numeric, text, text, numeric, boolean) from public;
revoke execute on function checkout_cart(jsonb, text, boolean) from public;

grant execute on function next_product_code() to authenticated;
grant execute on function create_product_with_batch(text, text, text, numeric, numeric, numeric, numeric, date, date) to authenticated;
grant execute on function add_batch(uuid, numeric, numeric, numeric, date, date) to authenticated;
grant execute on function sell_product(uuid, numeric, text, text, numeric, boolean) to authenticated;
grant execute on function checkout_cart(jsonb, text, boolean) to authenticated;

-- View juga perlu dipaksa memakai hak akses PEMANGGIL query (bukan pemilik
-- view) supaya RLS tabel di baliknya tetap berlaku untuk siapa pun yang
-- membaca view ini. Butuh Postgres 15+ (dipakai Supabase saat ini).
alter view product_stock_summary set (security_invoker = true);
