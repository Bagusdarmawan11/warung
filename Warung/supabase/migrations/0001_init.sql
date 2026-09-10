-- ============================================================================
-- WARUNG KASIR - Skema Database Awal
-- Jalankan file ini di Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- PRODUCTS: data induk produk. Barcode/kode ("code") bersifat TETAP per produk
-- dan tidak berubah walau di-restock berkali-kali (tidak perlu cetak stiker baru
-- setiap restock). Stok & harga per kedatangan barang disimpan di product_batches.
-- ----------------------------------------------------------------------------
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,                 -- kode/barcode tetap, misal "BR0001"
  name text not null,
  category text,
  unit_type text not null default 'pcs' check (unit_type in ('pcs', 'gram')),
  -- 'pcs'  = dijual satuan/bungkus/pack (qty bulat)
  -- 'gram' = dijual timbangan, qty dalam gram (boleh desimal), contoh: telur, kemiri, lada
  low_stock_threshold numeric not null default 3,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_products_name on products using gin (to_tsvector('simple', name));
create index if not exists idx_products_code on products (code);

-- ----------------------------------------------------------------------------
-- PRODUCT_BATCHES: satu baris = satu "kedatangan barang" (lot). Setiap kali
-- barang masuk / restock, dibuat batch baru dengan qty & harga sendiri.
-- Penjualan mengurangi qty_remaining dari batch TERLAMA yang masih > 0 (FIFO),
-- sehingga tidak akan pernah salah mengurangi batch yang sudah habis.
-- ----------------------------------------------------------------------------
create table if not exists product_batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  qty_initial numeric not null check (qty_initial >= 0),
  qty_remaining numeric not null check (qty_remaining >= 0),
  buy_price numeric not null default 0,   -- harga modal per unit (per pcs ATAU per gram)
  sell_price numeric not null default 0,  -- harga jual per unit (per pcs ATAU per gram)
  expiry_date date,
  received_at date not null default current_date,
  status text not null default 'active' check (status in ('active', 'depleted')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_batches_fifo on product_batches (product_id, status, received_at, created_at);

-- ----------------------------------------------------------------------------
-- STOCK_IN_HISTORY: riwayat barang masuk (audit log, satu baris per batch dibuat)
-- ----------------------------------------------------------------------------
create table if not exists stock_in_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  batch_id uuid references product_batches(id) on delete set null,
  product_name_snapshot text not null,
  qty numeric not null,
  buy_price numeric,
  sell_price numeric,
  received_at date not null default current_date,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- SALES: riwayat penjualan. Satu transaksi kasir bisa berisi beberapa baris
-- (trx_id sama). batch_id mencatat batch mana persisnya yang dikurangi supaya
-- tidak ambigu dan bisa diaudit / dihitung untung per batch.
-- ----------------------------------------------------------------------------
create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  trx_id text not null,
  product_id uuid not null references products(id),
  batch_id uuid references product_batches(id) on delete set null,
  product_name_snapshot text not null,
  qty numeric not null,            -- jumlah pcs ATAU gram terjual
  unit_price numeric not null,     -- harga jual per unit yang dipakai saat itu
  unit_cost numeric not null default 0, -- harga modal per unit dari batch asal (untuk hitung untung)
  total numeric not null,
  buyer_name text,
  sold_at timestamptz not null default now()
);

create index if not exists idx_sales_sold_at on sales (sold_at desc);
create index if not exists idx_sales_trx on sales (trx_id);

-- ----------------------------------------------------------------------------
-- Trigger: auto-update updated_at pada products
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_products_updated_at on products;
create trigger trg_products_updated_at
  before update on products
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Semua tabel HANYA bisa diakses oleh pengguna yang sudah login (authenticated)
-- lewat Supabase Auth. Kunci "anon" publik tidak bisa membaca/menulis apa pun.
-- Ini penting: anon key selalu ikut ter-bundle ke browser, jadi tanpa RLS ini
-- siapa pun yang membuka DevTools bisa membaca/menghapus seluruh data warung.
-- ----------------------------------------------------------------------------
alter table products enable row level security;
alter table product_batches enable row level security;
alter table stock_in_history enable row level security;
alter table sales enable row level security;

drop policy if exists "authenticated full access" on products;
create policy "authenticated full access" on products
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on product_batches;
create policy "authenticated full access" on product_batches
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on stock_in_history;
create policy "authenticated full access" on stock_in_history
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on sales;
create policy "authenticated full access" on sales
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- View bantu: ringkasan stok per produk (jumlah semua batch aktif)
-- ----------------------------------------------------------------------------
create or replace view product_stock_summary as
select
  p.id as product_id,
  p.code,
  p.name,
  p.category,
  p.unit_type,
  p.low_stock_threshold,
  p.is_active,
  coalesce(sum(b.qty_remaining) filter (where b.status = 'active'), 0) as stok,
  (
    select b2.sell_price from product_batches b2
    where b2.product_id = p.id and b2.qty_remaining > 0
    order by b2.received_at asc, b2.created_at asc
    limit 1
  ) as harga_jual_aktif,
  (
    select b2.buy_price from product_batches b2
    where b2.product_id = p.id and b2.qty_remaining > 0
    order by b2.received_at asc, b2.created_at asc
    limit 1
  ) as harga_modal_aktif,
  (
    select min(b3.expiry_date) from product_batches b3
    where b3.product_id = p.id and b3.qty_remaining > 0 and b3.expiry_date is not null
  ) as kadaluwarsa_terdekat
from products p
left join product_batches b on b.product_id = p.id
group by p.id;
