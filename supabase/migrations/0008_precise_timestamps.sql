-- ============================================================================
-- WARUNG KASIR - Presisi Waktu untuk Urutan Riwayat
-- Jalankan SETELAH 0007_product_images_and_history.sql
--
-- Kenapa perlu ini: kolom "received_at" (tanggal barang masuk) sebelumnya
-- cuma nyimpen TANGGAL (tanpa jam), jadi kalau ada banyak transaksi di hari
-- yang sama, sistem tidak selalu bisa mengurutkan mana yang lebih dulu -
-- kadang barang masuk malah kelihatan lebih "baru" daripada penjualan yang
-- sebenarnya terjadi setelahnya. Migration ini mengubah kolom itu jadi
-- timestamptz (tanggal + jam) supaya bisa diberi waktu spesifik per baris
-- saat import data lama (lihat lib/actions/import.ts), berdasarkan urutan
-- baris asli di file CSV kamu (baris paling atas = paling lama).
-- ============================================================================

-- View bergantung pada kolom received_at (dipakai untuk urutan FIFO harga
-- aktif) - drop dulu, alter kolom, lalu buat ulang view-nya di bawah.
drop view if exists product_stock_summary;

alter table product_batches
  alter column received_at type timestamptz using received_at::timestamptz;
alter table product_batches
  alter column received_at set default now();

alter table stock_in_history
  alter column received_at type timestamptz using received_at::timestamptz;
alter table stock_in_history
  alter column received_at set default now();

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

-- ----------------------------------------------------------------------------
-- Perbarui fungsi-fungsi yang menerima parameter received_at supaya menerima
-- timestamptz (tanggal + jam), bukan cuma date.
-- ----------------------------------------------------------------------------
drop function if exists create_product_with_batch(text, text, text, numeric, numeric, numeric, numeric, date, date);
create or replace function create_product_with_batch(
  p_name text,
  p_category text,
  p_unit_type text,
  p_low_stock_threshold numeric,
  p_qty numeric,
  p_buy_price numeric,
  p_sell_price numeric,
  p_expiry_date date,
  p_received_at timestamptz
) returns products as $$
declare
  v_product products;
  v_batch product_batches;
  v_code text;
begin
  if p_qty is null or p_qty < 0 then
    raise exception 'QTY_INVALID: jumlah tidak boleh negatif';
  end if;
  if p_unit_type not in ('pcs', 'gram') then
    raise exception 'UNIT_TYPE_INVALID: %', p_unit_type;
  end if;

  v_code := next_product_code();

  insert into products (code, name, category, unit_type, low_stock_threshold)
  values (v_code, trim(p_name), nullif(trim(coalesce(p_category, '')), ''), p_unit_type, coalesce(p_low_stock_threshold, 3))
  returning * into v_product;

  insert into product_batches (product_id, qty_initial, qty_remaining, buy_price, sell_price, expiry_date, received_at)
  values (v_product.id, p_qty, p_qty, coalesce(p_buy_price, 0), coalesce(p_sell_price, 0), p_expiry_date, coalesce(p_received_at, now()))
  returning * into v_batch;

  insert into stock_in_history (product_id, batch_id, product_name_snapshot, qty, buy_price, sell_price, received_at)
  values (v_product.id, v_batch.id, v_product.name, p_qty, p_buy_price, p_sell_price, coalesce(p_received_at, now()));

  return v_product;
end;
$$ language plpgsql security definer;

drop function if exists add_batch(uuid, numeric, numeric, numeric, date, date);
create or replace function add_batch(
  p_product_id uuid,
  p_qty numeric,
  p_buy_price numeric,
  p_sell_price numeric,
  p_expiry_date date,
  p_received_at timestamptz
) returns product_batches as $$
declare
  v_batch product_batches;
  v_name text;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'QTY_INVALID: jumlah tambahan stok harus lebih dari 0';
  end if;

  select name into v_name from products where id = p_product_id;
  if v_name is null then
    raise exception 'PRODUCT_NOT_FOUND: %', p_product_id;
  end if;

  insert into product_batches (product_id, qty_initial, qty_remaining, buy_price, sell_price, expiry_date, received_at)
  values (p_product_id, p_qty, p_qty, coalesce(p_buy_price, 0), coalesce(p_sell_price, 0), p_expiry_date, coalesce(p_received_at, now()))
  returning * into v_batch;

  insert into stock_in_history (product_id, batch_id, product_name_snapshot, qty, buy_price, sell_price, received_at)
  values (p_product_id, v_batch.id, v_name, p_qty, p_buy_price, p_sell_price, coalesce(p_received_at, now()));

  return v_batch;
