# Managed Call Centre (Collections-as-a-Service) — Implementation Plan

**Status:** Approved plan (product direction agreed)  
**Last updated:** 2026-07-19 (added verified contact / BYOD proof model)  
**Owner:** Platform (Device Lock)  
**Related code today:** `backend/src/call-centre/` (incl. bridge call stub), `backend/src/billing/`, multi-tenant `tenantId` model, `CallFollowUp` / `CallAttempt`

This document is the durable source of truth for the managed collections / call-centre product. Update it when decisions change; do not rely on chat history alone.

---

## 1. Product framing

### Two operating modes

| Mode | Who follows up | Who pays for it |
|------|----------------|-----------------|
| **Self-serve** | Seller’s own staff (`OWNER` / `MANAGER` / `AGENT`) | Included or basic plan |
| **Managed collections** | Platform collectors (admin ops) | Seller **subscribes** to a collections package |

Sellers still own the credit relationship (customers, devices, loans, locks).  
Platform sells **follow-up capacity** and **collector labour**, not the loan book.

### Subscription packages

| Package | Active devices | Price model |
|---------|----------------|-------------|
| **Starter** | Less than 30 | TZS 18,000 / device / month |
| **Growth** | 30–44 | TZS 700,000 / month (flat) |
| **Business** | 45–55 | TZS 900,000 / month (flat) |

**Activation rules (recommended):**

- Subscription status: `NONE` | `PENDING` | `ACTIVE` | `PAST_DUE` | `SUSPENDED`
- Managed queue only receives cases when status is `ACTIVE` (optional short grace window)
- Device count for tier validation = **active financed devices** (`ACTIVE` + `LOCKED`), snapshot at billing period start
- Over-cap devices: decide one of — block new managed enrollment, auto-upgrade, or overage fee (**Phase 0 decision**)

---

## 2. What already exists vs gaps

| Capability | Today | Gap for this product |
|------------|--------|----------------------|
| Seller isolation (`tenantId`) | Strong | Collectors are still **inside** a tenant |
| Overdue queue + assign + call attempt | Basic | No platform-wide collector pool |
| Promise to pay | On `CallFollowUp` | No dedicated PTP worklist / reports |
| Payments + company | Tenant-scoped payments | No platform “all paid cases” cross-tenant view |
| Call log | `CallAttempt` + bridge provider stub | Weak `SELF_REPORTED` when provider unset; no device log match |
| SMS / WhatsApp from collector’s own phone | Not built | Need initiate-from-system + proof contact happened |
| Billing plans | `STARTER/GROWTH/BUSINESS` with different math | Not these device-band collections packages |
| Collector KPIs | Outcome group-by only | No hours, avg talk time, follow-up counts, daily/monthly/annual history |

---

## 3. Target architecture

```text
Seller (Tenant A) ──loans/customers/devices──► Case (always tagged tenantId)
        │                                              │
        │  subscribes to Managed Collections           │ assignment
        ▼                                              ▼
 Platform Ops (Collectors) ◄──── CaseAssignment ──── Case Work Queue
        │
        ├── Call / SMS / WhatsApp (CommunicationLog)
        ├── Promise-to-pay (PTP)
        └── Collector activity (duration, sessions)
                 │
                 ▼
        Platform Admin reports (filter by company, collector, period)
```

### Hard rules

1. **Every case row retains `tenantId` (seller company).** Never drop company identity when a collector works a case.
2. **Collectors see only assigned cases** (plus optional team pool later).
3. **Seller staff never see other sellers’ cases.**
4. **Platform SUPER_ADMIN sees all companies**, always with company name on every record.
5. **Collectors cannot unlock devices by default** (notes + PTP + escalate only; unlock stays with seller or payment automation unless explicitly granted later).
6. **No “free-typed” contact counts as verified work.** Follow-up must be **started from the system**, then **proven** with a verification signal (device log match, provider callback, or channel API receipt). Self-report alone is allowed only as a fallback and is labelled weak.

---

## 3A. Verified contact: own phone, system-initiated (critical)

### Business rule

Collectors use **their own phone number / SIM / WhatsApp account** to talk to clients (BYOD), but:

1. The contact must be **initiated from Device Lock** (case screen → Call / SMS / WhatsApp), not invented after the fact.
2. The system must record **whether the follow-up was real**, not only that a button was pressed.
3. Performance and billing-facing metrics prefer **verified** contacts over self-reported ones.

### Why “open phone app” is not enough

| Action only | What you know | Risk |
|-------------|---------------|------|
| `tel:` / dialer open | User tapped Call | May hang up immediately; may never dial |
| SMS intent with prefilled body | User opened SMS app | May not press Send |
| `wa.me` / WhatsApp deep link | User opened WhatsApp | May not send; may chat someone else |

