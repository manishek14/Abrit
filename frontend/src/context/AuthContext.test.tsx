import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../context/AuthContext';

/**
 * Round-6 session model: the panel holds NO token in JavaScript. The session
 * lives in an HttpOnly cookie; the context restores it via GET /auth/me,
 * login() only records the profile, logout() clears the cookie server-side.
 */

// --- axios mock (the real client hits the network; jsdom must not) ---------
vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  getApiErrorMessage: vi.fn((e: unknown) => String(e)),
  API_BASE_URL: 'http://test/api',
  WS_BASE_URL: 'http://test',
}));

import { api } from '../api/client';
const apiGet = vi.mocked(api.get);
const apiPost = vi.mocked(api.post);

const ADMIN = { id: 'a-1', email: 'admin@abrit.local', name: 'Super Admin' };

function Probe(): JSX.Element {
  const { status, admin, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="admin">{admin?.email ?? 'none'}</span>
      <button onClick={() => void login('admin@abrit.local', 'pw')}>login</button>
      <button onClick={() => void logout()}>logout</button>
    </div>
  );
}

describe('AuthContext (HttpOnly-cookie session — review round 6)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('restores the session from GET /auth/me on mount (cookie probe)', async () => {
    apiGet.mockResolvedValueOnce({ data: { admin: ADMIN } });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByTestId('status').textContent).toBe('loading');
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(screen.getByTestId('admin').textContent).toBe('admin@abrit.local');
    expect(apiGet).toHaveBeenCalledWith('/auth/me');
  });

  it('a failing /auth/me probe ends in the anonymous state', async () => {
    apiGet.mockRejectedValueOnce(new Error('401'));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
    expect(screen.getByTestId('admin').textContent).toBe('none');
  });

  it('login() records the profile and switches to authenticated — no token is ever stored', async () => {
    apiGet.mockRejectedValueOnce(new Error('401')); // start anonymous
    apiPost.mockResolvedValueOnce({ data: { admin: ADMIN } });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));

    await act(async () => {
      await userEvent.click(screen.getByText('login'));
    });

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(apiPost).toHaveBeenCalledWith('/auth/login', {
      email: 'admin@abrit.local',
      password: 'pw',
    });
    // only the DISPLAY profile may be cached — never a credential
    expect(window.localStorage.getItem('abrit.accessToken')).toBeNull();
    expect(window.localStorage.getItem('abrit.admin')).toContain('admin@abrit.local');
  });

  it('logout() calls the server (clears the HttpOnly cookie) and goes anonymous', async () => {
    apiGet.mockResolvedValueOnce({ data: { admin: ADMIN } });
    apiPost.mockResolvedValueOnce({ data: { ok: true } });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));

    await act(async () => {
      await userEvent.click(screen.getByText('logout'));
    });

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
    expect(apiPost).toHaveBeenCalledWith('/auth/logout');
    expect(screen.getByTestId('admin').textContent).toBe('none');
  });

  it('logout() succeeds locally even when the server is unreachable', async () => {
    apiGet.mockResolvedValueOnce({ data: { admin: ADMIN } });
    apiPost.mockRejectedValueOnce(new Error('network down'));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));

    await act(async () => {
      await userEvent.click(screen.getByText('logout'));
    });

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
  });
});
