import type { AdminUser } from '../types';

const TOKEN_STORAGE_KEY = 'abrit.accessToken';
const ADMIN_STORAGE_KEY = 'abrit.admin';

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
    // Storage unavailable (private mode, quota) — session simply won't persist.
  }
}

function safeRemoveItem(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export const tokenStorage = {
  get(): string | null {
    return safeGetItem(TOKEN_STORAGE_KEY);
  },
  set(token: string): void {
    safeSetItem(TOKEN_STORAGE_KEY, token);
  },
  clear(): void {
    safeRemoveItem(TOKEN_STORAGE_KEY);
  },
};

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

/** Clears the whole persisted session (token + cached admin profile). */
export function clearSession(): void {
  tokenStorage.clear();
  adminStorage.clear();
}