So initiation creates a **pending contact session**; verification closes it as real.

### Verification levels

| Level | Code | Meaning | Counts as “real follow-up” for strict KPIs? |
|-------|------|---------|-----------------------------------------------|
| **Strong** | `PROVIDER_VERIFIED` | Carrier/CPaaS/WhatsApp Business API confirms delivery or call completed | Yes |
| **Strong** | `DEVICE_LOG_MATCHED` | Collector app matched an OS call/SMS log (and/or WhatsApp signal) to the customer number in the session window | Yes |
| **Medium** | `ATTEMPTED` | Provider accepted request / dial started; no final duration yet | Partial (attempt yes, success TBD) |
| **Weak** | `SELF_REPORTED` | Collector typed outcome only; no log/API proof | No (or separate “unverified” metric) |
| **Failed** | `FAILED` / `NO_MATCH` | Session expired with no matching log, or provider failed | No |

Existing code already has `verificationStatus` on `CallAttempt` (`SELF_REPORTED`, `ATTEMPTED`, …) via `CallProviderService` — extend that model to all channels.

### Recommended architecture (two layers)

```text
  Dashboard / Collector web
           │
           │ 1. POST /contacts/start  (caseId, channel, customerPhone)
           ▼
  Backend creates ContactSession (PENDING)
           │
           ├─► Call path A: Bridge CPaaS (ring collector phone → connect customer)
           │         callback: duration, status → VERIFIED
           │
           ├─► Call path B: Hand off to Collector Android app → native dial
           │         app reads Call Log → match number + time → DEVICE_LOG_MATCHED
           │
           ├─► SMS path A: Platform SMS API (Beem) from system sender  [optional product]
           │         API receipt → PROVIDER_VERIFIED
           │
           ├─► SMS path B: Collector app opens SMS to customer with template
           │         app reads Sent SMS log → match → DEVICE_LOG_MATCHED
           │
           └─► WhatsApp path A: WhatsApp Business Cloud API (business number)
                     delivery receipt → PROVIDER_VERIFIED
           └─► WhatsApp path B (personal WA): deep link + strict session +
                     limited device signals / manual proof  → see limitations below
```

**Product recommendation:**

| Channel | Primary (strong proof) | Fallback (BYOD personal) |
|---------|------------------------|---------------------------|
| **Call** | Bridge call (provider rings collector’s phone, then customer) — already sketched in `CallProviderService` | Collector **Android companion app** + `READ_CALL_LOG` match |
| **SMS** | Beem/system SMS when message can be official | Companion app + `READ_SMS` / `SEND_SMS` match after system-started compose |
| **WhatsApp** | WhatsApp **Business** API (platform or per-company number) | Personal WhatsApp: initiation + session + **weak/medium** proof only unless Business API |

Personal WhatsApp cannot be reliably and compliantly “read” like SMS/call logs on modern Android (no official call-log equivalent; scraping WhatsApp violates ToS and breaks often). Plan for **Business API** for strong WhatsApp verification.

### Contact session lifecycle (all channels)

```text
1. Collector opens case → taps Call | SMS | WhatsApp
2. Backend creates ContactSession:
     id, caseId, tenantId, collectorId,
     channel, customerPhoneE164, collectorPhoneE164?,
     templateId?, bodyPreview?,
     status=PENDING, verification=NONE,
     initiatedAt, expiresAt (= initiatedAt + N minutes)
3. Client opens native channel (dialer / SMS / WA) OR provider starts bridge
4. Proof arrives:
     - Provider webhook, or
     - Collector app uploads matched log slice (hashed/minimised), or
     - API message id status
5. Backend sets verificationStatus + durationSeconds + completedAt
6. Only then CommunicationLog is marked VERIFIED (or attempt stays UNVERIFIED)
7. Collector still enters outcome notes / PTP (human result ≠ transport proof)
```

**Timeout:** if no proof within e.g. 15–30 minutes, session → `NO_MATCH` / expired; collector may re-initiate.

### Data model additions

```text
ContactSession
  id
  tenantId                 // seller company
  caseId, loanId, customerId
  collectorId
  channel                  // CALL | SMS | WHATSAPP
  customerPhone            // normalized E.164
  collectorPhone?          // registered staff phone for this collector
  status                   // PENDING | COMPLETED | EXPIRED | FAILED
  verificationStatus       // NONE | SELF_REPORTED | ATTEMPTED | DEVICE_LOG_MATCHED | PROVIDER_VERIFIED | NO_MATCH | FAILED
  initiatedAt, expiresAt, completedAt
  durationSeconds?
  provider?
  providerMessageId? / providerCallId?
  deviceMatchMeta Json?    // e.g. log timestamp, type OUTGOING, matched digits (no full dump)
  communicationLogId?

CollectorDevice
  collectorId
  phoneE164                // SIM they use for follow-up
  platform                 // ANDROID
  pushToken?
  lastSeenAt
  callLogPermission        // GRANTED | DENIED
  smsPermission
  // whatsapp: no OS permission; use Business API or weak session only
```

