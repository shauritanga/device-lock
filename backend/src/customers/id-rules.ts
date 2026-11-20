import { IdDocumentType } from '@prisma/client';

export interface IdCheck {
  valid: boolean;
  /** Human-readable reason when invalid. */
  reason?: string;
  /** Normalised number (digits/letters only, upper case). */
  normalized: string;
}

/**
 * Format checks for the ID documents shops accept. This proves the number is
 * well formed, not that it is registered: there is no NIDA lookup here.
 */
export function checkIdNumber(type: IdDocumentType, raw: string): IdCheck {
  const normalized = raw.replace(/[\s-]/g, '').toUpperCase();
  const fail = (reason: string): IdCheck => ({ valid: false, reason, normalized });

  switch (type) {
    case IdDocumentType.NATIONAL_ID: {
      // NIDA: 20 digits, YYYYMMDD-XXXXX-XXXXX-XX. The first eight are the birth date.
      if (!/^\d{20}$/.test(normalized)) return fail('A NIDA number has 20 digits');
      const year = Number(normalized.slice(0, 4));
      const month = Number(normalized.slice(4, 6));
      const day = Number(normalized.slice(6, 8));
      const born = new Date(Date.UTC(year, month - 1, day));
      const real =
        born.getUTCFullYear() === year &&
        born.getUTCMonth() === month - 1 &&
        born.getUTCDate() === day;
      if (!real || year < 1900 || born.getTime() > Date.now()) {
        return fail('The birth date inside the NIDA number is not valid');
      }
      const age = (Date.now() - born.getTime()) / (365.25 * 24 * 3600 * 1000);
      if (age < 18) return fail('The customer must be at least 18 years old');
      return { valid: true, normalized };
    }
    case IdDocumentType.DRIVING_LICENSE:
      return /^\d{10}$/.test(normalized)
        ? { valid: true, normalized }
        : fail('A driving licence number has 10 digits');
    case IdDocumentType.PASSPORT:
      return /^[A-Z]{1,2}\d{6,8}$/.test(normalized)
        ? { valid: true, normalized }
        : fail('A passport number is 1-2 letters followed by 6-8 digits');
    case IdDocumentType.VOTER_ID:
      return /^[A-Z0-9]{8,16}$/.test(normalized)
        ? { valid: true, normalized }
        : fail('A voter ID has 8-16 letters and digits');
  }
}

/** Face distance thresholds (face-api euclidean distance: lower is closer). */
export const FACE_MATCH_MAX = 0.5;
export const FACE_REVIEW_MAX = 0.65;
