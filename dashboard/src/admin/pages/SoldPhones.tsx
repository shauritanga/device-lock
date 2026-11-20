import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { Card } from '@/shared/components/ui/Card';
import { Table, Row } from '@/shared/components/ui/Table';
import { StatusDot } from '@/shared/components/ui/Pill';
import { Input, Select } from '@/shared/components/ui/Field';
import { Search } from '@/shared/icons';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { FigureStrip } from '@/shared/components/FigureStrip';
import { PanelEmpty } from '@/shared/components/Panel';
import { ago, isStale, money, shortDate } from '@/shared/lib/format';

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
  { value: 'ALL', label: 'All phones' },
  { value: 'LOCKED', label: 'Locked' },
  { value: 'UNLOCKED', label: 'Unlocked' },
  { value: 'SILENT', label: 'Not reporting' },
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
            ...(status === 'LOCKED' ? { status } : {}),
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
        (status !== 'UNLOCKED' || d.status !== 'LOCKED') &&
        (status !== 'SILENT' || (d.status !== 'PENDING_ENROLLMENT' && isStale(d.lastCheckInAt))) &&
        (!q ||
        [d.imei, d.model, d.make, d.customer?.fullName, d.customer?.phone, d.tenant.name, d.loan.soldBy?.fullName]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))),
    );
  }, [data, query, status]);

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
        <div className="flex flex-col gap-2 border-b border-line-soft px-5 py-3.5 sm:flex-row sm:items-center">
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search customer, IMEI, shop, seller"
              className="!w-full !pl-9"
            />
          </div>
          <Select
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            className="sm:!w-48"
            aria-label="Filter by company"
          >
            <option value="">All companies</option>
            {(tenants ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="sm:!w-44"
            aria-label="Filter by status"
          >
            {STATUSES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
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
            columns={['Shop', 'Customer', 'Phone type', 'IMEI', 'Lock status', 'Payment due', 'Price', 'Paid', 'Sold']}
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
                  {d.status === 'LOCKED' ? (
                    <StatusDot status="LOCKED" label="Locked" />
                  ) : (
                    <StatusDot status="ACTIVE" label="Unlocked" />
                  )}
                  {d.status === 'PENDING_ENROLLMENT' ? (
                    <div className="mt-0.5 text-xs text-amber-700">Not enrolled</div>
                  ) : (
                    <div className={isStale(d.lastCheckInAt) ? 'mt-0.5 text-xs text-rose-600' : 'mt-0.5 text-xs text-muted'}>
                      Seen {ago(d.lastCheckInAt)}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {d.loan.nextDue ? (
                    (() => {
                      const due = new Date(d.loan.nextDue.dueDate);
                      const late = Math.floor((Date.now() - due.getTime()) / 86_400_000);
                      if (d.loan.nextDue.sequence === 0) {
                        return (
                          <>
                            <div className="font-medium text-rose-600">Deposit not paid</div>
                            <div className="text-xs tabular-nums text-muted">
                              {money(d.loan.nextDue.amountDue, d.loan.currency)}
                            </div>
                          </>
                        );
                      }
                      return late >= 1 ? (
                        <>
                          <div className="font-medium text-rose-600">
                            Overdue {late} {late === 1 ? 'day' : 'days'}
                          </div>
                          <div className="text-xs tabular-nums text-muted">
                            since {shortDate(d.loan.nextDue.dueDate)} ·{' '}
                            {money(d.loan.nextDue.amountDue, d.loan.currency)}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-ink">{shortDate(d.loan.nextDue.dueDate)}</div>
                          <div className="text-xs tabular-nums text-muted">
                            {money(d.loan.nextDue.amountDue, d.loan.currency)}
                          </div>
                        </>
                      );
                    })()
                  ) : d.loan.status === 'COMPLETED' ? (
                    <span className="text-emerald-600">Completed</span>
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
