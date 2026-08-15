import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LogOut, Settings, User } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { cn } from '../lib/cn';

function formatRole(role?: string) {
  if (!role) return 'User';
  return role
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Shared account popup (header avatar + sidebar footer).
 */
export function AccountMenu({
  align = 'right',
  placement = 'bottom',
  trigger,
}: {
  align?: 'left' | 'right';
  placement?: 'top' | 'bottom';
  trigger: ReactNode;
}) {
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="rounded-full text-left outline-none transition hover:opacity-90"
      >
        {trigger}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className={cn(
            'absolute z-50 min-w-[11.5rem] overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-pop',
            align === 'right' ? 'right-0' : 'left-0',
            placement === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2',
          )}
        >
          <MenuLink
            to="/profile"
            icon={User}
            label="Profile"
            onNavigate={() => setOpen(false)}
          />
          <MenuLink
            to="/settings"
            icon={Settings}
            label="Settings"
            onNavigate={() => setOpen(false)}
          />
          <div className="my-1 border-t border-line" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-rose-600 transition hover:bg-canvas"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({
  to,
  icon: Icon,
  label,
  onNavigate,
}: {
  to: string;
  icon: typeof User;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      to={to}
      role="menuitem"
      onClick={onNavigate}
      className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-ink transition hover:bg-canvas"
    >
      <Icon className="h-4 w-4 text-muted" />
      {label}
    </Link>
  );
}

export { formatRole };
