set request.jwt.claim.role = 'authenticated';
set request.jwt.claim.sub = 'b6e7f2b0-0000-4000-8000-000000000008';
set role authenticated;

begin;

select '=== SETUP: buat produk, restock dgn tanggal kustom kemarin ===' as info;
select id as prod_id from create_product_with_batch('Roti Tawar', null, 'pcs', 3, 10, 5000, 7000, null, '2026-09-01T08:00:00') \gset

select '--- Cek tanggal_masuk_terakhir di view (harus 2026-09-01) ---' as info;
select tanggal_masuk_terakhir from product_stock_summary where product_id = :'prod_id'::uuid;

select '=== TEST: checkout dengan tanggal transaksi KUSTOM (2026-09-02, bukan hari ini) ===' as info;
select checkout_cart(
  jsonb_build_array(jsonb_build_object('product_id', :'prod_id', 'qty', 2)),
  'Bu Yuni',
  false,
  '2026-09-02T14:30:00'::timestamptz
) as hasil;

select '--- Cek sold_at tercatat PERSIS sesuai tanggal kustom (bukan waktu sekarang) ---' as info;
select sold_at from sales where buyer_name = 'Bu Yuni';

select '=== TEST: checkout TANPA tanggal kustom (harus pakai now()) ===' as info;
select checkout_cart(
  jsonb_build_array(jsonb_build_object('product_id', :'prod_id', 'qty', 1)),
  'Pak Joko',
  false,
  null
) as hasil2;
select (sold_at > now() - interval '1 minute') as tercatat_sekarang from sales where buyer_name = 'Pak Joko';

select '--- Stok akhir harus 10-2-1=7 (FIFO tetap benar walau tanggal beda-beda) ---' as info;
select stok from product_stock_summary where product_id = :'prod_id'::uuid;

rollback;
reset role;
