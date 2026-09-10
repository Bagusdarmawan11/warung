import { ImportClient } from '@/components/import/ImportClient';
import { RoleGuard } from '@/components/RoleGuard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default function ImportPage() {
  return <RoleGuard requires="admin"><ImportClient /></RoleGuard>;
}
