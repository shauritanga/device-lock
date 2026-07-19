import { type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Smartphone,
  Users,
  FileText,
  CreditCard,
  ShieldCheck,
  UserCog,
  LogOut,
  Bell,
  ReceiptText,
  PhoneCall,
  WalletCards,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { Avatar } from '../ui/misc';
import { cn } from '../../lib/cn';

const mainNav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/sales', label: 'Sales', icon: ReceiptText },
  { to: '/devices', label: 'Devices', icon: Smartphone },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/loans', label: 'Loans', icon: FileText },
  { to: '/payments', label: 'Payments', icon: CreditCard },
  { to: '/call-centre', label: 'Call Centre', icon: PhoneCall },
];

const adminNav = [
  { to: '/billing', label: 'Billing', icon: WalletCards },
  { to: '/staff', label: 'Staff', icon: UserCog },
];

const subtitles: Record<string, string> = {
  Dashboard: 'Overview of your financed fleet and collections',
  Sales: 'Credit sales from customer assignment to repayment',
  Devices: 'Enrolled devices and their lock status',
  Customers: 'People financing devices with you',
  Loans: 'Financing agreements and repayment schedules',
  Payments: 'Collections and reconciliation across loans',
  'Call Centre': 'Overdue call queue, promises to pay, and escalation tracking',
  Billing: 'Subscription plan, usage bundles, and monthly invoices',
  Staff: 'Team members with access to this console',
};

function NavItem({
  to,
  label,
  icon: Icon,
  end,
}: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
}) {
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

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const title =
    [...mainNav, ...adminNav].find((n) =>
      n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to),
    )?.label ?? 'Dashboard';

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col bg-canvas px-4 py-6">
        <div className="flex items-center gap-2.5 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight">Device Lock</span>
        </div>

        <nav className="mt-8 space-y-1">
          <p className="px-3.5 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Main menu
          </p>
          {mainNav.map((n) => (
            <NavItem key={n.to} {...n} />
          ))}
        </nav>

        {user?.role === 'SUPER_ADMIN' || user?.role === 'OWNER' ? (
          <nav className="mt-8 space-y-1">
            <p className="px-3.5 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
              Account management
            </p>
            {adminNav.map((n) => (
              <NavItem key={n.to} {...n} />
            ))}
          </nav>
        ) : null}

        <button
          onClick={logout}
          className="mt-auto flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-muted transition hover:bg-white/60 hover:text-rose-600"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Log out
        </button>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden p-3 pl-0">
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl2 border border-line bg-surface shadow-card">
          <header className="flex items-center justify-between border-b border-line px-8 py-5">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
              <p className="text-sm text-muted">{subtitles[title] ?? 'Welcome to your console'}</p>
            </div>
            <div className="flex items-center gap-3">
              <button className="rounded-xl bg-canvas p-2.5 text-muted hover:text-ink">
                <Bell className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2.5 rounded-xl bg-canvas py-1.5 pl-1.5 pr-3">
                <Avatar name={user?.role ?? 'U'} />
                <div className="text-sm">
                  <p className="font-semibold leading-tight">{user?.role}</p>
                  <p className="text-xs text-muted">{user?.tenantId ? 'Tenant' : 'Platform'}</p>
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
