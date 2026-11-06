import type { AdminUser } from '../types';

/**
 * Session storage after the round-6 security change: the ACCESS TOKEN is an
 * HttpOnly cookie set by the backend — it never touches JavaScript, so there
 * is nothing here to store or steal. Only the display profile (name/email for
 * the header) is cached in localStorage, and the server remains the source of
 * truth via GET /auth/me on every page load.
 *
 * CSRF double submit: the readable `abrit_csrf` cookie must be echoed in the
 * X-CSRF-Token header on every state-changing request (client.ts does this).
 */

const ADMIN_STORAGE_KEY = 'abrit.admin';
const CSRF_COOKIE_NAME = 'abrit_csrf';

function safeGetItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode, quota) — profile simply won't persist.
  }
}

function safeRemoveItem(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export const adminStorage = {
  get(): AdminUser | null {
    const raw = safeGetItem(ADMIN_STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as AdminUser;
      return typeof parsed.id === 'string' && typeof parsed.email === 'string' ? parsed : null;
    } catch {
      return null;
    }
  },
  set(admin: AdminUser): void {
    safeSetItem(ADMIN_STORAGE_KEY, JSON.stringify(admin));
  },
  clear(): void {
    safeRemoveItem(ADMIN_STORAGE_KEY);
  },
};

/** Reads the CSRF double-submit token the backend set alongside the session. */
export function getCsrfToken(): string | null {
  try {
    const cookies = window.document.cookie.split(';');
    for (const part of cookies) {
      const [key, ...rest] = part.trim().split('=');
      if (key === CSRF_COOKIE_NAME) return decodeURIComponent(rest.join('='));
    }
  } catch {
    // no document access — the interceptor will just omit the header
  }
  return null;
}

/** Clears the cached profile (the HttpOnly cookie is cleared server-side). */
export function clearSession(): void {
  adminStorage.clear();
}
