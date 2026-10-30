import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSignature, Printer } from 'lucide-react';
import { api } from '@/shared/api/client';
import { AgreementDocument } from '@/shared/agreements/AgreementDocument';
import { SignForm } from '@/shared/agreements/SignForm';
import { apiErrorMessage } from '@/shared/agreements/apiError';
import type { Agreement, AgreementSummary, SignPayload } from '@/shared/agreements/types';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Field, Input } from '@/shared/components/ui/Field';
import { Modal } from '@/shared/components/ui/Modal';
import { StatusPill } from '@/shared/components/ui/Pill';
import { Table, Row } from '@/shared/components/ui/Table';
import { money, shortDate } from '@/shared/lib/format';

type FormState = {
  providerName: string;
  providerAddress: string;
  providerEmail: string;
  providerPhone: string;
  clientName: string;
  clientAddress: string;
  clientEmail: string;
  clientPhone: string;
  feePerDevice: string;
};

const DEFAULT_PROVIDER = 'Mega Agency Company Limited';

function formFrom(a: Agreement | null, clientName: string): FormState {
  return {
    providerName: a?.providerName ?? DEFAULT_PROVIDER,
    providerAddress: a?.providerAddress ?? '',
    providerEmail: a?.providerEmail ?? '',
    providerPhone: a?.providerPhone ?? '',
    clientName: a?.clientName ?? clientName,
    clientAddress: a?.clientAddress ?? '',
    clientEmail: a?.clientEmail ?? '',
    clientPhone: a?.clientPhone ?? '',
    feePerDevice: String(a?.feePerDevice ?? 5000),
  };
}

