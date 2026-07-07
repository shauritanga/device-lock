# Device-Lock SaaS — Backend Design (NestJS + Postgres)

Backend that lets multiple phone-credit businesses (tenants) finance phones,
track installments, and remotely lock/unlock the on-device DPC agent built in
`../android-dpc`.

---

## 1. Stack

| Concern        | Choice                                   | Why |
|----------------|------------------------------------------|-----|
| Framework      | **NestJS** (modular, DI, guards)         | Requested; clean fit for multi-guard auth |
| DB             | **PostgreSQL**                           | Requested; relational data + RLS |
| ORM            | **Prisma**                               | Type-safe; client extensions for tenant scoping |
| Auth           | `@nestjs/jwt` + Passport                 | Separate staff & device strategies |
| Tenant context | `nestjs-cls` (AsyncLocalStorage)         | Carries `tenantId` per request |
| Queue/jobs     | **BullMQ + Redis**                       | Overdue scans, SMS, webhook processing, command dispatch |
| Push           | **Firebase Admin SDK (FCM)**             | Instant LOCK/UNLOCK to devices |
| Validation     | `class-validator` / DTOs                 | Request safety |
| Config         | `@nestjs/config` (+ Zod validation)      | Typed env |
| Docs           | `@nestjs/swagger`                        | OpenAPI for the dashboard team |

---

## 2. Multi-tenancy

**Model: shared DB, shared schema, `tenantId` on every business row.** Enforced in two layers:

1. **App layer.** A staff JWT carries `tenantId`. A Nest interceptor stores it in
   `nestjs-cls`. A Prisma **client extension** injects `where: { tenantId }` into
   every read and sets it on every create. Result: a service method *cannot*
   accidentally read another tenant's rows.
2. **DB layer (defense in depth).** Postgres **Row-Level Security**:

   ```sql
   ALTER TABLE "Device" ENABLE ROW LEVEL SECURITY;
   CREATE POLICY tenant_isolation ON "Device"
     USING ("tenantId" = current_setting('app.tenant_id')::uuid);
   ```

   The request's `tenantId` is pushed via `SET app.tenant_id = ...` on the
   connection. Even a buggy query can't cross tenants.

`SUPER_ADMIN` (you) bypasses tenant scoping through a dedicated admin module that
explicitly opts out of the extension.

> Future option: schema-per-tenant or DB-per-tenant for an enterprise client that
> demands physical isolation. Not needed for MVP.

---

## 3. Module layout

```
src/
  app.module.ts
  common/            # guards, interceptors, Prisma service, cls, filters
  config/            # typed env loading
  auth/              # staff login, JWT, refresh, role guard
  tenants/           # CRUD (super-admin) + per-tenant policy settings
  users/             # staff management within a tenant
  customers/         # phone buyers
  devices/           # device registry, enrollment tokens, QR generation
  loans/             # loan + auto-generated installment schedule
  installments/      # schedule, overdue evaluation
  payments/          # manual payments + reconciliation
  webhooks/          # mobile-money inbound (M-Pesa/Tigo/Airtel)
  commands/          # LOCK/UNLOCK/REMIND/WIPE lifecycle + dispatch
  agent/             # DEVICE-facing API (enroll, check-in, ack) — separate auth
  notifications/     # SMS (reminders/warnings) + FCM push
  jobs/              # BullMQ processors + cron schedulers
```

Two auth worlds:
- **Staff API** (`/v1/...`) — `JwtAuthGuard` + `RolesGuard`, tenant-scoped.
- **Agent API** (`/v1/agent/...`) — `DeviceAuthGuard` (per-device token). No staff JWT.

---

## 4. Staff REST API (`/v1`, JWT)

```
POST   /auth/login                 -> { accessToken, refreshToken }
POST   /auth/refresh
POST   /auth/logout

# super-admin only
GET    /tenants
POST   /tenants
PATCH  /tenants/:id                # name, policy (graceDays, maxOfflineDays), active

# within tenant
GET    /users        POST /users        PATCH /users/:id     DELETE /users/:id
GET    /customers    POST /customers    GET   /customers/:id PATCH  /customers/:id

GET    /devices                     # filter by status, customer
POST   /devices                     # register IMEI -> creates EnrollmentToken
GET    /devices/:id
GET    /devices/:id/qr              # provisioning QR (token + DPC package)
POST   /devices/:id/lock            # manual lock  -> queues LOCK command
POST   /devices/:id/unlock          # manual unlock-> queues UNLOCK command
GET    /devices/:id/events          # audit timeline

POST   /loans                       # principal, term... -> generates installments
GET    /loans/:id
GET    /loans/:id/installments
POST   /loans/:id/cancel

POST   /payments                    # record cash/manual payment
GET    /payments

GET    /commands                    # command history
GET    /dashboard/summary           # counts: active, locked, overdue, collections
```

