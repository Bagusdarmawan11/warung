'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Users, UserPlus, Trash2, ShieldCheck, RefreshCw, Send, Clock, Phone, Settings2 } from 'lucide-react';
import { Card, Field, Input, Select, Button, EmptyState } from '@/components/ui';
import { ConfirmDialog } from '@/components/Modal';
import { RoleGuard } from '@/components/RoleGuard';
import { createClient } from '@/lib/supabase/client';

interface UserRoleRow {
  id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'kasir';
  display_name: string | null;
  created_at: string;
}

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Admin', kasir: 'Kasir' };
const ROLE_DESC: Record<string, string> = {
  owner: 'Akses penuh + kelola user & pengaturan',
  admin: 'Kelola produk, stok, riwayat, laporan',
  kasir: 'Input penjualan saja',
};
const ROLE_COLOR: Record<string, string> = {
  owner: 'bg-peach-100 text-peach-600',
  admin: 'bg-lilac-100 text-lilac-600',
  kasir: 'bg-mint-100 text-mint-700',
};

// Jam-jam UTC yang valid untuk cron (dalam WIB = UTC+7)
// Vercel Hobby: hanya 1x/hari, jadwal dalam UTC
const SCHEDULE_OPTIONS = [
  { label: '00:00 WIB (17:00 UTC)', utcHour: 17 },
  { label: '06:00 WIB (23:00 UTC)', utcHour: 23 },
  { label: '07:00 WIB (00:00 UTC)', utcHour: 0 },
  { label: '08:00 WIB (01:00 UTC)', utcHour: 1 },
  { label: '12:00 WIB (05:00 UTC)', utcHour: 5 },
  { label: '18:00 WIB (11:00 UTC)', utcHour: 11 },
  { label: '21:00 WIB (14:00 UTC)', utcHour: 14 },
  { label: '22:00 WIB (15:00 UTC)', utcHour: 15 },
  { label: '23:00 WIB (16:00 UTC)', utcHour: 16 },
];

