import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { Loan } from '@/shared/api/types';
import { Card, CardHeader } from '@/shared/components/ui/Card';
import { StatusPill } from '@/shared/components/ui/Pill';
import { Table, Row } from '@/shared/components/ui/Table';
import { Center, Spinner } from '@/shared/components/ui/misc';
import { money, shortDate } from '@/shared/lib/format';

export default function LoanDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: loan, isLoading } = useQuery({
    queryKey: ['loan', id],
    queryFn: async () => (await api.get<Loan>(`/loans/${id}`)).data,
  });

  if (isLoading || !loan) return <Center><Spinner /></Center>;

  const paid = loan.installments?.filter((i) => i.status === 'PAID').length ?? 0;
  const total = loan.installments?.length ?? 0;

  return (
    <div className="space-y-6">
      <Link to="/loans" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back to loans
      </Link>

      <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        <Metric label="Principal" value={money(loan.principal, loan.currency)} />
        <Metric label="Down payment" value={money(loan.downPayment, loan.currency)} />
        <Metric label="Interest" value={`${loan.interestRate}%`} />
        <Metric label="Progress" value={`${paid}/${total} paid`} />
      </div>

      <Card>
        <CardHeader
          title="Installment schedule"
          subtitle={`${loan.customer?.fullName ?? ''} · ${loan.device?.imei ?? ''}`}
          action={<StatusPill status={loan.status} />}
        />
        <div className="p-3">
          <Table columns={['#', 'Due date', 'Amount', 'Paid', 'Status']}>
            {loan.installments?.map((i) => (
              <Row key={i.id}>
                <td className="px-4 py-3 font-medium">{i.sequence}</td>
                <td className="px-4 py-3 text-muted">{shortDate(i.dueDate)}</td>
                <td className="px-4 py-3">{money(i.amount, loan.currency)}</td>
                <td className="px-4 py-3 text-muted">{money(i.amountPaid, loan.currency)}</td>
                <td className="px-4 py-3 text-right"><StatusPill status={i.status} /></td>
              </Row>
            ))}
          </Table>
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight">{value}</p>
    </Card>
  );
}
