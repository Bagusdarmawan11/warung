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

  const apiKey = process.env.GEMINI_API_KEY;
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
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 900, temperature: 0.6 },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error('Gemini API error:', errText);
      return NextResponse.json({ ok: false, reason: 'api_error' }, { status: 502 });
    }

    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts || [])
      .map((p: any) => p.text || '')
      .filter(Boolean)
      .join('\n');

    if (!text) {
      // Kemungkinan diblok oleh safety filter atau alasan lain
      const blockReason = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason;
      console.error('Gemini returned no text. finishReason/blockReason:', blockReason);
      return NextResponse.json({ ok: false, reason: 'empty_response' }, { status: 502 });
    }

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
