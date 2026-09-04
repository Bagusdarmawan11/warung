set request.jwt.claim.role = 'authenticated';
set request.jwt.claim.sub = 'b6e7f2b0-0000-4000-8000-000000000006';
set role authenticated;

begin;

select '=== SETUP: 3 varian telur terpisah (simulasi masalah nyata) ===' as info;
select id as p1_id from create_product_with_batch('Telur Ayam 1 Kg', null, 'pcs', 3, 10, 1000, 1500, null, null) \gset
select id as p2_id from create_product_with_batch('Telur Ayam 2 KG', null, 'pcs', 3, 20, 1000, 1500, null, null) \gset
select id as p3_id from create_product_with_batch('Telur Ayam 500 gram', null, 'pcs', 3, 5, 1000, 1500, null, null) \gset

select '--- Sebelum merge: 3 produk aktif ---' as info;
select count(*) from products where is_active = true;

select '=== MERGE jadi 1 produk gram baru ===' as info;
select code, name, unit_type from merge_products_into_new(
  'Telur Ayam', null, 'gram', 100, 2500, 25, 30, null,
  array[:'p1_id'::uuid, :'p2_id'::uuid, :'p3_id'::uuid]
);

select '--- Setelah merge: harus cuma 1 produk AKTIF (yang baru) ---' as info;
select code, name, unit_type, stok from product_stock_summary where is_active = true and name ilike '%telur%';

select '--- 3 produk lama HARUS masih ADA di database tapi is_active=false (bukan dihapus) ---' as info;
select code, name, is_active from products where id in (:'p1_id'::uuid, :'p2_id'::uuid, :'p3_id'::uuid);

select '--- Total baris di tabel products (harus 4: 3 lama diarsipkan + 1 baru) ---' as info;
select count(*) from products;

select '=== TEST: merge dengan kurang dari 2 sumber harus GAGAL ===' as info;
select merge_products_into_new('Gagal', null, 'gram', 3, 100, 10, 20, null, array[:'p1_id'::uuid]);

rollback;
reset role;
