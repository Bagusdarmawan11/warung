set request.jwt.claim.role = 'authenticated';
set request.jwt.claim.sub = 'b6e7f2b0-0000-4000-8000-000000000009';
set role authenticated;

begin;

select '=== SETUP: produk stok 100, jual 50 ===' as info;
select id as prod_id from create_product_with_batch('Gula Merah', null, 'pcs', 3, 100, 8000, 10000, null, null) \gset
select checkout_cart(
  jsonb_build_array(jsonb_build_object('product_id', :'prod_id', 'qty', 50)),
  'Bu Nina', false, null
) as hasil_awal;

select id as sale_id from sales where buyer_name = 'Bu Nina' \gset
select '--- DEBUG: cek batch_id tersimpan di sale ---' as info;
select batch_id from sales where id = :'sale_id'::uuid;
select '--- DEBUG: cek qty_remaining batch sebelum edit ---' as info;
select id, qty_initial, qty_remaining, status from product_batches where product_id = :'prod_id'::uuid;

select '--- Stok setelah jual 50 (harus 50) ---' as info;
select stok from product_stock_summary where product_id = :'prod_id'::uuid;

select '=== TEST 1: EDIT qty jadi 5 (salah ketik, aslinya 50 -> 5). Stok harus KEMBALI ke 95 ===' as info;
select update_sale_transaction(:'sale_id'::uuid, 5, 10000, 'Bu Nina', now()) as hasil_edit1;
select '--- DEBUG: qty_remaining batch SETELAH edit (harus 95) ---' as info;
select id, qty_initial, qty_remaining, status from product_batches where product_id = :'prod_id'::uuid;
select '--- Stok sekarang (harus 100-5=95) ---' as info;
select stok from product_stock_summary where product_id = :'prod_id'::uuid;
select qty, total from sales where id = :'sale_id'::uuid;

select '=== TEST 2: EDIT qty jadi 20 (naik dari 5 ke 20, stok harus BERKURANG 15 lagi jadi 80) ===' as info;
select update_sale_transaction(:'sale_id'::uuid, 20, 10000, 'Bu Nina', now()) as hasil_edit2;
select '--- Stok sekarang (harus 100-20=80) ---' as info;
select stok from product_stock_summary where product_id = :'prod_id'::uuid;

select '=== TEST 3: EDIT harga jual, tanggal, dan nama pembeli (qty tetap) ===' as info;
select update_sale_transaction(:'sale_id'::uuid, 20, 12000, 'Pak Anton', '2026-08-15T10:00:00'::timestamptz) as hasil_edit3;
select buyer_name, unit_price, total, sold_at from sales where id = :'sale_id'::uuid;
select '--- Stok TIDAK berubah (masih 80, karena qty tidak berubah di edit ini) ---' as info;
select stok from product_stock_summary where product_id = :'prod_id'::uuid;

select '=== TEST 4: coba qty 0 harus GAGAL (validasi) ===' as info;
select update_sale_transaction(:'sale_id'::uuid, 0, 12000, 'Pak Anton', now());

rollback;
reset role;
