'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';
import { User } from '@/types';

export function useAuth() {
  const { user, isAuthenticated, isLoading, setUser, setLoading, clearUser } =
    useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (user) return;

    api
      .get<User>('/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => {
        clearUser();
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // proceed regardless
    } finally {
      clearUser();
      router.push('/login');
    }
  }, [clearUser, router]);

  return { user, isAuthenticated, isLoading, logout };
}