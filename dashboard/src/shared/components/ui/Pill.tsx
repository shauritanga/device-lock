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
      return 'green';
    case 'LOCKED':
    case 'FAILED':
    case 'DEFAULTED':
    case 'OVERDUE':
      return 'red';
    case 'PENDING_ENROLLMENT':
    case 'PENDING':
    case 'QUEUED':
    case 'NEW':
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
