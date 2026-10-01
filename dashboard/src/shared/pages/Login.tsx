import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, type LucideIcon } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { APP_URLS, type AppId } from '../config';
import { cn } from '../lib/cn';

// Dev-only convenience. Never rendered in a production build.
const DEV_CREDENTIALS = { email: 'admin@linda.co.tz', password: 'Linda@2026' };

/** Full-bleed atmosphere for the admin console — phone retail / handset context. */
const ADMIN_HERO =
  'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=1600&q=80';

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
  const [showPassword, setShowPassword] = useState(false);

  const otherApp: AppId = app === 'admin' ? 'client' : 'admin';
  const isAdmin = app === 'admin';

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

  const form = (
    <div className={cn('w-full', isAdmin ? 'max-w-[380px]' : 'max-w-md')}>
      {!isAdmin && (
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl overflow-hidden bg-white shadow-sm border border-border p-0.5">
            <img src="/logos/logo-corrected-icon-only.jpg" alt={brand.name} className="h-full w-full object-contain rounded-lg" />
          </div>
          <div>
            <p className="text-lg font-bold leading-tight tracking-tight">{brand.name}</p>
            <p className="text-xs text-muted">{brand.tag}</p>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] overflow-hidden bg-white shadow-sm border border-border p-0.5">
            <img src="/logos/logo-corrected-icon-only.jpg" alt={brand.name} className="h-full w-full object-contain rounded-lg" />
          </div>
          <div>
            <p className="text-[15px] font-bold tracking-tight text-ink">{brand.name}</p>
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              Admin
            </p>
          </div>
        </div>
      )}

      <h1
        className={cn(
          'font-bold tracking-tight text-ink',
          isAdmin ? 'text-[28px] leading-tight' : 'text-2xl',
        )}
      >
        {isAdmin ? 'Sign in' : 'Welcome back'}
      </h1>
      <p className={cn('text-sm text-muted', isAdmin ? 'mt-2' : 'mt-1')}>
        {isAdmin
          ? 'Platform staff — collections, companies, and demo leads.'
          : 'Sign in to manage your financed devices.'}
      </p>

      {import.meta.env.DEV && (
        <p className="mt-3 rounded-xl bg-canvas px-3 py-2 text-2xs text-muted">
          Dev seed: <span className="font-medium text-ink">{DEV_CREDENTIALS.email}</span>
          {' / '}
          <span className="font-medium text-ink">{DEV_CREDENTIALS.password}</span>
        </p>
      )}

      <form onSubmit={onSubmit} className={cn('space-y-4', isAdmin ? 'mt-8' : 'mt-6')}>
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
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted transition hover:text-ink"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden />
              ) : (
                <Eye className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
        </Field>
        {error && (
          <p role="alert" className="text-sm text-rose-600">
            {error}
          </p>
        )}
        <Button
          type="submit"
          disabled={busy}
          className={cn(
            'w-full',
            isAdmin &&
              'h-11 rounded-xl bg-[#0369A1] shadow-none hover:bg-[#075985] focus-visible:ring-[#0369A1]',
          )}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p
        className={cn(
          'text-center text-xs text-muted',
          isAdmin ? 'mt-10' : 'mt-6 border-t border-line pt-4',
        )}
      >
        {isAdmin ? 'Selling devices on credit?' : 'Platform staff?'}{' '}
        <a href={APP_URLS[otherApp]} className="font-medium text-[#0369A1] hover:underline">
          {otherApp === 'client' ? 'Go to the seller console' : 'Go to the admin console'}
        </a>
      </p>
    </div>
  );

  if (!isAdmin) {
    return (
      <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-brand-50 via-canvas to-surface p-4">
        <div className="w-full max-w-md rounded-xl2 border border-line bg-surface p-8 shadow-card">
          {form}
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-full lg:grid-cols-2">
      {/* Visual plane — desktop */}
      <aside className="relative hidden overflow-hidden bg-[#0C4A6E] lg:block">
        <img
          src={ADMIN_HERO}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(165deg, rgba(8,47,73,0.88) 0%, rgba(3,105,161,0.72) 48%, rgba(8,47,73,0.92) 100%)',
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.55) 1px, transparent 0)',
            backgroundSize: '22px 22px',
          }}
          aria-hidden
        />

        <div className="relative flex h-full min-h-full flex-col justify-between p-10 xl:p-12">
          <div className="flex items-center gap-3.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white p-1 shadow-lg ring-1 ring-white/40">
              <img src="/logos/logo-corrected-icon-only.jpg" alt={brand.name} className="h-full w-full object-contain rounded-lg" />
            </span>
            <div>
              <p className="text-[17px] font-extrabold tracking-tight text-white">
                {brand.name}
              </p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-200/90">
                Admin console
              </p>
            </div>
          </div>

          <div className="max-w-md">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-200/80">
              Platform operations
            </p>
            <h2 className="mt-3 text-[34px] font-extrabold leading-[1.15] tracking-[-0.03em] text-white xl:text-[40px]">
              Collect on time.
              <br />
              Keep every handset honest.
            </h2>
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-sky-100/85">
              Manage seller companies, demo leads, and verified collections from one place.
            </p>
          </div>

          <p className="text-[12px] text-sky-200/70">Linda · Tanzania</p>
        </div>
      </aside>

      {/* Form — right */}
      <main className="relative flex min-h-full items-center justify-center bg-surface px-6 py-12 sm:px-10">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-sky-50/80 to-transparent lg:hidden"
          aria-hidden
        />
        <div className="relative animate-[loginIn_420ms_cubic-bezier(0.16,1,0.3,1)_both]">
          {form}
        </div>
      </main>
    </div>
  );
}
