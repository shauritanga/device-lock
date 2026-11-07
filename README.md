# Device Lock

Device Lock is a multi-tenant phone-financing platform for businesses that sell phones on credit. It combines a NestJS/PostgreSQL backend, a React staff dashboard, and a Kotlin Android Device Policy Controller (DPC) agent that can enroll, check in, and lock or unlock financed devices.

## What This Repository Contains

| Directory | Purpose |
| --- | --- |
| `backend/` | NestJS API, Prisma schema/migrations, tenant isolation, auth, device control, payments, webhooks, jobs, and provisioning endpoints. |
| `dashboard/` | Vite + React + Tailwind staff dashboard for managing customers, devices, loans, payments, and staff. |
| `android-dpc/` | Kotlin Android DPC/agent app that enrolls devices, stores an agent token, checks in with the backend, receives FCM sync triggers, and enforces lock state. |
| `android-collector/` | Separate staff companion app for collectors: my queue, system-initiated Call/SMS, device log verification (`DEVICE_LOG_MATCHED`). |
| `docs/` | Product and implementation plans (e.g. managed collections / call centre). |

### Product plans

- [Managed Call Centre / Collections-as-a-Service](docs/COLLECTIONS_CALL_CENTRE_PLAN.md) — subscription packages, platform collectors, case separation by seller company, PTP, communications log, and collector performance reports.

## Core Capabilities

- Multi-tenant tenant/shop model with PostgreSQL rows scoped by `tenantId`.
- Staff authentication with JWT access and refresh tokens.
- Role-based access for `SUPER_ADMIN`, `OWNER`, `MANAGER`, and `AGENT` users.
- Customer, device, loan, installment, payment, staff, and tenant management.
- Device enrollment tokens and QR/provisioning payload support.
- Device-facing agent API for enrollment, check-ins, and command acknowledgements.
- Remote lock, unlock, release, reminder, policy sync, and wipe command lifecycle.
- Flat-interest loan schedules and overdue evaluation jobs.
- Snippe mobile-money collections (USSD push) with automatic disbursement of cleared instalments to the seller — the platform never holds cash.
- Beem SMS provider hooks for reminders and warnings.
- Optional Firebase Cloud Messaging for fast device sync, with periodic check-ins as fallback.

## Architecture

```text
Staff browser
  -> dashboard/ React SPA
  -> backend/ REST API (/v1)
  -> PostgreSQL via Prisma

Android financed phone
  -> android-dpc/ DPC agent
  -> backend/ device API (/v1/agent)
  -> command queue/state in PostgreSQL
  -> optional FCM push trigger for immediate check-in
```

The backend has two API surfaces:

- Staff API under `/v1/*`, protected by staff JWTs and role guards.
- Agent API under `/v1/agent/*`, protected by per-device agent tokens.

## Tech Stack

| Area | Stack |
| --- | --- |
| Backend | NestJS 10, TypeScript, Prisma, PostgreSQL, Zod config validation, `nestjs-cls`, Nest schedule |
| Dashboard | React 18, Vite, TypeScript, Tailwind CSS, TanStack Query, Axios, Recharts, React Router |
| Android Agent | Kotlin, Android Gradle Plugin, AndroidX, WorkManager, Firebase Messaging, Security Crypto |
| Integrations | Snippe (collect + disburse), Beem SMS, Firebase Admin/FCM |

## Prerequisites

- Node.js 20+ recommended.
- npm.
- PostgreSQL database.
- Java 17 for Android builds.
- Android Studio or Android SDK if building `android-dpc/`.
- Firebase project/config only if you want FCM push delivery.
- Snippe and Beem credentials only if testing live payments/SMS.

## Backend Setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit `backend/.env` with your local values. Required for boot:

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://USER@localhost:5432/devicelock?schema=public
JWT_ACCESS_SECRET=change-me-access
JWT_REFRESH_SECRET=change-me-refresh
```

Optional but supported:

```env
RLS_DATABASE_URL=postgresql://devicelock_app:app_password@localhost:5432/devicelock?schema=public
REDIS_URL=redis://localhost:6379
SNIPPE_API_KEY=            # snp_… with collection:read/create + disbursement:read/create
SNIPPE_WEBHOOK_SECRET=     # whsec_… (Snippe dashboard > Settings > Webhook Secret)
BEEM_API_KEY=
BEEM_SECRET_KEY=
BEEM_SENDER_ID=INFO
PUBLIC_BASE_URL=
PROVISIONING_APK_URL=
PROVISIONING_APK_PATH=
PROVISIONING_SIGNATURE_CHECKSUM=
```

Run migrations and generate Prisma client:

```bash
npm run prisma:generate
npm run prisma:migrate
```

Seed demo data:

```bash
npm run db:seed
```

Seed users:

| Email | Password | Role |
| --- | --- | --- |
| `super@devicelock.test` | `password123` | `SUPER_ADMIN` |
| `owner.a@acme.test` | `password123` | `OWNER` for Tenant A |

Start the backend:

```bash
npm run start:dev
```

The API listens on `http://localhost:3000` by default. The health endpoint is available at `GET /health`; versioned API endpoints are under `/v1`.

