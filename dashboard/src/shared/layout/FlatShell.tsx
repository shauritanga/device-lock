import { type ReactNode, useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Bell, Moon, PanelLeft, Sun, X } from '@/shared/icons';
import { useAuth } from '../auth/AuthContext';
import { roleAllowed } from '../auth/roles';
import { Avatar } from '../components/ui/misc';
import { useTheme } from '../theme/ThemeContext';
import { cn } from '../lib/cn';
import { AccountMenu, formatRole } from './AccountMenu';
import type { NavGroup, NavItem, ShellBrand } from './AppShell';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { PageTrailProvider, usePageTrailValue } from './PageTrail';

function FlatNavLink({
  to,
  label,
  icon: Icon,
  end,
  collapsed,
  onNavigate,
}: NavItem & { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-lg px-2.5 py-2 text-[13.5px] transition-colors',
          collapsed && 'md:justify-center',
          isActive
            ? 'bg-brand-600/10 font-medium text-brand-600 dark:bg-brand-500/[0.12]'
            : 'font-[450] text-muted hover:bg-hover hover:text-ink',
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className={cn(collapsed && 'md:hidden')}>{label}</span>
    </NavLink>
  );
}

/**
 * Flat dashboard shell used by the admin console — same structure as the
 * rucky-rentals dashboard: full-height 240px sidebar with section labels and a
 * user card, 60px top bar, and a canvas-coloured content area.
 */
function FlatShellInner({
  brand,
  navGroups,
  children,
}: {
  brand: ShellBrand;
  navGroups: NavGroup[];
  children: ReactNode;
}) {
  const { user } = useAuth();
  const trail = usePageTrailValue();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const displayName = user?.fullName?.trim() || user?.email || 'User';
  const roleLabel = formatRole(user?.role);

  const groups = navGroups
    .filter((g) => roleAllowed(user?.role, g.roles))
    .map((g) => ({ ...g, items: g.items.filter((i) => roleAllowed(user?.role, i.roles)) }))
    .filter((g) => g.items.length > 0);

  const all = groups.flatMap((g) => g.items);
  const active = all
    .filter((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)))
    .sort((a, b) => b.to.length - a.to.length)[0];
  const title =
    location.pathname === '/profile'
      ? 'Profile'
      : location.pathname === '/settings'
        ? 'Settings'
        : (active?.label ?? brand.name);
  // Like rucky-rentals, the Dashboard carries the current month beside its title.
  const subtitle =
    location.pathname === '/'
      ? new Date().toLocaleDateString('en', { month: 'long', year: 'numeric' })
      : null;

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false);
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [mobileOpen]);

  const iconBtn =
    'flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-line bg-elevated text-muted transition hover:bg-hover hover:text-ink';

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-canvas">
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        id="app-sidebar"
        className={cn(
          'z-50 flex shrink-0 flex-col overflow-hidden border-r border-line bg-surface transition-[width,transform] duration-200',
          'fixed inset-y-0 left-0 w-[240px]',
          'md:static md:z-auto md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'md:w-[60px]' : 'md:w-[240px]',
        )}
      >
        <div className="flex h-[60px] shrink-0 items-center gap-2.5 border-b border-line-soft px-4">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[7px] bg-white">
            <img
              src="/logos/logo-corrected-icon-only.jpg"
              alt={brand.name}
              className="h-full w-full object-contain"
            />
          </div>
          <span
            className={cn(
              'truncate text-[15px] font-semibold tracking-[-0.3px] text-ink',
              collapsed && 'md:hidden',
            )}
          >
            {brand.name}
          </span>
          <button
            type="button"
            className="ml-auto rounded-md p-1 text-faint hover:text-ink md:hidden"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3" aria-label="Main">
          {groups.map((g) => (
            <div key={g.label} className="flex flex-col gap-0.5">
              <p
                className={cn(
                  'overflow-hidden whitespace-nowrap px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.8px] text-faint',
                  collapsed && 'md:invisible',
                )}
              >
                {g.label}
              </p>
              {g.items.map((item) => (
                <FlatNavLink
                  key={item.to}
                  {...item}
                  collapsed={collapsed}
                  onNavigate={() => setMobileOpen(false)}
                />
              ))}
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-line-soft px-2 py-3">
          <AccountMenu
            align="left"
            placement="top"
            trigger={
              <span
                className={cn(
                  'flex w-full items-center gap-2.5 overflow-hidden rounded-lg px-2.5 py-2 transition-colors hover:bg-hover',
                  collapsed && 'md:justify-center md:px-0',
                )}
              >
                <Avatar name={displayName} />
                <span className={cn('min-w-0 text-left', collapsed && 'md:hidden')}>
                  <span className="block truncate text-[13px] font-medium text-ink">{displayName}</span>
                  <span className="block truncate text-[11px] text-faint">{roleLabel}</span>
                </span>
              </span>
            }
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[60px] shrink-0 items-center gap-4 border-b border-line-soft bg-surface px-4 sm:px-7">
          <button
            type="button"
            onClick={() => (window.matchMedia('(min-width: 768px)').matches ? setCollapsed((v) => !v) : setMobileOpen(true))}
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] text-faint transition hover:bg-hover hover:text-ink"
            aria-label="Toggle navigation"
            aria-controls="app-sidebar"
          >
            <PanelLeft className="h-[18px] w-[18px]" />
          </button>
          {trail ? (
            <Breadcrumbs items={trail} variant="topbar" />
          ) : (
            <h1 className="flex min-w-0 items-baseline gap-2 truncate text-base font-semibold tracking-tight text-ink">
              {title}
              {subtitle ? (
                <span className="font-serif text-[15px] font-normal italic text-muted" style={{ fontFamily: "'Instrument Serif', serif" }}>
                  {subtitle}
                </span>
              ) : null}
            </h1>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button type="button" className={iconBtn} aria-label="Notifications">
              <Bell className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className={iconBtn}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-7">{children}</main>
      </div>
    </div>
  );
}

/**
 * Flat dashboard shell used by both consoles — same structure as the
 * rucky-rentals dashboard. Pages that drill down declare a breadcrumb with
 * `usePageTrail`, which the top bar shows in place of the title.
 */
export function FlatShell(props: {
  brand: ShellBrand;
  navGroups: NavGroup[];
  children: ReactNode;
}) {
  return (
    <PageTrailProvider>
      <FlatShellInner {...props} />
    </PageTrailProvider>
  );
}