All list endpoints are paginated (`?take=&cursor=`) and tenant-scoped automatically.

---

## 5. Device (agent) API (`/v1/agent`, device token)

This is the contract the Kotlin DPC agent speaks.

```
POST /v1/agent/enroll
  body: { enrollmentToken, imei, serial, make, model, fcmToken }
  -> { deviceId, agentToken, policy: { maxOfflineDays, graceDays } }
  Consumes the one-time token, binds device, stores hashed agentToken.

POST /v1/agent/checkin                       (Authorization: device token)
  body: { fcmToken?, batteryState?, lastKnownLockState }
  -> { policy, commands: [{ id, type, reason }] }
  Updates lastCheckInAt, returns queued commands. Heartbeat + fallback delivery.

POST /v1/agent/commands/:id/ack              (device token)
  body: { result: "DONE" | "FAILED", detail? }
  -> 204 ; marks command ACKED/FAILED, writes DeviceEvent, updates Device.status.
```

**Instant path:** when staff/the system queues a command, the server sends an FCM
data message; the agent then calls `/checkin` to pull it. **Fallback path:** the
agent checks in on a schedule regardless.

**Offline self-lock:** the agent stores `maxOfflineDays`. If it cannot reach
`/checkin` within that window, it locks itself locally — so a customer can't dodge
a lock by staying offline. Reconnect + a valid UNLOCK (or healthy loan) clears it.

---

## 6. Lifecycle flows

**Enrollment (point of sale)**
1. Agent staff registers device (IMEI) + customer + loan → backend issues
   `EnrollmentToken` and renders a **QR**.
2. Shop factory-resets the phone, scans the QR during Android setup → DPC installs
   as **Device Owner**, calls `/agent/enroll`, becomes `ACTIVE`.

**Overdue → lock (nightly job)**
1. Cron marks installments past `dueDate` as `OVERDUE`.
2. Day 0..graceDays: send SMS reminders/warnings (humane, and reduces disputes).
3. After grace: queue `LOCK`, push FCM, agent enters kiosk → `Device.status=LOCKED`.

**Payment → auto-unlock**
1. Mobile-money webhook arrives → verify signature → idempotent on `providerRef`.
2. Create `Payment(CONFIRMED)`, apply to oldest unpaid installment(s).
3. If loan back in good standing **and** device `LOCKED` → queue `UNLOCK` + push.
4. Loan fully paid → `RELEASED` (management removed, factory reset re-enabled).

---

## 7. Background jobs (BullMQ)

| Job | Trigger | Action |
|-----|---------|--------|
| `installments.evaluate` | cron nightly | mark OVERDUE, enqueue reminders/locks per grace |
| `commands.dispatch`      | on enqueue   | send FCM, set SENT, set `expiresAt` |
| `webhooks.process`       | on receive   | verify, match, apply payment, maybe unlock |
| `devices.heartbeat-audit`| cron hourly  | flag devices silent beyond `maxOfflineDays` |
| `sms.send`               | on enqueue   | provider send + retry/backoff |

Webhooks use an **inbox/outbox** pattern: persist raw payload first, process async,
idempotent on `providerRef` — so retries from the telco never double-credit.

---

## 8. Security notes

- Passwords: Argon2id. Device tokens: random 256-bit, stored hashed (`agentTokenHash`).
- Rate-limit `/auth/login` and all `/agent/*` endpoints.
- `WIPE` command gated to `OWNER`/`MANAGER` + tenant policy flag; always audited.
- Every state change writes a `DeviceEvent` (dispute evidence, regulator-friendly).
- Webhook endpoints verify provider signatures/IP allowlist before trusting payloads.
- PII (national ID, phone) — document retention + access per data-protection law.

---

## 9. Open decisions for Step 3 (MVP build plan)

- Interest model: flat vs reducing balance (schema currently models flat — simplest).
- SMS provider for TZ (e.g. Africa's Talking, Beem) — affects `notifications`.
- Which mobile-money rail to integrate first (M-Pesa TZ via Selcom/aggregator?).
- Hosting (single VPS + managed Postgres vs. container platform).
```
