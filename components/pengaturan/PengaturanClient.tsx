'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Users, UserPlus, Trash2, ShieldCheck, RefreshCw } from 'lucide-react';
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
  email?: string;
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  kasir: 'Kasir',
};

const ROLE_DESC: Record<string, string> = {
  owner: 'Akses penuh + kelola user',
  admin: 'Kelola produk, stok, riwayat, laporan',
  kasir: 'Input penjualan saja',
};

const ROLE_COLOR: Record<string, string> = {
  owner: 'bg-peach-100 text-peach-600',
  admin: 'bg-lilac-100 text-lilac-600',
  kasir: 'bg-mint-100 text-mint-700',
};

export function PengaturanClient() {
  const [users, setUsers] = useState<UserRoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'kasir'>('kasir');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRoleRow | null>(null);
  const supabase = createClient();

  async function loadUsers() {
    setLoading(true);
    try {
      const { data } = await supabase.from('user_roles').select('*').order('created_at');
      setUsers((data as UserRoleRow[]) || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { toast.error('Isi email terlebih dahulu'); return; }
    setSaving(true);
    try {
      // Cari user_id berdasarkan email lewat fungsi signUp (tanpa password = invite link)
      // Cara paling sederhana tanpa admin API: minta user daftar dulu, lalu owner assign role
      // Di sini kita pakai pendekatan manual: owner ketik user_id atau email
      // Untuk MVP, owner invite user lewat Supabase Dashboard, lalu assign role di sini
      toast.error('Undang user dulu lewat Supabase Dashboard (Authentication → Users → Invite user), lalu masukkan user_id-nya di bawah');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddByUserId(e: React.FormEvent) {
    e.preventDefault();
    const userId = email.trim();
    if (!userId) { toast.error('Isi User ID terlebih dahulu'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('user_roles').insert({
        user_id: userId,
        role: newRole,
        display_name: displayName.trim() || null,
      });
      if (error) {
        if (error.code === '23505') toast.error('User ini sudah punya role. Hapus dulu sebelum mengubah.');
        else toast.error(error.message);
        return;
      }
      toast.success(`User berhasil ditambahkan sebagai ${ROLE_LABEL[newRole]}`);
      setEmail('');
      setDisplayName('');
      loadUsers();
    } finally {
      setSaving(false);
    }
  }

  async function handleChangeRole(u: UserRoleRow, newRoleVal: string) {
    const { error } = await supabase.from('user_roles').update({ role: newRoleVal }).eq('id', u.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Role berhasil diubah');
    loadUsers();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from('user_roles').delete().eq('id', deleteTarget.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Akses user berhasil dicabut');
    setDeleteTarget(null);
    loadUsers();
  }

  return (
    <RoleGuard requires="owner">
      <div className="animate-slide-up">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-extrabold text-ink">Pengaturan Pengguna</h1>
          <p className="text-sm text-ink-soft">Kelola siapa saja yang bisa mengakses sistem kasir warung ini.</p>
        </div>

        {/* Daftar user aktif */}
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-ink"><Users size={16} className="mr-1.5 inline text-lilac-400" /> Pengguna Aktif</h2>
            <button onClick={loadUsers} className="flex items-center gap-1 text-xs text-ink-soft hover:text-ink">
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
          {loading ? (
            <p className="text-sm text-ink-soft">Memuat...</p>
          ) : users.length === 0 ? (
            <EmptyState icon={<Users size={28} />} title="Belum ada pengguna terdaftar" />
          ) : (
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
                  <select
                    value={u.role}
                    onChange={(e) => handleChangeRole(u, e.target.value)}
                    className="rounded-lg border border-lilac-200 bg-white px-2 py-1 text-xs font-bold text-ink"
                  >
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="kasir">Kasir</option>
                  </select>
                  <button
                    onClick={() => setDeleteTarget(u)}
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-rose-100 text-rose-500"
                    title="Cabut akses"
                  >
                    <Trash2 size={13} />
                  </button>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Tambah user baru */}
        <Card>
          <h2 className="mb-4 font-display text-base font-bold text-ink"><UserPlus size={16} className="mr-1.5 inline text-lilac-400" /> Tambah Pengguna</h2>

          <div className="mb-4 rounded-xl bg-lilac-50 p-3 text-[11px] leading-relaxed text-ink-soft">
            <p className="font-bold text-ink">Cara menambahkan pengguna baru:</p>
            <p className="mt-1">1. Buka <strong>Supabase Dashboard</strong> → <strong>Authentication</strong> → <strong>Users</strong> → klik <strong>"Invite user"</strong> → masukkan email ibu/kakak kamu.</p>
            <p className="mt-1">2. Mereka akan dapat link aktivasi di email. Setelah klik & buat password, buka kembali halaman ini.</p>
            <p className="mt-1">3. Di Supabase Dashboard → Authentication → Users, cari user baru itu → copy <strong>UUID</strong>-nya (kolom UID).</p>
            <p className="mt-1">4. Paste UUID di bawah, pilih role, lalu klik Tambahkan.</p>
          </div>

          <form onSubmit={handleAddByUserId} className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <Field label="User ID (UUID dari Supabase) *" full>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="font-mono text-sm" />
            </Field>
            <Field label="Nama tampilan">
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Cth: Ibu, Kak Sari" />
            </Field>
            <Field label="Role / Hak akses">
              <Select value={newRole} onChange={(e) => setNewRole(e.target.value as any)}>
                <option value="kasir">Kasir — input penjualan saja</option>
                <option value="admin">Admin — kelola produk, stok, riwayat</option>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" full disabled={saving}>
                <ShieldCheck size={16} /> {saving ? 'Menyimpan...' : 'Tambahkan Pengguna'}
              </Button>
            </div>
          </form>
        </Card>

        {/* Penjelasan role */}
        <div className="mt-6 space-y-2">
          <h2 className="font-display text-sm font-bold text-ink-soft">Penjelasan Role</h2>
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
        onConfirm={handleDelete}
        title="Cabut Akses Pengguna"
        message={`Cabut akses "${deleteTarget?.display_name || deleteTarget?.user_id}"? Mereka masih bisa login tapi tidak bisa mengakses aplikasi sampai ditambahkan lagi.`}
        danger
      />
    </RoleGuard>
  );
}
