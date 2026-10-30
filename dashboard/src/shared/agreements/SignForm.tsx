import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { SignaturePad } from './SignaturePad';
import type { SignPayload } from './types';

/** Signatory details + signature + optional witness, shared by client and platform signing. */
export function SignForm({
  partyName,
  submitLabel,
  pending,
  error,
  defaultName,
  onSubmit,
}: {
  partyName: string;
  submitLabel: string;
  pending: boolean;
  error?: string | null;
  defaultName?: string;
  onSubmit: (payload: SignPayload) => void;
}) {
  const [name, setName] = useState(defaultName ?? '');
  const [title, setTitle] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [witnessName, setWitnessName] = useState('');
  const [witnessSignature, setWitnessSignature] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(false);

  const witnessIncomplete = !!witnessName.trim() !== !!witnessSignature;
  const ready =
    name.trim().length >= 2 &&
    title.trim().length >= 2 &&
    !!signature &&
    authorized &&
    !witnessIncomplete;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready || !signature) return;
        onSubmit({
          signatoryName: name.trim(),
          signatoryTitle: title.trim(),
          signature,
          witnessName: witnessName.trim() || undefined,
          witnessSignature: witnessSignature ?? undefined,
          authorized,
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Signatory name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Field>
        <Field label="Title / position" required>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Managing Director"
          />
        </Field>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium text-ink">
          Signature for {partyName}
          <span className="ml-0.5 text-rose-600">*</span>
        </p>
        <SignaturePad value={signature} onChange={setSignature} />
      </div>

      <details className="rounded-xl border border-line bg-canvas/60 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-ink">
          Add a witness (optional)
        </summary>
        <div className="mt-4 space-y-4">
          <Field
            label="Witness name"
            error={witnessIncomplete ? 'Provide both the witness name and signature' : null}
          >
            <Input value={witnessName} onChange={(e) => setWitnessName(e.target.value)} />
          </Field>
          <SignaturePad value={witnessSignature} onChange={setWitnessSignature} />
        </div>
      </details>

      <label className="flex items-start gap-2.5 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={authorized}
          onChange={(e) => setAuthorized(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-line text-brand-600"
        />
        <span>
          I have read and understood this agreement, and I am authorized to sign it on behalf
          of <span className="font-medium">{partyName}</span>.
        </span>
      </label>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <Button type="submit" disabled={!ready || pending} className="w-full sm:w-auto">
        {pending ? 'Signing…' : submitLabel}
      </Button>
    </form>
  );
}
