import { BarangMasukClient } from '@/components/barang-masuk/BarangMasukClient';
import { RoleGuard } from '@/components/RoleGuard';

export const dynamic = 'force-dynamic';

export default function BarangMasukPage() {
  return <RoleGuard requires="admin"><BarangMasukClient /></RoleGuard>;
}