Link `CommunicationLog` / `CallAttempt` to `contactSessionId` and always store `verificationStatus`.

### Collector Android companion app (for BYOD proof)

A small **staff-only** app (not the financed DPC agent):

| Responsibility | Detail |
|----------------|--------|
| Login | Same staff JWT / device binding |
| Receive “start contact” | FCM or poll: session id, channel, customer number, optional SMS body |
| Start channel | Place call / open SMS / open WhatsApp with exact number from session |
| Read logs | After contact, scan recent **outgoing** call/SMS to that number |
| Upload proof | Minimal match payload to backend (not full call history dump) |
| Permissions UX | Explain why call/SMS access is required for verified work |

#### Android permissions (BYOD verification)

| Permission | Use | Channel |
|------------|-----|---------|
| `READ_CALL_LOG` | Confirm outgoing call to customer number after system start | Call |
| `CALL_PHONE` (optional) | Place call without leaving app | Call |
| `READ_PHONE_STATE` | Detect active call / multi-SIM line | Call |
| `READ_SMS` | Confirm SMS sent to customer number | SMS |
| `SEND_SMS` (optional) | Send template SMS from collector SIM via app | SMS |
| `RECEIVE_SMS` (optional) | Delivery/reply correlation if needed later | SMS |
| `POST_NOTIFICATIONS` | Session prompts | All |
| **WhatsApp** | No official “read WhatsApp” permission | Use Business API or deep link + weak verification |

**Privacy / compliance (must ship with product):**

- Collectors consent in writing; only **match** logs for numbers the system asked them to contact, inside the session window.
- Do **not** upload entire call/SMS history.
- Prefer storing: session id, hashed/normalized number, direction, timestamp, duration, match confidence.
- Works best on **company-issued** phones with clear policy; personal BYOD needs explicit consent.
- Play Store / OEM policies may restrict `READ_CALL_LOG` / `READ_SMS` to default dialer/SMS roles — design for **sideload / enterprise** distribution if Play rejects broad use.

### Call: preferred strong path (no call-log permission)

Use **bridge / click-to-call provider** (extends existing `CallProviderService`):

1. System has collector’s registered phone + customer phone.  
2. Provider calls collector; when they answer, dials customer (or simultaneous).  
3. Webhook returns connected / duration / recording URL.  
4. `verificationStatus = PROVIDER_VERIFIED`.  

Collector still uses “their” phone as the endpoint, but proof is independent of Android permissions.

### SMS: two modes

| Mode | Who sends | Proof |
|------|-----------|--------|
| **System SMS** | Beem (or similar) as Device Lock / seller sender ID | API success + optional DLR |
| **Collector SIM SMS** | Collector phone after system-started compose | Device SMS log match via companion app |

Admin reporting should show channel mode and verification level.

### WhatsApp: realistic options

| Option | Proof strength | Notes |
|--------|----------------|-------|
| WhatsApp Cloud API / BSP | Strong | Official; templates for first outbound; best for compliance |
| `wa.me` deep link only | Weak | Must pair with session + collector confirmation; easy to fake |
| Screenshot upload | Weak–medium | Manual QA; not scalable |
| Read personal WhatsApp data | Do **not** build | ToS, security, brittle |

**Recommendation:** initiate personal WhatsApp only as interim UX; plan **Business WhatsApp** for verified follow-ups that count in strict KPIs.

### Matching rules (device log)

For a `ContactSession` in `PENDING`:

1. Normalize phones to E.164 (TZ: `0XXXXXXXXX` → `255…`).  
2. Within `[initiatedAt, expiresAt]`, find **outgoing** call/SMS to same national number.  
3. Optional: minimum duration for calls (e.g. ≥ 10s) before `DEVICE_LOG_MATCHED`.  
4. One log line matches at most one session (prevent double-counting).  
5. On match → complete session; attach duration; create/update `CommunicationLog`.

### UI rules

- Buttons: **Start verified call / SMS / WhatsApp** (creates session first).  
- Show badge on timeline: `Verified` | `Unverified` | `Pending proof`.  
- Collector performance defaults to **verified-only** filter (toggle to include self-reported).  
- Block completing “successful contact” outcome without at least `ATTEMPTED` / `DEVICE_LOG_MATCHED` / `PROVIDER_VERIFIED` (configurable).  
- Register collector phone number(s) on staff profile before they can start sessions.

