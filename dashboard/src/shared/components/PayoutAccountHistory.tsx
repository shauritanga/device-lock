import type { PayoutAccountChange } from '@/shared/api/types';
import { Table, Row } from '@/shared/components/ui/Table';
import { EmptyState } from '@/shared/components/ui/misc';
import { shortDate } from '@/shared/lib/format';

const ROLE: Record<string, string> = { OWNER: 'Owner', SUPER_ADMIN: 'Platform admin' };

/** Who changed the payout account, and when. */
export function PayoutAccountHistory({ changes }: { changes: PayoutAccountChange[] }) {
  if (changes.length === 0) {
    return <EmptyState title="No account changes yet" />;
  }
  return (
    <div className="overflow-x-auto">
      <Table columns={['When', 'Changed by', 'From', 'To']}>
        {changes.map((c) => (
          <Row key={c.id}>
            <td className="px-4 py-3 text-muted">{shortDate(c.createdAt)}</td>
            <td className="px-4 py-3">
              <p className="font-medium text-ink">{c.changedByName}</p>
              <p className="text-xs text-muted">{ROLE[c.changedByRole] ?? c.changedByRole}</p>
            </td>
            <td className="px-4 py-3 font-mono text-xs text-muted">{c.oldPhone ?? '—'}</td>
            <td className="px-4 py-3">
              <p className="font-mono text-xs text-ink">{c.newPhone}</p>
              <p className="text-xs text-muted">{c.newName}</p>
            </td>
          </Row>
        ))}
      </Table>
    </div>
  );
}
