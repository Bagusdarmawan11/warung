import { Suspense } from 'react';
import { getProductSummaries } from '@/lib/actions/products';
import { ProdukClient } from '@/components/produk/ProdukClient';

export const dynamic = 'force-dynamic';

export default async function ProdukPage() {
  const products = await getProductSummaries();
  return (
    <Suspense fallback={<div className="py-10 text-center text-sm text-ink-soft">Memuat...</div>}>
      <ProdukClient initialProducts={products} />
    </Suspense>
  );
}
