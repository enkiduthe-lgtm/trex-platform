'use client';
import { useEffect, useState } from 'react';
import { api } from './api';
import { orderPermissions } from './order-permissions';

export function useOrderPermissions() {
  const [permissions, setPermissions] = useState(() => orderPermissions(''));
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void api<{ user: { role: string } }>('/auth/me').then(async me => {
      const currentRole = me.user.role;
      const profile = currentRole === 'ADMIN'
        ? await api<{ configured: boolean; grants: string[] | null }>('/admin/access/me') : undefined;
      if (active) { setRole(currentRole); setPermissions(orderPermissions(currentRole, profile)); }
    }).catch(() => {
      if (active) setError('İşlem Yetkileri Yüklenemedi. Sayfayı Yenileyin.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  return { permissions, role, loading, error };
}