## Payments: collect and disburse (Snippe)

Customers pay instalments by mobile money (`POST /v1/payments/mobile` sends a USSD push).
Snippe settles the money to the platform balance; as soon as a payment clears it is
passed on to the seller, so **we never hold cash**:

1. `payment.completed` (webhook, or the 1-minute poller as a fallback) marks the payment
   `CONFIRMED`, credits the instalment, and records what Snippe settled (`netAmount`,
   after its collection fee).
2. Everything owed to a seller is claimed into a `Payout` and sent to the seller's
   mobile-money number (`Tenant.payoutPhone` / `payoutName`, set via `PATCH /v1/tenants/:id`).
   Snippe's payout fee is deducted from the seller's share. Payments are claimed
   atomically, so none can be paid out twice.
3. Snippe's minimum payout is 5,000 TZS: smaller amounts accumulate until they clear it.
   Failed or reversed payouts return their payments to the owed pool and are retried
   by the 5-minute sweep. Cash/manual payments are never disbursed.

**Payout account.** The company **owner** sets it on their Payouts page (`PUT /v1/payouts/account`);
a super admin can also set or fix it from the company page. Owner changes require re-entering the
password, are rate-limited, are logged (`PayoutAccountChange`), alert the old number (SMS) and the
company owners (email), and pause payouts for `PAYOUT_ACCOUNT_HOLD_HOURS` (default 24, `0` = off)
when the number changes, so a hijacked login can't instantly redirect money.

Webhooks need a public HTTPS `PUBLIC_BASE_URL`; without one (local dev) the pollers
reconcile instead. Webhook signatures are mandatory in production, and outcomes are
re-read from Snippe's API before anything is applied.

Verify the flow against a fake gateway (no real money) with a throwaway database:
`TEST_DATABASE_URL=…/linda_test npm run test:snippe` (after `npm run build`).

## Packages, payment gate and the Negotiation package

Every company has a collections **package**: Starter (prepaid phones at 18,000 each), Growth,
Business (flat monthly), or **Negotiation** (for lenders with no phones, e.g. microcredit; the
monthly fee is agreed per client and entered at activation; no phones or loans allowed).

A company created from now on is **read-only until its first package invoice is paid** (an admin
activates the package, the first invoice is created automatically, and "Mark paid" unlocks it). A
later invoice unpaid more than `SUBSCRIPTION_GRACE_DAYS` (default 7) past its due date locks it
again. Read-only means data stays visible but writes (registering phones, sales, payments, staff)
return 403 `SUBSCRIPTION_REQUIRED`; sign-in, agreement signing, enrolled phones, locking and
payment webhooks are never blocked. Starter clients can register only as many phones as they paid
for. Companies that existed before this rule are exempt; admins can switch it on per company
(`subscriptionRequired`). `GET /v1/subscription/access` tells the console why a company is locked.

Check it against a throwaway database: `TEST_DATABASE_URL=…/linda_test npm run test:gate`.

## Dashboard Setup

`dashboard/` builds **two consoles** from one codebase — see `dashboard/README.md`
for the full layout.

| Console | Dev port | Production origin | Roles |
| --- | --- | --- | --- |
| Seller | 5173 | `client.linda.co.tz` | `OWNER`, `MANAGER`, `AGENT` |
| Admin | 5174 | `admin.linda.co.tz` | `SUPER_ADMIN`, `COLLECTIONS_ADMIN`, `COLLECTOR` |

```bash
cd dashboard
npm install
```

Create `dashboard/.env.local` if the API is not running at the default URL:

```env
VITE_API_URL=http://localhost:3000/v1
```

Run either console:

```bash
npm run dev:client   # http://localhost:5173
npm run dev:admin    # http://localhost:5174
```

