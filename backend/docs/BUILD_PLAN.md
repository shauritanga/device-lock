# Device-Lock — MVP Build Plan & Effort Estimates

Confirmed stack: **NestJS + PostgreSQL (self-managed on a VPS)**, **Prisma**,
**Beem** (SMS), **ClickPesa** (mobile money: M-Pesa/Tigo/Airtel/cards), **flat
interest**, Kotlin **DPC agent** (from `../android-dpc`), React dashboard.

Effort assumes **1 experienced full-stack dev** + **part-time Android dev** for
the agent. Estimates are in **developer-days (d)**. A second dev roughly halves
calendar time on parallelizable phases (agent + dashboard).

---

## Phase 0 — Foundations  (≈ 5 d)
| Task | Effort |
|------|--------|
| NestJS monorepo scaffold (`backend/`), config (`@nestjs/config` + Zod), logging | 1 d |
| Prisma wired to Postgres; first migration from existing `schema.prisma` | 1 d |
| `nestjs-cls` tenant context + Prisma client extension (auto `tenantId`) | 1.5 d |
| Postgres **RLS** migration + connection `SET app.tenant_id` | 1 d |
| Docker Compose for local (Postgres + Redis); `.env` template | 0.5 d |

**Deliverable:** app boots, migrates, tenant scoping provably works (test that
tenant A cannot read tenant B).

---

## Phase 1 — Core domain & auth  (≈ 9 d)
| Task | Effort |
|------|--------|
| Auth: login, JWT access+refresh, Argon2, refresh rotation, logout | 2 d |
| `RolesGuard` + roles (SUPER_ADMIN/OWNER/MANAGER/AGENT) | 1 d |
| Tenants module (super-admin CRUD + policy: graceDays, maxOfflineDays) | 1 d |
| Users module (per-tenant staff CRUD) | 1 d |
| Customers module | 1 d |
| Devices module: register IMEI → EnrollmentToken; list/detail; status | 1.5 d |
| Loans + **flat-interest** installment generator; cancel | 1.5 d |

**Deliverable:** staff can register a customer, a device, and a loan; schedule
auto-generates. Swagger documented.

---

## Phase 2 — Device control + agent protocol  (≈ 13 d)
*Backend and Android run in parallel where possible.*

**Backend (≈ 7 d)**
| Task | Effort |
|------|--------|
| Agent API: `enroll`, `checkin`, `commands/:id/ack` + `DeviceAuthGuard` | 2.5 d |
| Commands module: queue LOCK/UNLOCK/REMIND/SYNC_POLICY; lifecycle | 1.5 d |
| FCM dispatch via Firebase Admin; `commands.dispatch` BullMQ job | 1.5 d |
| QR generation endpoint (token + DPC package payload) | 0.5 d |
| DeviceEvent audit writes on every state change | 1 d |

**Android agent hardening (≈ 6 d)** *(beyond the POC)*
| Task | Effort |
|------|--------|
| Enroll flow (consume QR token, store agent token) + checkin loop | 2 d |
| FCM receiver → trigger checkin → execute LOCK/UNLOCK | 1.5 d |
| Boot receiver re-asserts lock; **offline self-lock** via maxOfflineDays | 1.5 d |
| QR provisioning profile (Device Owner via setup-wizard QR) | 1 d |

**Deliverable:** factory-reset test phone → scan QR → enrolls → remote LOCK/UNLOCK
works end-to-end, survives reboot, self-locks when offline past the window.

---

## Phase 3 — Payments, SMS, automation  (≈ 10 d)
| Task | Effort |
|------|--------|
| ClickPesa integration: initiate USSD-push checkout + status query | 2 d |
| ClickPesa **webhook**: verify, inbox/outbox, idempotent on providerRef | 2 d |
| Apply payment → installments → loan status; **auto-UNLOCK** when cleared | 2 d |
| Manual payment entry (cash) | 0.5 d |
| Beem SMS provider in `notifications` (reminders/warnings) + retry | 1.5 d |
| `installments.evaluate` nightly cron: OVERDUE → reminders → LOCK after grace | 2 d |

**Deliverable:** missed installment auto-warns then locks; a ClickPesa payment
auto-unlocks the phone with no staff action.

---

## Phase 4 — Staff dashboard (React)  (≈ 12 d)
| Task | Effort |
|------|--------|
| App shell, auth, role-aware nav, API client | 2 d |
| Customers + devices screens (register, detail, QR display) | 3 d |
| Loans + installment schedule views; record payment | 2.5 d |
| Device control (lock/unlock buttons, command history, event timeline) | 2 d |
| Dashboard summary (active / locked / overdue / collections) | 1.5 d |
| Tenant + user admin | 1 d |

**Deliverable:** a shop can run the whole flow from a browser.

---

## Phase 5 — Hardening, deploy, pilot  (≈ 8 d)
| Task | Effort |
|------|--------|
| VPS provisioning: Postgres (self-installed), Redis, Node, Nginx/TLS, systemd | 2 d |
| Backups (pg_dump cron + offsite), monitoring, log rotation | 1.5 d |
| Rate limiting, input fuzzing, secrets management review | 1 d |
| E2E test pass on **multiple cheap Android models** (provisioning quirks) | 2 d |
| Pilot with one shop, 20–50 devices; fix-as-you-go buffer | 1.5 d |

**Deliverable:** production VPS, live pilot.

---

## Summary

| Phase | Effort |
|-------|--------|
| 0 Foundations | 5 d |
| 1 Core domain & auth | 9 d |
| 2 Device control + agent | 13 d |
| 3 Payments + SMS + automation | 10 d |
| 4 Dashboard | 12 d |
| 5 Hardening + pilot | 8 d |
| **Total** | **≈ 57 dev-days** |

**Calendar:**
- **1 dev:** ~11–13 weeks (allowing for meetings, ClickPesa/Beem onboarding waits).
- **2 devs** (1 backend/web + 1 Android): ~7–8 weeks (Phase 2 agent and Phase 4
  dashboard parallelize).

## Critical path
`Phase 0 → Phase 1 → Phase 2 (agent loop) → Phase 3 (auto-unlock) → pilot.`
The dashboard (Phase 4) can lag behind; use Swagger/Postman to operate during
early testing.

## Biggest risks (watch these)
1. **Device fragmentation** — provisioning/Device-Owner behaviour varies by OEM &
   Android version. Test the *exact* models you'll sell early (Phase 2/5).
2. **ClickPesa onboarding & webhook signing** — start the merchant/KYC application
   in week 1; it can gate Phase 3.
3. **Bypass resistance** — software Device-Owner lock stops most users, not a
   determined flasher. Acceptable for MVP; revisit TEE-level later.
4. **Legal/consent** — loan contract must disclose locking + data use (BOT + data
   protection). Have this reviewed before the pilot, not after.

## Recommended MVP cut (defer to v1.1)
WIPE command, reducing-balance interest, multi-language SMS templates,
zero-touch enrollment (start with QR), advanced analytics.
