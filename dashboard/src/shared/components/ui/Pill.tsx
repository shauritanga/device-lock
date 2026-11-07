import { cn } from '../../lib/cn';

type Tone = 'green' | 'red' | 'amber' | 'gray' | 'brand' | 'blue';

const tones: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-700',
  red: 'bg-rose-50 text-rose-600',
  amber: 'bg-amber-50 text-amber-700',
  gray: 'bg-slate-100 text-slate-600',
  brand: 'bg-brand-100 text-brand-700',
  blue: 'bg-sky-50 text-sky-700',
};

export function Pill({ tone = 'gray', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
        tones[tone],
      )}
    >
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