### What we will not claim

- That a deep link alone proves a conversation happened.  
- That personal WhatsApp can be fully audited without Business API.  
- That self-reported notes equal verified follow-up.

---

## 4. Roles & accounts

| Role | Scope | Purpose |
|------|--------|---------|
| `SUPER_ADMIN` | Platform | Packages, companies, all reports, assign work |
| `COLLECTIONS_ADMIN` | Platform | Manage collectors, assign cases, SLA, quality |
| `COLLECTOR` | Platform (`tenantId = null`) | Daily follow-up on assigned cases only |
| `OWNER` / `MANAGER` | Seller tenant | Sell credit, optional self-serve follow-up, subscribe |
| `AGENT` | Seller tenant | Sales / payments (not managed collector) |

### How “admin people follow up” works

1. Create platform users with role `COLLECTOR` / `COLLECTIONS_ADMIN` (no seller `tenantId`).
2. When seller activates subscription, their **overdue cases become eligible** for the managed queue.
3. `COLLECTIONS_ADMIN` assigns cases to collectors (or auto-assign by workload later).
4. Collector UI: **My queue** only.
5. Platform admin UI: **All companies**, filters, performance.

### Distinguishing cases by seller

On every list and export show:

- Company name  
- Company id (`tenantId`)  
- Case identity = loan (+ installment)  

Always filterable: `tenantId`, `collectorId`, date range, outcome, PTP status.

---

## 5. Data model (core additions)

Build on existing `CallFollowUp` / `CallAttempt` / `Payment` / `Tenant`.

### A. Collections subscription

```text
CollectionsSubscription
  tenantId
  packageCode          // STARTER | GROWTH | BUSINESS
  status               // ACTIVE | PAST_DUE | ...
  deviceBandMin / deviceBandMax
  priceModel           // PER_DEVICE | FLAT
  unitPrice / flatPrice
  currency             // TZS
  activatedAt, endsAt
  maxDevices
```

Keep this **separate** from generic SaaS `billingPlan` so device-lock platform fees and collections service fees stay clean in finance.

### B. Case (work unit)

```text
CollectionCase
  tenantId             // seller company (required)
  loanId, customerId, deviceId
  installmentId?       // primary overdue installment
  status               // OPEN | IN_PROGRESS | PROMISED | PAID | ESCALATED | CLOSED
  priority / daysOverdue
  assignedToId?        // collector User
  assignedAt?
  followUpCount
  lastContactedAt
  nextActionAt
  source               // AUTO_OVERDUE | MANUAL | SELLER_HANDOFF
```

Auto-create/update from the overdue job when subscription is `ACTIVE`.

### C. Communications (requirement 4)

```text
CommunicationLog
  tenantId             // seller company
  caseId / loanId / customerId
  channel              // CALL | SMS | WHATSAPP
  direction            // OUTBOUND | INBOUND
  collectorId?
  providerMessageId?
  status               // QUEUED | SENT | DELIVERED | FAILED | COMPLETED
  startedAt, endedAt
  durationSeconds?     // calls
  body / templateId?
  metadata Json
```

Keep `CallAttempt` as the rich call sub-record; link it to `CommunicationLog` or migrate later.

### D. Promise to pay (requirement 3)

```text
PromiseToPay
  tenantId, caseId, loanId, customerId
  promisedAmount, currency
  promisedAt           // when client promised
  dueDate              // promised pay date
  status               // OPEN | KEPT | BROKEN | CANCELLED
  createdById          // collector
  keptPaymentId?       // linked when payment lands
```

### E. Collector work time (requirements 8–9)

```text
CollectorSession
  collectorId
  startedAt, endedAt   // shift / logged-in work window
  source               // MANUAL_CLOCK | AUTO_FROM_ACTIVITY

CollectorDailyStat
  collectorId, date
  callsCount, talkSeconds, smsCount, whatsappCount
  followUpsCount, casesWorked, ptpCount, paymentsInfluenced
  hoursWorked          // from sessions (primary policy)
```

### F. Paid cases (requirement 2)

Prefer query over new table when possible:

- `Payment` where confirmed/paid  
- Join loan → customer → **tenant (company)**  
- Platform report: payment date, amount, method, case/loan, company  

Optional: `CollectionCase.closedAt` + `closedReason = PAID`.

---

## 6. Admin requirements → features

