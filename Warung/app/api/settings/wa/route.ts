import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const { data: roleRow } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
  if (!roleRow || roleRow.role !== 'owner') {
    return NextResponse.json({ ok: false, error: 'Hanya owner' }, { status: 403 });
  }

  // Simpan ke app_settings (sudah dilakukan di client)
  // Endpoint ini hanya konfirmasi — perubahan nomor Fonnte sebenarnya
  // memerlukan update env var di Vercel dan redeploy.
  // Untuk jadwal, perlu update vercel.json dan redeploy juga.
  return NextResponse.json({
    ok: true,
    note: 'Pengaturan tersimpan. Untuk nomor dan jadwal baru aktif, lakukan Redeploy di Vercel Dashboard.',
  });
}
