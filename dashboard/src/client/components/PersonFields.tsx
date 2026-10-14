import { useEffect, useState, type ReactNode } from 'react';
import { Camera, RefreshCw, Upload } from 'lucide-react';
import { Field, Input, Select } from '@/shared/components/ui/Field';
import { FieldGrid } from '@/shared/components/ui/FormSection';
import { cn } from '@/shared/lib/cn';

export type IdDocumentType = 'NATIONAL_ID' | 'VOTER_ID' | 'DRIVING_LICENSE' | 'PASSPORT';

export const ID_TYPES: Array<{ value: IdDocumentType; label: string }> = [
  { value: 'NATIONAL_ID', label: 'National ID (NIDA)' },
  { value: 'VOTER_ID', label: 'Voter ID' },
  { value: 'DRIVING_LICENSE', label: 'Driving licence' },
  { value: 'PASSPORT', label: 'Passport' },
];

export const RELATIONSHIPS = [
  'Parent',
  'Spouse',
  'Sibling',
  'Child',
  'Relative',
  'Friend',
  'Employer',
  'Neighbour',
  'Other',
] as const;


/** Object URL for a File that is created and revoked together (safe under StrictMode). */
export function useObjectUrl(file: File | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

export type PersonForm = {
  fullName: string;
  relationship: string;
  phone: string;
  idDocumentType: IdDocumentType;
  nationalId: string;
  address: string;
  photo: File | null;
};

export const emptyPerson = (): PersonForm => ({
  fullName: '',
  relationship: '',
  phone: '',
  idDocumentType: 'NATIONAL_ID',
  nationalId: '',
  address: '',
  photo: null,
});

export type PersonErrors = Partial<Record<keyof PersonForm, string>>;

export function validatePerson(
  p: PersonForm,
  kind: 'customer' | 'guardian',
  opts: { photoOptional?: boolean } = {},
): PersonErrors {
  const e: PersonErrors = {};
  if (p.fullName.trim().length < 2) e.fullName = 'Enter the full name';
  if (kind === 'guardian' && !p.relationship) e.relationship = 'Select the relationship';
  if (p.phone.replace(/\D/g, '').length < 7) e.phone = 'Enter a valid phone number';
  if (p.nationalId.trim().length < 4) e.nationalId = 'Enter the ID number';
  if (p.address.trim().length < 3) e.address = 'Enter the physical address';
  if (!p.photo && !opts.photoOptional) e.photo = 'Take or upload a photo';
  return e;
}

const ID_PLACEHOLDER: Record<IdDocumentType, string> = {
  NATIONAL_ID: '19850615-12345-00001-23',
  VOTER_ID: 'T-1234-5678-9012',
  DRIVING_LICENSE: '4001234567',
  PASSPORT: 'AB123456',
};

/**
 * One person's details: used for the customer and for each guardian so both
 * forms look and behave the same (phone, photo, ID type + number, address).
 */
export function PersonFields({
  kind,
  value,
  onChange,
  errors,
  existingPhoto,
  afterPhone,
  photoLabel,
}: {
  kind: 'customer' | 'guardian';
  value: PersonForm;
  onChange: (next: PersonForm) => void;
  errors: PersonErrors;
  existingPhoto?: boolean;
  afterPhone?: ReactNode;
  photoLabel?: string;
}) {
  const set = <K extends keyof PersonForm>(k: K, v: PersonForm[K]) =>
    onChange({ ...value, [k]: v });

  const phone = (
    <Field label="Phone number" required error={errors.phone}>
      <Input
        value={value.phone}
        onChange={(e) => set('phone', e.target.value)}
        placeholder="+255 7XX XXX XXX"
        inputMode="tel"
        autoComplete="off"
      />
    </Field>
  );
  const name = (
    <Field label="Full name" required error={errors.fullName}>
      <Input
        value={value.fullName}
        onChange={(e) => set('fullName', e.target.value)}
        placeholder="As written on the ID"
        autoComplete="off"
      />
    </Field>
  );

  return (
    <div className="space-y-4">
      <FieldGrid>
        {kind === 'customer' ? (
          <>
            {phone}
            {name}
          </>
        ) : (
          <>
            {name}
            <Field label="Relationship to customer" required error={errors.relationship}>
              <Select
                value={value.relationship}
                onChange={(e) => set('relationship', e.target.value)}
              >
                <option value="">Select…</option>
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            {phone}
          </>
        )}
        {afterPhone ? <div className="sm:col-span-2">{afterPhone}</div> : null}
        <Field label="ID type" required>
          <Select
            value={value.idDocumentType}
            onChange={(e) => set('idDocumentType', e.target.value as IdDocumentType)}
          >
            {ID_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ID number" required error={errors.nationalId}>
          <Input
            value={value.nationalId}
            onChange={(e) => set('nationalId', e.target.value)}
            placeholder={`e.g. ${ID_PLACEHOLDER[value.idDocumentType]}`}
            autoComplete="off"
          />
        </Field>
        <div className={kind === 'customer' ? 'sm:col-span-2' : undefined}>
          <Field label="Physical address" required error={errors.address}>
            <Input
              value={value.address}
              onChange={(e) => set('address', e.target.value)}
              placeholder="Street, ward, district, city"
              autoComplete="off"
            />
          </Field>
        </div>
      </FieldGrid>
      <PhotoCapture
        label={photoLabel ?? 'Photo'}
        file={value.photo}
        hasExisting={existingPhoto}
        error={errors.photo}
        onChange={(f) => set('photo', f)}
      />
    </div>
  );
}

export function PhotoCapture({
  label,
  file,
  hasExisting,
  error,
  onChange,
}: {
  label: string;
  file: File | null;
  hasExisting?: boolean;
  error?: string;
  onChange: (f: File | null) => void;
}) {
  const url = useObjectUrl(file);
  const accept = 'image/jpeg,image/png,image/webp';
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.files?.[0] ?? null);
    e.target.value = '';
  };

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink">
        {label} <span className="text-rose-600">*</span>
      </span>
      <div
        className={cn(
          'flex flex-col items-center gap-4 rounded-2xl border border-dashed p-4 sm:flex-row',
          error ? 'border-rose-300 bg-rose-50/50' : 'border-line bg-canvas/40',
        )}
      >
        {url ? (
          <img src={url} alt={`${label} preview`} className="h-28 w-28 shrink-0 rounded-2xl object-cover" />
        ) : (
          <span className="flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl bg-canvas text-muted">
            <Camera className="h-8 w-8" />
          </span>
        )}
        <div className="flex flex-1 flex-col items-center gap-3 text-center sm:items-start sm:text-left">
          <p className="text-xs text-muted">
            {url
              ? 'Looks good? You can retake it.'
              : hasExisting
                ? 'A photo is already on file. Add a new one only if needed.'
                : 'Face clearly visible, good light. JPG, PNG or WebP, up to 8 MB.'}
          </p>
          <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
              {url ? <RefreshCw className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
              {url ? 'Retake' : 'Take photo'}
              <input type="file" accept={accept} capture="user" className="sr-only" onChange={pick} />
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-canvas">
              <Upload className="h-4 w-4" /> Upload
              <input type="file" accept={accept} className="sr-only" onChange={pick} />
            </label>
          </div>
        </div>
      </div>
      {error ? <span className="mt-1 block text-xs text-rose-600">{error}</span> : null}
    </div>
  );
}
