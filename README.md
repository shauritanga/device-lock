# Device Lock

Device Lock is a multi-tenant phone-financing platform for businesses that sell phones on credit. It combines a NestJS/PostgreSQL backend, a React staff dashboard, and a Kotlin Android Device Policy Controller (DPC) agent that can enroll, check in, and lock or unlock financed devices.

## What This Repository Contains

| Directory | Purpose |
| --- | --- |
| `backend/` | NestJS API, Prisma schema/migrations, tenant isolation, auth, device control, payments, webhooks, jobs, and provisioning endpoints. |
| `dashboard/` | Vite + React + Tailwind staff dashboard for managing customers, devices, loans, payments, and staff. |
| `android-dpc/` | Kotlin Android DPC/agent app that enrolls devices, stores an agent token, checks in with the backend, receives FCM sync triggers, and enforces lock state. |

## Core Capabilities

- Multi-tenant tenant/shop model with PostgreSQL rows scoped by `tenantId`.
- Staff authentication with JWT access and refresh tokens.
- Role-based access for `SUPER_ADMIN`, `OWNER`, `MANAGER`, and `AGENT` users.
- Customer, device, loan, installment, payment, staff, and tenant management.
- Device enrollment tokens and QR/provisioning payload support.
- Device-facing agent API for enrollment, check-ins, and command acknowledgements.
- Remote lock, unlock, release, reminder, policy sync, and wipe command lifecycle.
- Flat-interest loan schedules and overdue evaluation jobs.
- ClickPesa payment integration hooks and webhook handling.
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
| Integrations | ClickPesa, Beem SMS, Firebase Admin/FCM |

## Prerequisites

- Node.js 20+ recommended.
- npm.
- PostgreSQL database.
- Java 17 for Android builds.
- Android Studio or Android SDK if building `android-dpc/`.
- Firebase project/config only if you want FCM push delivery.
- ClickPesa and Beem credentials only if testing live payments/SMS.

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
CLICKPESA_CLIENT_ID=
CLICKPESA_API_KEY=
CLICKPESA_CHECKSUM_KEY=
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

## Dashboard Setup

```bash
cd dashboard
npm install
```

Create `dashboard/.env.local` if the API is not running at the default URL:

```env
VITE_API_URL=http://localhost:3000/v1
```

Run the dashboard:

```bash
npm run dev
```

Open the Vite URL, usually `http://localhost:5173`, and log in with one of the seeded users.

Build for production:

```bash
npm run build
```

## Android DPC Setup

The Android agent is in `android-dpc/` and builds as package `com.devicelock.agent`.

Debug builds currently bake this backend URL into the app:

```kotlin
AGENT_BASE_URL = "http://192.168.1.194:3001/v1"
```

Update `android-dpc/app/build.gradle.kts` for your LAN or deployed backend before installing on a device. Release builds use:

```kotlin
AGENT_BASE_URL = "https://REPLACE-WITH-PROD-DOMAIN/v1"
```

Build from the Android project:

```bash
cd android-dpc
./gradlew assembleDebug
```

FCM is optional. If `android-dpc/app/google-services.json` exists, the Google Services plugin is applied and Firebase Messaging can receive instant sync triggers. Without it, the app still builds and relies on periodic/on-demand check-ins.

For a real deployment, replace the default `STAFF_PIN`, production backend URL, signing configuration, and provisioning checksum before release.

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
| Webhooks | `POST /webhooks/clickpesa` |
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
- Do not commit production secrets, Firebase service-account files, ClickPesa keys, Beem keys, signing keys, or real customer data.

## Project Docs

- `backend/docs/DESIGN.md` explains the intended backend architecture, tenancy model, API design, and device protocol.
- `backend/docs/BUILD_PLAN.md` outlines the MVP phases and effort estimates.

## Current Development Notes

- The backend currently uses PostgreSQL directly; there is no committed Docker Compose file.
- `REDIS_URL` exists in config for queue/job hardening, but current scheduled jobs are implemented with Nest schedule.
- The Android debug backend URL is environment-specific and should be changed before testing on another network.
- Production provisioning requires a public backend URL, a reachable APK URL, and a release signing certificate checksum.
