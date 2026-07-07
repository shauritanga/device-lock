import { createHash, randomBytes } from 'crypto';

/** Hex SHA-256 — used to store hashes of high-entropy tokens (not passwords). */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Cryptographically-random opaque token (hex). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}
