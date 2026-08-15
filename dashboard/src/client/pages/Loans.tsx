import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { Loan } from '@/shared/api/types';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Table, Row } from '@/shared/components/ui/Table';
import { StatusPill } from '@/shared/components/ui/Pill';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { money, shortDate } from '@/shared/lib/format';

/**
 * Loan book — schedules and repayment status.
 * New credit deals are created on Sales (customer + device + loan + contract).
 */
export default function Loans() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['loans'],
    queryFn: async () => (await api.get<Loan[]>('/loans')).data,
  });

  if (isLoading) {
    return (
      <Center>
        <Spinner />
      </Center>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="hidden text-xl font-bold tracking-tight md:block">Loans</h2>
          <p className="text-sm text-muted">
            Open a loan for the installment schedule and payment history. New
            credit sales are started under Sales.
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate('/sales')}>
          <Plus className="h-4 w-4" /> New credit sale
        </Button>
      </div>

      <Card className="p-3">
        {!data || data.length === 0 ? (
          <EmptyState
            title="No loans yet"
            hint="A loan is created automatically when you complete a credit sale."
          />
        ) : (
          <Table
            columns={[
              'Customer',
              'Device',
              'Principal',
              'Term',
              'Status',
              'Started',
            ]}
          >
            {data.map((l) => (
              <Row key={l.id} onClick={() => navigate(`/loans/${l.id}`)}>
                <td className="px-4 py-3 font-medium">
                  {l.customer?.fullName ?? '—'}
                </td>
                <td className="px-4 py-3 text-muted">{l.device?.imei ?? '—'}</td>
                <td className="px-4 py-3">
                  {money(l.principal, l.currency)}
                </td>
                <td className="px-4 py-3 text-muted">{l.termMonths} mo</td>
                <td className="px-4 py-3">
                  <StatusPill status={l.status} />
                </td>
                <td className="px-4 py-3 text-right text-muted">
                  {shortDate(l.startDate)}
                </td>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      {data && data.length === 0 ? (
        <p className="text-center text-sm text-muted">
          <Link to="/sales" className="font-medium text-brand-700 hover:underline">
            Go to Sales
          </Link>{' '}
          to create a credit sale.
        </p>
      ) : null}
    </div>
  );
}
