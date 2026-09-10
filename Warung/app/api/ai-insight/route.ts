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
          generationConfig: {
            maxOutputTokens: 3000,
            temperature: 0.6,
            // Gemini 2.5 Flash punya mode "thinking" bawaan yang diam-diam
            // memakai sebagian besar jatah token untuk "mikir" sebelum
            // menulis jawaban - kalau tidak dimatikan, jawaban yang terlihat
            // sering kepotong pendek walau maxOutputTokens sudah besar.
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error('Gemini API error:', errText);
      return NextResponse.json({ ok: false, reason: 'api_error' }, { status: 502 });
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const text = (candidate?.content?.parts || [])
      .map((p: any) => p.text || '')
      .filter(Boolean)
      .join('\n')
      .trim();

    if (!text) {
      const blockReason = candidate?.finishReason || data.promptFeedback?.blockReason;
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
  return `Kamu adalah konsultan bisnis untuk sebuah warung sembako kecil di Indonesia. Berdasarkan data ringkasan (BUKAN data mentah) di bawah, tulis analisis dalam Bahasa Indonesia yang jelas dan enak dibaca, dengan struktur PERSIS seperti ini (pakai heading tebal seperti contoh, jangan pakai simbol markdown # atau tabel):

**Kesimpulan Penjualan**
2-4 kalimat merangkum kondisi bisnis: tren omzet naik/turun, produk yang menonjol, dan hal penting lain dari data.

**Saran**
3-4 poin saran praktis berdasarkan pola yang terlihat di data (misal soal stok, harga, atau produk tertentu).

**Rekomendasi Tindakan**
3-5 poin tindakan KONKRET dan spesifik yang bisa langsung dilakukan pemilik warung minggu ini (bukan saran umum/generik).

Aturan penting:
- Jangan mengarang angka yang tidak ada di data.
- Sebut nama produk/angka spesifik dari data kalau relevan, supaya terasa personal (bukan template generik).
- Total tulisan sekitar 200-300 kata, bahasa santai tapi profesional, tanpa basa-basi pembuka seperti "Tentu, berikut...".

DATA:
${JSON.stringify(stats, null, 2)}`;
}
