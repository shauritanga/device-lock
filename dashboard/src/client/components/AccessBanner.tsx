import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { money, shortDate } from '@/shared/lib/format';

type Access = {
  allowed: boolean;
  reason: string;
  message: string;
  noPhones: boolean;
  invoice: { id: string; total: number; dueDate: string; status: string } | null;
};

/**
 * Tells seller staff why their console is read-only (and what unlocks it), or
 * that their package doesn't include phone features. Renders nothing when
 * everything is fine.
 */
export function AccessBanner() {
  const { data } = useQuery({
    queryKey: ['subscription', 'access'],
    queryFn: async () => (await api.get<Access>('/subscription/access')).data,
    refetchInterval: 60_000,
    retry: false,
  });
  if (!data) return null;

  if (!data.allowed) {
    return (
      <div role="status" className="mb-6 rounded-xl2 border border-amber-300/60 bg-amber-50 px-5 py-4 dark:border-amber-500/30 dark:bg-amber-500/10">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          Your account is read-only
        </p>
        <p className="mt-1 text-sm text-amber-800/90 dark:text-amber-200/90">{data.message}</p>
        {data.invoice ? (
          <p className="mt-2 text-sm text-amber-900 dark:text-amber-100">
            Invoice <span className="font-semibold tabular-nums">{money(data.invoice.total)}</span>
            {' · '}due {shortDate(data.invoice.dueDate)}. Contact Linda to arrange payment.
          </p>
        ) : null}
        <p className="mt-2 text-xs text-amber-800/80 dark:text-amber-200/70">
          You can still view your data. Registering phones, sales, payments and staff changes are
          paused. Phones already enrolled keep working.
        </p>
      </div>
    );
  }

  if (data.noPhones) {
    return (
      <div role="status" className="mb-6 rounded-xl2 border border-line bg-surface px-5 py-3 text-sm text-muted">
        Your Negotiation package doesn't include phone features such as registering phones or
        creating loans.
      </div>
    );
  }
  return null;
}
