import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { apiErrorMessage } from '@/shared/agreements/apiError';
import { Button } from '@/shared/components/ui/Button';
import { Card, CardHeader } from '@/shared/components/ui/Card';
import { useConfirm } from '@/shared/components/ui/ConfirmDialog';
import { Field, Input, Select } from '@/shared/components/ui/Field';
import type { Tenant } from './types';

/**
 * What happens to a phone when its loan is repaid: handed over to the customer (retail credit),
 * or kept enrolled but unrestricted for the next loan (microfinance with phones as collateral).
 */
export function RepaymentPolicyCard({ tenant }: { tenant: Tenant }) {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [mode, setMode] = useState<'RELEASE' | 'KEEP_ENROLLED'>(tenant.afterRepayment ?? 'RELEASE');
  const [days, setDays] = useState(String(tenant.retentionDays ?? 90));

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.patch(`/tenants/${tenant.id}`, {
          afterRepayment: mode,
          retentionDays: Number(days),
        })
      ).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenants', tenant.id] }),
  });

  const dirty = mode !== (tenant.afterRepayment ?? 'RELEASE') || Number(days) !== (tenant.retentionDays ?? 90);
  const validDays = Number.isInteger(Number(days)) && Number(days) >= 7 && Number(days) <= 365;

  return (
    <Card>
      {dialog}
      <CardHeader
        title="After repayment"
        subtitle="What happens to a customer's phone when their loan is fully paid"
      />
      <div className="space-y-4 p-5 sm:p-6">
        <Field label="When a loan is repaid">
          <Select value={mode} onChange={(e) => setMode(e.target.value as 'RELEASE' | 'KEEP_ENROLLED')}>
            <option value="RELEASE">Release the phone to the customer (retail credit)</option>
            <option value="KEEP_ENROLLED">Keep the phone enrolled for the next loan (microfinance)</option>
          </Select>
        </Field>
        {mode === 'KEEP_ENROLLED' ? (
          <Field
            label="Release automatically after (days with no new loan)"
            hint="Between loans the phone is unlocked and has no restrictions. It is released if no new loan starts in time, or whenever the owner chooses."
          >
            <Input type="number" min="7" max="365" value={days} onChange={(e) => setDays(e.target.value)} />
          </Field>
        ) : null}
        <p className="text-xs text-muted">
          Keeping phones enrolled needs app version 0.6.0 or later on the phone. Earlier phones are released as
          before. The loan contract must tell the customer that the phone stays enrolled between loans.
        </p>
        {save.isError ? <p className="text-sm text-rose-600">{apiErrorMessage(save.error)}</p> : null}
        <Button
          disabled={!dirty || !validDays || save.isPending}
          onClick={async () => {
            const ok = await confirm({
              title: mode === 'KEEP_ENROLLED' ? 'Keep repaid phones enrolled?' : 'Release repaid phones?',
              message:
                mode === 'KEEP_ENROLLED'
                  ? `Phones stay under the lender's control between loans (unlocked, no restrictions) and are released after ${days} days with no new loan. Make sure the loan contract says so.`
                  : 'Phones are handed over to the customer as soon as their loan is repaid.',
              confirmLabel: 'Save policy',
            });
            if (ok) save.mutate();
          }}
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Card>
  );
}
