-- ============================================================================
-- WARUNG KASIR - Import Riwayat Penjualan Lama
-- Jalankan SETELAH 0005_bulk_import.sql
--
-- Sebelumnya, file CSV Penjualan hanya dipakai untuk MENGHITUNG sisa stok
-- bersih (qty masuk - qty terjual) saat import, tapi baris-baris penjualannya
-- sendiri tidak pernah benar-benar disimpan sebagai riwayat transaksi -
-- itu sebabnya menu Riwayat/Analitik kosong walau file Penjualan sudah
-- diupload. Fungsi ini menyimpan tiap baris penjualan lama sebagai catatan
-- riwayat asli (tanpa mengubah stok lagi, karena stok bersihnya sudah
-- dihitung sekali lewat bulk_import_products).
--
-- Baris riwayat hasil import ditandai trx_id berawalan "LEGACY-IMPORT-" dan
-- fungsi ini otomatis MENOLAK jalan lagi kalau sebelumnya sudah pernah ada
-- riwayat dengan tanda itu di database -> mencegah data penjualan dobel
-- kalau file yang sama tidak sengaja di-import berkali-kali.
-- ============================================================================

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

      v_price := coalesce((v_item ->> 'unit_price')::numeric, 0);
      v_cost := coalesce((v_item ->> 'unit_cost')::numeric, 0);

      insert into sales (trx_id, product_id, batch_id, product_name_snapshot, qty, unit_price, unit_cost, total, buyer_name, sold_at)
      values (
        'LEGACY-IMPORT-' || substr(md5(random()::text || v_name || coalesce(v_item ->> 'sold_at', '')), 1, 16),
        v_product_id,
        null,
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
