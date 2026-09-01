set request.jwt.claim.role = 'authenticated';
set request.jwt.claim.sub = 'b6e7f2b0-0000-4000-8000-000000000003';
set role authenticated;

begin;

select '=== SETUP: buat 2 produk dulu ===' as info;
select bulk_import_products('[
  {"name":"Indomie Goreng","qty":50,"buy_price":3000,"sell_price":3500},
  {"name":"Aqua 600ml","qty":30,"buy_price":2500,"sell_price":3000}
]'::jsonb);

select '=== TEST 1: import 3 baris riwayat penjualan (1 produk tidak dikenal) ===' as info;
select bulk_import_sales_history('[
  {"product_name":"Indomie Goreng","qty":5,"unit_price":3500,"unit_cost":3000,"buyer_name":"Bu Warsih","sold_at":"2026-08-01"},
  {"product_name":"Aqua 600ml","qty":2,"unit_price":3000,"unit_cost":2500,"buyer_name":"Pak Budi","sold_at":"2026-08-02"},
  {"product_name":"Produk Tidak Ada","qty":1,"unit_price":1000,"unit_cost":800,"sold_at":"2026-08-02"}
]'::jsonb) as hasil;

select '--- Cek jumlah baris sales tercatat (harus 2, yang 1 tidak dikenal dilewati) ---' as info;
select count(*) from sales where trx_id like 'LEGACY-IMPORT-%';

select '--- Cek detail riwayat Indomie (harus qty 5, harga 3500, modal 3000, tanggal 1 Agu) ---' as info;
select product_name_snapshot, qty, unit_price, unit_cost, total, buyer_name, sold_at::date from sales where product_name_snapshot = 'Indomie Goreng' and trx_id like 'LEGACY-IMPORT-%';

select '=== TEST 2: coba import LAGI (harus DITOLAK karena sudah pernah ada riwayat LEGACY-IMPORT) ===' as info;
select bulk_import_sales_history('[
  {"product_name":"Indomie Goreng","qty":999,"unit_price":1,"unit_cost":1,"sold_at":"2026-08-01"}
]'::jsonb) as hasil_percobaan_kedua;

select '--- Cek jumlah baris sales TIDAK bertambah (harus tetap 2, bukan 3) ---' as info;
select count(*) from sales where trx_id like 'LEGACY-IMPORT-%';

rollback;
reset role;