| # | Requirement | Implementation |
|---|-------------|----------------|
| **1** | Separate all cases by company/account | `tenantId` on every case/log/report; UI company filter; seller scope; platform views always show company column |
| **2** | Paid cases + payment date + company | Platform report `GET /collections/paid-cases`; filters; CSV export |
| **3** | Payment commitments (PTP dates) | `PromiseToPay` + PTP board (today / overdue PTP / upcoming) |
| **4** | Calls, SMS, WhatsApp per client | `CommunicationLog` + client timeline on case detail |
| **5** | Collector work summary daily/monthly/annual + history | `CollectorDailyStat` cron + report APIs + charts; retain raw logs (or documented retention) |
| **6** | Payment progress/performance stats | Recovery rate, collected vs overdue book, PTP keep rate, by company & collector |
| **7** | Follow-up count per case in period | `followUpCount` + query communications/follow-ups by `caseId` + date range |
| **8** | Average call time per collector | `AVG(durationSeconds)` on completed calls by period |
| **9** | Total hours worked per collector | Sum of session duration (primary); talk time as separate KPI |

---

## 7. UX surfaces

### A. Seller dashboard (existing tenant app)

- Subscribe / activate collections package  
- Badge: managed collections ON/OFF  
- Read-only view of follow-ups on **their** customers  
- Optional: hand off specific loans  

### B. Platform Collections console (new)

| Screen | Who | Purpose |
|--------|-----|---------|
| **Companies** | Admin | Subscription status, package, device count, SLA |
| **Work queue** | Admin | Unassigned open cases by company/priority |
| **My queue** | Collector | Assigned cases only |
| **Case detail** | Both | Customer, debt, device status, timeline, PTP, log contact |
| **Paid cases** | Admin | Requirement 2 |
| **Promises** | Both | Requirement 3 |
| **Collector performance** | Admin | Requirements 5–9 |
| **Payments analytics** | Admin | Requirement 6 |

### Case detail must show

- Company name (seller)  
- Customer + phones  
- Amount overdue, days overdue, device lock status  
- Follow-up count (period selector)  
- PTP list  
- Full communication timeline  
- Actions: Call, SMS, WhatsApp note, Log PTP, Escalate, Mark unreachable  

---

## 8. End-to-end workflow

```text
1. Seller sells phone on credit (existing)
2. Installment goes OVERDUE (existing job)
3. If tenant has ACTIVE collections subscription:
     → ensure CollectionCase OPEN (or update priority)
4. COLLECTIONS_ADMIN assigns case → COLLECTOR
5. Collector opens case → Start Call | SMS | WhatsApp (system only)
     → ContactSession PENDING
     → Bridge provider and/or Collector app opens channel on collector’s phone
6. Proof:
     → Provider webhook and/or device call/SMS log match
     → ContactSession VERIFIED | NO_MATCH | EXPIRED
     → CommunicationLog written with verificationStatus
7. Outcomes (after or during verified attempt):
     - PROMISE_TO_PAY → PromiseToPay + nextActionAt
     - PAID_ALREADY / payment webhook → link payment, close case
     - NO_ANSWER → schedule nextFollowUpAt, increment count
     - ESCALATE → seller notified / field visit flag
8. Nightly job:
     - Expire stale ContactSessions
     - Break open PTPs past due without payment
     - Roll CollectorDailyStat (prefer verified contacts)
     - Invoice collections subscription (per package rules)
```

---

## 9. Billing logic (packages)

| Package | Monthly charge |
|---------|----------------|
| Starter | `activeDevices × 18_000` (band: &lt; 30) |
| Growth | `700_000` flat (band: 30–44) |
| Business | `900_000` flat (band: 45–55) |

**Activation checklist**

1. Choose package matching current active device count  
2. Payment / manual activation by SUPER_ADMIN  
3. Set `CollectionsSubscription.status = ACTIVE`  
4. Backfill open overdue loans into `CollectionCase`  
5. Optional welcome notification to seller  

**Separate products in finance:**

- Product A: Device Lock platform fee (optional / existing billing evolution)  
- Product B: Managed collections fee (this plan)  

---

## 10. Security & multi-tenancy

| Actor | Data access |
|-------|-------------|
| Seller staff | Own `tenantId` only |
| Collector | Cases where `assignedToId = me` (and their logs) |
| Collections admin | All managed cases, all companies (read); assign write |
| Super admin | Full platform |

Implementation notes:

- Extend JWT claims: `role`, `tenantId?`, `scope: PLATFORM | TENANT`
- Platform queries use **explicit** `tenantId` filters and always select company name
- Never use unscoped global lists in collector endpoints
- Optional Phase 3: audit who viewed/exported PII

---

## 11. Integrations (phased)

