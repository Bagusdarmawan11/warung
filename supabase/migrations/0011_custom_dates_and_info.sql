-- ============================================================================
-- WARUNG KASIR - Tanggal Transaksi Kustom & Info Tambahan
-- Jalankan SETELAH 0010_import_fifo_redesign.sql
-- ============================================================================

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
  p.image_url,
  (
    select max(b4.received_at) from product_batches b4
    where b4.product_id = p.id
  ) as tanggal_masuk_terakhir
from products p
left join product_batches b on b.product_id = p.id
group by p.id;

alter view product_stock_summary set (security_invoker = true);

drop function if exists sell_product(uuid, numeric, text, text, numeric, boolean);
create or replace function sell_product(
  p_product_id uuid,
  p_qty numeric,
  p_trx_id text,
  p_buyer_name text,
  p_unit_price_override numeric default null,
  p_allow_oversell boolean default false,
  p_sold_at timestamptz default null
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
  v_sold_at timestamptz := coalesce(p_sold_at, now());
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

    insert into sales (trx_id, product_id, batch_id, product_name_snapshot, qty, unit_price, unit_cost, total, buyer_name, sold_at)
    values (p_trx_id, p_product_id, v_batch.id, v_product_name, v_take, v_unit_price, v_batch.buy_price, v_take * v_unit_price, p_buyer_name, v_sold_at)
    returning * into v_new_sale;

    return next v_new_sale;

    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    if not p_allow_oversell then
      raise exception 'INSUFFICIENT_STOCK: sisa kekurangan %', v_remaining;
    end if;

    v_unit_price := coalesce(p_unit_price_override, v_last_price);
    insert into sales (trx_id, product_id, batch_id, product_name_snapshot, qty, unit_price, unit_cost, total, buyer_name, sold_at)
    values (p_trx_id, p_product_id, null, v_product_name, v_remaining, v_unit_price, v_last_cost, v_remaining * v_unit_price, p_buyer_name, v_sold_at)
    returning * into v_new_sale;

    return next v_new_sale;
  end if;

  return;
end;
$$ language plpgsql security definer;

drop function if exists checkout_cart(jsonb, text, boolean);
create or replace function checkout_cart(
  p_items jsonb,
  p_buyer_name text,
  p_allow_oversell boolean default false,
  p_sold_at timestamptz default null
) returns jsonb as $$
declare
  v_trx_id text := 'TX' || to_char(now(), 'YYYYMMDDHH24MISSMS') || substr(md5(random()::text), 1, 4);
  v_item jsonb;
  v_sale sales;
  v_result jsonb := '[]'::jsonb;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'CART_EMPTY: keranjang kosong';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    for v_sale in
      select * from sell_product(
        (v_item ->> 'product_id')::uuid,
        (v_item ->> 'qty')::numeric,
        v_trx_id,
        p_buyer_name,
        nullif(v_item ->> 'unit_price_override', '')::numeric,
        p_allow_oversell,
        p_sold_at
      )
    loop
      v_result := v_result || to_jsonb(v_sale);
    end loop;
  end loop;

  return jsonb_build_object('trx_id', v_trx_id, 'sales', v_result);
end;
$$ language plpgsql security definer;

revoke execute on function sell_product(uuid, numeric, text, text, numeric, boolean, timestamptz) from public;
grant execute on function sell_product(uuid, numeric, text, text, numeric, boolean, timestamptz) to authenticated;
revoke execute on function checkout_cart(jsonb, text, boolean, timestamptz) from public;
grant execute on function checkout_cart(jsonb, text, boolean, timestamptz) to authenticated;
