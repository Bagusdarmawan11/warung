import { getProductSummaries } from '@/lib/actions/products';
import { ProdukClient } from '@/components/produk/ProdukClient';

export const dynamic = 'force-dynamic';

export default async function ProdukPage() {
  const products = await getProductSummaries();
  return <ProdukClient initialProducts={products} />;
}
