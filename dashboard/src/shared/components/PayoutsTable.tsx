import type { Payout } from '@/shared/api/types';
import { Table, Row } from '@/shared/components/ui/Table';
import { StatusDot } from '@/shared/components/ui/Pill';
import { EmptyState } from '@/shared/components/ui/misc';
import { money, shortDate } from '@/shared/lib/format';

/** Disbursement history, shared by the seller and admin consoles. */
export function PayoutsTable({ payouts }: { payouts: Payout[] }) {
  if (payouts.length === 0) {
    return (
      <EmptyState
        title="No payouts yet"
        hint="Payouts appear here as customer payments clear and are sent on."
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table columns={['Date', 'Sent to', 'Collected', 'Fee', 'Paid out', 'Status']}>
        {payouts.map((p) => (
          <Row key={p.id}>
            <td className="px-4 py-3 text-muted">{shortDate(p.createdAt)}</td>
            <td className="px-4 py-3">
              <p className="font-medium text-ink">{p.recipientName}</p>
              <p className="font-mono text-xs text-muted">{p.recipientPhone}</p>
            </td>
            <td className="px-4 py-3 tabular-nums text-muted">
              {money(p.grossAmount, p.currency)}
            </td>
            <td className="px-4 py-3 tabular-nums text-muted">
              {money(p.feeAmount, p.currency)}
            </td>
            <td className="px-4 py-3 font-semibold tabular-nums text-ink">
              {money(p.amount, p.currency)}
            </td>
            <td className="px-4 py-3">
              <StatusDot status={p.status} />
              {p.failureReason ? (
                <p className="mt-1 max-w-[16rem] text-xs text-rose-600">
                  {p.failureReason}
                </p>
              ) : null}
            </td>
          </Row>
        ))}
      </Table>
    </div>
  );
}
