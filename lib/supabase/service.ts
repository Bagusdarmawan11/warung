import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Client Supabase pakai SERVICE ROLE KEY - melewati RLS sepenuhnya.
 *
 * JANGAN PERNAH pakai ini di komponen client atau di mana pun yang bisa
 * diakses browser. Hanya untuk job backend tepercaya yang TIDAK punya sesi
 * user (misal cron laporan WhatsApp harian), dan rute pemanggilnya sendiri
 * WAJIB diproteksi (lihat verifikasi CRON_SECRET di app/api/cron/*).
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diisi di environment variable');
  }
  return createSupabaseClient(url, key, { auth: { persistSession: false } });
}
