'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type UserRole = 'owner' | 'admin' | 'kasir' | null;

interface RoleCtx {
  role: UserRole;
  loading: boolean;
  isOwner: boolean;
  isAdminOrAbove: boolean;
}

const RoleContext = createContext<RoleCtx>({ role: null, loading: true, isOwner: false, isAdminOrAbove: false });

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc('get_my_role').then(({ data, error }) => {
      if (!error) setRole((data as UserRole) || null);
      setLoading(false);
    });
  }, []);

  return (
    <RoleContext.Provider value={{
      role,
      loading,
      isOwner: role === 'owner',
      isAdminOrAbove: role === 'owner' || role === 'admin',
    }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}
