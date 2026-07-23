import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { APP_URLS, type AppId } from '../config';

// Dev-only convenience. Never rendered in a production build.
const DEV_CREDENTIALS = { email: 'athanas@devicelock.test', password: 'Athanas@2015' };

export default function Login({
  app,
  brand,
}: {
  app: AppId;
  brand: { name: string; tag: string; icon: LucideIcon };
}) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const BrandIcon = brand.icon;

  const [email, setEmail] = useState(import.meta.env.DEV ? DEV_CREDENTIALS.email : '');
  const [password, setPassword] = useState(
    import.meta.env.DEV ? DEV_CREDENTIALS.password : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const otherApp: AppId = app === 'admin' ? 'client' : 'admin';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch {
      setError('Invalid email or password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-brand-50 via-canvas to-surface p-4">
      <div className="w-full max-w-md rounded-xl2 border border-line bg-surface p-8 shadow-card">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
            <BrandIcon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-bold leading-tight tracking-tight">{brand.name}</p>
            <p className="text-xs text-muted">{brand.tag}</p>
          </div>
        </div>

        <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">
          {app === 'admin'
            ? 'Sign in to manage collections across companies.'
            : 'Sign in to manage your financed devices.'}
        </p>

        {import.meta.env.DEV && (
          <p className="mt-2 rounded-xl bg-canvas px-3 py-2 text-2xs text-muted">
            Dev seed: <span className="font-medium text-ink">{DEV_CREDENTIALS.email}</span>
            {' / '}
            <span className="font-medium text-ink">{DEV_CREDENTIALS.password}</span>
          </p>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-rose-600">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-6 border-t border-line pt-4 text-center text-xs text-muted">
          {app === 'admin' ? 'Selling devices on credit?' : 'Platform staff?'}{' '}
          <a
            href={APP_URLS[otherApp]}
            className="font-medium text-brand-700 hover:underline"
          >
            {otherApp === 'client' ? 'Go to the seller console' : 'Go to the admin console'}
          </a>
        </p>
      </div>
    </div>
  );
}
