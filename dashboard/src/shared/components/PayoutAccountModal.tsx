import { useEffect, useState } from 'react';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input } from '@/shared/components/ui/Field';
import { Modal } from '@/shared/components/ui/Modal';

/** Mirrors the backend rule: 07XXXXXXXX, 255XXXXXXXXX or +255XXXXXXXXX (mobile). */
const TZ_MOBILE = /^(\+?255|0)[67]\d{8}$/;

export function apiErrorText(e: unknown): string {
  const msg = (e as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Something went wrong.');
}

export type AccountForm = { phone: string; name: string; password: string };

/**
 * Edit a payout account. Owners must re-enter their password; admins (who are
 * already trusted) don't.
 */
export function PayoutAccountModal({
  open,
  onClose,
  company,
  initial,
  requirePassword,
  holdNotice,
  pending,
  error,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  company?: string;
  initial: { phone: string; name: string };
  requirePassword: boolean;
  /** Shown when changing the number will pause payouts. */
  holdNotice?: string;
  pending: boolean;
  error?: unknown;
  onSubmit: (form: AccountForm) => void;
}) {
  const [form, setForm] = useState<AccountForm>({ ...initial, password: '' });

  useEffect(() => {
    if (open) setForm({ ...initial, password: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const phoneOk = TZ_MOBILE.test(form.phone.trim());
  const valid =
    phoneOk && form.name.trim().length >= 2 && (!requirePassword || form.password.length > 0);

  return (
    <Modal open={open} onClose={onClose} title="Payout account" className="max-w-md">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSubmit({ ...form, phone: form.phone.trim(), name: form.name.trim() });
        }}
      >
        <p className="text-sm text-muted">
          Collected instalments{company ? ' for ' : ' '}
          {company ? <span className="font-medium text-ink">{company}</span> : null} are sent
          to this mobile-money account.
        </p>
        <Field label="Mobile-money number">
          <Input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="0712345678 or 255712345678"
            inputMode="tel"
            required
          />
          {form.phone.trim() !== '' && !phoneOk ? (
            <p className="mt-1 text-xs text-rose-600">
              Enter a Tanzanian mobile number (07… / 06… / 255…).
            </p>
          ) : null}
        </Field>
        <Field label="Registered name on the account">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Name as registered with the network"
            minLength={2}
            required
          />
        </Field>
        {requirePassword ? (
          <Field label="Your password">
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Confirm it's you"
              autoComplete="current-password"
              required
            />
          </Field>
        ) : null}
        {holdNotice ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{holdNotice}</p>
        ) : null}
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button type="submit" disabled={pending || !valid}>
            {pending ? 'Saving…' : 'Save account'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
        {error ? <p className="text-sm text-rose-600">{apiErrorText(error)}</p> : null}
      </form>
    </Modal>
  );
}
