import { type ReactNode, useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Bell,
  Moon,
  PanelLeft,
  Sun,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { roleAllowed } from '../auth/roles';
import { Avatar } from '../components/ui/misc';
import { useTheme } from '../theme/ThemeContext';
import { cn } from '../lib/cn';
import { AccountMenu, formatRole } from './AccountMenu';

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Exact match only — use for the index route. */
  end?: boolean;
  /** Optional description — not shown in the header. */
  subtitle?: string;
  /** Omit to show the item to every role in this console. */
  roles?: readonly Role[];
};

export type NavGroup = {
  label: string;
  items: NavItem[];
  roles?: readonly Role[];
};

export type ShellBrand = {
  name: string;
  tag: string;
  icon: LucideIcon;
};

function NavItemLink({
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
          'flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition',
          collapsed && 'md:justify-center md:px-2.5',
          isActive
            ? 'bg-surface text-brand-700 shadow-card'
            : 'text-muted hover:bg-surface/60 hover:text-ink',
        )
      }
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      <span className={cn(collapsed && 'md:hidden')}>{label}</span>
    </NavLink>
  );
}

/**
 * One shell, two consoles. Each app supplies its own brand line and nav groups;
 * items are filtered by the signed-in role so nobody sees a link they can't open.
 *
 * Mobile: off-canvas drawer. Desktop: collapsible sidebar.
 */
export function AppShell({
  brand,
  navGroups,
  children,
}: {
  brand: ShellBrand;
  navGroups: NavGroup[];
  children: ReactNode;
}) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const BrandIcon = brand.icon;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const displayName = user?.fullName?.trim() || user?.email || 'User';
  const roleLabel = formatRole(user?.role);

  const visibleGroups = navGroups
    .filter((g) => roleAllowed(user?.role, g.roles))
    .map((g) => ({ ...g, items: g.items.filter((i) => roleAllowed(user?.role, i.roles)) }))
    .filter((g) => g.items.length > 0);

  const allItems = visibleGroups.flatMap((g) => g.items);
  // Longest matching path wins so "/collections/reports" doesn't resolve to "/".
  const active = allItems
    .filter((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)))
    .sort((a, b) => b.to.length - a.to.length)[0];

  const pageTitle =
    location.pathname === '/profile'
      ? 'Profile'
      : location.pathname === '/settings'
        ? 'Settings'
        : active?.label ?? brand.name;

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileNavOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileNavOpen]);

  return (
    <div className="flex h-full min-h-0">
      {mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm md:hidden"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <aside
        id="app-sidebar"
        className={cn(
          'flex shrink-0 flex-col bg-canvas py-5 transition-[width,transform] duration-200',
          'fixed inset-y-0 left-0 z-50 w-[min(18rem,88vw)] px-4',
          'md:static md:z-auto md:translate-x-0',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
          sidebarCollapsed ? 'md:w-[72px] md:px-2' : 'md:w-64 md:px-4 md:py-6',
        )}
      >
        <div
          className={cn(
            'flex items-center gap-2.5',
            sidebarCollapsed ? 'md:justify-center md:px-0' : 'px-2',
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl overflow-hidden bg-white shadow-sm border border-border p-0.5">
            <img src="/logos/logo-corrected-icon-only.jpg" alt={brand.name} className="h-full w-full object-contain rounded-lg" />
          </div>
          <div className={cn('min-w-0 flex-1', sidebarCollapsed && 'md:hidden')}>
            <p className="truncate text-lg font-bold leading-tight tracking-tight">
              {brand.name}
            </p>
            <p className="truncate text-2xs text-muted">{brand.tag}</p>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-muted transition hover:text-ink md:hidden"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="mt-6 flex-1 space-y-1 overflow-y-auto md:mt-8" aria-label="Main">
          {visibleGroups.flatMap((group) =>
            group.items.map((item) => (
              <NavItemLink
                key={item.to}
                {...item}
                collapsed={sidebarCollapsed}
                onNavigate={() => setMobileNavOpen(false)}
              />
            )),
          )}
        </nav>

        <div
          className={cn(
            'mt-4',
            sidebarCollapsed && 'md:flex md:justify-center',
          )}
        >
          <AccountMenu
            align="left"
            placement="top"
            trigger={
              <span
                className={cn(
                  'flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2 py-2 transition hover:bg-surface/70',
                  sidebarCollapsed && 'md:justify-center md:px-0',
                )}
              >
                <Avatar name={displayName} />
                <span
                  className={cn(
                    'min-w-0 text-left',
                    sidebarCollapsed && 'md:hidden',
                  )}
                >
                  <span className="block truncate text-sm font-semibold text-ink">
                    {displayName}
                  </span>
                  <span className="block truncate text-xs text-muted">{roleLabel}</span>
                </span>
              </span>
            }
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden md:p-3 md:pl-0">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface md:rounded-xl2 md:border md:border-line md:shadow-card">
          <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3.5 sm:px-6 sm:py-4 md:px-8 md:py-5">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="rounded-lg p-2 text-muted transition hover:text-ink md:hidden"
                aria-label="Open navigation"
                aria-controls="app-sidebar"
                aria-expanded={mobileNavOpen}
              >
                <PanelLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setSidebarCollapsed((v) => !v)}
                className="hidden rounded-lg p-1.5 text-muted transition hover:text-ink md:inline-flex"
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-expanded={!sidebarCollapsed}
              >
                <PanelLeft className="h-5 w-5" />
              </button>
              <h1 className="truncate text-lg font-bold tracking-tight sm:text-xl md:text-2xl">
                {pageTitle}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
              <button
                type="button"
                className="rounded-lg p-2 text-muted transition hover:text-ink"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={toggleTheme}
                className="rounded-lg p-2 text-muted transition hover:text-ink"
                aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              >
                {theme === 'dark' ? (
                  <Sun className="h-5 w-5" />
                ) : (
                  <Moon className="h-5 w-5" />
                )}
              </button>
              <AccountMenu
                align="right"
                placement="bottom"
                trigger={<Avatar name={displayName} />}
              />
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-canvas/40 p-4 sm:p-6 md:p-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
