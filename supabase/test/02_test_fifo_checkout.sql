set request.jwt.claim.role = 'authenticated';
set request.jwt.claim.sub = 'b6e7f2b0-0000-4000-8000-000000000001';
set role authenticated;

begin;

select '=== TEST 1: buat produk baru + batch pertama ===' as info;
select code, name, id from create_product_with_batch(
  'Indomie Goreng Test', 'Mie Instan', 'pcs', 3, 2, 3000, 3500, null, '2026-01-01'
) \gset p1_
select :'p1_code' as kode_produk, :'p1_id' as product_id;

select '=== TEST 2: restock (batch kedua, harga beda) ===' as info;
select id as batch2_id from add_batch(:'p1_id'::uuid, 5, 3200, 3800, null, '2026-02-01') \gset b2_
select :'b2_batch2_id' as batch2_id;

select '=== Cek stok gabungan lewat view (harus 7 = 2+5) ===' as info;
select stok, harga_jual_aktif, harga_modal_aktif from product_stock_summary where product_id = :'p1_id'::uuid;

select '=== TEST 3: jual 4 pcs -> harus ambil 2 dari batch lama (habis) + 2 dari batch baru (FIFO) ===' as info;
select * from sell_product(:'p1_id'::uuid, 4, 'TX_TEST_1', 'Bu Warsih', null, false);

select '--- Cek batch lama HARUS depleted & sisa 0 ---' as info;
select status, qty_remaining from product_batches where product_id = :'p1_id'::uuid order by received_at asc limit 1;

select '--- Cek batch baru HARUS masih active & sisa 3 (5-2) ---' as info;
select status, qty_remaining from product_batches where product_id = :'p1_id'::uuid order by received_at desc limit 1;

select '--- Cek 2 baris sales tercatat dgn harga BERBEDA sesuai batch asalnya (3500 lalu 3800) ---' as info;
select qty, unit_price, unit_cost, total from sales where trx_id = 'TX_TEST_1' order by unit_price asc;

select '=== TEST 4: stok sisa sekarang harus 3 ===' as info;
select stok from product_stock_summary where product_id = :'p1_id'::uuid;

select '=== TEST 5: coba jual 100 (lebih dari stok 3) TANPA allow_oversell -> HARUS GAGAL, stok TIDAK berubah ===' as info;
savepoint before_fail;
select * from sell_product(:'p1_id'::uuid, 100, 'TX_TEST_FAIL', null, null, false);
rollback to savepoint before_fail;
select '--- Stok setelah percobaan gagal (harus TETAP 3, tidak ada perubahan) ---' as info;
select stok from product_stock_summary where product_id = :'p1_id'::uuid;

select '=== TEST 6: checkout_cart ATOMIK - 2 produk, produk ke-2 stoknya kurang -> SEMUA harus rollback ===' as info;
select code, id from create_product_with_batch('Gula Pasir Test', null, 'pcs', 3, 1, 12000, 14000, null, null) \gset p2_
select :'p2_code', :'p2_id';

savepoint before_checkout_fail;
select checkout_cart(
  jsonb_build_array(
    jsonb_build_object('product_id', :'p1_id', 'qty', 1),
    jsonb_build_object('product_id', :'p2_id', 'qty', 999)
  ),
  'Pembeli Uji',
  false
);
rollback to savepoint before_checkout_fail;

select '--- Stok produk 1 setelah checkout GAGAL (harus TETAP 3, TIDAK ikut kepotong walau item pertama valid) ---' as info;
select stok from product_stock_summary where product_id = :'p1_id'::uuid;
select '--- Stok produk 2 setelah checkout GAGAL (harus TETAP 1) ---' as info;
select stok from product_stock_summary where product_id = :'p2_id'::uuid;

select '=== TEST 7: checkout_cart SUKSES (stok cukup semua) -> harus benar2 terpotong & 1 trx_id sama utk 2 produk ===' as info;
select checkout_cart(
  jsonb_build_array(
    jsonb_build_object('product_id', :'p1_id', 'qty', 1),
    jsonb_build_object('product_id', :'p2_id', 'qty', 1)
  ),
  'Pembeli Sukses',
  false
) as hasil_checkout;

select stok from product_stock_summary where product_id = :'p1_id'::uuid;
select stok from product_stock_summary where product_id = :'p2_id'::uuid;

select '=== TEST 8: allow_oversell=true -> harus tetap tercatat walau lebih dari stok ===' as info;
select * from sell_product(:'p2_id'::uuid, 999, 'TX_OVERSELL', 'Uji Oversell', null, true);
select stok from product_stock_summary where product_id = :'p2_id'::uuid;

rollback;
reset role;
