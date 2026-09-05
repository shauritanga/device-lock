import { createHash, randomBytes } from 'crypto';

/** Hex SHA-256 — used to store hashes of high-entropy tokens (not passwords). */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Cryptographically-random opaque token (hex). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/** Readable temporary password for first login (never stored in plaintext). */
export function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}
