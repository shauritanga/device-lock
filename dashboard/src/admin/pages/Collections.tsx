import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Headphones, RefreshCw } from 'lucide-react';
import { api } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/AuthContext';
import { PLATFORM_ADMIN_ROLES } from '@/shared/auth/roles';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Field, Select } from '@/shared/components/ui/Field';
import { Center, Spinner } from '@/shared/components/ui/misc';
import { CaseList, type CollectionCase } from '@/shared/components/CaseList';

type Collector = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  phone?: string | null;
  isActive: boolean;
  _count?: { assignedCollectionCases: number };
};

const caseHref = (id: string) => `/cases/${id}`;

/**
 * The collector work queue. Platform admins see and assign the unassigned pool;
 * every admin-console role sees the cases assigned to them.
 */
export default function Collections() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isPlatformAdmin = user ? PLATFORM_ADMIN_ROLES.includes(user.role) : false;

  const [assignCaseId, setAssignCaseId] = useState<string | null>(null);
  const [assignTo, setAssignTo] = useState('');

  const mine = useQuery({
    queryKey: ['collections', 'cases', 'mine'],
    queryFn: async () => (await api.get<CollectionCase[]>('/collections/cases/mine')).data,
    enabled: Boolean(user),
  });

  const unassigned = useQuery({
    queryKey: ['collections', 'cases', 'unassigned'],
    queryFn: async () =>
      (await api.get<CollectionCase[]>('/collections/cases/unassigned')).data,
    enabled: isPlatformAdmin,
  });

  const collectors = useQuery({
    queryKey: ['collections', 'collectors'],
    queryFn: async () => (await api.get<Collector[]>('/collections/collectors')).data,
    enabled: isPlatformAdmin,
  });

  const sync = useMutation({
    mutationFn: async () => (await api.post('/collections/sync')).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collections'] }),
  });

  const autoAssign = useMutation({
    mutationFn: async () =>
      (await api.post('/collections/cases/auto-assign', { limit: 50 })).data as {
        assigned: number;
      },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collections'] }),
  });

  const assign = useMutation({
    mutationFn: async () => {
      if (!assignCaseId || !assignTo) throw new Error('Pick a collector');
      return (
        await api.post(`/collections/cases/${assignCaseId}/assign`, {
          assignedToId: assignTo,
        })
      ).data;
    },
    onSuccess: () => {
      setAssignCaseId(null);
      setAssignTo('');
      qc.invalidateQueries({ queryKey: ['collections'] });
    },
  });

  if (!user) {
    return (
      <Center>
        <Spinner />
      </Center>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Headphones className="h-4 w-4" />
          Every case shows the seller company it belongs to
        </div>
        {isPlatformAdmin ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => sync.mutate()}
              disabled={sync.isPending}
            >
              <RefreshCw className={`h-4 w-4 ${sync.isPending ? 'animate-spin' : ''}`} />
              Sync overdue cases
            </Button>
            <Button
              variant="secondary"
              onClick={() => autoAssign.mutate()}
              disabled={autoAssign.isPending}
            >
              {autoAssign.isPending
                ? 'Assigning…'
                : autoAssign.isSuccess
                  ? `Assigned ${autoAssign.data.assigned}`
                  : 'Auto-assign queue'}
            </Button>
          </div>
        ) : null}
      </div>

      {isPlatformAdmin ? (
        <CaseList
          title="Unassigned work queue"
          subtitle="Assign to a collector — company column always visible"
          rows={unassigned.data}
          loading={unassigned.isLoading}
          empty="No unassigned cases. Activate a subscription and sync."
          showCompany
          actionLabel="Assign"
          caseHref={caseHref}
          onAction={(id) => {
            setAssignCaseId(id);
            setAssignTo(collectors.data?.[0]?.id ?? '');
          }}
        />
      ) : null}

      <CaseList
        title="My queue"
        subtitle="Cases assigned to you"
        rows={mine.data}
        loading={mine.isLoading}
        empty="No cases assigned to you yet."
        showCompany
        caseHref={caseHref}
      />

      {assignCaseId && isPlatformAdmin ? (
        <Card className="border-brand-200 p-5">
          <p className="font-semibold">Assign case</p>
          <p className="text-xs text-muted">Case id: {assignCaseId}</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <Field label="Collector">
              <Select value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                <option value="">Select…</option>
                {(collectors.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} ({c.role})
                  </option>
                ))}
              </Select>
            </Field>
            <Button onClick={() => assign.mutate()} disabled={assign.isPending}>
              {assign.isPending ? 'Assigning…' : 'Confirm assign'}
            </Button>
            <Button variant="ghost" onClick={() => setAssignCaseId(null)}>
              Cancel
            </Button>
          </div>
          {assign.isError ? (
            <p className="mt-2 text-sm text-rose-600">
              Could not assign — pick a collector and try again.
            </p>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
