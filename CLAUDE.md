# Linda (SimuLinda) — device-lock

Multi-tenant SaaS for Tanzanian phone shops that sell handsets on credit. The shop
registers a credit sale, the phone is enrolled with an Android Device Owner agent,
the buyer repays by mobile money, and the phone is locked after a missed payment
and grace period, unlocked on confirmed payment, and released when the loan is paid.

The shop owns the loan and the credit risk. Linda is software: it collects each
instalment through the Snippe gateway and pays it straight out to the shop, and
earns its own revenue from separate package invoices.

Live at `linda.co.tz` (marketing), `client.linda.co.tz` (seller console),
`admin.linda.co.tz` (admin console), `api.linda.co.tz` (API). Currency is TZS.

## Layout

| Path | What it is |
| --- | --- |
| `backend/` | NestJS 10 + Prisma + PostgreSQL API. One folder per module under `src/`. |
| `dashboard/` | React 18 + Vite + Tailwind. One codebase, two consoles: `src/client` (seller) and `src/admin` (platform), sharing `src/shared`. |
| `android-dpc/` | Kotlin agent on the financed phone (`com.devicelock.agent`): enrollment, check-in, lock screen, buyer app, Pay Now. |
| `android-collector/` | Kotlin app for platform debt collectors: case queue, call/SMS from their own phone, call-log matching as proof. |
| `website/` | Static marketing site, a single `index.html` using Tailwind via CDN. Served directly by nginx. |
| `docs/`, `backend/docs/`, `deploy/` | Product plans, partner API reference, shop handover guide, design notes, deploy guide. |

`README.md` covers setup and the API surface. `IMPLEMENTATION_FLOW.md` is the
original build log and is partly out of date.

## Commands

```bash
# backend/
npm run start:dev         # API on :3000, routes under /v1
npm run build
npm run prisma:generate
npm run prisma:migrate    # create/apply a migration in development
npm run db:seed

# dashboard/
npm run dev:client        # seller console, :5173
npm run dev:admin         # admin console, :5174
npm run build             # typecheck, then dist/client and dist/admin

# android-dpc/ and android-collector/
./gradlew assembleDebug
```

There is no unit-test suite. The only automated checks are three scripts that run
against a throwaway database (`TEST_DATABASE_URL`, after `npm run build`):
`npm run test:tenant`, `npm run test:gate`, `npm run test:snippe`. Otherwise verify
with `npm run build` in `backend/` and `dashboard/`.

## Roles

- Seller staff, tied to a tenant: `OWNER`, `MANAGER`, `AGENT`. They use the seller console.
- Platform staff, no tenant: `SUPER_ADMIN`, `COLLECTIONS_ADMIN`, `MASTER_COLLECTOR`,
  `COLLECTOR`. They use the admin console and the collector app.

## Things to know before changing code

**Tenant isolation.** Every business-owned row carries `tenantId`. Use
`prisma.scoped` in request code: it injects `tenantId` from the CLS request context
into reads and writes for the models listed in `TENANT_SCOPED_MODELS`
(`backend/src/common/tenant/tenant-context.ts`). Postgres row-level security is the
second layer. A new tenant-owned model must be added to that list and given an RLS
policy in its migration. Background jobs must set the tenant in CLS themselves, as
`backend/src/jobs/installments.evaluator.ts` does.

**Three API surfaces.** Staff routes under `/v1/*` use staff JWTs and role guards.
Device routes under `/v1/agent/*` use per-device agent tokens. Partner routes under
`/v1/partner/*` use API keys (`docs/PARTNER_API.md`).

**Device commands are asynchronous.** Lock, unlock and release are queued as
`DeviceCommand` rows and take effect when the phone acknowledges them, by FCM push,
periodic check-in, or signed SMS fallback. Never treat a queued command as done.

**Money.** A payment is applied only after its outcome is re-read from Snippe; a
webhook body alone is not trusted. Confirmed payments are claimed into a `Payout`
atomically so none is paid out twice. Changing a payout number pauses payouts.
Cash payments are recorded but never disbursed.

**Subscription gate.** `SubscriptionGuard` makes a company read-only (writes return
403 `SUBSCRIPTION_REQUIRED`) until its package invoice is paid. Sign-in, agreement
signing, agent check-ins, locking and payment webhooks must never be blocked by it.

**Console boundary.** Code under `dashboard/src/client` and `dashboard/src/admin`
must not import from each other; shared code lives in `src/shared` and is imported
through the `@` alias.

**Android URLs.** Both apps bake in `https://api.linda.co.tz/v1`, HTTPS only. A phone
is only truly controlled when the agent is Device Owner, which requires QR
provisioning on a factory-reset phone.

## Collections packages

Starter 1–39 phones at 18,000 per phone per month, Growth 40–59 at 700,000 flat,
Business 60–75 at 900,000 flat, and Negotiation (lenders with no phones, fee agreed
per client). The bands are written in several places; change all of them together:

- `backend/src/collections/packages.ts` (the source of truth)
- `packageCodeForCount` in `backend/src/collections/collections.service.ts`
- `suggestPackage` in `backend/src/demo-requests/demo-requests.service.ts`
- comments in `backend/prisma/schema.prisma` and `backend/src/collections/dto/collections.dto.ts`
- `backend/scripts/subscription-gate-check.ts`
- the phones field in `dashboard/src/admin/pages/CompanyDetail.tsx`
- pricing cards, structured data and the demo form options in `website/index.html`
- `docs/COLLECTIONS_CALL_CENTRE_PLAN.md`

## Deploy

One Ubuntu server, `root@139.59.139.30`, repo at `/var/www/device-lock`, API under
pm2 as `device-lock-api` on port 3200. Follow `deploy/DEPLOY.md`: `git pull`, then
`npm ci`, `npx prisma migrate deploy` and `npm run build` in `backend/`, `npm ci` and
`npm run build` in `dashboard/`, then `pm2 restart device-lock-api`. The website
updates on `git pull` alone. Migrations are forward-only. Deploy only when asked.

## Conventions

- Work happens directly on `main`; commit and push only when asked.
- Commit messages are a single plain subject line in the style of the history, for
  example `Lock screen: let the customer pay Now from a different mobile-money number`.
  Do not add `Co-Authored-By` or any other Claude attribution.
- Never commit secrets: `.env`, Firebase service-account files, `google-services.json`,
  Snippe or Beem keys, signing keystores, or real customer data.
- UI work follows the existing flat design in `dashboard/src/shared`; do not introduce
  new sections, libraries or styles that the task did not ask for.
