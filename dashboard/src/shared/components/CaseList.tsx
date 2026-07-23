import { Link } from 'react-router-dom';
import { Card, CardHeader } from './ui/Card';
import { Button } from './ui/Button';
import { Pill, StatusPill } from './ui/Pill';
import { Center, EmptyState, Spinner } from './ui/misc';
import { money, shortDate } from '../lib/format';

export type CollectionCase = {
  id: string;
  tenantId: string;
  companyName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  deviceImei: string | null;
  deviceModel: string | null;
  deviceStatus: string | null;
  daysOverdue: number;
  amountDue: string | number;
  currency: string;
  status: string;
  source?: string | null;
  referralNote?: string | null;
  referredAt?: string | null;
  followUpCount: number;
  dueDate?: string | null;
  assignedToId?: string | null;
  assignedTo?: { id: string; fullName: string; phone?: string | null } | null;
};

/**
 * Shared between both consoles. `caseHref` is optional: the admin console links
 * each row to the collector workspace, the seller console has no such route and
 * renders the name as plain text instead of a dead link.
 */
export function CaseList({
  title,
  subtitle,
  rows,
  loading,
  empty,
  showCompany,
  actionLabel,
  onAction,
  caseHref,
}: {
  title: string;
  subtitle: string;
  rows?: CollectionCase[];
  loading: boolean;
  empty: string;
  showCompany: boolean;
  actionLabel?: string;
  onAction?: (id: string) => void;
  caseHref?: (id: string) => string;
}) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      {loading ? (
        <Center>
          <Spinner />
        </Center>
      ) : !rows || rows.length === 0 ? (
        <div className="p-5">
          <EmptyState title={empty} />
        </div>
      ) : (
        <div className="overflow-x-auto px-2 pb-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                {showCompany ? <th className="px-3 py-2 font-medium">Company</th> : null}
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Device</th>
                <th className="px-3 py-2 font-medium">Days</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                {actionLabel ? <th className="px-3 py-2 font-medium" /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line hover:bg-canvas/40">
                  {showCompany ? (
                    <td className="px-3 py-3 font-medium">{r.companyName ?? '—'}</td>
                  ) : null}
                  <td className="px-3 py-3">
                    <span className="flex flex-wrap items-center gap-2">
                      {caseHref ? (
                        <Link
                          to={caseHref(r.id)}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {r.customerName}
                        </Link>
                      ) : (
                        <span className="font-medium text-ink">{r.customerName}</span>
                      )}
                      {r.source === 'SELLER_HANDOFF' ? (
                        <Pill tone="brand">Handed over</Pill>
                      ) : null}
                    </span>
                    <p className="text-xs text-muted">{r.customerPhone}</p>
                    {r.referralNote ? (
                      <p className="mt-0.5 max-w-xs truncate text-xs italic text-ink-soft">
                        “{r.referralNote}”
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-muted">
                    <p>{r.deviceImei}</p>
                    <p className="text-xs">{r.deviceModel}</p>
                  </td>
                  <td className="px-3 py-3 tabular-nums">{r.daysOverdue}</td>
                  <td className="px-3 py-3 tabular-nums text-muted">
                    {r.dueDate ? shortDate(r.dueDate) : '—'}
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">
                    {money(r.amountDue)}
                  </td>
                  {actionLabel && onAction ? (
                    <td className="px-3 py-3 text-right">
                      <Button
                        variant="secondary"
                        className="!py-1.5 !text-xs"
                        onClick={() => onAction(r.id)}
                      >
                        {actionLabel}
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
