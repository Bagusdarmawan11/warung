/**
 * Kirim pesan WhatsApp lewat Fonnte (https://fonnte.com).
 * Butuh FONNTE_TOKEN & FONNTE_TARGET di environment variable.
 */
export async function sendWhatsAppMessage(message: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.FONNTE_TOKEN;
  const target = process.env.FONNTE_TARGET;

  if (!token || !target) {
    return { ok: false, error: 'FONNTE_TOKEN atau FONNTE_TARGET belum diisi di environment variable' };
  }

  try {
    const form = new FormData();
    form.append('target', target);
    form.append('message', message);
    form.append('countryCode', '62');

    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { Authorization: token },
      body: form,
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || data?.status === false) {
      return { ok: false, error: 'Fonnte error: ' + JSON.stringify(data) };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: 'Gagal mengirim ke Fonnte: ' + e.message };
  }
}
