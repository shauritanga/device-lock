import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { Card } from '@/shared/components/ui/Card';
import { Table, Row } from '@/shared/components/ui/Table';
import { StatusDot } from '@/shared/components/ui/Pill';
import { Select } from '@/shared/components/ui/Field';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { FigureStrip } from '@/shared/components/FigureStrip';
import { ListToolbar } from '@/shared/components/ListToolbar';
import { PanelEmpty } from '@/shared/components/Panel';
import { money, shortDate } from '@/shared/lib/format';

type SoldPhone = {
  id: string;
  imei: string;
  make?: string | null;
  model?: string | null;
  status: string;
  lastCheckInAt?: string | null;
  tenant: { id: string; name: string };
  customer?: { id: string; fullName: string; phone: string } | null;
  loan: {
    id: string;
    status: string;
    principal: string;
    downPayment: string;
    currency: string;
    startDate: string;
    overdueInstallments: number;
    nextDue?: { sequence: number; dueDate: string; amountDue: number } | null;
    totalPaid: number;
    soldBy?: { id: string; fullName: string; role: string } | null;
  };
};

const STATUSES = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'LOCKED', label: 'Locked' },
  { value: 'PENDING_ENROLLMENT', label: 'Not enrolled yet' },
  { value: 'RELEASED', label: 'Released' },
  { value: 'DEFAULTED', label: 'Defaulted' },
];

/**
 * Every phone that has actually been given to a customer on credit, across all
 * sellers. Phones that are only registered in a seller's stock are not listed.
 */
export default function SoldPhones() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [tenantId, setTenantId] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-sold-devices', tenantId, status],
    queryFn: async () =>
      (
        await api.get<SoldPhone[]>('/collections/sold-devices', {
          params: {
            ...(tenantId ? { tenantId } : {}),
            ...(status !== 'ALL' ? { status } : {}),
          },
        })
      ).data,
  });
  const { data: tenants } = useQuery({
    queryKey: ['tenants'],
    queryFn: async () => (await api.get<Array<{ id: string; name: string }>>('/tenants')).data,
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter(
      (d) =>
        !q ||
        [d.imei, d.model, d.make, d.customer?.fullName, d.customer?.phone, d.tenant.name, d.loan.soldBy?.fullName]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [data, query]);

  const figures = useMemo(() => {
    const all = rows;
    return {
      total: all.length,
      locked: all.filter((d) => d.status === 'LOCKED').length,
      overdue: all.filter((d) => d.loan.overdueInstallments > 0).length,
      financed: all.reduce((t, d) => t + Number(d.loan.principal), 0),
      collected: all.reduce((t, d) => t + d.loan.totalPaid, 0),
    };
  }, [rows]);

  if (isLoading) {
    return (
      <Center>
        <Spinner />
      </Center>
    );
  }

  return (
    <div className="space-y-5">
      <FigureStrip
        items={[
          { label: 'Phones sold', value: figures.total, hint: 'Given to customers' },
          { label: 'Locked', value: figures.locked },
          { label: 'With overdue payments', value: figures.overdue },
          { label: 'Total financed', value: money(figures.financed) },
          { label: 'Collected so far', value: money(figures.collected) },
        ]}
      />

      <Card>
        <ListToolbar
          title="Sold phones"
          noun="phone"
          count={rows.length}
          query={query}
          onQuery={setQuery}
          placeholder="Search customer, IMEI, shop, seller"
          filter={{ value: status, onChange: setStatus, options: STATUSES }}
        />
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-5 py-2.5">
          <span className="text-xs text-muted">Company</span>
          <Select
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            className="!w-auto"
            aria-label="Filter by company"
          >
            <option value="">All companies</option>
            {(tenants ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>

        {!data || data.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No phones sold yet"
              hint="Phones show up here once a seller completes a credit sale and gives the phone to a customer. Phones that are only registered in stock are not shown."
            />
          </div>
        ) : rows.length === 0 ? (
          <PanelEmpty>No phones match your search.</PanelEmpty>
        ) : (
          <Table
            columns={['Shop', 'Customer', 'Phone type', 'IMEI', 'Lock status', 'Next due', 'Price', 'Paid', 'Sold']}
          >
            {rows.map((d) => (
              <Row key={d.id}>
                <td className="px-4 py-3 text-ink">
                  <div className="font-medium">{d.tenant.name}</div>
                  {d.loan.soldBy ? (
                    <div className="text-xs text-muted">by {d.loan.soldBy.fullName}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-ink">{d.customer?.fullName ?? '—'}</div>
                  <div className="text-xs text-muted">{d.customer?.phone}</div>
                </td>
                <td className="px-4 py-3 text-muted">
                  {[d.make, d.model].filter(Boolean).join(' ') || '—'}
                </td>
                <td className="px-4 py-3 tabular-nums text-ink">{d.imei}</td>
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    <StatusDot status={d.status} />
                    {d.loan.overdueInstallments > 0 ? <StatusDot status="OVERDUE" /> : null}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {d.loan.nextDue ? (
                    <>
                      <div
                        className={
                          new Date(d.loan.nextDue.dueDate) < new Date()
                            ? 'font-medium text-rose-600'
                            : 'text-ink'
                        }
                      >
                        {shortDate(d.loan.nextDue.dueDate)}
                      </div>
                      <div className="text-xs tabular-nums text-muted">
                        {money(d.loan.nextDue.amountDue, d.loan.currency)}
                      </div>
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums">{money(d.loan.principal, d.loan.currency)}</td>
                <td className="px-4 py-3 tabular-nums text-muted">
                  {money(d.loan.totalPaid, d.loan.currency)}
                </td>
                <td className="px-4 py-3 text-right text-muted">{shortDate(d.loan.startDate)}</td>
              </Row>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
