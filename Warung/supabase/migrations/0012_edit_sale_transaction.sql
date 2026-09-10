-- ============================================================================
-- WARUNG KASIR - Edit Transaksi Penjualan
-- Jalankan SETELAH 0011_custom_dates_and_info.sql
--
-- Dipakai untuk memperbaiki transaksi penjualan yang salah input (tanggal,
-- qty, harga jual, nama pembeli) TANPA perlu utak-atik database manual.
--
-- Bagian paling penting: kalau QTY diubah, stok produk harus ikut disesuaikan
-- supaya tetap akurat. Fungsi ini menghitung selisihnya lalu menambah/
-- mengurangi qty_remaining pada BATCH yang sama persis dengan yang dipakai
-- transaksi aslinya (bukan batch lain) - jadi kalau kamu salah ketik qty 50
-- padahal maksudnya 5, begitu diperbaiki jadi 5, sisa 45-nya otomatis
-- dikembalikan ke stok. Batch tidak akan pernah dipaksa jadi negatif atau
-- melebihi qty awal batch itu sendiri.
-- ============================================================================

create or replace function update_sale_transaction(
  p_sale_id uuid,
  p_qty numeric,
  p_unit_price numeric,
  p_buyer_name text,
  p_sold_at timestamptz
) returns sales as $$
declare
  v_old sales;
  v_delta numeric;
  v_batch product_batches;
  v_new_remaining numeric;
  v_updated sales;
begin
  select * into v_old from sales where id = p_sale_id for update;
  if v_old is null then
    raise exception 'SALE_NOT_FOUND: transaksi tidak ditemukan';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'QTY_INVALID: jumlah harus lebih dari 0';
  end if;
  if p_sold_at is null then
    raise exception 'DATE_INVALID: tanggal wajib diisi';
  end if;

  v_delta := p_qty - v_old.qty;

  if v_old.batch_id is not null and v_delta <> 0 then
    select * into v_batch from product_batches where id = v_old.batch_id for update;
    -- CATATAN: sengaja cek v_batch.id (bukan "v_batch is not null") karena
    -- untuk tipe ROW, "IS NOT NULL" cuma true kalau SEMUA kolom terisi -
    -- batch punya kolom nullable (expiry_date, note) yang sering kosong,
    -- jadi "v_batch is not null" salah mendeteksi "tidak ketemu" padahal
    -- barisnya ketemu. Kolom id dijamin selalu terisi kalau baris ketemu.
    if v_batch.id is not null then
      v_new_remaining := greatest(0, least(v_batch.qty_initial, v_batch.qty_remaining - v_delta));
      update product_batches
      set qty_remaining = v_new_remaining,
          status = case when v_new_remaining <= 0 then 'depleted' else 'active' end
      where id = v_batch.id;
    end if;
  end if;

  update sales
  set qty = p_qty,
      unit_price = coalesce(p_unit_price, unit_price),
      total = p_qty * coalesce(p_unit_price, unit_price),
      buyer_name = nullif(trim(coalesce(p_buyer_name, '')), ''),
      sold_at = p_sold_at
  where id = p_sale_id
  returning * into v_updated;

  return v_updated;
end;
$$ language plpgsql security definer;

revoke execute on function update_sale_transaction(uuid, numeric, numeric, text, timestamptz) from public;
grant execute on function update_sale_transaction(uuid, numeric, numeric, text, timestamptz) to authenticated;
