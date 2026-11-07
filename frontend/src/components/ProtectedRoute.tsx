import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Redirects unauthenticated visitors to /login, remembering the target.
 * While the session probe (/auth/me with the HttpOnly cookie) is still in
 * flight we render nothing — a page refresh must not flash the login page.
 */
export function ProtectedRoute(): JSX.Element {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <div aria-label="Checking session" />;
  }
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  return <Outlet />;
}
