import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// ── Token helpers ─────────────────────────────────────────────────────────────

export const setAuthTokens = (accessToken: string, refreshToken: string) => {
  localStorage.setItem('access_token', accessToken);
  localStorage.setItem('refresh_token', refreshToken);
  // Cookie for middleware — set longer than access token so refresh can work
  // access token = 15min, cookie = 7 days (refresh token lifetime)
  document.cookie = `access_token=${accessToken}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
};

export const clearAuth = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  document.cookie = 'access_token=; path=/; max-age=0; SameSite=Lax';
};

export const getAccessToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
};

// ── Request interceptor — attach token ───────────────────────────────────────

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor — refresh on 401 ────────────────────────────────────

let isRefreshing = false;
let failedQueue: {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}[] = [];

const processQueue = (error: AxiosError | null, token: string | null) => {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token)));
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }

    original._retry = true;
    isRefreshing = true;

    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
      isRefreshing = false;
      clearAuth();
      window.location.href = '/login';
      return Promise.reject(error);
    }

    try {
      const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {
        refreshToken,
      });

      // Bug 3 fix: update BOTH localStorage AND cookie on token refresh
      setAuthTokens(data.accessToken, data.refreshToken);

      original.headers.Authorization = `Bearer ${data.accessToken}`;
      processQueue(null, data.accessToken);
      return api(original);
    } catch (refreshError) {
      processQueue(refreshError as AxiosError, null);
      clearAuth();
      window.location.href = '/login';
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);