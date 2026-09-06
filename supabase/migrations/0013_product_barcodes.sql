-- ============================================================================
-- WARUNG KASIR - Barcode Tambahan (Kemasan Produk)
-- Jalankan SETELAH 0012_edit_sale_transaction.sql
--
-- Memungkinkan setiap produk punya lebih dari 1 barcode: kode internal
-- (BR0001 dst, sudah ada) PLUS barcode kemasan dari pabrik yang sudah
-- tercetak di produknya. Saat kasir scan barcode kemasan, sistem langsung
-- menemukan produk yang sesuai, tanpa perlu tempel stiker barcode baru.
-- ============================================================================

create table product_barcodes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  barcode text not null,
  label text,                 -- nama/keterangan barcode, opsional (misal "Indomie Goreng 85gr")
  created_at timestamptz not null default now(),
  unique (barcode)            -- barcode harus unik di seluruh sistem (1 barcode = 1 produk)
);

alter table product_barcodes enable row level security;

drop policy if exists "authenticated full access" on product_barcodes;
create policy "authenticated full access" on product_barcodes
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Cari produk berdasarkan barcode apapun (internal BR0001 ATAU barcode kemasan)
-- Dipakai kasir saat scan - satu query, satu fungsi, langsung dapat product_id-nya.
create or replace function find_product_by_any_barcode(p_barcode text)
returns uuid as $$
declare
  v_product_id uuid;
begin
  -- Coba dari kode internal produk dulu
  select id into v_product_id from products
  where code = upper(trim(p_barcode)) and is_active = true
  limit 1;

  -- Kalau tidak ketemu, coba dari tabel barcode tambahan
  if v_product_id is null then
    select pb.product_id into v_product_id
    from product_barcodes pb
    join products p on p.id = pb.product_id
    where pb.barcode = trim(p_barcode) and p.is_active = true
    limit 1;
  end if;

  return v_product_id;
end;
$$ language plpgsql security definer;

revoke execute on function find_product_by_any_barcode(text) from public;
grant execute on function find_product_by_any_barcode(text) to authenticated;
