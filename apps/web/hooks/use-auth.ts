'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';
import { User } from '@/types';

export function useAuth() {
  const { user, isAuthenticated, isLoading, setUser, setLoading, logout } =
    useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (user) return;

    const token = localStorage.getItem('access_token');
    if (!token) {
      setLoading(false);
      return;
    }

    api
      .get<User>('/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => {
        logout();
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // proceed regardless — backend failure shouldn't block logout
    } finally {
      logout();
      router.push('/login');
    }
  }, [logout, router]);

  return { user, isAuthenticated, isLoading, logout: handleLogout };
}