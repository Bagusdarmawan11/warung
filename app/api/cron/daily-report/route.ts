import { NextResponse } from 'next/server';
import { determineReportPeriods, buildReportMessage } from '@/lib/reporting';
import { sendWhatsAppMessage } from '@/lib/fonnte';

export const maxDuration = 30;

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  const namaWarung = process.env.NEXT_PUBLIC_NAMA_WARUNG || 'Warung Saya';
  const periods = determineReportPeriods();
  const results: { kind: string; sent: boolean; error?: string }[] = [];

  for (const period of periods) {
    try {
      const message = await buildReportMessage(period, namaWarung);
      const sendResult = await sendWhatsAppMessage(message);
      results.push({ kind: period.kind, sent: sendResult.ok, error: sendResult.error });
    } catch (e: any) {
      results.push({ kind: period.kind, sent: false, error: e.message });
    }
  }

  return NextResponse.json({ ok: true, results });
}
