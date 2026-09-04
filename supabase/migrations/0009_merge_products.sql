-- ============================================================================
-- WARUNG KASIR - Gabung Produk (Merge)
-- Jalankan SETELAH 0008_precise_timestamps.sql
--
-- Dipakai untuk kasus seperti: produk "Telur Ayam 1 Kg", "Telur Ayam 2 KG",
-- "Telur Ayam 500 gram", dst yang seharusnya cuma 1 produk timbangan (gram),
-- tapi jadi banyak produk terpisah (biasanya gara-gara data lama/import).
--
-- Fungsi ini membuat SATU produk baru (kode & batch baru, dengan stok/harga
-- yang kamu tentukan sendiri di form-nya - karena cuma pemilik warung yang
-- tahu berapa sisa berat riil sekarang), lalu produk-produk lama yang dipilih
-- untuk digabung otomatis DIARSIPKAN (bukan dihapus) - riwayat transaksi &
-- laporan lama tetap aman dan tidak berubah, cuma tidak muncul lagi di
-- Daftar Barang aktif.
-- ============================================================================

create or replace function merge_products_into_new(
  p_name text,
  p_category text,
  p_unit_type text,
  p_low_stock_threshold numeric,
  p_qty numeric,
  p_buy_price numeric,
  p_sell_price numeric,
  p_expiry_date date,
  p_source_ids uuid[]
) returns products as $$
declare
  v_new_product products;
begin
  if p_source_ids is null or array_length(p_source_ids, 1) < 2 then
    raise exception 'SOURCE_INVALID: pilih minimal 2 produk untuk digabung';
  end if;

  -- Buat produk baru (kode & batch baru) - pakai logika yang sama seperti
  -- tambah produk biasa.
  v_new_product := create_product_with_batch(
    p_name, p_category, p_unit_type, p_low_stock_threshold,
    p_qty, p_buy_price, p_sell_price, p_expiry_date, now()
  );

  -- Arsipkan semua produk lama yang digabung (bukan dihapus, supaya riwayat
  -- transaksi & laporan lama tidak berubah).
  update products
  set is_active = false
  where id = any(p_source_ids);

  return v_new_product;
end;
$$ language plpgsql security definer;

revoke execute on function merge_products_into_new(text, text, text, numeric, numeric, numeric, numeric, date, uuid[]) from public;
grant execute on function merge_products_into_new(text, text, text, numeric, numeric, numeric, numeric, date, uuid[]) to authenticated;