| Channel | Phase 1 (initiate + weak/medium) | Phase 2 (strong proof) |
|---------|----------------------------------|-------------------------|
| Call | ContactSession + bridge provider stub / registered staff phone; optional self-report | Live CPaaS bridge webhooks **or** Collector app `READ_CALL_LOG` match |
| SMS | System Beem templates (API proof) **or** session + SMS intent | Collector app `READ_SMS` match for SIM-sent SMS; DLR for API SMS |
| WhatsApp | Session + `wa.me` deep link + pending proof badge | WhatsApp Business Cloud API / BSP delivery receipts |
| Collector app | Not required for bridge/API-only path | Android companion for BYOD call/SMS log verification |
| Payments | Existing payments + webhooks | Auto-close case + notify collector |

**MVP stance:** ship ContactSession + verification badges immediately; use bridge/API for strong call/SMS where possible; do not treat personal WhatsApp deep links as verified until Business API.

---

## 12. Metrics definitions (code once, keep stable)

| KPI | Formula |
|-----|---------|
| Follow-ups in period | Count of communications (or completed outcomes) on case between `from`–`to` |
| Avg call time | `sum(durationSeconds) / count(completed calls)` per collector |
| Hours worked | `sum(session endedAt - startedAt)` (**primary**) |
| Talk time hours | `sum(durationSeconds) / 3600` (**secondary**) |
| Recovery rate | Paid amount on managed cases / overdue amount at period start |
| PTP keep rate | PTPs with linked payment by dueDate / total PTPs due in period |

Document these in admin help so historical year-over-year numbers stay comparable.

---

## 13. Phased delivery

### Phase 0 — Product decisions (½ day)

- [x] Confirm package bands and overage rules → **as table; over-cap = reject activation until corrected**  
- [x] Confirm hours = clock sessions vs talk time → **sessions primary, talk time secondary**  
- [x] Confirm collectors may **not** unlock devices in v1 → **yes, deny unlock**  
- [x] Confirm contact proof policy → **both** (bridge CPaaS + companion app); Phase 2/2b  
- [x] Confirm WhatsApp → **Business API for verified; personal = Unverified interim**  
- [x] Self-reported in KPIs → **off by default (toggle later)**  

### Phase 1 — Foundation (1–1.5 weeks) — **DONE (local code 2026-07-19)**

- [x] Roles: `COLLECTOR`, `COLLECTIONS_ADMIN`  
- [x] `CollectionsSubscription` + package config (Starter / Growth / Business)  
- [x] `CollectionCase` + auto-create from overdue when subscribed  
- [x] Assignment APIs + **My queue / Admin queue** UI (`/collections`)  
- [x] Company name on every case row  
- [x] Collector profile: registered follow-up phone number(s)  

**Delivers:** Requirement 1 for managed service  

**Code entry points:**
- Backend: `backend/src/collections/`
- Migration: `backend/prisma/migrations/20260719120000_collections_foundation/`
- UI: `dashboard/src/pages/Collections.tsx`
- Plan: this file  

### Phase 2 — Contact, verification sessions & PTP (1.5–2 weeks) — **DONE (code 2026-07-19)**

- [x] `ContactSession` start/complete/expire APIs  
- [x] Unified `CommunicationLog` with `verificationStatus`  
- [x] UI: Start Call / SMS / WhatsApp only via session  
- [x] Call: bridge provider hook (`ATTEMPTED` when configured; stub otherwise)  
- [x] SMS: session + `sms:` launch URL  
- [x] WhatsApp: `wa.me` deep link session (Unverified until Business API)  
- [x] Case timeline shows verification badges  
- [x] `PromiseToPay` + create/list on case detail  
- [x] Complete contact flow writes outcome (SELF_REPORTED until device/provider proof)  

**Delivers:** Requirements 3, 4, 7 (basic) + initiate-from-system rule  

**Code:** `ContactSession` / `CommunicationLog` / `PromiseToPay` models;  
`POST /collections/cases/:id/contact-sessions`, `.../complete`, `.../promises`;  
UI `CollectionCaseDetail.tsx`  

### Phase 2b — Collector companion app (BYOD log proof) — **DONE (scaffold 2026-07-19)**

- [x] Android staff app: login, my queue, start call/SMS/WA (`android-collector/`)  
- [x] Permissions: `READ_CALL_LOG`, `READ_SMS`, `CALL_PHONE` (+ consent dialog)  
- [x] Match outgoing logs to session; upload proof  
- [x] Backend match endpoint → `DEVICE_LOG_MATCHED` (already in Phase 6)  
- [x] Consent copy in login / permission dialog  

**Delivers:** Strong BYOD call/SMS proof without CPaaS  

**Code:** `android-collector/` — see `android-collector/README.md`  

### Phase 3 — Money & company reports (1 week) — **DONE (code 2026-07-19)**

