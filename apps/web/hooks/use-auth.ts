'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';
import { User } from '@/types';

export function useAuth() {
  const { user, isAuthenticated, isLoading, setUser, setLoading, logout } =
    useAuthStore();
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setLoading(false);
      return;
    }

    // Verify token and fetch user on mount
    api
      .get<User>('/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => {
        logout();
      });
  }, []);

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // proceed even if API fails
    } finally {
      logout();
      router.push('/login');
    }
  };

  return { user, isAuthenticated, isLoading,  handleLogout };
}