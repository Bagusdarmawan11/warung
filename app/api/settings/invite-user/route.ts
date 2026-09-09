import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  // Verifikasi caller adalah owner
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const { data: roleRow } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
  if (!roleRow || roleRow.role !== 'owner') {
    return NextResponse.json({ ok: false, error: 'Hanya owner yang bisa mengundang user' }, { status: 403 });
  }

  const { email, role, displayName } = await req.json();
  if (!email?.trim()) return NextResponse.json({ ok: false, error: 'Email wajib diisi' }, { status: 400 });
  if (!['admin', 'kasir'].includes(role)) return NextResponse.json({ ok: false, error: 'Role tidak valid' }, { status: 400 });

  // Gunakan service role key untuk invite user
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) {
    return NextResponse.json({ ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi' }, { status: 500 });
  }

  const adminClient = createAdminClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    // Kirim email undangan
    const { data: invited, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email.trim(), {
      redirectTo: `${process.env.NEXT_PUBLIC_BASE_URL || url}/auth/callback`,
      data: { invited_role: role, display_name: displayName?.trim() || '' },
    });

    if (inviteErr) {
      return NextResponse.json({ ok: false, error: inviteErr.message }, { status: 400 });
    }

    // Langsung tambahkan role ke tabel (user_id sudah ada setelah invite)
    if (invited?.user?.id) {
      await adminClient.from('user_roles').upsert({
        user_id: invited.user.id,
        role,
        display_name: displayName?.trim() || null,
      }, { onConflict: 'user_id' });
    }

    return NextResponse.json({ ok: true, userId: invited?.user?.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
