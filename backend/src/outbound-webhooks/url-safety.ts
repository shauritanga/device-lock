import { lookup } from 'dns/promises';
import { isIP } from 'net';

/** True for loopback, private, link-local and other non-public addresses. */
export function isPrivateAddress(ip: string): boolean {
  if (ip.includes(':')) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
    return (
      v === '::1' ||
      v === '::' ||
      v.startsWith('fc') ||
      v.startsWith('fd') ||
      v.startsWith('fe80')
    );
  }
  const [a, b] = ip.split('.').map(Number) as [number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

/**
 * Throws unless the URL is https and every address it resolves to is public, so a
 * partner-supplied webhook URL cannot be used to reach our internal network (SSRF).
 * `allowPrivate` (dev/test only) permits http and private addresses.
 */
export async function assertPublicWebhookUrl(
  raw: string,
  allowPrivate = false,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Webhook URL is not a valid URL');
  }
  if (allowPrivate) return url;
  if (url.protocol !== 'https:') throw new Error('Webhook URL must use https');
  if (url.username || url.password) throw new Error('Webhook URL must not contain credentials');

  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = isIP(host)
    ? [host]
    : (await lookup(host, { all: true }).catch(() => [])).map((r) => r.address);
  if (addrs.length === 0) throw new Error('Webhook host could not be resolved');
  if (addrs.some(isPrivateAddress)) {
    throw new Error('Webhook URL must resolve to a public address');
  }
  return url;
}
