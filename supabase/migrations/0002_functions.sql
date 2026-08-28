-- ============================================================================
-- WARUNG KASIR - Sequence & Fungsi Transaksi Atomik
-- Jalankan SETELAH 0001_init.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Sequence untuk kode produk (BR0001, BR0002, ...). Memakai sequence Postgres
-- (bukan "cari kode terbesar lalu +1" di sisi aplikasi) supaya tidak mungkin
-- terjadi duplikat kode walau dua orang menambah produk bersamaan.
-- ----------------------------------------------------------------------------
create sequence if not exists product_code_seq start 1;

create or replace function next_product_code()
returns text as $$
  select 'BR' || lpad(nextval('product_code_seq')::text, 4, '0');
$$ language sql;

-- ----------------------------------------------------------------------------
-- create_product_with_batch: membuat produk baru + batch pertamanya sekaligus,
-- dalam satu transaksi. Mengembalikan produk yang baru dibuat.
-- ----------------------------------------------------------------------------
create or replace function create_product_with_batch(
  p_name text,
  p_category text,
  p_unit_type text,
  p_low_stock_threshold numeric,
  p_qty numeric,
  p_buy_price numeric,
  p_sell_price numeric,
  p_expiry_date date,
  p_received_at date
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
  values (v_product.id, p_qty, p_qty, coalesce(p_buy_price, 0), coalesce(p_sell_price, 0), p_expiry_date, coalesce(p_received_at, current_date))
  returning * into v_batch;

  insert into stock_in_history (product_id, batch_id, product_name_snapshot, qty, buy_price, sell_price, received_at)
  values (v_product.id, v_batch.id, v_product.name, p_qty, p_buy_price, p_sell_price, coalesce(p_received_at, current_date));

  return v_product;
end;
$$ language plpgsql security definer;

-- ----------------------------------------------------------------------------
-- add_batch: menambah stok (restock) produk yang SUDAH ADA -> membuat batch baru
-- dengan kode/barcode yang sama (kode ada di tabel products, tidak berubah).
-- ----------------------------------------------------------------------------
create or replace function add_batch(
  p_product_id uuid,
  p_qty numeric,
  p_buy_price numeric,
  p_sell_price numeric,
  p_expiry_date date,
  p_received_at date
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
  values (p_product_id, p_qty, p_qty, coalesce(p_buy_price, 0), coalesce(p_sell_price, 0), p_expiry_date, coalesce(p_received_at, current_date))
  returning * into v_batch;

  insert into stock_in_history (product_id, batch_id, product_name_snapshot, qty, buy_price, sell_price, received_at)
  values (p_product_id, v_batch.id, v_name, p_qty, p_buy_price, p_sell_price, coalesce(p_received_at, current_date));

  return v_batch;
end;
$$ language plpgsql security definer;

-- ----------------------------------------------------------------------------
-- sell_product: mengurangi stok satu produk memakai FIFO (batch paling lama
-- yang qty_remaining > 0 dipakai duluan), bisa "meluber" otomatis ke batch
-- berikutnya kalau qty yang diminta lebih besar dari sisa 1 batch. Dijalankan
-- di dalam SATU transaksi database dengan row lock ("for update"), sehingga
-- dua transaksi kasir yang terjadi bersamaan tidak akan pernah salah
-- mengurangi / mengurangi dobel batch yang sama (race condition aman).
--
-- p_allow_oversell: kalau false (default) dan stok total tidak cukup, fungsi
-- akan gagal dengan error 'INSUFFICIENT_STOCK' supaya aplikasi bisa tampilkan
-- konfirmasi ke kasir. Kalau true, transaksi tetap dicatat penuh walau stok
-- tercatat tidak cukup (baris kekurangan dicatat dengan batch_id NULL).
-- ----------------------------------------------------------------------------
create or replace function sell_product(
  p_product_id uuid,
  p_qty numeric,
  p_trx_id text,
  p_buyer_name text,
  p_unit_price_override numeric default null,
  p_allow_oversell boolean default false
) returns setof sales as $$
declare
  v_batch record;
  v_remaining numeric := p_qty;
  v_take numeric;
  v_unit_price numeric;
  v_product_name text;
  v_new_sale sales;
  v_last_cost numeric := 0;
  v_last_price numeric := 0;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'QTY_INVALID: jumlah jual harus lebih dari 0';
  end if;

  select name into v_product_name from products where id = p_product_id;
  if v_product_name is null then
    raise exception 'PRODUCT_NOT_FOUND: %', p_product_id;
  end if;

  for v_batch in
    select * from product_batches
    where product_id = p_product_id and status = 'active' and qty_remaining > 0
    order by received_at asc, created_at asc
    for update
  loop
    exit when v_remaining <= 0;

    v_take := least(v_remaining, v_batch.qty_remaining);
    v_unit_price := coalesce(p_unit_price_override, v_batch.sell_price);
    v_last_cost := v_batch.buy_price;
    v_last_price := v_unit_price;

    update product_batches
    set qty_remaining = qty_remaining - v_take,
        status = case when qty_remaining - v_take <= 0 then 'depleted' else 'active' end
    where id = v_batch.id;

    insert into sales (trx_id, product_id, batch_id, product_name_snapshot, qty, unit_price, unit_cost, total, buyer_name)
    values (p_trx_id, p_product_id, v_batch.id, v_product_name, v_take, v_unit_price, v_batch.buy_price, v_take * v_unit_price, p_buyer_name)
    returning * into v_new_sale;

    return next v_new_sale;

    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    if not p_allow_oversell then
      raise exception 'INSUFFICIENT_STOCK: sisa kekurangan %', v_remaining;
    end if;

    v_unit_price := coalesce(p_unit_price_override, v_last_price);
    insert into sales (trx_id, product_id, batch_id, product_name_snapshot, qty, unit_price, unit_cost, total, buyer_name)
    values (p_trx_id, p_product_id, null, v_product_name, v_remaining, v_unit_price, v_last_cost, v_remaining * v_unit_price, p_buyer_name)
    returning * into v_new_sale;

    return next v_new_sale;
  end if;

  return;
end;
$$ language plpgsql security definer;