end;
$$ language plpgsql security definer;

revoke execute on function create_product_with_batch(text, text, text, numeric, numeric, numeric, numeric, date, timestamptz) from public;
grant execute on function create_product_with_batch(text, text, text, numeric, numeric, numeric, numeric, date, timestamptz) to authenticated;
revoke execute on function add_batch(uuid, numeric, numeric, numeric, date, timestamptz) from public;
grant execute on function add_batch(uuid, numeric, numeric, numeric, date, timestamptz) to authenticated;

-- ----------------------------------------------------------------------------
-- bulk_import_products: terima waktu spesifik (jam:menit) per baris, bukan
-- cuma tanggal, supaya urutan barang masuk di hari yang sama tetap benar
-- sesuai urutan baris di file CSV aslinya.
-- ----------------------------------------------------------------------------
create or replace function bulk_import_products(p_items jsonb)
returns jsonb as $$
declare
  v_item jsonb;
  v_code text;
  v_product_id uuid;
  v_batch_id uuid;
  v_created int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_name text;
  v_qty numeric;
  v_received_at timestamptz;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'ITEMS_INVALID: data harus berupa array';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_name := trim(coalesce(v_item ->> 'name', ''));
    if v_name = '' then
      continue;
    end if;

    begin
      if exists (select 1 from products where lower(name) = lower(v_name) and is_active = true) then
        v_skipped := v_skipped || jsonb_build_object('name', v_name, 'reason', 'Produk dengan nama ini sudah ada, dilewati');
        continue;
      end if;

      v_qty := greatest(coalesce((v_item ->> 'qty')::numeric, 0), 0);
      v_code := next_product_code();
      v_received_at := coalesce(nullif(v_item ->> 'received_at', '')::timestamptz, now());

      insert into products (code, name, category, unit_type, low_stock_threshold)
      values (
        v_code,
        v_name,
        nullif(trim(coalesce(v_item ->> 'category', '')), ''),
        coalesce(nullif(v_item ->> 'unit_type', ''), 'pcs'),
        coalesce((v_item ->> 'low_stock_threshold')::numeric, 3)
      )
      returning id into v_product_id;

      insert into product_batches (product_id, qty_initial, qty_remaining, buy_price, sell_price, expiry_date, received_at)
      values (
        v_product_id,
        v_qty,
        v_qty,
        coalesce((v_item ->> 'buy_price')::numeric, 0),
        coalesce((v_item ->> 'sell_price')::numeric, 0),
        nullif(v_item ->> 'expiry_date', '')::date,
        v_received_at
      )
      returning id into v_batch_id;

      insert into stock_in_history (product_id, batch_id, product_name_snapshot, qty, buy_price, sell_price, received_at)
      values (
        v_product_id, v_batch_id, v_name, v_qty,
        (v_item ->> 'buy_price')::numeric,
        (v_item ->> 'sell_price')::numeric,
        v_received_at
      );

      v_created := v_created + 1;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('name', v_name, 'reason', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('created', v_created, 'skipped', v_skipped);
end;
$$ language plpgsql security definer;

revoke execute on function bulk_import_products(jsonb) from public;
grant execute on function bulk_import_products(jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- bulk_import_sales_history: terima waktu spesifik (jam:menit) per baris juga.
-- ----------------------------------------------------------------------------
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
  v_sold_at timestamptz;
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
      v_sold_at := coalesce(nullif(v_item ->> 'sold_at', '')::timestamptz, now());

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
        v_sold_at
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
