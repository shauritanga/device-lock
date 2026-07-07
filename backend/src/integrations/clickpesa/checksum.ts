import { createHmac } from 'crypto';

/**
 * ClickPesa checksum (per https://docs.clickpesa.com/home/checksum):
 *  1. Recursively sort object keys alphabetically at every level.
 *  2. Serialize to compact JSON (no extra whitespace).
 *  3. HMAC-SHA256 with the merchant checksum secret -> hex digest.
 * The `checksum` and `checksumMethod` fields are excluded from the input.
 */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      if (key === 'checksum' || key === 'checksumMethod') continue;
      out[key] = canonicalize(obj[key]);
    }
    return out;
  }
  return value;
}

export function createPayloadChecksum(
  checksumKey: string,
  payload: Record<string, unknown>,
): string {
  const payloadString = JSON.stringify(canonicalize(payload));
  return createHmac('sha256', checksumKey).update(payloadString).digest('hex');
}

/** Constant-time-ish comparison of two hex checksums. */
export function checksumMatches(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