/** Service agreement lifecycle for one company: prepare → send → countersign. */
export function AgreementCard({ tenantId, companyName }: { tenantId: string; companyName: string }) {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Agreement | null>(null);
  const [form, setForm] = useState<FormState>(formFrom(null, companyName));
  const [countersigning, setCountersigning] = useState(false);

  const list = useQuery({
    queryKey: ['agreements', 'tenant', tenantId],
    queryFn: async () =>
      (await api.get<AgreementSummary[]>(`/agreements?tenantId=${tenantId}`)).data,
  });

  const detail = useQuery({
    queryKey: ['agreements', 'detail', viewId],
    queryFn: async () => (await api.get<Agreement>(`/agreements/${viewId}`)).data,
    enabled: !!viewId,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['agreements'] });

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        ...form,
        feePerDevice: Number(form.feePerDevice),
        providerEmail: form.providerEmail || undefined,
        providerPhone: form.providerPhone || undefined,
        clientPhone: form.clientPhone || undefined,
      };
      return editing
        ? (await api.patch<Agreement>(`/agreements/${editing.id}`, body)).data
        : (await api.post<Agreement>('/agreements', { tenantId, ...body })).data;
    },
    onSuccess: (a) => {
      setFormOpen(false);
      setViewId(a.id);
      refresh();
    },
  });

  const send = useMutation({
    mutationFn: async (id: string) => (await api.post(`/agreements/${id}/send`)).data,
    onSuccess: refresh,
  });
  const voidIt = useMutation({
    mutationFn: async (id: string) => (await api.post(`/agreements/${id}/void`, {})).data,
    onSuccess: () => {
      setViewId(null);
      refresh();
    },
  });
  const countersign = useMutation({
    mutationFn: async (p: SignPayload) =>
      (await api.post(`/agreements/${viewId}/countersign`, p)).data,
    onSuccess: () => {
      setCountersigning(false);
      refresh();
    },
  });

  const rows = list.data ?? [];
  const live = rows.find((r) => r.status !== 'VOID');
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const openCreate = () => {
    setEditing(null);
    setForm(formFrom(null, companyName));
    setFormOpen(true);
  };
  const openEdit = (a: Agreement) => {
    setEditing(a);
    setForm(formFrom(a, companyName));
    setFormOpen(true);
  };

  const a = detail.data;
  const formValid =
    form.providerName && form.providerAddress && form.clientName && form.clientAddress &&
    form.clientEmail && Number(form.feePerDevice) > 0;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <FileSignature className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-base font-semibold tracking-tight">Service agreement</h3>
            <p className="text-sm text-muted">
              {live
                ? 'Devices can be enrolled once this is fully signed.'
                : 'No agreement yet. Prepare one to onboard this company.'}
            </p>
          </div>
        </div>
        {!live ? <Button onClick={openCreate}>Prepare agreement</Button> : null}
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <Table columns={['Created', 'Fee / device', 'Sent', 'Status', '']}>
            {rows.map((r) => (
              <Row key={r.id}>
                <td className="px-4 py-3 text-muted">{shortDate(r.createdAt)}</td>
                <td className="px-4 py-3 tabular-nums">{money(r.feePerDevice)}</td>
                <td className="px-4 py-3 text-muted">{shortDate(r.sentAt)}</td>
                <td className="px-4 py-3">
                  <StatusPill status={r.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="secondary"
                    className="!py-1.5 !text-xs"
                    onClick={() => {
                      setCountersigning(false);
                      setViewId(r.id);
                    }}
                  >
                    Open
                  </Button>
                </td>
              </Row>
            ))}
          </Table>
        </div>
      ) : null}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit agreement details' : 'Prepare service agreement'}
        className="max-w-2xl"
      >
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">Service provider</legend>
            <Field label="Company name" required>
              <Input value={form.providerName} onChange={set('providerName')} />
            </Field>
            <Field label="Registered office" required>
              <Input value={form.providerAddress} onChange={set('providerAddress')} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Notice email">
                <Input type="email" value={form.providerEmail} onChange={set('providerEmail')} />
              </Field>
              <Field label="Notice phone">
                <Input value={form.providerPhone} onChange={set('providerPhone')} />
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">Client</legend>
            <Field label="Company name" required>
              <Input value={form.clientName} onChange={set('clientName')} />
            </Field>
            <Field label="Registered office" required>
              <Input value={form.clientAddress} onChange={set('clientAddress')} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Notice email" required hint="The signing request is sent here.">
                <Input type="email" value={form.clientEmail} onChange={set('clientEmail')} />
              </Field>
              <Field label="Notice phone">
                <Input value={form.clientPhone} onChange={set('clientPhone')} />
              </Field>
            </div>
          </fieldset>

          <Field label="Monthly fee per device (TZS)" required>
            <Input
              type="number"
              min={1}
              value={form.feePerDevice}
              onChange={set('feePerDevice')}
            />
          </Field>

          {save.isError ? (
            <p className="text-sm text-rose-600">{apiErrorMessage(save.error)}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formValid || save.isPending}>
              {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create draft'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!viewId}
        onClose={() => {
          setViewId(null);
          setCountersigning(false);
        }}
        title="Service agreement"
        className="max-w-4xl"
      >
        {a ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusPill status={a.status} />
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" />
                  Print / Save PDF
                </Button>
                {a.status === 'DRAFT' ? (
                  <>
                    <Button variant="secondary" onClick={() => openEdit(a)}>
                      Edit details
                    </Button>
                    <Button onClick={() => send.mutate(a.id)} disabled={send.isPending}>
                      {send.isPending ? 'Sending…' : 'Send to client'}
                    </Button>
                  </>
                ) : null}
                {a.status === 'SENT' ? (
                  <Button
                    variant="secondary"
                    onClick={() => send.mutate(a.id)}
                    disabled={send.isPending}
                  >
                    Resend email
                  </Button>
                ) : null}
                {a.status === 'CLIENT_SIGNED' && !countersigning ? (
                  <Button onClick={() => setCountersigning(true)}>Countersign</Button>
                ) : null}
                {a.status !== 'VOID' ? (
                  <Button
                    variant="danger"
                    onClick={() => {
                      if (window.confirm('Void this agreement? This cannot be undone.')) {
                        voidIt.mutate(a.id);
                      }
                    }}
                    disabled={voidIt.isPending}
                  >
                    Void
                  </Button>
                ) : null}
              </div>
            </div>

            {send.isError ? (
              <p className="text-sm text-rose-600">{apiErrorMessage(send.error)}</p>
            ) : null}

            {countersigning ? (
              <div className="rounded-xl border border-line p-4">
                <h4 className="mb-4 font-semibold">Countersign for {a.providerName}</h4>
                <SignForm
                  partyName={a.providerName}
                  submitLabel="Countersign & activate"
                  pending={countersign.isPending}
                  error={countersign.isError ? apiErrorMessage(countersign.error) : null}
                  onSubmit={(p) => countersign.mutate(p)}
                />
              </div>
            ) : null}

            <div className="overflow-hidden rounded-xl border border-line">
              <AgreementDocument agreement={a} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">Loading…</p>
        )}
      </Modal>
    </Card>
  );
}
