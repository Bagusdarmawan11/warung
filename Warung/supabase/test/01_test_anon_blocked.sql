\set ON_ERROR_STOP off
set request.jwt.claim.role = 'anon';
set role anon;

select '--- TEST: anon SELECT products (harus 0 baris, bukan error) ---' as info;
select count(*) as jumlah_terlihat_anon from products;

select '--- TEST: anon INSERT langsung ke products (harus GAGAL / 0 baris karena RLS) ---' as info;
insert into products (code, name, unit_type) values ('HACK01', 'Produk Ilegal', 'pcs');
select count(*) as jumlah_setelah_insert from products where code = 'HACK01';

select '--- TEST: anon panggil RPC create_product_with_batch (HARUS permission denied) ---' as info;
select create_product_with_batch('Produk Anon', null, 'pcs', 3, 10, 100, 200, null, null);

select '--- TEST: anon panggil RPC checkout_cart (HARUS permission denied) ---' as info;
select checkout_cart('[]'::jsonb, 'Test', false);

reset role;
