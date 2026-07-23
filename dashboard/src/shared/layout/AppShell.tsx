import { type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Bell, LogOut, type LucideIcon } from 'lucide-react';
import type { Role } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { roleAllowed } from '../auth/roles';
import { Avatar } from '../components/ui/misc';
import { cn } from '../lib/cn';

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Exact match only — use for the index route. */
  end?: boolean;
  /** Shown under the page title in the header. */
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

function NavItemLink({ to, label, icon: Icon, end }: NavItem) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition',
          isActive
            ? 'bg-surface text-brand-700 shadow-card'
            : 'text-muted hover:bg-surface/60 hover:text-ink',
        )
      }
    >
      <Icon className="h-[18px] w-[18px]" />
      {label}
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
  const { user, logout } = useAuth();
  const location = useLocation();
  const BrandIcon = brand.icon;

  const visibleGroups = navGroups
    .filter((g) => roleAllowed(user?.role, g.roles))
    .map((g) => ({ ...g, items: g.items.filter((i) => roleAllowed(user?.role, i.roles)) }))
    .filter((g) => g.items.length > 0);

  const allItems = visibleGroups.flatMap((g) => g.items);
  // Longest matching path wins so "/collections/reports" doesn't resolve to "/".
  const active = allItems
    .filter((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)))
    .sort((a, b) => b.to.length - a.to.length)[0];

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col bg-canvas px-4 py-6">
        <div className="flex items-center gap-2.5 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
            <BrandIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold leading-tight tracking-tight">
              {brand.name}
            </p>
            <p className="truncate text-2xs text-muted">{brand.tag}</p>
          </div>
        </div>

        <div className="mt-8 space-y-8 overflow-y-auto">
          {visibleGroups.map((group) => (
            <nav key={group.label} className="space-y-1">
              <p className="px-3.5 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                {group.label}
              </p>
              {group.items.map((item) => (
                <NavItemLink key={item.to} {...item} />
              ))}
            </nav>
          ))}
        </div>

        <button
          onClick={logout}
          className="mt-auto flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-muted transition hover:bg-white/60 hover:text-rose-600"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Log out
        </button>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden p-3 pl-0">
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl2 border border-line bg-surface shadow-card">
          <header className="flex items-center justify-between border-b border-line px-8 py-5">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {active?.label ?? brand.name}
              </h1>
              <p className="text-sm text-muted">{active?.subtitle ?? brand.tag}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="rounded-xl bg-canvas p-2.5 text-muted hover:text-ink"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2.5 rounded-xl bg-canvas py-1.5 pl-1.5 pr-3">
                <Avatar name={user?.role ?? 'U'} />
                <div className="text-sm">
                  <p className="font-semibold leading-tight">{user?.role}</p>
                  <p className="text-xs text-muted">
                    {user?.tenantId ? 'Company' : 'Platform'}
                  </p>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto bg-canvas/40 p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
