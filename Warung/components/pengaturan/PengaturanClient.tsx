'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Users, UserPlus, Trash2, ShieldCheck, RefreshCw, Send, Settings2, UploadCloud, MessageCircle } from 'lucide-react';
import { Card, Field, Input, Select, Button, EmptyState } from '@/components/ui';
import { ConfirmDialog } from '@/components/Modal';
import { RoleGuard } from '@/components/RoleGuard';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

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


export function PengaturanClient() {
  // ── User management ──
  const [users, setUsers] = useState<UserRoleRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userId, setUserId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'kasir'>('kasir');
  const [savingUser, setSavingUser] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRoleRow | null>(null);
  // Invite via email
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteDisplayName, setInviteDisplayName] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'kasir'>('kasir');
  const [inviting, setInviting] = useState(false);

  // ── WA Report settings ──
  const [fonntTarget, setFonnteTarget] = useState('');
  const [scheduleWib, setScheduleWib] = useState('00:00');
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
    const { data } = await supabase.from('app_settings').select('key,value').in('key', ['fonnte_target', 'report_schedule_wib']);
    if (data) {
      const t = data.find((r: any) => r.key === 'fonnte_target');
      const s = data.find((r: any) => r.key === 'report_schedule_wib');
      if (t) setFonnteTarget(t.value);
      if (s) setScheduleWib(s.value || '00:00');
    }
    setWaLoaded(true);
  }

  useEffect(() => { loadUsers(); loadWASettings(); }, []);

  async function handleInviteByEmail() {
    if (!inviteEmail.trim()) { toast.error('Isi email terlebih dahulu'); return; }
    setInviting(true);
    try {
      const res = await fetch('/api/settings/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole, displayName: inviteDisplayName.trim() }),
      });
      const data = await res.json();
      if (!data.ok) { toast.error(data.error); return; }
      toast.success(`Undangan berhasil dikirim ke ${inviteEmail}! Mereka akan dapat email untuk aktivasi.`);
      setInviteEmail(''); setInviteDisplayName('');
      loadUsers();
    } finally { setInviting(false); }
  }

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
    // Validasi format jam HH:MM
    if (!/^\d{1,2}:\d{2}$/.test(scheduleWib)) { toast.error('Format jam harus HH:MM, contoh: 00:30 atau 07:00'); return; }
    const [h, m] = scheduleWib.split(':').map(Number);
    if (h < 0 || h > 23 || m < 0 || m > 59) { toast.error('Jam tidak valid (00:00–23:59)'); return; }

    setSavingWA(true);
    try {
      await supabase.from('app_settings').upsert([
        { key: 'fonnte_target', value: fonntTarget.trim() },
        { key: 'report_schedule_wib', value: scheduleWib },
      ], { onConflict: 'key' });
      toast.success(`Pengaturan disimpan! Laporan akan dikirim tiap hari jam ${scheduleWib} WIB.`);
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
            <MessageCircle size={16} className="text-mint-500" /> Laporan WhatsApp Otomatis
          </h2>

          <div className="mb-3 rounded-xl bg-lilac-50 p-3 text-[11px] leading-relaxed text-ink-soft">
            Nomor target bisa diisi lebih dari satu, pisah koma. Contoh: <span className="font-mono font-bold">6281234567890,6289876543210</span><br />
            Untuk group WhatsApp, masukkan Group ID dari dashboard Fonnte (format: <span className="font-mono">xxxx@g.us</span>).<br />
            <span className="text-mint-600 font-bold">✅ Nomor yang disimpan di sini langsung aktif — tidak perlu Redeploy.</span>
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
            <Field label="Jam Pengiriman Laporan Harian (WIB)" hint="Format 24 jam: HH:MM — contoh 00:30 untuk jam 12:30 malam, 07:00 untuk jam 7 pagi">
              <Input
                value={scheduleWib}
                onChange={(e) => setScheduleWib(e.target.value)}
                placeholder="00:00"
                maxLength={5}
                disabled={!waLoaded}
              />
            </Field>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button full onClick={saveWASettings} disabled={savingWA || !waLoaded}>
              <Settings2 size={15} /> {savingWA ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </Button>
            <Button variant="ghost" full onClick={sendNow} disabled={sending}>
              <Send size={15} /> {sending ? 'Mengirim...' : 'Kirim Sekarang'}
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-ink-soft">
            Laporan otomatis dikirim tiap hari tepat di jam yang kamu set. Perubahan jam langsung aktif tanpa perlu redeploy.
            "Kirim Sekarang" selalu mengirim laporan hari ini segera.
          </p>
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
            <UserPlus size={16} className="text-lilac-400" /> Undang Pengguna Baru
          </h2>

          {/* Cara 1: Undang via email (otomatis) */}
          <div className="mb-4">
            <p className="mb-2 text-[11px] font-bold text-ink">Undang via Email (Direkomendasikan)</p>
            <p className="mb-3 text-[11px] text-ink-soft">Sistem akan mengirim email undangan. Setelah mereka klik link dan buat password, akses langsung aktif.</p>
            <div className="space-y-2">
              <Field label="Email yang akan diundang *">
                <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="contoh@gmail.com" />
              </Field>
              <Field label="Nama tampilan">
                <Input value={inviteDisplayName} onChange={(e) => setInviteDisplayName(e.target.value)} placeholder="Cth: Ibu, Kak Sari" />
              </Field>
              <Field label="Role">
                <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as any)}>
                  <option value="kasir">Kasir — input penjualan saja</option>
                  <option value="admin">Admin — kelola produk, stok, riwayat</option>
                </Select>
              </Field>
              <Button full onClick={handleInviteByEmail} disabled={inviting}>
                <Send size={15} /> {inviting ? 'Mengirim undangan...' : 'Kirim Undangan Email'}
              </Button>
            </div>
          </div>

          <div className="my-3 flex items-center gap-3">
            <div className="flex-1 border-t border-lilac-100" />
            <span className="text-[11px] text-ink-soft">atau manual (kalau email tidak tersedia)</span>
            <div className="flex-1 border-t border-lilac-100" />
          </div>

          {/* Cara 2: Manual via UUID */}
          <div className="mb-1 rounded-xl bg-lilac-50 p-3 text-[11px] text-ink-soft">
            Buka Supabase → Authentication → Users → copy UUID dari kolom UID → paste di bawah.
          </div>
          <form onSubmit={handleAddUser} className="space-y-2 mt-2">
            <Field label="User ID (UUID dari Supabase)">
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
              <ShieldCheck size={16} /> {savingUser ? 'Menyimpan...' : 'Tambahkan via UUID'}
            </Button>
          </form>
        </Card>

        {/* ── Import CSV ── */}
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-display text-base font-bold text-ink">
            <UploadCloud size={16} className="text-lilac-400" /> Import Data (CSV)
          </h2>
          <p className="mb-3 text-[11px] text-ink-soft">Import data produk & transaksi lama dari file CSV. Hanya owner yang bisa mengakses fitur ini.</p>
          <Link href="/import">
            <Button full variant="ghost">
              <UploadCloud size={15} /> Buka Halaman Import CSV
            </Button>
          </Link>
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
