-- ============================================================================
-- WARUNG KASIR - Multi-User Role & Produk Mengendap
-- Jalankan SETELAH 0013_product_barcodes.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabel roles user - satu entri per user yang terdaftar
--    Role: 'owner' | 'admin' | 'kasir'
--    Kalau user tidak ada di tabel ini, dianggap belum dapat akses (blocked)
-- ----------------------------------------------------------------------------
create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  role text not null check (role in ('owner', 'admin', 'kasir')),
  display_name text,
  created_at timestamptz not null default now()
);

alter table user_roles enable row level security;

-- Fungsi helper dulu (security definer = bypass RLS saat dipanggil) supaya
-- cek role di RLS tidak menyebabkan infinite recursion.
create or replace function get_my_role()
returns text as $$
  select role from user_roles where user_id = auth.uid() limit 1;
$$ language sql security definer;

grant execute on function get_my_role() to authenticated;

-- Owner bisa lihat & kelola semua user
create policy "owner can manage all roles" on user_roles
  for all using (get_my_role() = 'owner')
  with check (get_my_role() = 'owner');

-- Semua user (termasuk kasir) bisa baca role sendiri buat cek akses di frontend
create policy "user can read own role" on user_roles
  for select using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 3. Fungsi produk mengendap - produk yang sudah lama tidak terjual
--    Dipakai laporan WhatsApp mingguan
-- ----------------------------------------------------------------------------
create or replace function get_slow_moving_products(p_days_threshold int default 14)
returns table(
  product_name text,
  stok numeric,
  unit_type text,
  last_sold_at timestamptz,
  days_since_sold int
) as $$
  select
    p.name as product_name,
    coalesce(sum(b.qty_remaining) filter (where b.status = 'active'), 0) as stok,
    p.unit_type,
    max(s.sold_at) as last_sold_at,
    extract(day from now() - max(s.sold_at))::int as days_since_sold
  from products p
  left join product_batches b on b.product_id = p.id
  left join sales s on s.product_id = p.id
  where p.is_active = true
  group by p.id, p.name, p.unit_type
  having
    coalesce(sum(b.qty_remaining) filter (where b.status = 'active'), 0) > 0
    and (
      max(s.sold_at) is null
      or max(s.sold_at) < now() - make_interval(days => p_days_threshold)
    )
  order by days_since_sold desc nulls first, stok desc
  limit 10;
$$ language sql security definer;

revoke execute on function get_slow_moving_products(int) from public;
grant execute on function get_slow_moving_products(int) to authenticated;
