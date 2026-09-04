set request.jwt.claim.role = 'authenticated';
set request.jwt.claim.sub = 'b6e7f2b0-0000-4000-8000-000000000007';
set role authenticated;

begin;

select '=== TEST 1: import 3 baris restock utk PRODUK SAMA (beda tanggal) -> harus jadi 1 produk, 3 batch ===' as info;
select bulk_import_products('[
  {"name":"Indomie Goreng","qty":10,"buy_price":2800,"sell_price":3500,"received_at":"2026-08-01T07:00:00"},
  {"name":"Indomie Goreng","qty":15,"buy_price":2900,"sell_price":3500,"received_at":"2026-08-10T07:01:00"},
  {"name":"indomie goreng","qty":20,"buy_price":3000,"sell_price":3600,"received_at":"2026-08-20T07:00:00"}
]'::jsonb) as hasil_produk;

select '--- Harus 1 produk aktif ---' as info;
select count(*) from products where is_active = true;
select '--- Harus 3 batch terpisah untuk produk itu (BUKAN 1 gabungan) ---' as info;
select count(*) from product_batches;
select '--- Harus 3 baris stock_in_history juga (riwayat restock lengkap) ---' as info;
select count(*) from stock_in_history;
select '--- Total stok gabungan harus 45 (10+15+20) ---' as info;
select stok from product_stock_summary where name = 'Indomie Goreng';

select '=== TEST 2: import LAGI (harus DITOLAK karena guard sudah aktif) ===' as info;
select bulk_import_products('[{"name":"Produk Baru Harusnya Ditolak","qty":99,"buy_price":1,"sell_price":1}]'::jsonb) as hasil_kedua;
select '--- Total batch TIDAK bertambah (harus tetap 3) ---' as info;
select count(*) from product_batches;

select '=== TEST 3+4: jual 12 pcs (FIFO motong batch tertua) DAN 50 pcs sekaligus (oversell) dalam 1 panggilan (sesuai pemakaian nyata) ===' as info;
select id as prod_id from products where name = 'Indomie Goreng' \gset
select bulk_import_sales_history(
  ('[' ||
   '{"product_name":"Indomie Goreng","qty":12,"unit_price":3500,"unit_cost":2800,"buyer_name":"Bu Rini","sold_at":"2026-08-05T09:00:00"},' ||
   '{"product_name":"Indomie Goreng","qty":50,"unit_price":3600,"unit_cost":3000,"buyer_name":"Pak Budi","sold_at":"2026-08-25T09:00:00"}' ||
   ']')::jsonb
) as hasil_jual;

select '--- Batch TERTUA (qty awal 10) harus HABIS (depleted) ---' as info;
select received_at::date, status, qty_remaining from product_batches where product_id = :'prod_id'::uuid order by received_at asc;

select '--- Sisa stok sekarang harus 0 (45 - 12 - 33 tersisa dari batch, lalu 50 diminta tapi cuma 33 ada -> habis, TIDAK minus) ---' as info;
select stok from product_stock_summary where product_id = :'prod_id'::uuid;

select '--- Baris sales Bu Rini (qty 12, HARGA ASLI CSV 3500/2800) ---' as info;
select qty, unit_price, unit_cost, batch_id is not null as ada_batch from sales where buyer_name = 'Bu Rini' order by qty desc;

select '--- Baris sales Pak Budi: total qty harus TETAP 50 walau batch cuma cukup sebagian (kekurangan tercatat batch_id NULL) ---' as info;
select sum(qty) as total_qty_pak_budi, count(*) as jumlah_baris from sales where buyer_name = 'Pak Budi';
select qty, batch_id is not null as ada_batch from sales where buyer_name = 'Pak Budi' order by qty desc;

rollback;
reset role;
