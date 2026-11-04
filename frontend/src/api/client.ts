import axios, { AxiosError, type AxiosInstance } from 'axios';
import { clearSession, tokenStorage } from './token';

export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

export const WS_BASE_URL: string = import.meta.env.VITE_WS_URL ?? 'http://localhost:3000';

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20_000,
});

// Attach the bearer token (if any) to every request.
api.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Any 401 (except wrong credentials on the login endpoint itself) ends the
// session: clear persisted state and hard-redirect to /login.
api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (error instanceof AxiosError && error.response?.status === 401) {
      const requestUrl = error.config?.url ?? '';
      const isLoginRequest = requestUrl.includes('/auth/login');
      const onLoginPage = window.location.pathname.startsWith('/login');
      clearSession();
      if (!isLoginRequest && !onLoginPage) {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  },
);

/**
 * Extracts a human-readable message from an axios/API error.
 * NestJS sends `{ message: string | string[] }` on failures.
 */
export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data as { message?: unknown; error?: unknown } | undefined;
    const raw = data?.message ?? data?.error;
    if (typeof raw === 'string' && raw.length > 0) return raw;
    if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') return raw.join('; ');
    if (error.code === 'ECONNABORTED') return 'Request timed out. Is the backend running?';
    if (error.response) {
      return `Request failed with status ${error.response.status}.`;
    }
    if (error.request) {
      return 'No response from the server. Is the backend running?';
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
