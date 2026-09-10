-- ============================================================================
-- WARUNG KASIR - Fitur Edit Lanjutan Riwayat Transaksi
-- Jalankan SETELAH 0014_roles_and_slow_moving.sql
-- ============================================================================

create or replace function delete_sale_transaction(p_sale_id uuid)
returns void as $$
declare v_sale sales;
begin
  select * into v_sale from sales where id = p_sale_id;
  if v_sale is null then raise exception 'SALE_NOT_FOUND: transaksi tidak ditemukan'; end if;
  if v_sale.batch_id is not null then
    update product_batches
    set qty_remaining = least(qty_initial, qty_remaining + v_sale.qty), status = 'active'
    where id = v_sale.batch_id;
  end if;
  delete from sales where id = p_sale_id;
end;
$$ language plpgsql security definer;

revoke execute on function delete_sale_transaction(uuid) from public;
grant execute on function delete_sale_transaction(uuid) to authenticated;

create or replace function rename_buyer_for_group(
  p_old_buyer_name text, p_date_key text, p_new_buyer_name text
) returns int as $$
declare v_updated int;
begin
  update sales
  set buyer_name = nullif(trim(p_new_buyer_name), '')
  where (buyer_name = p_old_buyer_name or (p_old_buyer_name = '' and buyer_name is null))
    and sold_at::date = p_date_key::date;
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$ language plpgsql security definer;

revoke execute on function rename_buyer_for_group(text, text, text) from public;
grant execute on function rename_buyer_for_group(text, text, text) to authenticated;

-- change_sale_product: dengan fix kasus batch_id NULL (transaksi lama)
create or replace function change_sale_product(
  p_sale_id uuid,
  p_new_product_id uuid,
  p_new_unit_price numeric default null,
  p_allow_oversell boolean default false
) returns sales as $$
declare
  v_sale sales;
  v_new_product_name text;
  v_remaining numeric;
  v_take numeric;
  v_batch record;
  v_fallback_batch_id uuid;
  v_new_sale sales;
  v_last_cost numeric := 0;
  v_unit_price numeric;
begin
  select * into v_sale from sales where id = p_sale_id for update;
  if v_sale is null then raise exception 'SALE_NOT_FOUND'; end if;
  select name into v_new_product_name from products where id = p_new_product_id;
  if v_new_product_name is null then raise exception 'PRODUCT_NOT_FOUND'; end if;

  if v_sale.batch_id is not null then
    update product_batches
    set qty_remaining = least(qty_initial, qty_remaining + v_sale.qty), status = 'active'
    where id = v_sale.batch_id;
  else
    -- Transaksi lama tanpa batch_id: kembalikan ke batch paling baru
    select id into v_fallback_batch_id
    from product_batches where product_id = v_sale.product_id
    order by received_at desc, created_at desc limit 1;
    if v_fallback_batch_id is not null then
      update product_batches
      set qty_remaining = least(qty_initial, qty_remaining + v_sale.qty), status = 'active'
      where id = v_fallback_batch_id;
    end if;
  end if;

  delete from sales where id = p_sale_id;

  v_remaining := v_sale.qty;
  for v_batch in
    select * from product_batches
    where product_id = p_new_product_id and status = 'active' and qty_remaining > 0
    order by received_at asc, created_at asc for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_remaining, v_batch.qty_remaining);
    v_unit_price := coalesce(p_new_unit_price, v_batch.sell_price);
    v_last_cost := v_batch.buy_price;
    update product_batches
    set qty_remaining = qty_remaining - v_take,
        status = case when qty_remaining - v_take <= 0 then 'depleted' else 'active' end
    where id = v_batch.id;
    insert into sales (trx_id, product_id, batch_id, product_name_snapshot, qty,
      unit_price, unit_cost, total, buyer_name, sold_at)
    values (v_sale.trx_id, p_new_product_id, v_batch.id, v_new_product_name,
      v_take, v_unit_price, v_batch.buy_price, v_take * v_unit_price,
      v_sale.buyer_name, v_sale.sold_at)
    returning * into v_new_sale;
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    if not p_allow_oversell then raise exception 'INSUFFICIENT_STOCK: stok produk baru tidak cukup'; end if;
    v_unit_price := coalesce(p_new_unit_price, v_last_cost);
    insert into sales (trx_id, product_id, batch_id, product_name_snapshot, qty,
      unit_price, unit_cost, total, buyer_name, sold_at)
    values (v_sale.trx_id, p_new_product_id, null, v_new_product_name,
      v_remaining, v_unit_price, v_last_cost, v_remaining * v_unit_price,
      v_sale.buyer_name, v_sale.sold_at)
    returning * into v_new_sale;
  end if;

  return v_new_sale;
end;
$$ language plpgsql security definer;

revoke execute on function change_sale_product(uuid, uuid, numeric, boolean) from public;
grant execute on function change_sale_product(uuid, uuid, numeric, boolean) to authenticated;

-- 4. HAPUS BATCH: hapus satu batch barang masuk
--    Stok yang tersisa di batch itu otomatis terhapus dari perhitungan
--    CATATAN: tidak bisa hapus batch kalau sudah ada penjualan yang mereferensikan batch itu
create or replace function delete_product_batch(p_batch_id uuid)
returns void as $$
declare
  v_batch product_batches;
  v_sales_count int;
begin
  select * into v_batch from product_batches where id = p_batch_id;
  if v_batch is null then
    raise exception 'BATCH_NOT_FOUND: batch tidak ditemukan';
  end if;

  -- Cek apakah ada transaksi yang mereferensikan batch ini
  select count(*) into v_sales_count from sales where batch_id = p_batch_id;
  if v_sales_count > 0 then
    raise exception 'BATCH_HAS_SALES: batch ini sudah punya % transaksi penjualan dan tidak bisa dihapus. Hapus transaksinya dulu dari halaman Riwayat.', v_sales_count;
  end if;

  delete from product_batches where id = p_batch_id;
end;
$$ language plpgsql security definer;

revoke execute on function delete_product_batch(uuid) from public;
grant execute on function delete_product_batch(uuid) to authenticated;

-- 5. EDIT TANGGAL MASSAL: ubah tanggal untuk semua transaksi
--    dalam satu grup (pembeli + tanggal yang sama) sekaligus
create or replace function reschedule_buyer_group(
  p_old_buyer_name text,
  p_old_date_key text,       -- format YYYY-MM-DD
  p_new_date timestamptz
) returns int as $$
declare
  v_updated int;
begin
  update sales
  set sold_at = p_new_date
  where (buyer_name = p_old_buyer_name or (p_old_buyer_name = '' and buyer_name is null))
    and sold_at::date = p_old_date_key::date;
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$ language plpgsql security definer;

revoke execute on function reschedule_buyer_group(text, text, timestamptz) from public;
grant execute on function reschedule_buyer_group(text, text, timestamptz) to authenticated;