- [x] Platform **Paid cases** report (payment date + company)  
- [x] Payment progress dashboard (stats, by company, by collector)  
- [x] PTP board on reports page  
- [x] Case follow-up count in period API  
- [ ] CSV export (optional polish)  

**Delivers:** Requirements 2, 6 (and 7 API)  

**Code:** `GET /collections/reports/paid-cases`, `.../payment-stats`, `.../case-followups/:caseId`;  
UI `/collections/reports`  

### Phase 4 — Collector performance (1 week) — **DONE (code 2026-07-19)**

- [x] Call duration on contact complete (manual; provider path already ATTEMPTED)  
- [x] Collector work sessions (clock in/out) — primary **hours worked**  
- [x] Daily rollup `CollectorDailyStat` + day/month/year performance report  
- [x] UI: clock in/out + performance table on Reports  

**Delivers:** Requirements 5, 8, 9 (and hardened 7)  

**Code:** `CollectorWorkSession`, `CollectorDailyStat`;  
`POST /collections/work-sessions/clock-in|clock-out`, `GET .../me`,  
`GET /collections/reports/collector-performance?period=day|month|year`  

### Phase 5 — Billing for packages (3–5 days) — **DONE (code 2026-07-19)**

- [x] Invoice generation for Starter / Growth / Business (`CollectionsInvoice`)  
- [x] Activation UI (already in Phase 1) + generate / mark paid / process past due  
- [x] Mark subscription `PAST_DUE` when invoice overdue (sync only works for ACTIVE)  

**Code:** `CollectionsInvoice` model;  
`GET/POST /collections/invoices/*`, `billing/summary`;  
UI on Collections page  

### Phase 6 — Polish (ongoing)

- [x] CSV export (paid cases + collector performance)  
- [x] Auto-close collection case when arrears cleared / loan completed  
- [x] Auto-mark PTP KEPT when payment confirmed  
- [x] Break OPEN PTPs past dueDate → BROKEN  
- [x] Nightly cron (3am): past-due invoices, broken PTPs, daily rollups, case sync  
- [x] Seller-facing “what collectors did this week” (`GET /collections/activity/me`)  
- [x] Auto-assign unassigned cases (least-loaded round-robin)  
- [x] Contact session device-proof endpoint (`POST .../proof` → DEVICE_LOG_MATCHED)  
- [ ] WhatsApp Business API  
- [ ] Auto-dialer / power dial  
- [x] Full collector companion Android app scaffold (`android-collector/`)  

---

## 14. Suggested API surface

```text
# Subscription
POST   /v1/collections/subscriptions
GET    /v1/collections/subscriptions/me
GET    /v1/admin/collections/subscriptions

# Cases
GET    /v1/collections/cases
POST   /v1/collections/cases/:id/assign
GET    /v1/collections/cases/:id
POST   /v1/collections/cases/:id/communications
POST   /v1/collections/cases/:id/contact-sessions   # start Call|SMS|WhatsApp
POST   /v1/collections/contact-sessions/:id/proof   # device log match upload
POST   /v1/collections/contact-sessions/:id/complete
POST   /v1/collections/cases/:id/promises

# Reports
GET    /v1/collections/reports/paid-cases
GET    /v1/collections/reports/promises
GET    /v1/collections/reports/collector-performance?period=day|month|year
GET    /v1/collections/reports/payment-stats
GET    /v1/collections/reports/case-followups/:caseId
```

Dashboard: new top-level **Collections** area for platform roles; seller sees **Billing → Collections service**.

---

## 15. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Collectors leak data across companies | Assignment scope + mandatory company column + audits |
| Mixing SaaS billing with collections billing | Separate subscription entity and invoices |
| Hours gamed (always clocked in) | Report talk time and contacts alongside hours |
| WhatsApp API delay | Deep link + Unverified badge; Business API for verified WA |
| Fake “I called” self-reports | ContactSession required; KPIs default to verified only |
| Call/SMS log permissions blocked by Play/OEM | Prefer bridge CPaaS; distribute companion as enterprise/sideload if needed |
| Privacy complaints on personal phones | Consent + match-only upload; prefer company handsets |
| Existing call centre code conflict | Evolve toward cases; keep old APIs until migration |
| Device unlock abuse by collectors | Default deny unlock for `COLLECTOR` |

---

## 16. Success criteria (MVP)

