import { getSalesHistory, getStockInHistory } from '@/lib/actions/sales';
import { RiwayatClient } from '@/components/riwayat/RiwayatClient';

export const dynamic = 'force-dynamic';

export default async function RiwayatPage() {
  const [sales, stockIn] = await Promise.all([getSalesHistory(), getStockInHistory()]);
  const namaWarung = process.env.NEXT_PUBLIC_NAMA_WARUNG || 'Warung Saya';
  return <RiwayatClient initialSales={sales} initialStockIn={stockIn} namaWarung={namaWarung} />;
}
