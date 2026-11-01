# Partner API — lock and unlock devices from your own system

Base URL: `https://<api-host>/v1/partner`

There are two ways to get a key:

- **Your own company (self-serve):** a company owner opens **Developers** in the seller console and
  creates keys instantly. A key made there is pinned to that company, so `X-Tenant-Id` is never
  needed. Keys can be **read-only** (GET endpoints only — lock/unlock returns `403`), rolled, or
  revoked at any time, and each key has its own webhook endpoint and signing secret. The page also
  has a request log (30 days) and these docs. Up to 10 active keys per company.
- **Outside partners (arranged):** the platform operator creates the partner in the admin console,
  issues the key and secret, and grants it one or more companies.

## Authentication

```
Authorization: Bearer dlk_live_...
X-Tenant-Id: <company id>     # required only if your key is granted more than one company
```

A key only ever reaches devices of companies it was granted; anything else returns `404`
(devices) or `403` (company). Keep the key server-side.

**Rate limit:** per key, default 60 requests/minute. Responses carry `X-RateLimit-Limit` and
`X-RateLimit-Remaining`; over the limit you get `429` with `Retry-After` (seconds).

## Locking is asynchronous

`lock` / `unlock` only **queue** a command (`202`). The phone changes state when it receives and
acknowledges the command, which can take seconds or — if the phone is offline — until it next
connects. A command stays pending until the phone confirms it; `expiresAt` (7 days) is carried in
the SMS fallback but the status is not changed to `EXPIRED` automatically, so apply your own timeout. Treat the webhook (or polling) as the source of truth, not
the `202`.

## Endpoints

### Find a device
`GET /devices/lookup?imei=<14-17 digits>` and `GET /devices/{id}`

```json
{ "id": "…", "imei": "…", "serialNumber": null, "make": "…", "model": "…",
  "status": "ACTIVE", "lockedAt": null, "lastCheckInAt": "2026-10-31T08:00:00Z",
  "loanStatus": "ACTIVE" }
```
`GET /devices/{id}` also returns `lastCommand`. Statuses: `PENDING_ENROLLMENT`, `ACTIVE`, `LOCKED`,
`RELEASED`, `DEFAULTED`, `WIPED`.

### Lock / unlock
`POST /devices/{id}/lock` and `POST /devices/{id}/unlock`

```json
{ "reason": "3 installments overdue", "idempotencyKey": "loan-1001-lock-1" }
```
`reason` (3–300 chars) is stored for audit. `idempotencyKey` (8–128 chars, **required**) is yours to
choose; retrying with the same key never queues a second command and returns the original with
`200` and `"idempotentReplay": true`. Reusing a key for a different device or action is `409`.

Response `202`:
```json
{ "id": "<commandId>", "deviceId": "…", "type": "LOCK", "status": "QUEUED",
  "reason": "…", "createdAt": "…", "sentAt": null, "ackedAt": null,
  "expiresAt": "…", "idempotentReplay": false }
```

`409` is returned when the device is `PENDING_ENROLLMENT`/`RELEASED`/`WIPED`, is already in the
requested state (lock when locked, unlock when not locked), or a command of that type is already
in progress.

### Poll a command
`GET /commands/{id}` → `status`: `QUEUED` → `SENT` → `ACKED` (done) or `FAILED`. You can only read
commands issued with your own key.

## Webhooks

Configured per key. We `POST` JSON to your URL (https only; must resolve to a public address;
redirects are not followed; 10 s timeout):

| Event | Meaning |
|---|---|
| `device.locked` | the phone confirmed it is now locked |
| `device.unlocked` | the phone confirmed it is unlocked |
| `command.failed` | the phone reported it could not execute a lock/unlock |
| `webhook.test` | manual test from the operator |

```json
{ "id": "evt…", "type": "device.locked", "createdAt": "…",
  "data": { "commandId": "…", "deviceId": "…", "commandType": "LOCK", "result": "DONE",
            "deviceStatus": "LOCKED", "detail": null, "idempotencyKey": "loan-1001-lock-1",
            "occurredAt": "…" } }
```

Reply with any `2xx` to acknowledge. Otherwise we retry with backoff (30 s, 2 min, 8 min, 32 min,
~2 h) and give up after 6 attempts. **Delivery is at-least-once** — de-duplicate on `id`, which is
identical across retries.

### Verifying the signature
Header: `X-DeviceLock-Signature: t=<unix seconds>,v1=<hex>` where
`v1 = HMAC_SHA256(webhookSecret, "<t>." + rawBody)`. Compute over the **raw** body, compare in
constant time, and reject if `t` is more than ~5 minutes old.

```js
const crypto = require('crypto');
function verify(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return expected.length === v1.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}
```

## Errors
Standard JSON `{ "statusCode", "message", "error" }`. `400` validation · `401` missing/invalid/
suspended key · `403` company not granted, read-only key, or company inactive · `404` not found (or not yours) · `409` state conflict ·
`429` rate limited.

## Operator notes
- Manage partners in the admin console → *API partners* (SUPER_ADMIN only): create, grant
  companies, rotate key/secret, suspend, revoke. Keys and secrets are shown once.
- Partner-issued commands are attributed to the key (`DeviceCommand.apiClientId`) and logged as
  `PARTNER_LOCK_QUEUED` / `PARTNER_UNLOCK_QUEUED` device events.
- The rate limiter is in-process; move it to Redis before running more than one backend instance.
- For local testing only, `WEBHOOK_ALLOW_PRIVATE=true` permits http/private webhook URLs. Never set
  it in production.
