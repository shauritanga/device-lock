import { cn } from '../../lib/cn';
import { IS_ADMIN_APP } from '../../config';

type Tone = 'green' | 'red' | 'amber' | 'gray' | 'brand' | 'blue';

// Translucent tints with saturated text: readable on light and dark surfaces.
const tones: Record<Tone, string> = {
  green: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  red: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  gray: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  brand: 'bg-brand-600/10 text-brand-700',
  blue: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
};

export function Pill({ tone = 'gray', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
        'admin:gap-1.5 admin:px-2 admin:py-[3px] admin:text-[11.5px]',
        tones[tone],
      )}
    >
      {IS_ADMIN_APP ? (
        <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-current" aria-hidden />
      ) : null}
      {children}
    </span>
  );
}

/** Map a domain status string to a pill tone. */
export function statusTone(status: string): Tone {
  switch (status) {
    case 'ACTIVE':
    case 'CONFIRMED':
    case 'PAID':
    case 'COMPLETED':
    case 'ACKED':
    case 'CONVERTED':
    case 'QUALIFIED':
    case 'CONNECTED':
    case 'REPAYMENT_COMMITTED':
      return 'green';
    case 'LOCKED':
    case 'FAILED':
    case 'REVERSED':
    case 'DEFAULTED':
    case 'OVERDUE':
    case 'SUSPECTED_FRAUD':
      return 'red';
    case 'PENDING_ENROLLMENT':
    case 'PENDING':
    case 'QUEUED':
    case 'NEW':
    case 'NOT_CONNECTED':
      return 'amber';
    case 'SENT':
    case 'CONTACTED':
      return 'blue';
    case 'RELEASED':
    case 'CANCELLED':
    case 'WAIVED':
    case 'EXPIRED':
    case 'CLOSED':
    case 'INACTIVE':
    case 'NONE':
      return 'gray';
    default:
      return 'brand';
  }
}

export function StatusPill({ status }: { status: string }) {
  return <Pill tone={statusTone(status)}>{status.replace(/_/g, ' ')}</Pill>;
}

const dots: Record<Tone, string> = {
  green: 'bg-emerald-500',
  red: 'bg-rose-500',
  amber: 'bg-amber-500',
  gray: 'bg-slate-400',
  brand: 'bg-brand-500',
  blue: 'bg-sky-500',
};

/** Quiet status: a small coloured dot with plain text, for dense lists. */
export function StatusDot({ status, label }: { status: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm text-ink-soft">
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dots[statusTone(status)])} aria-hidden />
      {label ?? status.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}
    </span>
  );
}
