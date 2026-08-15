import { useAuth } from '../auth/AuthContext';
import { formatRole } from '../layout/AccountMenu';
import { Card } from '../components/ui/Card';
import { Avatar } from '../components/ui/misc';

/** Basic account profile for both consoles. */
export default function Profile() {
  const { user } = useAuth();
  const name = user?.fullName?.trim() || '—';

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="hidden text-xl font-bold tracking-tight text-ink md:block">Profile</h1>
        <p className="mt-0.5 text-sm text-muted">Your account details.</p>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-4">
          <Avatar name={name === '—' ? 'U' : name} />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-ink">{name}</p>
            <p className="truncate text-sm text-muted">{user?.email ?? '—'}</p>
          </div>
        </div>

        <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl border border-line px-3 py-2.5">
            <dt className="text-2xs font-semibold uppercase tracking-wider text-muted">Role</dt>
            <dd className="mt-0.5 font-medium text-ink">{formatRole(user?.role)}</dd>
          </div>
          <div className="rounded-xl border border-line px-3 py-2.5">
            <dt className="text-2xs font-semibold uppercase tracking-wider text-muted">Phone</dt>
            <dd className="mt-0.5 font-medium text-ink">{user?.phone || '—'}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
