import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  // Route ini sudah otomatis diproteksi middleware (wajib login), tapi kita
  // cek ulang di sini sebagai lapisan pertahanan kedua ("defense in depth").
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, reason: 'not_configured' });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'bad_request' }, { status: 400 });
  }

  const prompt = buildPrompt(body);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 900,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Anthropic API error:', errText);
      return NextResponse.json({ ok: false, reason: 'api_error' }, { status: 502 });
    }

    const data = await res.json();
    const text = (data.content || [])
      .map((block: any) => (block.type === 'text' ? block.text : ''))
      .filter(Boolean)
      .join('\n');

    return NextResponse.json({ ok: true, text });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, reason: 'network_error' }, { status: 502 });
  }
}

function buildPrompt(stats: any): string {
  return `Kamu adalah asisten analisis bisnis untuk sebuah warung sembako kecil di Indonesia. Berdasarkan data ringkasan (BUKAN data mentah) berikut, tulis dalam Bahasa Indonesia yang santai tapi jelas:
1. Ringkasan kondisi bisnis 2-3 kalimat.
2. 3-5 rekomendasi tindakan konkret dan singkat (poin-poin).
Jangan mengarang angka yang tidak ada di data. Jawab maksimal sekitar 200 kata, tanpa heading markdown berlebihan.

DATA:
${JSON.stringify(stats, null, 2)}`;
}
