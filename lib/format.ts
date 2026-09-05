export function rupiah(n: number | null | undefined): string {
  const v = Math.round(Number(n) || 0);
  return 'Rp' + v.toLocaleString('id-ID');
}

export function formatQty(n: number, unitType: 'pcs' | 'gram'): string {
  if (unitType === 'gram') {
    if (n >= 1000) return (n / 1000).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' kg';
    return n.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' gr';
  }
  return n.toLocaleString('id-ID');
}

export function formatTanggal(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatTanggalWaktu(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function startOfWeekISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  const day = local.getUTCDay() || 7; // Senin = 1 ... Minggu = 7
  local.setUTCDate(local.getUTCDate() - (day - 1));
  return local.toISOString().slice(0, 10);
}

export function startOfMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function startOfYearISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-01-01`;
}

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const today = new Date(todayISO() + 'T00:00:00');
  const target = new Date(iso + 'T00:00:00');
  if (isNaN(target.getTime())) return null;
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/**
 * Produk satuan "gram" disimpan & dihitung di database per-gram (supaya
 * matematika stok konsisten), tapi manusia biasanya mikir harga barang
 * timbangan per KILOGRAM (misal harga telur/kemiri/lada per kg). Dua fungsi
 * ini menjembatani itu: dipakai di form-form input harga untuk produk gram,
 * supaya admin cukup ketik harga per kg seperti biasa, sistem yang
 * mengonversi ke per-gram di baliknya.
 */
export function pricePerKgFromPerGram(pricePerGram: number): number {
  return Math.round((pricePerGram || 0) * 1000);
}
export function pricePerGramFromPerKg(pricePerKg: number): number {
  return (pricePerKg || 0) / 1000;
}
