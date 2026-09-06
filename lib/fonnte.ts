/**
 * Kirim pesan WhatsApp lewat Fonnte (https://fonnte.com).
 * Butuh FONNTE_TOKEN & FONNTE_TARGET di environment variable.
 *
 * FONNTE_TARGET bisa diisi beberapa nomor/group ID, pisah dengan koma:
 *   6281234567890,6289876543210,1234567890-1234567890@g.us
 *
 * Catatan: untuk group WhatsApp, "countryCode" TIDAK dikirim (Fonnte
 * menolak request kalau countryCode dikirim bersamaan dengan group ID).
 * Solusinya: kirim target satu per satu, format nomor HP pakai countryCode
 * tapi group ID dikirim tanpa countryCode.
 */
export async function sendWhatsAppMessage(message: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.FONNTE_TOKEN;
  const targetRaw = process.env.FONNTE_TARGET;

  if (!token || !targetRaw) {
    return { ok: false, error: 'FONNTE_TOKEN atau FONNTE_TARGET belum diisi di environment variable' };
  }

  const targets = targetRaw.split(',').map((t) => t.trim()).filter(Boolean);
  const errors: string[] = [];

  for (const target of targets) {
    try {
      const form = new FormData();
      form.append('target', target);
      form.append('message', message);
      // countryCode HANYA untuk nomor HP biasa (diawali angka, bukan format group @g.us)
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
