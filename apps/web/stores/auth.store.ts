import { create } from 'zustand';
import { User } from '@/types';
import { clearAuth } from '@/lib/api';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user) =>
    set({ user, isAuthenticated: true, isLoading: false }),

  setLoading: (isLoading) => set({ isLoading }),

  logout: () => {
    clearAuth();
    set({ user: null, isAuthenticated: false, isLoading: false });
  },
}));