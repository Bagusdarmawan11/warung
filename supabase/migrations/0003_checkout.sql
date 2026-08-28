-- ============================================================================
-- WARUNG KASIR - Checkout Atomik
-- Jalankan SETELAH 0002_functions.sql
--
-- Kenapa perlu fungsi ini: satu transaksi kasir biasanya berisi beberapa
-- barang sekaligus. Kalau tiap barang dikurangi lewat pemanggilan RPC
-- terpisah dari JavaScript, dan barang ke-3 gagal (stok kurang), maka barang
-- ke-1 & ke-2 yang sudah terlanjur dikurangi TIDAK BISA dibatalkan lagi
-- (bug: stok berkurang padahal transaksi "gagal"). Fungsi checkout_cart
-- membungkus SEMUA baris keranjang dalam SATU transaksi database: kalau ada
-- satu saja yang gagal, semuanya otomatis dibatalkan (rollback).
-- ============================================================================

create or replace function checkout_cart(
  p_items jsonb,               -- array of {"product_id":..,"qty":..,"unit_price_override":..(optional)}
  p_buyer_name text,
  p_allow_oversell boolean default false
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
        p_allow_oversell
      )
    loop
      v_result := v_result || to_jsonb(v_sale);
    end loop;
  end loop;

  return jsonb_build_object('trx_id', v_trx_id, 'sales', v_result);
end;
$$ language plpgsql security definer;