export function PengaturanClient() {
  // ── User management ──
  const [users, setUsers] = useState<UserRoleRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userId, setUserId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'kasir'>('kasir');
  const [savingUser, setSavingUser] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRoleRow | null>(null);

  // ── WA Report settings ──
  const [fonntTarget, setFonnteTarget] = useState('');
  const [scheduleHour, setScheduleHour] = useState(17); // default 17 UTC = 00:00 WIB
  const [savingWA, setSavingWA] = useState(false);
  const [sending, setSending] = useState(false);
  const [waLoaded, setWaLoaded] = useState(false);

  const supabase = createClient();

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      const { data } = await supabase.from('user_roles').select('*').order('created_at');
      setUsers((data as UserRoleRow[]) || []);
    } finally { setLoadingUsers(false); }
  }

  async function loadWASettings() {
    // Simpan setting WA di tabel app_settings (key-value sederhana)
    const { data } = await supabase.from('app_settings').select('key,value').in('key', ['fonnte_target', 'report_schedule_utc_hour']);
    if (data) {
      const t = data.find((r: any) => r.key === 'fonnte_target');
      const s = data.find((r: any) => r.key === 'report_schedule_utc_hour');
      if (t) setFonnteTarget(t.value);
      if (s) setScheduleHour(Number(s.value));
    }
    setWaLoaded(true);
  }

  useEffect(() => { loadUsers(); loadWASettings(); }, []);

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    if (!userId.trim()) { toast.error('Isi User ID terlebih dahulu'); return; }
    setSavingUser(true);
    try {
      const { error } = await supabase.from('user_roles').insert({
        user_id: userId.trim(),
        role: newRole,
        display_name: displayName.trim() || null,
      });
      if (error) {
        if (error.code === '23505') toast.error('User ini sudah punya role.');
        else toast.error(error.message);
        return;
      }
      toast.success(`User ditambahkan sebagai ${ROLE_LABEL[newRole]}`);
      setUserId(''); setDisplayName('');
      loadUsers();
    } finally { setSavingUser(false); }
  }

  async function handleChangeRole(u: UserRoleRow, newRoleVal: string) {
    const { error } = await supabase.from('user_roles').update({ role: newRoleVal }).eq('id', u.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Role berhasil diubah');
    loadUsers();
  }

  async function handleDeleteUser() {
    if (!deleteTarget) return;
    const { error } = await supabase.from('user_roles').delete().eq('id', deleteTarget.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Akses user berhasil dicabut');
    setDeleteTarget(null);
    loadUsers();
  }

  async function saveWASettings() {
    if (!fonntTarget.trim()) { toast.error('Isi nomor target terlebih dahulu'); return; }
    setSavingWA(true);
    try {
      // Upsert ke app_settings
      await supabase.from('app_settings').upsert([
        { key: 'fonnte_target', value: fonntTarget.trim() },
        { key: 'report_schedule_utc_hour', value: String(scheduleHour) },
      ], { onConflict: 'key' });
      // Update vercel.json jadwal via API internal
      const res = await fetch('/api/settings/wa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fonnte_target: fonntTarget.trim(), schedule_utc_hour: scheduleHour }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        toast.error('Tersimpan di DB, tapi jadwal Vercel perlu update manual: ' + (d?.error || 'unknown'));
      } else {
        toast.success('Pengaturan WA disimpan! Nomor target baru akan aktif setelah redeploy.');
      }
    } finally { setSavingWA(false); }
  }

  async function sendNow() {
    setSending(true);
    try {
      const res = await fetch('/api/settings/wa-send-now', { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        toast.error('Gagal mengirim: ' + (data?.error || 'Cek koneksi Fonnte'));
      } else {
        toast.success('Laporan harian berhasil dikirim ke WhatsApp!');
      }
    } finally { setSending(false); }
  }

  return (
    <RoleGuard requires="owner">
      <div className="animate-slide-up space-y-6">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink">Pengaturan</h1>
          <p className="text-sm text-ink-soft">Kelola pengguna dan konfigurasi laporan WhatsApp.</p>
        </div>

        {/* ── Laporan WhatsApp ── */}
        <Card>
          <h2 className="mb-4 flex items-center gap-2 font-display text-base font-bold text-ink">
            <Phone size={16} className="text-mint-500" /> Laporan WhatsApp Otomatis
          </h2>

          <div className="mb-3 rounded-xl bg-lilac-50 p-3 text-[11px] leading-relaxed text-ink-soft">
            Nomor target bisa diisi lebih dari satu, pisah koma. Contoh: <span className="font-mono font-bold">6281234567890,6289876543210</span><br />
            Untuk group WhatsApp, masukkan Group ID dari dashboard Fonnte (format: <span className="font-mono">xxxx@g.us</span>).<br />
            <span className="text-butter-600 font-bold">⚠️ Setelah simpan, perlu Redeploy di Vercel supaya nomor baru aktif.</span>
          </div>

          <div className="space-y-3">
            <Field label="Nomor Target (pisah koma untuk multiple)">
              <Input
                value={fonntTarget}
                onChange={(e) => setFonnteTarget(e.target.value)}
                placeholder="6281234567890,group-id@g.us"
                disabled={!waLoaded}
              />
            </Field>
            <Field label="Jadwal Pengiriman Laporan Harian">
              <Select value={String(scheduleHour)} onChange={(e) => setScheduleHour(Number(e.target.value))}>
                {SCHEDULE_OPTIONS.map((o) => (
                  <option key={o.utcHour} value={o.utcHour}>{o.label}</option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="mt-4 flex gap-2">
            <Button full onClick={saveWASettings} disabled={savingWA || !waLoaded}>
              <Settings2 size={15} /> {savingWA ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </Button>
            <Button variant="ghost" full onClick={sendNow} disabled={sending}>
              <Send size={15} /> {sending ? 'Mengirim...' : 'Kirim Sekarang'}
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-ink-soft">"Kirim Sekarang" mengirim laporan harian hari ini ke nomor yang tersimpan di Vercel (bukan yang baru diketik).</p>
        </Card>

        {/* ── Pengguna ── */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
              <Users size={16} className="text-lilac-400" /> Pengguna Aktif
            </h2>
            <button onClick={loadUsers} className="flex items-center gap-1 text-xs text-ink-soft hover:text-ink">
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
          {loadingUsers ? <p className="text-sm text-ink-soft">Memuat...</p>
            : users.length === 0 ? <EmptyState icon={<Users size={28} />} title="Belum ada pengguna" />
            : (
              <div className="space-y-2">
                {users.map((u) => (
                  <Card key={u.id} tight className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 flex-none items-center justify-center rounded-full text-xs font-bold ${ROLE_COLOR[u.role]}`}>
                      {(u.display_name || u.user_id).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink">{u.display_name || 'Tanpa nama'}</p>
                      <p className="font-mono text-[10px] text-ink-soft">{u.user_id.slice(0, 8)}...</p>
                    </div>
                    <select value={u.role} onChange={(e) => handleChangeRole(u, e.target.value)}
                      className="rounded-lg border border-lilac-200 bg-white px-2 py-1 text-xs font-bold text-ink">
                      <option value="owner">Owner</option>
                      <option value="admin">Admin</option>
                      <option value="kasir">Kasir</option>
                    </select>
                    <button onClick={() => setDeleteTarget(u)}
                      className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-rose-100 text-rose-500">
                      <Trash2 size={13} />
                    </button>
                  </Card>
                ))}
              </div>
            )}
        </div>

        {/* ── Tambah user ── */}
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-display text-base font-bold text-ink">
            <UserPlus size={16} className="text-lilac-400" /> Tambah Pengguna
          </h2>
          <div className="mb-3 rounded-xl bg-lilac-50 p-3 text-[11px] leading-relaxed text-ink-soft">
            <strong className="text-ink">Cara:</strong> Buka Supabase → Authentication → Users → Invite user → masukkan email. Setelah mereka aktivasi, copy UUID dari kolom UID dan paste di bawah.
          </div>
          <form onSubmit={handleAddUser} className="space-y-3">
            <Field label="User ID (UUID dari Supabase) *">
              <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="font-mono text-sm" />
            </Field>
            <Field label="Nama tampilan">
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Cth: Ibu, Kak Sari" />
            </Field>
            <Field label="Role">
              <Select value={newRole} onChange={(e) => setNewRole(e.target.value as any)}>
                <option value="kasir">Kasir — input penjualan saja</option>
                <option value="admin">Admin — kelola produk, stok, riwayat</option>
              </Select>
            </Field>
            <Button type="submit" full disabled={savingUser}>
              <ShieldCheck size={16} /> {savingUser ? 'Menyimpan...' : 'Tambahkan Pengguna'}
            </Button>
          </form>
        </Card>

        {/* Role legend */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-ink-soft">Penjelasan Role</h2>
          {Object.entries(ROLE_LABEL).map(([k, label]) => (
            <div key={k} className="flex items-center gap-3">
              <span className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-bold ${ROLE_COLOR[k]}`}>{label}</span>
              <span className="text-xs text-ink-soft">{ROLE_DESC[k]}</span>
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteUser}
        title="Cabut Akses Pengguna"
        message={`Cabut akses "${deleteTarget?.display_name || deleteTarget?.user_id}"?`}
        danger
      />
    </RoleGuard>
  );
}
