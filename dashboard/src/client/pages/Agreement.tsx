import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileSignature, Printer } from 'lucide-react';
import { api } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/AuthContext';
import { AgreementDocument } from '@/shared/agreements/AgreementDocument';
import { SignForm } from '@/shared/agreements/SignForm';
import { apiErrorMessage } from '@/shared/agreements/apiError';
import type { Agreement, SignPayload } from '@/shared/agreements/types';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { StatusPill } from '@/shared/components/ui/Pill';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { shortDate } from '@/shared/lib/format';

export default function AgreementPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [signing, setSigning] = useState(false);

  const query = useQuery({
    queryKey: ['agreements', 'me'],
    queryFn: async () => (await api.get<Agreement | null>('/agreements/me')).data,
  });

  const sign = useMutation({
    mutationFn: async (payload: SignPayload) =>
      (await api.post<Agreement>(`/agreements/me/${query.data!.id}/sign`, payload)).data,
    onSuccess: () => {
      setSigning(false);
      qc.invalidateQueries({ queryKey: ['agreements'] });
    },
  });

  if (query.isLoading) {
    return (
      <Center>
        <Spinner />
      </Center>
    );
  }

  const a = query.data;
  if (!a) {
    return (
      <Card>
        <EmptyState
          title="No service agreement yet"
          hint="When the platform issues your service agreement it will appear here for signing."
        />
      </Card>
    );
  }

  const canSign = a.status === 'SENT' && user?.role === 'OWNER';

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
              <FileSignature className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-bold tracking-tight">Service agreement</span>
                <StatusPill status={a.status} />
              </div>
              <p className="mt-0.5 text-sm text-muted">{statusHint(a, user?.role === 'OWNER')}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print / Save PDF
            </Button>
            {canSign && !signing ? (
              <Button onClick={() => setSigning(true)}>
                <FileSignature className="h-4 w-4" />
                Sign agreement
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      {signing ? (
        <Card className="p-5 sm:p-6">
          <h2 className="text-base font-semibold">Sign for {a.clientName}</h2>
          <p className="mb-5 mt-0.5 text-sm text-muted">
            Review the agreement below, then sign. Your name, time, and device details are
            recorded with the signature.
          </p>
          <SignForm
            partyName={a.clientName}
            submitLabel="Sign agreement"
            pending={sign.isPending}
            error={sign.isError ? apiErrorMessage(sign.error) : null}
            defaultName={user?.fullName}
            onSubmit={(p) => sign.mutate(p)}
          />
        </Card>
      ) : null}

      {a.status === 'ACTIVE' ? (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Fully signed and in force since {shortDate(a.activatedAt)}.
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl2 border border-line bg-white shadow-card">
        <AgreementDocument agreement={a} />
      </div>
    </div>
  );
}

function statusHint(a: Agreement, isOwner: boolean): string {
  switch (a.status) {
    case 'SENT':
      return isOwner
        ? 'Waiting for your signature. Devices cannot be enrolled until it is signed.'
        : 'Waiting for the company owner to sign.';
    case 'CLIENT_SIGNED':
      return `You signed on ${shortDate(a.clientSignedAt)}. Waiting for countersignature.`;
    case 'ACTIVE':
      return `Executed ${shortDate(a.activatedAt)}`;
    default:
      return '';
  }
}
