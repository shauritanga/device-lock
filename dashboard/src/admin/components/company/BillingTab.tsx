import { useMemo, useState, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Input, Select } from '@/shared/components/ui/Field';
import { Pill, StatusPill } from '@/shared/components/ui/Pill';
import { EmptyState } from '@/shared/components/ui/misc';
import { Table, Row } from '@/shared/components/ui/Table';
import { money, shortDate } from '@/shared/lib/format';
import type { BillingSummary, Invoice } from './types';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-faint">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-ink">{children}</dd>
    </div>
  );
}

export function BillingTab({
  billing,
  invoices,
  onActivate,
  onGenerate,
  generating,
  onMarkPaid,
  markingPaid,
}: {
  billing?: BillingSummary;
  invoices: Invoice[];
  onActivate: () => void;
  onGenerate: () => void;
  generating: boolean;
  onMarkPaid: (id: string) => void;
  markingPaid: boolean;
}) {
  const sub = billing?.subscription;
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((i) => {
      if (status && i.status !== status) return false;
      return !q || `${i.packageCode} ${i.status}`.toLowerCase().includes(q);
    });
  }, [invoices, search, status]);
  const hasFilters = search.trim() !== '' || status !== '';

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-ink">Subscription</h3>
            <p className="text-sm text-muted">
              {sub ? 'Managed collections package for this company.' : 'No collections subscription yet.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={onGenerate} disabled={generating || !sub}>
              {generating ? 'Generating…' : 'Generate invoice'}
            </Button>
            <Button type="button" onClick={onActivate}>
              {sub ? 'Update package' : 'Activate subscription'}
            </Button>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 px-5 py-5 md:grid-cols-4">
          <Fact label="Package">{sub ? <Pill tone="brand">{sub.packageCode}</Pill> : '—'}</Fact>
          <Fact label="Status">{sub ? <StatusPill status={sub.status} /> : '—'}</Fact>
          <Fact label="Active since">{shortDate(sub?.activatedAt)}</Fact>
          <Fact label="Active devices">{billing?.activeDevices ?? 0}</Fact>
          <Fact label="Est. monthly">{money(billing?.estimatedMonthly ?? 0)}</Fact>
          <Fact label="Open balance">{money(billing?.openBalance ?? 0)}</Fact>
          <Fact label="Suggested package">{billing?.suggestedPackage ?? '—'}</Fact>
          <Fact label="Notes">{sub?.notes || '—'}</Fact>
        </dl>
      </Card>

      <Card>
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:flex-wrap sm:items-center">
          <h3 className="text-base font-semibold tracking-tight text-ink sm:mr-auto">Invoices</h3>
          <div className="relative w-full sm:w-56">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
              aria-hidden
            />
            <Input
              className="w-full pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoices…"
              aria-label="Search invoices"
            />
          </div>
          <Select
            className="w-full sm:w-40"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="DRAFT">DRAFT</option>
            <option value="OPEN">OPEN</option>
            <option value="PAID">PAID</option>
            <option value="PAST_DUE">PAST DUE</option>
            <option value="VOID">VOID</option>
          </Select>
          {hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              className="gap-1.5 px-2.5"
              onClick={() => {
                setSearch('');
                setStatus('');
              }}
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          ) : null}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title={invoices.length === 0 ? 'No invoices yet' : 'No matching invoices'}
            hint={
              invoices.length === 0
                ? sub
                  ? 'Generate an invoice for this company to get started.'
                  : 'Activate a subscription first, then generate invoices.'
                : 'Try clearing search or filters.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table columns={['Package', 'Period', 'Devices', 'Total', 'Due', 'Status', '']}>
              {filtered.map((inv) => (
                <Row key={inv.id}>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-md bg-canvas px-2 py-0.5 text-xs font-semibold text-ink-soft">
                      {inv.packageCode}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {shortDate(inv.periodStart)} – {shortDate(inv.periodEnd)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted">{inv.activeDevices}</td>
                  <td className="px-4 py-3 font-semibold tabular-nums text-ink">{money(inv.total)}</td>
                  <td className="px-4 py-3 text-muted">{shortDate(inv.dueDate)}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={inv.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {inv.status === 'OPEN' || inv.status === 'PAST_DUE' ? (
                      <Button
                        variant="secondary"
                        className="!py-1.5 !text-xs"
                        onClick={() => onMarkPaid(inv.id)}
                        disabled={markingPaid}
                      >
                        Mark paid
                      </Button>
                    ) : inv.paidAt ? (
                      <span className="text-xs text-muted">Paid {shortDate(inv.paidAt)}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </Row>
              ))}
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
