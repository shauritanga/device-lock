import type { ReactNode } from 'react';
import type { Payout, PayoutSummary } from '@/shared/api/types';
import { FigureStrip, type Figure } from '@/shared/components/FigureStrip';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { StatusDot } from '@/shared/components/ui/Pill';
import { money, shortDate } from '@/shared/lib/format';
import {
  ACCESS_COPY,
  AGREEMENT_COPY,
  type BillingSummary,
  type Invoice,
  type TabId,
  type Tenant,
} from './types';

/** "TZ" -> "Tanzania"; falls back to the code if the runtime can't name it. */
function countryName(code?: string): string {
  if (!code) return '—';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** One line in the "at a glance" list: what it is, its state, and where to manage it. */
function GlanceRow({
  title,
  children,
  action,
  onAction,
}: {
  title: string;
  children: ReactNode;
  action: string;
  onAction: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-4">
      <h3 className="w-44 shrink-0 text-sm font-medium text-ink">{title}</h3>
      <div className="min-w-0 flex-1 text-sm text-muted">{children}</div>
      <button
        type="button"
        onClick={onAction}
        className="text-sm font-medium text-brand-700 hover:underline"
      >
        {action}
      </button>
    </li>
  );
}

function RecentList({
  title,
  onViewAll,
  empty,
  children,
}: {
  title: string;
  onViewAll: () => void;
  empty: string;
  children: ReactNode[];
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-xs font-medium uppercase tracking-wide text-faint">{title}</h2>
        <button type="button" onClick={onViewAll} className="text-sm text-muted hover:text-ink">
          View all
        </button>
      </div>
      <Card>
        {children.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">{empty}</p>
        ) : (
          <ul className="divide-y divide-line">{children}</ul>
        )}
      </Card>
    </section>
  );
}

export function OverviewTab({
  tenant,
  billing,
  invoices,
  agreementStatus,
  payoutSummary,
  payouts,
  onGo,
  onActivate,
}: {
  tenant?: Tenant;
  billing?: BillingSummary;
  invoices: Invoice[];
  agreementStatus: string;
  /** Present for super admins only. */
  payoutSummary?: PayoutSummary;
  payouts: Payout[];
  onGo: (t: TabId) => void;
  onActivate: () => void;
}) {
  const sub = billing?.subscription;
  const agreement = AGREEMENT_COPY[agreementStatus] ?? AGREEMENT_COPY.NONE;
  const account = payoutSummary?.tenant;
  const hasAccount = !!(account?.payoutPhone && account.payoutName);

  const figures: Figure[] = [
    { label: 'Active devices', value: billing?.activeDevices ?? 0 },
    { label: 'Est. monthly', value: money(billing?.estimatedMonthly ?? 0) },
    { label: 'Open balance', value: money(billing?.openBalance ?? 0) },
  ];
  if (payoutSummary) {
    figures.push({
      label: 'Awaiting payout',
      value: money(payoutSummary.owed),
      hint: payoutSummary.owedCount ? `${payoutSummary.owedCount} payments` : undefined,
    });
  }

  return (
    <div className="space-y-8">
      <FigureStrip items={figures} />

      <section>
        <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-faint">Company</h2>
        <Card>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 px-5 py-5 md:grid-cols-4">
            <div>
              <dt className="text-xs text-muted">Status</dt>
              <dd className="mt-1">
                <StatusDot
                  status={tenant?.isActive === false ? 'INACTIVE' : 'ACTIVE'}
                  label={tenant?.isActive === false ? 'Suspended' : 'Active'}
                />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Joined</dt>
              <dd className="mt-1 text-sm text-ink">{shortDate(tenant?.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Access</dt>
              <dd className="mt-1">
                {billing?.access ? (
                  <StatusDot
                    status={billing.access.allowed ? 'ACTIVE' : 'PENDING'}
                    label={ACCESS_COPY[billing.access.reason] ?? billing.access.reason}
                  />
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Country</dt>
              <dd className="mt-1 text-sm text-ink">{countryName(tenant?.country)}</dd>
            </div>
          </dl>
        </Card>
      </section>

      <section>
        <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-faint">
          At a glance
        </h2>
        <Card>
          <ul className="divide-y divide-line">
            <GlanceRow title="Collections subscription" action="Manage" onAction={() => onGo('billing')}>
              {sub ? (
                <span className="flex flex-wrap items-center gap-x-3">
                  <span className="font-medium text-ink">{sub.packageCode}</span>
                  <StatusDot status={sub.status} />
                  {sub.activatedAt ? <span>since {shortDate(sub.activatedAt)}</span> : null}
                </span>
              ) : (
                <span className="flex flex-wrap items-center gap-3">
                  No subscription yet.
                  <Button type="button" variant="secondary" className="!py-1 !text-xs" onClick={onActivate}>
                    Activate
                  </Button>
                </span>
              )}
            </GlanceRow>

            <GlanceRow title="Service agreement" action="Open" onAction={() => onGo('agreement')}>
              <span className="flex flex-wrap items-center gap-x-3">
                <StatusDot
                  status={agreementStatus === 'NONE' ? 'INACTIVE' : agreementStatus}
                  label={agreement.label}
                />
                <span>{agreement.hint}</span>
              </span>
            </GlanceRow>

            {payoutSummary ? (
              <GlanceRow title="Payout account" action="Manage" onAction={() => onGo('payouts')}>
                {hasAccount ? (
                  <span className="flex flex-wrap items-center gap-x-3">
                    <span className="font-medium text-ink">{account!.payoutName}</span>
                    <span className="font-mono text-xs">{account!.payoutPhone}</span>
                    {payoutSummary.holdUntil ? <StatusDot status="PENDING" label="Payouts paused" /> : null}
                  </span>
                ) : (
                  <span>Not set — money collected for this company waits until one is added.</span>
                )}
              </GlanceRow>
            ) : null}
          </ul>
        </Card>
      </section>

      <div className={payoutSummary ? 'grid gap-8 lg:grid-cols-2' : ''}>
        <RecentList title="Latest invoices" onViewAll={() => onGo('billing')} empty="No invoices yet.">
          {invoices.slice(0, 4).map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-4 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm text-ink">
                  {shortDate(i.periodStart)} – {shortDate(i.periodEnd)}
                </p>
                <p className="text-xs text-muted">Due {shortDate(i.dueDate)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <span className="text-sm font-medium tabular-nums text-ink">{money(i.total)}</span>
                <StatusDot status={i.status} />
              </div>
            </li>
          ))}
        </RecentList>

        {payoutSummary ? (
          <RecentList title="Latest payouts" onViewAll={() => onGo('payouts')} empty="No payouts yet.">
            {payouts.slice(0, 4).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-ink">{shortDate(p.createdAt)}</p>
                  <p className="truncate text-xs text-muted">To {p.recipientName}</p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <span className="text-sm font-medium tabular-nums text-ink">
                    {money(p.amount, p.currency)}
                  </span>
                  <StatusDot status={p.status} />
                </div>
              </li>
            ))}
          </RecentList>
        ) : null}
      </div>
    </div>
  );
}
