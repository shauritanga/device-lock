import type { ReactNode } from 'react';
import {
  ArrowRight,
  Banknote,
  FileSignature,
  Hourglass,
  Package,
  ReceiptText,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Payout, PayoutSummary } from '@/shared/api/types';
import { StatCard } from '@/shared/components/StatCard';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Pill, StatusPill } from '@/shared/components/ui/Pill';
import { money, shortDate } from '@/shared/lib/format';
import {
  AGREEMENT_COPY,
  type BillingSummary,
  type Invoice,
  type TabId,
} from './types';

/** A compact at-a-glance card with one call to action. */
function SummaryCard({
  icon: Icon,
  title,
  action,
  onAction,
  children,
}: {
  icon: LucideIcon;
  title: string;
  action: string;
  onAction: () => void;
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
      </div>
      <div className="mt-4 flex-1 space-y-1.5">{children}</div>
      <button
        type="button"
        onClick={onAction}
        className="mt-4 inline-flex items-center gap-1 self-start text-sm font-medium text-brand-700 hover:text-brand-800"
      >
        {action}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </button>
    </Card>
  );
}

function ListCard({
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
    <Card>
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <button
          type="button"
          onClick={onViewAll}
          className="text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          View all
        </button>
      </div>
      {children.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">{children}</ul>
      )}
    </Card>
  );
}

export function OverviewTab({
  billing,
  invoices,
  agreementStatus,
  payoutSummary,
  payouts,
  onGo,
  onActivate,
}: {
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
  const hasAccount = !!(payoutSummary?.tenant.payoutPhone && payoutSummary.tenant.payoutName);
  const showPayouts = !!payoutSummary;

  return (
    <div className="space-y-6">
      <div
        className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${showPayouts ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}
      >
        <StatCard icon={Package} label="Active devices" value={billing?.activeDevices ?? 0} tone="brand" />
        <StatCard
          icon={Wallet}
          label="Est. monthly"
          value={money(billing?.estimatedMonthly ?? 0)}
          hint={billing?.suggestedPackage ? `Suggests ${billing.suggestedPackage}` : undefined}
          tone="green"
        />
        <StatCard icon={ReceiptText} label="Open balance" value={money(billing?.openBalance ?? 0)} tone="amber" />
        {showPayouts ? (
          <StatCard
            icon={Hourglass}
            label="Awaiting payout"
            value={money(payoutSummary.owed)}
            hint={payoutSummary.owedCount ? `${payoutSummary.owedCount} payments` : undefined}
            tone="amber"
          />
        ) : null}
      </div>

      <div className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${showPayouts ? 'xl:grid-cols-3' : 'xl:grid-cols-2'}`}>
        <SummaryCard
          icon={Wallet}
          title="Collections subscription"
          action={sub ? 'Manage billing' : 'View billing'}
          onAction={() => onGo('billing')}
        >
          {sub ? (
            <>
              <div className="flex items-center gap-2">
                <Pill tone="brand">{sub.packageCode}</Pill>
                <StatusPill status={sub.status} />
              </div>
              <p className="text-sm text-muted">
                {sub.activatedAt ? `Active since ${shortDate(sub.activatedAt)}` : 'Not yet activated'}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">No collections subscription yet.</p>
              <Button type="button" variant="secondary" className="!py-1.5 !text-xs" onClick={onActivate}>
                Activate subscription
              </Button>
            </>
          )}
        </SummaryCard>

        <SummaryCard
          icon={FileSignature}
          title="Service agreement"
          action="Open agreement"
          onAction={() => onGo('agreement')}
        >
          {agreementStatus === 'NONE' ? (
            <Pill tone="gray">{agreement.label}</Pill>
          ) : (
            <StatusPill status={agreementStatus} />
          )}
          <p className="text-sm text-muted">{agreement.hint}</p>
        </SummaryCard>

        {showPayouts ? (
          <SummaryCard icon={Banknote} title="Payout account" action="Manage payouts" onAction={() => onGo('payouts')}>
            {hasAccount ? (
              <>
                <p className="text-sm font-medium text-ink">{payoutSummary.tenant.payoutName}</p>
                <p className="font-mono text-sm text-muted">{payoutSummary.tenant.payoutPhone}</p>
                {payoutSummary.holdUntil ? (
                  <Pill tone="amber">Payouts paused</Pill>
                ) : (
                  <Pill tone="green">Ready</Pill>
                )}
              </>
            ) : (
              <>
                <Pill tone="amber">Not set</Pill>
                <p className="text-sm text-muted">Money collected for this company waits until an account is added.</p>
              </>
            )}
          </SummaryCard>
        ) : null}
      </div>

      <div className={`grid grid-cols-1 gap-4 ${showPayouts ? 'lg:grid-cols-2' : ''}`}>
        <ListCard
          title="Latest invoices"
          onViewAll={() => onGo('billing')}
          empty="No invoices yet."
        >
          {invoices.slice(0, 4).map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {shortDate(i.periodStart)} – {shortDate(i.periodEnd)}
                </p>
                <p className="text-xs text-muted">{i.packageCode} · due {shortDate(i.dueDate)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-semibold tabular-nums text-ink">{money(i.total)}</span>
                <StatusPill status={i.status} />
              </div>
            </li>
          ))}
        </ListCard>

        {showPayouts ? (
          <ListCard title="Latest payouts" onViewAll={() => onGo('payouts')} empty="No payouts yet.">
            {payouts.slice(0, 4).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{shortDate(p.createdAt)}</p>
                  <p className="truncate text-xs text-muted">to {p.recipientName}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums text-ink">
                    {money(p.amount, p.currency)}
                  </span>
                  <StatusPill status={p.status} />
                </div>
              </li>
            ))}
          </ListCard>
        ) : null}
      </div>
    </div>
  );
}
