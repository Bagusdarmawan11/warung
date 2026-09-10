/**
 * Kirim pesan WhatsApp lewat Fonnte (https://fonnte.com).
 * Target nomor dibaca dari database (app_settings) dulu,
 * fallback ke FONNTE_TARGET env var kalau tidak ada di DB.
 */
export async function sendWhatsAppMessage(message: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.FONNTE_TOKEN;
  if (!token) {
    return { ok: false, error: 'FONNTE_TOKEN belum diisi di environment variable' };
  }

  // Baca target dari database via REST API (aman untuk semua runtime)
  let targetRaw = process.env.FONNTE_TARGET || '';
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && serviceKey) {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/app_settings?key=eq.fonnte_target&select=value`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
      );
      if (res.ok) {
        const rows = await res.json();
        if (rows?.[0]?.value?.trim()) targetRaw = rows[0].value.trim();
      }
    }
  } catch {
    // fallback ke env var
  }

  if (!targetRaw) {
    return { ok: false, error: 'Nomor target belum diisi. Isi di halaman Pengaturan atau di FONNTE_TARGET env var.' };
  }

  const targets = targetRaw.split(',').map((t) => t.trim()).filter(Boolean);
  const errors: string[] = [];

  for (const target of targets) {
    try {
      const form = new FormData();
      form.append('target', target);
      form.append('message', message);
      if (!target.includes('@')) {
        form.append('countryCode', '62');
      }

      const res = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: { Authorization: token },
        body: form,
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || data?.status === false) {
        errors.push(`${target}: ${JSON.stringify(data)}`);
      }
    } catch (e: any) {
      errors.push(`${target}: ${e.message}`);
    }
  }

  if (errors.length === targets.length) {
    return { ok: false, error: 'Semua target gagal: ' + errors.join(' | ') };
  }
  if (errors.length > 0) {
    console.error('Sebagian target Fonnte gagal:', errors);
  }
  return { ok: true };
}
