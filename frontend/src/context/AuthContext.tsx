import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { adminStorage, clearSession } from '../api/token';
import type { AdminUser } from '../types';

/**
 * Round-6 session model: the credential is an HttpOnly cookie the browser
 * manages — the panel only tracks whether the server considers us signed in.
 * On every page load the session is restored from GET /auth/me (cookie →
 * admin profile); there is no token in JavaScript at all.
 */
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  admin: AdminUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [admin, setAdmin] = useState<AdminUser | null>(null);

  // Restore the session from the HttpOnly cookie (single probe per page load).
  useEffect(() => {
    let alive = true;
    api
      .get<{ admin: AdminUser }>('/auth/me')
      .then((response) => {
        if (!alive) return;
        adminStorage.set(response.data.admin);
        setAdmin(response.data.admin);
        setStatus('authenticated');
      })
      .catch(() => {
        if (!alive) return;
        clearSession();
        setAdmin(null);
        setStatus('anonymous');
      });
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    // the server sets the HttpOnly session + CSRF cookies on this response
    const response = await api.post<{ admin: AdminUser }>('/auth/login', { email, password });
    adminStorage.set(response.data.admin);
    setAdmin(response.data.admin);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    // server clears both cookies; even on failure the local session is gone
    try {
      await api.post('/auth/logout');
    } catch {
      // already logged out / network gone — proceed with the local logout
    }
    clearSession();
    setAdmin(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, admin, login, logout }),
    [status, admin, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
