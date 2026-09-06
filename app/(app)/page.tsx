import { getProductSummaries } from '@/lib/actions/products';
import { getSalesHistory, getStockInHistory } from '@/lib/actions/sales';
import { BerandaClient } from '@/components/beranda/BerandaClient';
import { RoleGuard } from '@/components/RoleGuard';

export const dynamic = 'force-dynamic';

export default async function BerandaPage() {
  const from120 = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  const [products, sales, stockIn] = await Promise.all([
    getProductSummaries(),
    getSalesHistory({ from: from120 }),
    getStockInHistory({ from: from120 }),
  ]);

  return <RoleGuard requires="admin"><BerandaClient products={products} sales={sales} stockIn={stockIn} /></RoleGuard>;
}
