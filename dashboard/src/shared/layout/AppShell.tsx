import { type ReactNode, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Bell,
  Moon,
  PanelLeft,
  Sun,
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
}: NavItem & { collapsed: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition',
          collapsed && 'justify-center px-2.5',
          isActive
            ? 'bg-surface text-brand-700 shadow-card'
            : 'text-muted hover:bg-surface/60 hover:text-ink',
        )
      }
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed ? label : null}
    </NavLink>
  );
}

/**
 * One shell, two consoles. Each app supplies its own brand line and nav groups;
 * items are filtered by the signed-in role so nobody sees a link they can't open.
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

  return (
    <div className="flex h-full">
      <aside
        className={cn(
          'flex shrink-0 flex-col bg-canvas py-6 transition-[width] duration-200',
          sidebarCollapsed ? 'w-[72px] px-2' : 'w-64 px-4',
        )}
      >
        <div
          className={cn(
            'flex items-center gap-2.5',
            sidebarCollapsed ? 'justify-center px-0' : 'px-2',
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
            <BrandIcon className="h-5 w-5" />
          </div>
          {!sidebarCollapsed ? (
            <div className="min-w-0">
              <p className="truncate text-lg font-bold leading-tight tracking-tight">
                {brand.name}
              </p>
              <p className="truncate text-2xs text-muted">{brand.tag}</p>
            </div>
          ) : null}
        </div>

        <div className="mt-8 flex-1 space-y-1 overflow-y-auto">
          {visibleGroups.flatMap((group) =>
            group.items.map((item) => (
              <NavItemLink
                key={item.to}
                {...item}
                collapsed={sidebarCollapsed}
              />
            )),
          )}
        </div>

        <div className={cn('mt-4', sidebarCollapsed ? 'flex justify-center' : '')}>
          <AccountMenu
            align="left"
            placement="top"
            trigger={
              <span
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-xl px-2 py-2 transition hover:bg-surface/70',
                  sidebarCollapsed && 'justify-center px-0',
                )}
              >
                <Avatar name={displayName} />
                {!sidebarCollapsed ? (
                  <span className="min-w-0 text-left">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {displayName}
                    </span>
                    <span className="block truncate text-xs text-muted">{roleLabel}</span>
                  </span>
                ) : null}
              </span>
            }
          />
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden p-3 pl-0">
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl2 border border-line bg-surface shadow-card">
          <header className="flex items-center justify-between border-b border-line px-8 py-5">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarCollapsed((v) => !v)}
                className="rounded-lg p-1.5 text-muted transition hover:text-ink"
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-expanded={!sidebarCollapsed}
              >
                <PanelLeft className="h-5 w-5" />
              </button>
              <h1 className="text-2xl font-bold tracking-tight">
                {pageTitle}
              </h1>
            </div>
            <div className="flex items-center gap-1.5">
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

          <main className="flex-1 overflow-y-auto bg-canvas/40 p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
