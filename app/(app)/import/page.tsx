import { ImportClient } from '@/components/import/ImportClient';

export const dynamic = 'force-dynamic';
// Beri sedikit keleluasaan waktu untuk file besar (proses utamanya sendiri
// sudah dibuat 1x panggilan database lewat bulk_import_products, jadi
// biasanya jauh lebih cepat dari batas ini).
export const maxDuration = 60;

export default function ImportPage() {
  return <ImportClient />;
}
