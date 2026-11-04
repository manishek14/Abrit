import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { adminStorage, tokenStorage } from '../api/token';
import type { AdminUser, LoginResponse } from '../types';

interface AuthContextValue {
  token: string | null;
  admin: AdminUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [token, setToken] = useState<string | null>(() => tokenStorage.get());
  const [admin, setAdmin] = useState<AdminUser | null>(() => adminStorage.get());

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const response = await api.post<LoginResponse>('/auth/login', { email, password });
    tokenStorage.set(response.data.accessToken);
    adminStorage.set(response.data.admin);
    setToken(response.data.accessToken);
    setAdmin(response.data.admin);
  }, []);

  const logout = useCallback((): void => {
    tokenStorage.clear();
    adminStorage.clear();
    setToken(null);
    setAdmin(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({ token, admin, login, logout }), [token, admin, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
