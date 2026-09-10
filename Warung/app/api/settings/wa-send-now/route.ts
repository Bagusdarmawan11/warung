import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildReportMessage } from '@/lib/reporting';
import { sendWhatsAppMessage } from '@/lib/fonnte';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const { data: roleRow } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
  if (!roleRow || roleRow.role !== 'owner') {
    return NextResponse.json({ ok: false, error: 'Hanya owner yang bisa mengirim laporan manual' }, { status: 403 });
  }

  const namaWarung = process.env.NEXT_PUBLIC_NAMA_WARUNG || 'Warung Saya';
  const todayStr = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Jakarta' });
  const todayLabel = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta'
  });
  const period = { kind: 'harian' as const, label: todayLabel, startDate: todayStr, endDate: todayStr };

  try {
    const message = await buildReportMessage(period, namaWarung);
    const result = await sendWhatsAppMessage(message);
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
