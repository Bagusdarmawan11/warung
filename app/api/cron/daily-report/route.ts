import { NextResponse } from 'next/server';
import { determineReportPeriods, buildReportMessage } from '@/lib/reporting';
import { sendWhatsAppMessage } from '@/lib/fonnte';

export const maxDuration = 30;

// Jalankan tiap menit, tapi hanya kirim laporan kalau jam WIB sesuai
// dengan yang tersimpan di database (app_settings.report_schedule_wib)
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';

  // Vercel Cron: cek header khusus dari Vercel (lebih reliable dari CRON_SECRET untuk * * * * *)
  // Manual trigger (ModHeader test): tetap pakai CRON_SECRET
  const authorized =
    isVercelCron ||
    (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`);

  if (!authorized) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  // Ambil jam target dari database
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let targetHourWIB = 0; // default 00:00 WIB
  let targetMinuteWIB = 0;

  if (supabaseUrl && serviceKey) {
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/app_settings?key=eq.report_schedule_wib&select=value`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
      );
      if (res.ok) {
        const rows = await res.json();
        if (rows?.[0]?.value) {
          // Format: "HH:MM" misal "00:30" atau "07:00"
          const [h, m] = rows[0].value.split(':').map(Number);
          if (!isNaN(h)) targetHourWIB = h;
          if (!isNaN(m)) targetMinuteWIB = m;
        }
      }
    } catch { /* pakai default */ }
  }

  // Waktu sekarang dalam WIB (UTC+7)
  const now = new Date();
  const wibNow = new Date(now.getTime() + 7 * 3600 * 1000);
  const currentHourWIB = wibNow.getUTCHours();
  const currentMinuteWIB = wibNow.getUTCMinutes();

  const isTimeToSend = currentHourWIB === targetHourWIB && currentMinuteWIB === targetMinuteWIB;

  // Kalau dipanggil manual (bukan Vercel Cron), selalu kirim tanpa cek jam
  const isManual = !isVercelCron;

  if (!isTimeToSend && !isManual) {
    // Belum waktunya, skip (normal — cron jalan tiap menit)
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `Belum waktunya. Sekarang ${currentHourWIB.toString().padStart(2, '0')}:${currentMinuteWIB.toString().padStart(2, '0')} WIB, jadwal ${targetHourWIB.toString().padStart(2, '0')}:${targetMinuteWIB.toString().padStart(2, '0')} WIB`,
    });
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
