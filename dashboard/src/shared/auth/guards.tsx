import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { ExternalLink, ShieldAlert } from 'lucide-react';
import type { Role } from '../api/types';
import { APP_LABELS, APP_URLS, type AppId } from '../config';
import { Button } from '../components/ui/Button';
import { Center, Spinner } from '../components/ui/misc';
import { useAuth } from './AuthContext';
import { ROLES_BY_APP, homeAppFor, roleAllowed } from './roles';

/**
 * Origin-level gate. Signed-in users whose role belongs to the *other* console
 * are shown a way across rather than a broken shell.
 *
 * This is defence in depth, not the security boundary — the API enforces roles
 * and tenant scoping server-side regardless of which build made the call.
 */
export function AppGuard({ app, children }: { app: AppId; children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Center>
        <Spinner />
      </Center>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!roleAllowed(user.role, ROLES_BY_APP[app])) {
    return <WrongConsole app={app} role={user.role} />;
  }
  return <>{children}</>;
}

function WrongConsole({ app, role }: { app: AppId; role: Role }) {
  const { logout } = useAuth();
  const correct = homeAppFor(role);

  return (
    <div className="flex min-h-full items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-md rounded-xl2 border border-line bg-surface p-8 shadow-card">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <h1 className="mt-5 text-xl font-bold tracking-tight">Wrong console</h1>
        <p className="mt-2 text-sm text-ink-soft">
          You are signed in to the <span className="font-medium">{APP_LABELS[app]}</span>, but
          your account has the <span className="font-medium">{role}</span> role.
        </p>

        {correct ? (
          <>
            <p className="mt-3 text-sm text-ink-soft">
              {correct === 'client'
                ? 'Seller accounts sign in at the seller console.'
                : 'Platform staff accounts sign in at the admin console.'}
            </p>
            <a href={APP_URLS[correct]} className="mt-5 block">
              <Button className="w-full">
                Go to {APP_LABELS[correct]}
                <ExternalLink className="h-4 w-4" />
              </Button>
            </a>
          </>
        ) : (
          <p className="mt-3 text-sm text-ink-soft">
            This role is not assigned to either console. Contact your administrator.
          </p>
        )}

        <Button variant="ghost" className="mt-2 w-full" onClick={logout}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

/** Route-level gate for pages only some roles inside a console may open. */
export function RequireRole({
  allow,
  children,
}: {
  allow: readonly Role[];
  children: ReactNode;
}) {
  const { user } = useAuth();
  if (!user) return null;
  if (!roleAllowed(user.role, allow)) return <NoAccess role={user.role} />;
  return <>{children}</>;
}

function NoAccess({ role }: { role: Role }) {
  return (
    <div className="rounded-xl2 border border-line bg-surface p-8 text-center shadow-card">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-canvas text-muted">
        <ShieldAlert className="h-5 w-5" />
      </div>
      <p className="mt-4 font-semibold text-ink">You don't have access to this page</p>
      <p className="mt-1 text-sm text-muted">
        The {role} role can't open this section. Ask an administrator if you need access.
      </p>
    </div>
  );
}
