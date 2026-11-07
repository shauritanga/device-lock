import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import type { Payout, PayoutSummary } from '@/shared/api/types';
import { useAuth } from '@/shared/auth/AuthContext';
import type { AgreementSummary } from '@/shared/agreements/types';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input, Select } from '@/shared/components/ui/Field';
import { Modal } from '@/shared/components/ui/Modal';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { money } from '@/shared/lib/format';
import { AgreementCard } from '../components/AgreementCard';
import { PayoutAccountCard } from '../components/PayoutAccountCard';
import { BillingTab } from '../components/company/BillingTab';
import { CompanyHeader } from '../components/company/CompanyHeader';
import { OverviewTab } from '../components/company/OverviewTab';
import type {
  BillingSummary,
  Invoice,
  PackageDef,
  TabId,
  Tenant,
} from '../components/company/types';

const TAB_IDS: TabId[] = ['overview', 'billing', 'payouts', 'agreement'];

/**
 * One company, organised into tabs: an at-a-glance overview, then billing,
 * payouts and the service agreement each on their own.
 */
export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [activateOpen, setActivateOpen] = useState(false);
  const [packageCode, setPackageCode] = useState('STARTER');
  const [notes, setNotes] = useState('');

  // Payout data is restricted to super admins by the API.
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const requested = params.get('tab') as TabId | null;
  const tab: TabId =
    requested && TAB_IDS.includes(requested) && (isSuperAdmin || requested !== 'payouts')
      ? requested
      : 'overview';
  const goTab = (t: TabId) => {
    const next = new URLSearchParams(params);
    if (t === 'overview') next.delete('tab');
    else next.set('tab', t);
    setParams(next, { replace: true });
  };

  const tenant = useQuery({
    queryKey: ['tenants', id],
    queryFn: async () => (await api.get<Tenant>(`/tenants/${id}`)).data,
    enabled: !!id,
    retry: false,
  });
  const packages = useQuery({
    queryKey: ['collections', 'packages'],
    queryFn: async () => (await api.get<PackageDef[]>('/collections/packages')).data,
  });
  const billing = useQuery({
    queryKey: ['collections', 'billing', id],
    queryFn: async () =>
      (await api.get<BillingSummary>(`/collections/billing/summary?tenantId=${id}`)).data,
    enabled: !!id,
  });
  const invoices = useQuery({
    queryKey: ['collections', 'invoices', id],
    queryFn: async () => (await api.get<Invoice[]>(`/collections/invoices?tenantId=${id}`)).data,
    enabled: !!id,
  });
  const agreements = useQuery({
    queryKey: ['agreements', 'tenant', id],
    queryFn: async () => (await api.get<AgreementSummary[]>(`/agreements?tenantId=${id}`)).data,
    enabled: !!id,
  });
  const payoutSummary = useQuery({
    queryKey: ['payouts', 'summary', id],
    queryFn: async () => (await api.get<PayoutSummary>(`/payouts/summary?tenantId=${id}`)).data,
    enabled: !!id && isSuperAdmin,
  });
  const payouts = useQuery({
    queryKey: ['payouts', 'list', id],
    queryFn: async () => (await api.get<Payout[]>(`/payouts?tenantId=${id}`)).data,
    enabled: !!id && isSuperAdmin,
  });

  const activateSub = useMutation({
    mutationFn: async () =>
      (
        await api.post('/collections/subscriptions/activate', {
          tenantId: id,
          packageCode,
          notes: notes || undefined,
        })
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections'] });
      setActivateOpen(false);
    },
  });
  const generateInvoice = useMutation({
    mutationFn: async () => (await api.post('/collections/invoices/generate', { tenantId: id })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections', 'invoices', id] });
      qc.invalidateQueries({ queryKey: ['collections', 'billing', id] });
    },
  });
  const markInvoicePaid = useMutation({
    mutationFn: async (invoiceId: string) =>
      (await api.post(`/collections/invoices/${invoiceId}/mark-paid`, {})).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections', 'invoices', id] });
      qc.invalidateQueries({ queryKey: ['collections', 'billing', id] });
      qc.invalidateQueries({ queryKey: ['collections', 'subscriptions'] });
    },
  });

  const sub = billing.data?.subscription;
  const invs = invoices.data ?? billing.data?.invoices ?? [];
  const name = tenant.data?.name ?? invs[0]?.tenant?.name ?? 'Company';
  const liveAgreement = (agreements.data ?? []).find((a) => a.status !== 'VOID');

  const openActivate = () => {
    setPackageCode(sub?.packageCode ?? billing.data?.suggestedPackage ?? 'STARTER');
    setNotes(sub?.notes ?? '');
    setActivateOpen(true);
  };

  if (tenant.isLoading || billing.isLoading) {
    return (
      <Center>
        <Spinner />
      </Center>
    );
  }
  if (tenant.isError) {
    return (
      <div className="space-y-3">
        <Link to="/companies" className="text-sm font-medium text-muted hover:text-ink">
          ← Companies
        </Link>
        <EmptyState title="Company not found" hint="It may have been removed." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CompanyHeader
        name={name}
        country={tenant.data?.country}
        createdAt={tenant.data?.createdAt}
        isActive={tenant.data?.isActive}
        subscriptionStatus={sub?.status ?? 'NONE'}
        packageCode={sub?.packageCode}
        tab={tab}
        onTab={goTab}
        hidden={isSuperAdmin ? [] : ['payouts']}
      />

      {tab === 'overview' ? (
        <OverviewTab
          billing={billing.data}
          invoices={invs}
          agreementStatus={liveAgreement?.status ?? 'NONE'}
          payoutSummary={isSuperAdmin ? payoutSummary.data : undefined}
          payouts={payouts.data ?? []}
          onGo={goTab}
          onActivate={openActivate}
        />
      ) : null}

      {tab === 'billing' ? (
        <BillingTab
          billing={billing.data}
          invoices={invs}
          onActivate={openActivate}
          onGenerate={() => generateInvoice.mutate()}
          generating={generateInvoice.isPending}
          onMarkPaid={(invoiceId) => markInvoicePaid.mutate(invoiceId)}
          markingPaid={markInvoicePaid.isPending}
        />
      ) : null}

      {tab === 'payouts' && id ? <PayoutAccountCard tenantId={id} /> : null}

      {tab === 'agreement' && id ? <AgreementCard tenantId={id} companyName={name} /> : null}

      <Modal
        open={activateOpen}
        onClose={() => setActivateOpen(false)}
        title={sub ? 'Update package' : 'Activate subscription'}
        className="max-w-lg"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            activateSub.mutate();
          }}
        >
          <p className="text-sm text-muted">
            For <span className="font-medium text-ink">{name}</span>. Device band must match the
            package.
          </p>
          {(packages.data ?? []).length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {(packages.data ?? []).map((p) => (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => setPackageCode(p.code)}
                  className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                    packageCode === p.code
                      ? 'border-brand-400 bg-brand-50 ring-2 ring-brand-100'
                      : 'border-line bg-canvas/60 hover:border-brand-200'
                  }`}
                >
                  <p className="font-semibold text-ink">{p.label}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {p.deviceBandMin}–{p.deviceBandMax} devices
                  </p>
                  <p className="mt-1 text-xs font-semibold tabular-nums text-ink">
                    {p.priceModel === 'PER_DEVICE'
                      ? `${money(p.unitPrice ?? 0)}/dev`
                      : `${money(p.flatPrice ?? 0)}/mo`}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <Field label="Package">
              <Select value={packageCode} onChange={(e) => setPackageCode(e.target.value)}>
                <option value="STARTER">STARTER</option>
                <option value="GROWTH">GROWTH</option>
                <option value="BUSINESS">BUSINESS</option>
              </Select>
            </Field>
          )}
          <Field label="Notes">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </Field>
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button type="submit" disabled={activateSub.isPending}>
              {activateSub.isPending ? 'Saving…' : sub ? 'Update' : 'Activate'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setActivateOpen(false)}>
              Cancel
            </Button>
          </div>
          {activateSub.isError ? (
            <p className="text-sm text-rose-600">
              Failed — check the device count matches the package band.
            </p>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
