import { getSalesHistory, getStockInHistory } from '@/lib/actions/sales';
import { RiwayatClient } from '@/components/riwayat/RiwayatClient';
import { RoleGuard } from '@/components/RoleGuard';

export const dynamic = 'force-dynamic';

export default async function RiwayatPage() {
  const [sales, stockIn] = await Promise.all([getSalesHistory(), getStockInHistory()]);
  const namaWarung = process.env.NEXT_PUBLIC_NAMA_WARUNG || 'Warung Saya';
  return <RoleGuard requires="admin"><RiwayatClient initialSales={sales} initialStockIn={stockIn} namaWarung={namaWarung} /></RoleGuard>;
}
