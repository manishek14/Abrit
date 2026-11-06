import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { clearSession, getCsrfToken } from './token';

export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

/** In production both apps sit behind ONE nginx origin (see nginx.conf) — the
 *  build bakes VITE_WS_URL='' and the socket connects to the current origin.
 *  Dev without a Vite proxy keeps the explicit localhost:3000 default. */
function resolveWsBaseUrl(): string {
  const configured = import.meta.env.VITE_WS_URL as string | undefined;
  if (configured && configured.length > 0) return configured; // explicit override
  if (configured === '') return window.location.origin; // production build: same origin
  return 'http://localhost:3000'; // dev default
}
export const WS_BASE_URL: string = resolveWsBaseUrl();

/**
 * Round-6 session model: the backend authenticates the panel with the
 * HttpOnly `abrit_session` cookie — the browser attaches it automatically,
 * which requires credentials on every request. Mutations additionally carry
 * the double-submit CSRF header (echo of the readable abrit_csrf cookie),
 * enforced by the backend CsrfGuard.
 */
export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20_000,
  withCredentials: true,
});

// Echo the CSRF cookie on every state-changing request (GET needs nothing).
api.interceptors.request.use((config) => {
  const method = (config.method ?? 'get').toLowerCase();
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    const csrf = getCsrfToken();
    if (csrf) {
      config.headers['X-CSRF-Token'] = csrf;
    }
  }
  return config as InternalAxiosRequestConfig;
});

// Any 401 (except wrong credentials on the login endpoint itself) ends the
// session: clear cached state and hard-redirect to /login. The initial
// /auth/me probe is EXEMPT — AuthContext handles it softly so a page refresh
// shows the login route without a hard reload.
api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (error instanceof AxiosError && error.response?.status === 401) {
      const requestUrl = error.config?.url ?? '';
      const isLoginRequest = requestUrl.includes('/auth/login');
      const isSessionProbe = requestUrl.includes('/auth/me');
      const onLoginPage = window.location.pathname.startsWith('/login');
      clearSession();
      if (!isLoginRequest && !isSessionProbe && !onLoginPage) {
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
