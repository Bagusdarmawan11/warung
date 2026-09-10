import { createServiceClient } from '@/lib/supabase/service';
import { rupiah, formatTanggal } from '@/lib/format';

const WIB_OFFSET_HOURS = 7;

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Tanggal hari ini menurut WIB (bukan UTC server), format YYYY-MM-DD. */
function wibDateString(date: Date): string {
  const shifted = new Date(date.getTime() + WIB_OFFSET_HOURS * 3600 * 1000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Rentang waktu UTC (untuk query DB) yang merepresentasikan satu tanggal kalender WIB penuh (00:00-23:59:59 WIB). */
function wibDayRangeToUtc(dateStr: string): { start: string; end: string } {
  return { start: `${dateStr}T00:00:00+07:00`, end: `${dateStr}T23:59:59.999+07:00` };
}

export interface ReportPeriod {
  kind: 'harian' | 'mingguan' | 'bulanan';
  label: string; // buat judul pesan, misal "Rabu, 3 September 2026" atau "27 Agu - 2 Sep 2026"
  startDate: string; // YYYY-MM-DD (WIB)
  endDate: string; // YYYY-MM-DD (WIB)
}

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function formatLabelDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${d} ${BULAN[m - 1]} ${y}`;
}
function dayNameOf(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return HARI[dt.getUTCDay()];
}

/**
 * Tentukan periode laporan apa saja yang harus dikirim HARI INI (dipanggil
 * sekitar jam 00:00 WIB, jadi "hari ini" di sini berarti hari yang baru
 * saja berakhir semalam).
 */
export function determineReportPeriods(now: Date = new Date()): ReportPeriod[] {
  const todayWib = wibDateString(now);
  const yesterday = addDaysToDateString(todayWib, -1);
  const periods: ReportPeriod[] = [];

  // Harian: selalu, untuk tanggal kemarin (hari yang baru berakhir)
  periods.push({
    kind: 'harian',
    label: `${dayNameOf(yesterday)}, ${formatLabelDate(yesterday)}`,
    startDate: yesterday,
    endDate: yesterday,
  });

  // Mingguan: kalau HARI INI (WIB) adalah Senin, laporkan 7 hari terakhir (Senin lalu - Minggu kemarin)
  const todayDow = dayOfWeekOf(todayWib);
  if (todayDow === 1) {
    // Senin
    const weekStart = addDaysToDateString(yesterday, -6); // 7 hari termasuk kemarin
    periods.push({
      kind: 'mingguan',
      label: `${formatLabelDate(weekStart)} - ${formatLabelDate(yesterday)}`,
      startDate: weekStart,
      endDate: yesterday,
    });
  }

  // Bulanan: kalau HARI INI (WIB) tanggal 1, laporkan seluruh bulan kemarin
  const todayDay = Number(todayWib.split('-')[2]);
  if (todayDay === 1) {
    const [y, m] = yesterday.split('-').map(Number); // yesterday = hari terakhir bulan lalu
    const monthStart = `${y}-${pad(m)}-01`;
    periods.push({
      kind: 'bulanan',
      label: `${BULAN[m - 1]} ${y}`,
      startDate: monthStart,
      endDate: yesterday,
    });
  }

  return periods;
}

function dayOfWeekOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

interface SaleForReport {
  qty: number;
  total: number;
  unit_price: number;
  unit_cost: number;
  buyer_name: string | null;
  product_name_snapshot: string;
  trx_id: string;
}

async function fetchSalesForPeriod(period: ReportPeriod): Promise<SaleForReport[]> {
  const supabase = createServiceClient();
  const { start } = wibDayRangeToUtc(period.startDate);
  const { end } = wibDayRangeToUtc(period.endDate);
  const { data, error } = await supabase
    .from('sales')
    .select('qty, total, unit_price, unit_cost, buyer_name, product_name_snapshot, trx_id')
    .gte('sold_at', start)
    .lte('sold_at', end);
  if (error) throw new Error(error.message);
  return (data as SaleForReport[]) || [];
}

function topN<T>(arr: T[], keyFn: (x: T) => string, valueFn: (x: T) => number, n: number): { name: string; value: number }[] {
  const map = new Map<string, number>();
  for (const item of arr) {
    const k = keyFn(item);
    map.set(k, (map.get(k) || 0) + valueFn(item));
  }
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, n);
}

function buildMessage(period: ReportPeriod, sales: SaleForReport[], namaWarung: string): string {
  const judul = period.kind === 'harian' ? 'Laporan Harian' : period.kind === 'mingguan' ? 'Laporan Mingguan' : 'Laporan Bulanan';
  const omzet = sales.reduce((s, r) => s + r.total, 0);
  const untung = sales.reduce((s, r) => s + (r.unit_price - r.unit_cost) * r.qty, 0);
  const jumlahTrx = new Set(sales.map((s) => s.trx_id)).size;

  let msg = `📊 *${judul} - ${namaWarung}*\n${period.label}\n\n`;

  if (sales.length === 0) {
    msg += 'Tidak ada transaksi penjualan tercatat di periode ini.';
    return msg;
  }

  msg += `💰 *Ringkasan*\nOmset: ${rupiah(omzet)}\nUntung: ${rupiah(untung)}\nTransaksi: ${jumlahTrx}\n\n`;

  const buyersWithName = sales.filter((s) => s.buyer_name?.trim());
  const bestProducts = topN(sales, (s) => s.product_name_snapshot, (s) => s.qty, 3);
  if (bestProducts.length) {
    msg += `🏆 *Produk Terlaris*\n`;
    bestProducts.forEach((p, i) => { msg += `${i + 1}. ${p.name} - ${p.value.toLocaleString('id-ID')}\n`; });
    msg += '\n';
  }

  if (buyersWithName.length) {
    const topOmzet = topN(buyersWithName, (s) => s.buyer_name!.trim(), (s) => s.total, 3);
    const topFrekuensi = topN(buyersWithName, (s) => s.buyer_name!.trim(), () => 1, 3);
    const topUntung = topN(buyersWithName, (s) => s.buyer_name!.trim(), (s) => (s.unit_price - s.unit_cost) * s.qty, 3);

    msg += `👤 *Top Pelanggan (Omset)*\n`;
    topOmzet.forEach((p, i) => { msg += `${i + 1}. ${p.name} - ${rupiah(p.value)}\n`; });
    msg += `\n🔁 *Top Pelanggan (Frekuensi)*\n`;
    topFrekuensi.forEach((p, i) => { msg += `${i + 1}. ${p.name} - ${p.value}x\n`; });
    msg += `\n📈 *Top Pelanggan (Untung)*\n`;
    topUntung.forEach((p, i) => { msg += `${i + 1}. ${p.name} - ${rupiah(p.value)}\n`; });
    msg += '\n';
  }

  msg += `_Warung Kasir Otomatis_`;
  return msg;
}

export async function buildReportMessage(period: ReportPeriod, namaWarung: string): Promise<string> {
  const sales = await fetchSalesForPeriod(period);
  let message = buildMessage(period, sales, namaWarung);

  // Laporan mingguan: tambahkan daftar produk mengendap (tidak laku 14 hari+)
  if (period.kind === 'mingguan') {
    try {
      const supabase = createServiceClient();
      const { data } = await supabase.rpc('get_slow_moving_products', { p_days_threshold: 14 });
      const slowItems = (data as any[]) || [];
      if (slowItems.length > 0) {
        message += `\n\n📦 *Produk Mengendap (stok ada, tidak laku >14 hari)*\n`;
        slowItems.forEach((p: any, i: number) => {
          const stok = p.unit_type === 'gram'
            ? (p.stok >= 1000 ? `${(p.stok / 1000).toFixed(1)} kg` : `${p.stok} gr`)
            : `${p.stok} pcs`;
          const since = p.last_sold_at
            ? `${p.days_since_sold} hari tidak laku`
            : 'Belum pernah terjual';
          message += `${i + 1}. ${p.product_name} (stok: ${stok}) — ${since}\n`;
        });
        message += `_Pertimbangkan diskon atau tawarkan ke pelanggan tetap._`;
      }
    } catch { /* produk mengendap opsional, tidak perlu block laporan utama */ }
  }

  return message;
}
