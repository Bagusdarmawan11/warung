-- ============================================================================
-- WARUNG KASIR - Import yang Benar-Benar FIFO (Perbaikan Besar)
-- Jalankan SETELAH 0009_merge_products.sql
--
-- MASALAH YANG DIPERBAIKI:
-- Sebelumnya, kalau satu produk direstock berkali-kali di file Barang Masuk
-- lama, semua baris itu DIGABUNG jadi cuma 1 batch (supaya "stok bersih").
-- Akibatnya di Riwayat/Detail Produk cuma kelihatan "1x barang masuk" padahal
-- aslinya sering direstock - dan stok akhirnya cuma angka hasil hitungan,
-- bukan benar-benar dipotong per transaksi lewat mekanisme FIFO yang sama
-- dengan yang dipakai Kasir sehari-hari.
--
-- SEKARANG: setiap baris di file Barang Masuk jadi BATCH-nya SENDIRI (persis
-- seperti kalau kamu tambah stok manual berkali-kali lewat aplikasi). Baris
-- Penjualan lama juga BENAR-BENAR memotong stok dari batch FIFO yang tepat
-- (bukan cuma dicatat sebagai riwayat), pakai mesin yang sama dengan
-- transaksi Kasir asli - jadi hasilnya konsisten dan bisa diaudit.
--
-- PENTING: kalau database kamu sudah pernah diimport pakai versi lama, WAJIB
-- jalankan supabase/scripts/reset_data.sql dulu sebelum import ulang dengan
-- logika baru ini - supaya tidak dobel hitung stok.
-- ============================================================================

create table if not exists import_flags (
  key text primary key,
  done_at timestamptz not null default now()
);
alter table import_flags enable row level security;
drop policy if exists "authenticated full access" on import_flags;
create policy "authenticated full access" on import_flags
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create or replace function bulk_import_products(p_items jsonb)
returns jsonb as $$
declare
  v_item jsonb;
  v_code text;
  v_product_id uuid;
  v_batch_id uuid;
  v_created_products int := 0;
  v_created_batches int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_name text;
  v_qty numeric;
  v_received_at timestamptz;
  v_already_imported boolean;
begin
  select exists(select 1 from import_flags where key = 'barang_masuk') into v_already_imported;
  if v_already_imported then
    return jsonb_build_object('created_products', 0, 'created_batches', 0, 'skipped', '[]'::jsonb, 'already_imported', true);
  end if;

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
      v_qty := greatest(coalesce((v_item ->> 'qty')::numeric, 0), 0);
      v_received_at := coalesce(nullif(v_item ->> 'received_at', '')::timestamptz, now());

      select id into v_product_id from products where lower(name) = lower(v_name) and is_active = true limit 1;

      if v_product_id is null then
        v_code := next_product_code();
        insert into products (code, name, category, unit_type, low_stock_threshold)
        values (
          v_code, v_name,
          nullif(trim(coalesce(v_item ->> 'category', '')), ''),
          coalesce(nullif(v_item ->> 'unit_type', ''), 'pcs'),
          coalesce((v_item ->> 'low_stock_threshold')::numeric, 3)
        )
        returning id into v_product_id;
        v_created_products := v_created_products + 1;
      end if;

      insert into product_batches (product_id, qty_initial, qty_remaining, buy_price, sell_price, expiry_date, received_at)
      values (
        v_product_id, v_qty, v_qty,
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

      v_created_batches := v_created_batches + 1;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('name', v_name, 'reason', sqlerrm);
    end;
  end loop;

  insert into import_flags (key) values ('barang_masuk')
  on conflict (key) do nothing;

  return jsonb_build_object('created_products', v_created_products, 'created_batches', v_created_batches, 'skipped', v_skipped, 'already_imported', false);
end;
$$ language plpgsql security definer;

revoke execute on function bulk_import_products(jsonb) from public;
grant execute on function bulk_import_products(jsonb) to authenticated;

create or replace function bulk_import_sales_history(p_items jsonb)
returns jsonb as $$
declare
  v_item jsonb;
  v_product_id uuid;
  v_created int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_name text;
  v_qty numeric;
  v_price numeric;
  v_cost numeric;
  v_sold_at timestamptz;
  v_already_imported boolean;
  v_remaining numeric;
  v_take numeric;
  v_batch record;
  v_trx_id text;
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

      select id into v_product_id from products where lower(name) = lower(v_name) order by created_at asc limit 1;
      if v_product_id is null then
        v_skipped := v_skipped || jsonb_build_object('name', v_name, 'reason', 'Produk tidak ditemukan di daftar barang (pastikan sudah import Barang Masuk dulu)');
        continue;
      end if;

      v_price := coalesce((v_item ->> 'unit_price')::numeric, 0);
      v_cost := coalesce((v_item ->> 'unit_cost')::numeric, 0);
      v_sold_at := coalesce(nullif(v_item ->> 'sold_at', '')::timestamptz, now());
      v_trx_id := 'LEGACY-IMPORT-' || substr(md5(random()::text || v_name || coalesce(v_item ->> 'sold_at', '')), 1, 16);
      v_remaining := v_qty;

      for v_batch in
        select * from product_batches
        where product_id = v_product_id and status = 'active' and qty_remaining > 0
        order by received_at asc, created_at asc
        for update
      loop
        exit when v_remaining <= 0;
        v_take := least(v_remaining, v_batch.qty_remaining);

        update product_batches
        set qty_remaining = qty_remaining - v_take,
            status = case when qty_remaining - v_take <= 0 then 'depleted' else 'active' end
        where id = v_batch.id;

        insert into sales (trx_id, product_id, batch_id, product_name_snapshot, qty, unit_price, unit_cost, total, buyer_name, sold_at)
        values (v_trx_id, v_product_id, v_batch.id, v_name, v_take, v_price, v_cost, v_take * v_price, nullif(v_item ->> 'buyer_name', ''), v_sold_at);

        v_remaining := v_remaining - v_take;
      end loop;

      if v_remaining > 0 then
        insert into sales (trx_id, product_id, batch_id, product_name_snapshot, qty, unit_price, unit_cost, total, buyer_name, sold_at)
        values (v_trx_id, v_product_id, null, v_name, v_remaining, v_price, v_cost, v_remaining * v_price, nullif(v_item ->> 'buyer_name', ''), v_sold_at);
      end if;

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
