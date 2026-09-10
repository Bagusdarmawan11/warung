set request.jwt.claim.role = 'authenticated';
set request.jwt.claim.sub = 'b6e7f2b0-0000-4000-8000-000000000004';
set role authenticated;
begin;

select bulk_import_products('[{"name":"Teh Botol","qty":20,"buy_price":3000,"sell_price":4000,"received_at":"2026-07-01"}]'::jsonb);
select bulk_import_sales_history('[{"product_name":"Teh Botol","qty":3,"unit_price":4000,"unit_cost":3000,"buyer_name":"Bu Ani","sold_at":"2026-07-10"}]'::jsonb) as hasil;

select '--- Cek sales.batch_id terisi (bukan NULL) & bisa dihitung durasinya ---' as info;
select s.qty, s.sold_at::date, pb.received_at, (s.sold_at::date - pb.received_at) as durasi_hari
from sales s join product_batches pb on pb.id = s.batch_id
where s.trx_id like 'LEGACY-IMPORT-%';

rollback;
reset role;