1. Seller activates **Growth**; 30–44 devices; overdue loans appear as managed cases tagged with **that company only**.  
2. Admin assigns 10 cases to Collector A; Collector B cannot see them.  
3. Collector **starts** call/SMS/WhatsApp from the case (ContactSession); timeline shows verification badge.  
4. Verified path: bridge callback or device log match marks contact `PROVIDER_VERIFIED` / `DEVICE_LOG_MATCHED`; pure self-report is labelled weak.  
5. Collector adds PTP date after contact; all visible on client timeline.  
6. Customer pays; paid-cases report shows **date + company**.  
7. End of day: Collector A report shows verified calls, avg talk time, hours, follow-up counts.  
8. Monthly report still available historically after 30+ days.  

---

## 17. Key decisions (locked recommendations)

| Decision | Recommendation | Status |
|----------|----------------|--------|
| Who owns the loan? | Always the **seller tenant** | Recommended |
| Who works managed cases? | Platform `COLLECTOR` accounts | Recommended |
| Case identity | `CollectionCase` per loan (or overdue installment) + `tenantId` | Recommended |
| Hours worked | Clock sessions primary; talk time separate | Recommended |
| WhatsApp strong proof | WhatsApp Business API (not personal chat scraping) | Recommended |
| Personal WhatsApp interim | Session + deep link + **Unverified** badge only | Recommended |
| Call strong proof | Bridge CPaaS and/or Collector app call-log match | Recommended |
| SMS strong proof | Beem API and/or Collector app SMS-log match | Recommended |
| Self-reported only | Allowed as fallback; excluded from strict KPIs by default | Recommended |
| Unlock | Not in collector role for v1 | Recommended |
| Pricing engine | Dedicated collections subscription, not current generic `PLANS` math | Recommended |

Update the **Status** column when product confirms Phase 0 answers.

---

## 18. Implementation tracking

Use this checklist as work proceeds. Mark items done in PRs and reference this file.

| Phase | Status | Notes / PR |
|-------|--------|------------|
| Phase 0 — Decisions | Done (2026-07-19) | Defaults locked in plan |
| Phase 1 — Foundation | Done (code) | Deploy to prod + seed collectors when ready |
| Phase 2 — Contact sessions & PTP | Done (code) | Case detail + sessions + PTP |
| Phase 2b — Collector companion app | Done (scaffold) | `android-collector/` + proof API |
| Phase 3 — Money reports | Done (code) | Reports page + APIs |
| Phase 4 — Collector performance | Done (code) | Clock + daily stats + reports |
| Phase 5 — Package billing | Done (code) | Invoices + past-due suspend |
| Phase 6 — Polish | In progress | CSV + payment hooks + nightly cron done |

---

## 19. Related files (current codebase)

| Area | Path |
|------|------|
| Call centre service | `backend/src/call-centre/` |
| Billing (existing plans) | `backend/src/billing/billing.service.ts` |
| Schema | `backend/prisma/schema.prisma` (`CallFollowUp`, `CallAttempt`, `UserRole`, `Tenant`) |
| Call centre UI | `dashboard/src/pages/CallCentre.tsx` |
| Billing UI | `dashboard/src/pages/Billing.tsx` |
| Backend design (multi-tenant) | `backend/docs/DESIGN.md` |

---

## 20. Change log

| Date | Change |
|------|--------|
| 2026-07-19 | Initial plan written from product scenario (managed collections packages + 9 admin requirements). |
| 2026-07-19 | Added **§3A Verified contact**: BYOD phones, system-initiated sessions, verification levels, bridge vs device call/SMS log match, WhatsApp Business vs personal limits, collector companion app permissions, privacy rules, Phase 2b. |
| 2026-07-19 | **Phase 0 locked.** **Phase 1 implemented:** roles, packages, CollectionsSubscription, CollectionCase, APIs, overdue sync hook, Collections dashboard page. |
| 2026-07-19 | **Phase 2 implemented:** ContactSession, CommunicationLog, PromiseToPay, start Call/SMS/WhatsApp from case, timeline + verification badges, case detail UI. |
| 2026-07-19 | **Phase 3 implemented:** paid-cases report, payment stats, by-company/by-collector, PTP board, case follow-up stats API, Collections Reports UI. |
| 2026-07-19 | **Phase 4 implemented:** work sessions clock in/out, CollectorDailyStat rollups, collector-performance day/month/year API + UI. |
| 2026-07-19 | **Phase 5 implemented:** CollectionsInvoice, generate monthly invoices, mark paid, process past due → subscription PAST_DUE. |
| 2026-07-19 | **Phase 6 (partial):** CSV exports, payment→case/PTP automation, break overdue PTPs, nightly collections cron. |
| 2026-07-19 | **Phase 6+:** seller weekly activity feed, auto-assign queue, contact proof API for device log match. |
| 2026-07-19 | **Phase 2b:** `android-collector/` staff companion app (login, queue, Call/SMS verify via logs → DEVICE_LOG_MATCHED). |
