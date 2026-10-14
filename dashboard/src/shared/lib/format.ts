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
