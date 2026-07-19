import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  // Matches prisma/seed.ts platform admin (seed wipes old owner.a@acme.test).
  const [email, setEmail] = useState('athanas@devicelock.test');
  const [password, setPassword] = useState('Athanas@2015');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate('/');
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
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-bold tracking-tight">Device Lock</p>
            <p className="text-xs text-muted">Financing console</p>
          </div>
        </div>

        <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">
          Sign in to manage your financed devices.
        </p>
        <p className="mt-2 rounded-xl bg-canvas px-3 py-2 text-2xs text-muted">
          After seed: <span className="font-medium text-ink">athanas@devicelock.test</span>
          {' / '}
          <span className="font-medium text-ink">Athanas@2015</span>
        </p>

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
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  );
}
