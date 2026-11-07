import { type ReactNode, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../theme/ThemeContext';

/** Card heading in the rucky-rentals style: title, small subtitle, quiet action link. */
export function PanelHeader({
  title,
  sub,
  to,
  action,
  right,
}: {
  title: string;
  sub?: string;
  to?: string;
  action?: string;
  /** A custom control (e.g. a button) instead of the quiet text link. */
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 pb-3.5 pt-[18px]">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold tracking-[-0.2px] text-ink">{title}</h3>
        {sub ? <p className="mt-0.5 text-xs text-faint">{sub}</p> : null}
      </div>
      {right ?? null}
      {!right && to && action ? (
        <Link to={to} className="shrink-0 text-[12.5px] font-medium text-brand-600 hover:underline">
          {action}
        </Link>
      ) : null}
    </div>
  );
}

/** Quiet empty message inside a panel. */
export function PanelEmpty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-muted">{children}</p>;
}

/** Accent colour for charts, read from the active theme so it follows light/dark. */
export function useAccent() {
  const { theme } = useTheme();
  return useMemo(() => {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--brand-600').trim();
    return v ? `rgb(${v})` : '#4f46e5';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);
}
