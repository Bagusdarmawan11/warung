'use client';

import { useRole, type UserRole } from '@/lib/RoleContext';
import { ShieldAlert } from 'lucide-react';

interface Props {
  requires: 'kasir' | 'admin' | 'owner';
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

const LEVEL: Record<string, number> = { kasir: 1, admin: 2, owner: 3 };

export function RoleGuard({ requires, children, fallback }: Props) {
  const { role, loading } = useRole();

  if (loading) return null;

  if (!role || LEVEL[role] < LEVEL[requires]) {
    return fallback ?? (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert size={36} className="mb-3 text-rose-400" />
        <p className="font-display text-lg font-bold text-ink">Akses Terbatas</p>
        <p className="mt-1 text-sm text-ink-soft">Kamu tidak punya izin untuk melihat halaman ini.</p>
      </div>
    );
  }

  return <>{children}</>;
}
