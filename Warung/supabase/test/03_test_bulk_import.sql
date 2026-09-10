set request.jwt.claim.role = 'authenticated';
set request.jwt.claim.sub = 'b6e7f2b0-0000-4000-8000-000000000002';
set role authenticated;

begin;

select '=== TEST 1: bulk import 3 produk normal ===' as info;
select bulk_import_products('[
  {"name":"Minyak Goreng 1L","qty":10,"buy_price":14000,"sell_price":16000,"unit_type":"pcs"},
  {"name":"Telur Ayam","qty":2000,"buy_price":25,"sell_price":30,"unit_type":"gram"},
  {"name":"Gula Pasir","qty":15,"buy_price":13000,"sell_price":15000,"unit_type":"pcs"}
]'::jsonb) as hasil;

select '--- Cek jumlah produk aktif (harus 3) ---' as info;
select count(*) from products where is_active = true;

select '--- Cek produk gram (Telur Ayam) stoknya 2000 & unit_type gram ---' as info;
select name, unit_type, stok from product_stock_summary where name = 'Telur Ayam';

select '=== TEST 2: import lagi dgn 1 nama SAMA (Gula Pasir) + 1 nama baru -> Gula Pasir harus DILEWATI, bukan dobel ===' as info;
select bulk_import_products('[
  {"name":"Gula Pasir","qty":99,"buy_price":1,"sell_price":1},
  {"name":"Kopi Sachet","qty":20,"buy_price":1000,"sell_price":1500}
]'::jsonb) as hasil;

select '--- Total produk sekarang (harus 4, BUKAN 5 - Gula Pasir tidak dobel) ---' as info;
select count(*) from products where is_active = true;
select '--- Stok Gula Pasir (harus TETAP 15, bukan 99 dari percobaan dobel) ---' as info;
select stok from product_stock_summary where name = 'Gula Pasir';

select '=== TEST 3: baris dengan nama kosong harus dilewati tanpa bikin fungsi gagal ===' as info;
select bulk_import_products('[{"name":"  ","qty":5},{"name":"Sabun Cuci","qty":3,"buy_price":2000,"sell_price":2500}]'::jsonb) as hasil;
select count(*) from products where is_active = true;

rollback;
reset role;

select '=== TEST 4 (role anon, DI LUAR transaksi authenticated di atas): panggil bulk_import_products harus GAGAL permission denied ===' as info;
set request.jwt.claim.role = 'anon';
set role anon;
select bulk_import_products('[{"name":"Hack","qty":1}]'::jsonb);
reset role;
