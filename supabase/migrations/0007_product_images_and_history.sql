-- ============================================================================
-- WARUNG KASIR - Foto Produk & Perbaikan Riwayat
-- Jalankan SETELAH 0006_import_sales_history.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Kolom foto produk (opsional)
-- ---------------------------------------------------------------------------
alter table products add column if not exists image_url text;

-- ---------------------------------------------------------------------------
-- 2. Storage bucket untuk foto produk
--    - public read (supaya foto bisa tampil langsung lewat <img src>)
--    - upload/update/delete hanya untuk yang sudah login
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "Public read product images" on storage.objects;
create policy "Public read product images" on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists "Authenticated upload product images" on storage.objects;
create policy "Authenticated upload product images" on storage.objects
  for insert with check (bucket_id = 'product-images' and auth.role() = 'authenticated');

drop policy if exists "Authenticated update product images" on storage.objects;
create policy "Authenticated update product images" on storage.objects
  for update using (bucket_id = 'product-images' and auth.role() = 'authenticated');

drop policy if exists "Authenticated delete product images" on storage.objects;
create policy "Authenticated delete product images" on storage.objects
  for delete using (bucket_id = 'product-images' and auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- 3. Tambahkan image_url ke view ringkasan stok (kolom baru ditambah di akhir,
--    aman untuk CREATE OR REPLACE VIEW)
-- ---------------------------------------------------------------------------
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
  ) as kadaluwarsa_terdekat,
  p.image_url
from products p
left join product_batches b on b.product_id = p.id
group by p.id;

alter view product_stock_summary set (security_invoker = true);

-- ---------------------------------------------------------------------------
-- 4. Perbaikan bulk_import_sales_history: kaitkan tiap baris riwayat lama ke
--    batch tertua produknya (biasanya cuma ada 1 batch hasil import), supaya
--    sistem bisa menghitung "berapa lama barang terjual sejak tanggal masuk"
--    walau untuk data lama sekalipun.
-- ---------------------------------------------------------------------------
create or replace function bulk_import_sales_history(p_items jsonb)
returns jsonb as $$
declare
  v_item jsonb;
  v_product_id uuid;
  v_batch_id uuid;
  v_created int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_name text;
  v_qty numeric;
  v_price numeric;
  v_cost numeric;
  v_already_imported boolean;
begin
  select exists(select 1 from sales where trx_id like 'LEGACY-IMPORT-%') into v_already_imported;
  if v_already_imported then
    return jsonb_build_object('created', 0, 'skipped', '[]'::jsonb, 'already_imported', true);
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'ITEMS_INVALID: data harus berupa array';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_name := trim(coalesce(v_item ->> 'product_name', ''));
    if v_name = '' then
      continue;
    end if;

    begin
      v_qty := coalesce((v_item ->> 'qty')::numeric, 0);
      if v_qty <= 0 then
        continue;
      end if;

      select id into v_product_id
      from products
      where lower(name) = lower(v_name)
      order by created_at asc
      limit 1;

      if v_product_id is null then
        v_skipped := v_skipped || jsonb_build_object('name', v_name, 'reason', 'Produk tidak ditemukan di daftar barang (pastikan sudah import Barang Masuk dulu)');
        continue;
      end if;

      select id into v_batch_id
      from product_batches
      where product_id = v_product_id
      order by received_at asc, created_at asc
      limit 1;

      v_price := coalesce((v_item ->> 'unit_price')::numeric, 0);
      v_cost := coalesce((v_item ->> 'unit_cost')::numeric, 0);

      insert into sales (trx_id, product_id, batch_id, product_name_snapshot, qty, unit_price, unit_cost, total, buyer_name, sold_at)
      values (
        'LEGACY-IMPORT-' || substr(md5(random()::text || v_name || coalesce(v_item ->> 'sold_at', '')), 1, 16),
        v_product_id,
        v_batch_id,
        v_name,
        v_qty,
        v_price,
        v_cost,
        v_qty * v_price,
        nullif(v_item ->> 'buyer_name', ''),
        coalesce(nullif(v_item ->> 'sold_at', '')::date, current_date)::timestamptz
      );

      v_created := v_created + 1;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('name', v_name, 'reason', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('created', v_created, 'skipped', v_skipped, 'already_imported', false);
end;
$$ language plpgsql security definer;

revoke execute on function bulk_import_sales_history(jsonb) from public;
grant execute on function bulk_import_sales_history(jsonb) to authenticated;