Log in with a seeded user whose role matches the console — signing in at the wrong
one shows a link across rather than an error.

Build for production (typechecks, then emits `dist/client` and `dist/admin`):

```bash
npm run build
```

Deploy each `dist` directory to its own origin with SPA fallback.

## Android DPC Setup

The Android agent is in `android-dpc/` and builds as package `com.devicelock.agent`.

Both **debug and release** bake the production API into the app (no on-device override, HTTPS only):

```kotlin
AGENT_BASE_URL = "https://api.linda.co.tz/v1"
```

The collector companion (`android-collector/`) uses the same URL as `API_BASE_URL`.  
Edit `android-dpc/app/build.gradle.kts` or `android-collector/app/build.gradle.kts` only if the production host changes.

Build from the Android project:

```bash
cd android-dpc
./gradlew assembleDebug

cd ../android-collector
./gradlew assembleDebug
```

FCM is optional. If `android-dpc/app/google-services.json` exists, the Google Services plugin is applied and Firebase Messaging can receive instant sync triggers. Without it, the app still builds and relies on periodic/on-demand check-ins.

For a hardened release later: HTTPS domain, cert pins, replace `STAFF_PIN`, signing config, and provisioning checksum.

## Main API Areas

All staff endpoints are prefixed with `/v1`.

| Area | Representative endpoints |
| --- | --- |
| Auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` |
| Tenants | `POST /tenants`, `GET /tenants`, `GET /tenants/:id`, `PATCH /tenants/:id` |
| Users | `POST /users`, `GET /users`, `GET /users/:id`, `PATCH /users/:id`, `DELETE /users/:id` |
| Customers | `POST /customers`, `GET /customers`, `GET /customers/:id`, `PATCH /customers/:id` |
| Devices | `POST /devices`, `GET /devices`, `GET /devices/:id`, `PATCH /devices/:id` |
| Device control | `POST /devices/:id/enrollment-token`, `GET /devices/:id/qr`, `POST /devices/:id/lock`, `POST /devices/:id/unlock`, `POST /devices/:id/release`, `GET /devices/:id/commands` |
| Loans | `POST /loans`, `GET /loans`, `GET /loans/:id`, `GET /loans/:id/installments`, `POST /loans/:id/cancel` |
| Payments | `POST /payments`, `POST /payments/mobile`, `GET /payments` |
| Dashboard | `GET /dashboard/summary` |
| Jobs | `POST /jobs/run-overdue` |
| Webhooks | `POST /webhooks/snippe` (payment.* and payout.* events, HMAC-signed) |
| Provisioning | `GET /provisioning/agent.apk` |

Device-agent endpoints are also under `/v1`:

| Endpoint | Purpose |
| --- | --- |
| `POST /agent/enroll` | Exchange enrollment token for device agent identity. |
| `POST /agent/checkin` | Report status and pull pending commands. |
| `POST /agent/commands/:id/ack` | Acknowledge command execution. |

## Useful Commands

Backend:

```bash
cd backend
npm run start:dev
npm run build
npm run prisma:generate
npm run prisma:migrate
npm run db:seed
npm run test:tenant
```

Dashboard:

```bash
cd dashboard
npm run dev
npm run build
npm run preview
```

Android:

```bash
cd android-dpc
./gradlew assembleDebug
```

## Multi-Tenancy And Security Notes

- Business-owned database rows carry `tenantId`.
- Staff JWTs carry user identity and tenant context.
- The backend uses CLS request context and Prisma scoping to keep tenant data separated.
- PostgreSQL Row-Level Security migrations provide a defense-in-depth layer.
- Device agents authenticate separately from staff users using per-device tokens.
- Local `.env`, `.env.local`, service-account JSON files, build outputs, and `node_modules` are ignored by git.
- Do not commit production secrets, Firebase service-account files, Snippe keys, Beem keys, signing keys, or real customer data.

## Project Docs

- `backend/docs/DESIGN.md` explains the intended backend architecture, tenancy model, API design, and device protocol.
- `backend/docs/BUILD_PLAN.md` outlines the MVP phases and effort estimates.

## Current Development Notes

- The backend currently uses PostgreSQL directly; there is no committed Docker Compose file.
- `REDIS_URL` exists in config for queue/job hardening, but current scheduled jobs are implemented with Nest schedule.
- The Android debug backend URL is environment-specific and should be changed before testing on another network.
- Production provisioning requires a public backend URL, a reachable APK URL, and a release signing certificate checksum.
