export function money(value: number | string, currency = 'TZS'): string {
  const n = typeof value === 'string' ? Number(value) : value;
  return `${currency} ${n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function shortDate(value?: string | Date | null): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const FREQ_UNIT = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month' } as const;

/** e.g. "30 days", "12 weeks", "6 months". Falls back to termMonths for legacy loans. */
export function termLabel(loan: {
  frequency?: keyof typeof FREQ_UNIT;
  termPeriods?: number;
  termMonths: number;
}): string {
  const unit = FREQ_UNIT[loan.frequency ?? 'MONTHLY'];
  const n = loan.termPeriods || loan.termMonths;
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

/** A phone whose agent app has not contacted the server for this long is not reporting. */
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

export function isStale(value?: string | Date | null): boolean {
  if (!value) return true;
  return Date.now() - new Date(value).getTime() > STALE_AFTER_MS;
}

/** "just now", "12 min ago", "5 h ago", "1 d 13 h ago". */
export function ago(value?: string | Date | null): string {
  if (!value) return 'never';
  const mins = Math.max(Math.floor((Date.now() - new Date(value).getTime()) / 60000), 0);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest ? `${days} d ${rest} h ago` : `${days} d ago`;
}
