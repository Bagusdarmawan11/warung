import { getSalesHistory } from '@/lib/actions/sales';
import { getProductSummaries } from '@/lib/actions/products';
import { AnalitikClient } from '@/components/analitik/AnalitikClient';

export const dynamic = 'force-dynamic';

export default async function AnalitikPage() {
  const [sales, products] = await Promise.all([
    getSalesHistory({ from: new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10) }),
    getProductSummaries(),
  ]);
  return <AnalitikClient sales={sales} products={products} />;
}
