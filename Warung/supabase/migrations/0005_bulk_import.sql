-- ============================================================================
-- WARUNG KASIR - Bulk Import Produk
-- Jalankan SETELAH 0004_security_hardening.sql
--
-- Dipakai oleh fitur "Import CSV" di halaman web (app/(app)/import). Kenapa
-- perlu fungsi terpisah (bukan panggil create_product_with_batch berkali-kali
-- dari JavaScript): kalau data ada ratusan baris, ratusan kali bolak-balik
-- request ke database dari serverless function Vercel berisiko kena batas
-- waktu (timeout). Fungsi ini memproses SEMUA baris dalam SATU pemanggilan
-- database, jauh lebih cepat & aman dari timeout.
--
-- Fitur tambahan dibanding create_product_with_batch biasa:
-- - Produk yang namanya sudah ada (case-insensitive) otomatis DILEWATI, bukan
--   dibuat dobel -> aman kalau tidak sengaja import 2x.
-- - Kalau satu baris datanya bermasalah, baris itu dilewati (dicatat di hasil)
--   TANPA menggagalkan baris-baris lain yang sudah benar.
-- ============================================================================

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
        coalesce(nullif(v_item ->> 'received_at', '')::date, current_date)
      )
      returning id into v_batch_id;

      insert into stock_in_history (product_id, batch_id, product_name_snapshot, qty, buy_price, sell_price, received_at)
      values (
        v_product_id, v_batch_id, v_name, v_qty,
        (v_item ->> 'buy_price')::numeric,
        (v_item ->> 'sell_price')::numeric,
        coalesce(nullif(v_item ->> 'received_at', '')::date, current_date)
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
