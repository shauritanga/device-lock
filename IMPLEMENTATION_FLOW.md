# SimuLinda 100% Coverage Implementation Flow

This document defines the implementation path to make the current system fully match the SimuLinda business proposal.

The goal is to move from the current MVP foundation to a complete phone credit-sales management and device-security platform covering seller operations, buyer self-service, automated repayment collection, reminders, lock/unlock enforcement, fair-use protection, and production onboarding.

## Coverage Target

The final product must cover these proposal promises:

- Credit-sale registration from shop counter to final settlement.
- Customer, device, loan, installment, payment, and contract management.
- Android device-owner enrollment with anti-tamper controls.
- Remote lock, unlock, remind, and release.
- Automatic lock/unlock based on payment status.
- Buyer app showing profile, amount paid, amount remaining, due dates, and payment history.
- Pay Now flow from buyer app and lock screen.
- Mobile-money collection and reconciliation.
- SMS and voice reminders before due date, on due date, and after missed payment.
- Grace-period and fair-use flow before locking.
- Emergency access and no customer data deletion.
- SIM-swap protection.
- Offline/low-network enforcement.
- Seller dashboard with branch, agent, recovery, late account, and device views.
- Call-centre follow-up workflow.
- Pricing/subscription and add-on tracking.
- Pilot/onboarding process for shops.

## Phase 1: Data Model Completion

Purpose: make the backend represent the full business process, not only devices and loans.

Deliverables:

- Add `Branch` model.
- Add `Sale` or `Contract` model linking customer, device, loan, staff, branch, and signed terms.
- Add `ReminderSchedule` or `ReminderEvent` model.
- Add `CallFollowUp` model for human collection calls.
- Add `SubscriptionPlan` and `TenantBilling` models.
- Add SIM metadata fields to device records.
- Add consent/contract fields: accepted terms, signed at, witness/staff, contract file/reference.

Acceptance criteria:

- Every financed phone can be traced to a customer, branch, staff member, contract, loan, and device.
- Backend can answer: who bought the phone, what they owe, when payment is due, who enrolled it, and what actions were taken.

## Phase 2: Complete Credit Sale Wizard

Purpose: make the shop workflow match the proposal's sale-to-settlement lifecycle.

Deliverables:

- Dashboard flow to register customer.
- Dashboard flow to register/select device.
- Loan setup form: price, deposit, interest, term, start date, payment frequency.
- Auto-generated installment schedule.
- Contract preview and acceptance.
- Enrollment token/QR generation after sale creation.
- Sale summary page.

Acceptance criteria:

- A staff member can complete a credit sale without manually touching database records.
- A financed device cannot be handed over without customer, loan, contract, and enrollment token.

## Phase 3: Production Enrollment Flow

Purpose: ensure the app is truly device-owner and cannot be removed by the customer.

Deliverables:

- QR provisioning flow for factory-reset devices.
- Enrollment screen in dashboard with QR payload.
- Device-owner verification after enrollment.
- Enrollment event logs.
- Clear error states for non-device-owner installs.
- Remove or protect debug-only enrollment shortcuts before production release.

Acceptance criteria:

- Real financed phones are enrolled as Android Device Owner.
- App cannot be uninstalled by the customer during active loan.
- Factory reset, safe boot, add user, and debugging escape paths are blocked where Android permits.

## Phase 4: Buyer App Completion

Purpose: make the device app useful to the customer, not only a lock agent.

Deliverables:

- Home screen with avatar, greeting, balance, paid amount, remaining amount, next due date, progress.
- Payments screen with installment schedule and payment history.
- Profile screen with customer and device details.
- Support screen with seller/call-centre contact and staff-only setup area.
- Cached offline account summary.
- Clean empty states when no loan exists.
- Local language support: English and Swahili.

Acceptance criteria:

- Buyer can see profile, paid amount, remaining amount, next due date, and payment history.
- Staff controls are not visible except behind staff/admin gate.
- App still shows last known data without internet.

## Phase 5: Pay Now Flow

Purpose: let customers pay from the buyer app or lock screen and unlock automatically.

Deliverables:

- Backend endpoint for device-authenticated payment initiation.
- Buyer app `Pay Now` button.
- Lock screen `Pay Now` button.
- Mobile-money phone number confirmation.
- Pending payment state.
- Payment result polling or push refresh.
- Auto-unlock after confirmed payment.
- Error handling for failed/cancelled payment.

Acceptance criteria:

- Customer can start mobile-money payment without calling the shop.
- Confirmed payment updates installments and unlocks device automatically.
- Failed payment does not unlock the device.

## Phase 6: Mobile-Money Reconciliation

Purpose: make payments reliable and auditable.

Deliverables:

- Complete ClickPesa/Selcom/mobile-money integration configuration.
- Webhook verification and idempotency.
- Provider status query fallback.
- Reversal/refund handling.
- Payment allocation to installments.
- Payment receipt display in dashboard and buyer app.
- Manual payment override with audit log.

Acceptance criteria:

- M-Pesa, Tigo Pesa, and Airtel Money channels reconcile correctly.
- Reversed payments re-open balances and can re-lock if arrears return.
- Duplicate webhooks do not duplicate payments.

## Phase 7: Reminder Engine

Purpose: implement the full automated follow-up promised in the proposal.

Deliverables:

- Reminder schedule generation per installment.
- SMS before due date.
- SMS on due date.
- SMS after missed payment.
- Grace-period warning.
- Lock warning.
- Swahili and English templates.
- Reminder audit log.
- Retry/failure handling.

Acceptance criteria:

- Customers receive reminders before any lock.
- Seller can see which reminders were sent and whether they failed.
- Reminder rules are configurable per tenant/branch.

## Phase 8: Voice/IVR Reminder Support

Purpose: cover the proposal's automated voice-call promise.

Deliverables:

- Integrate voice provider such as Beem or Africa's Talking.
- Voice template support.
- Due-date and overdue voice reminder jobs.
- Call status callback handling.
- Tenant-level enable/disable and cost tracking.

Acceptance criteria:

- Voice reminders can be sent automatically.
- Dashboard shows voice call attempts and outcomes.

## Phase 9: Graduated Restriction Policy

Purpose: enforce fairly before locking.

Deliverables:

- Configurable grace days per tenant/device.
- Reminder-first policy.
- Soft warning command.
- Lock command after grace period.
- Emergency access remains available.
- Lock reason shown on device.
- Release command after full settlement.

Acceptance criteria:

- Device is not locked before configured reminders and grace period.
- Device locks only when policy conditions are met.
- Fully paid devices are permanently released.

## Phase 10: Offline And Low-Network Enforcement

Purpose: make the system work in weak-network areas.

Deliverables:

- Device stores latest policy, next due date, grace end date, and max offline days.
- Device can locally restrict itself if offline past allowed threshold.
- Backend updates policy during check-in.
- Offline status shown in dashboard.
- Last check-in monitoring.

Acceptance criteria:

- A device cannot avoid enforcement by staying offline indefinitely.
- Device behavior remains predictable when network is intermittent.

## Phase 11: SMS Command Fallback

Purpose: support lock/unlock/remind when data and FCM are unavailable.

Deliverables:

- Secure SMS command format.
- Device receiver for signed SMS commands.
- Backend SMS command sender.
- Command nonce/replay protection.
- SMS delivery audit log.

Acceptance criteria:

- Backend can send lock/unlock via SMS fallback.
- Device rejects forged or replayed SMS commands.

## Phase 12: SIM-Swap Protection

Purpose: prevent customers from evading follow-up by changing SIM cards.

Deliverables:

- Capture SIM/operator/phone-number metadata during enrollment where Android permits.
- Device reports SIM changes during check-in.
- Tenant policy for allowed/blocked SIM changes.
- Lock or alert on unauthorized SIM swap.
- Dashboard approval flow for legitimate SIM replacement.

Acceptance criteria:

- Seller is alerted when SIM changes.
- Unauthorized SIM change can trigger lock or warning.
- Legitimate SIM replacement can be approved by staff.

## Phase 13: Anti-Tamper Hardening

Purpose: make device control reliable in production.

Deliverables:

- Verify device-owner status in app and backend.
- Enforce uninstall prevention.
- Block factory reset, safe boot, add user, and debugging where supported.
- Detect disabled permissions or policy failure.
- Device event logging for tamper attempts.
- Recovery flow for failed commands.

Acceptance criteria:

- Active-loan device cannot be trivially wiped, debugged, or uninstall the agent.
- Tamper events appear in dashboard.

## Phase 14: Seller Dashboard Completion

Purpose: make the seller dashboard operational for real shops.

Deliverables:

- Dashboard overview: active devices, due today, overdue, locked, collected today.
- Customers page.
- Credit sales/contracts page.
- Devices page with status and last check-in.
- Payments page.
- Overdue/accounts receivable page.
- Branch and agent performance reports.
- Recovery rate charts.
- Lock/unlock/release controls with permissions.

Acceptance criteria:

- Seller can run daily operations from dashboard.
- Owner can see business health per branch and staff member.

## Phase 15: Call-Centre Workflow

Purpose: cover the human follow-up service in the proposal.

Deliverables:

- Call queue for overdue customers.
- Follow-up notes.
- Promise-to-pay date.
- Call outcome categories.
- Escalation status.
- Staff assignment.
- Call-centre performance report.

Acceptance criteria:

- Human collectors know who to call, why, and what happened last time.
- Seller can see call-centre impact on collections.

## Phase 16: Contracts And Customer Protection

Purpose: protect customers and the shop legally and reputationally.

Deliverables:

- Simple contract template.
- Terms explaining installment plan, lock policy, reminders, grace period, emergency access, no data deletion, final release.
- Customer consent capture.
- PDF or printable contract.
- Contract storage/reference.
- Swahili and English versions.

Acceptance criteria:

- Every sale has clear accepted terms.
- Customer can understand what happens before and after missed payment.

## Phase 17: Pricing And Billing

Purpose: support the business model in the proposal.

Deliverables:

- Tenant subscription plan.
- Active-device billing count.
- SMS/voice bundle tracking.
- Call-centre add-on tracking.
- Monthly invoice generation.
- Payment status for tenant subscription.

Acceptance criteria:

- SimuLinda can bill shops according to Starter/Growth/Business plans or custom plans.
- Add-on costs are visible and auditable.

## Phase 18: Pilot And Onboarding Flow

Purpose: support the proposed 10-20 phone pilot path.

Deliverables:

- Shop onboarding checklist.
- Staff account setup.
- Branch setup.
- Test device enrollment process.
- Pilot monitoring dashboard.
- Pilot report: collection rate, late accounts, locks, unlocks, support issues.

Acceptance criteria:

- A new shop can be onboarded with a repeatable process.
- Pilot performance can be reviewed before scaling.

## Phase 19: Production Operations

Purpose: make the platform supportable after launch.

Deliverables:

- Environment configuration checklist.
- Logging and monitoring.
- Error reporting.
- Admin audit logs.
- Backup and restore plan.
- Security review.
- Deployment scripts.
- User documentation.

Acceptance criteria:

- Platform can be deployed, monitored, supported, and recovered reliably.

## Phase 20: End-To-End Acceptance Test

Purpose: prove the full proposal lifecycle works.

Test scenario:

1. Create tenant/shop.
2. Create branch and staff user.
3. Register customer.
4. Register phone.
5. Create credit sale and contract.
6. Generate installment schedule.
7. Enroll phone as device owner by QR.
8. Buyer opens app and sees profile, paid amount, remaining amount, and next due date.
9. Reminder is sent before due date.
10. Customer misses payment.
11. Grace-period reminder is sent.
12. Device locks after grace period.
13. Lock screen shows amount due and Pay Now.
14. Customer pays by mobile money.
15. Payment webhook confirms.
16. Installment is updated.
17. Device unlocks automatically.
18. Seller dashboard updates balances and recovery reports.
19. Final installment is paid.
20. Device is released permanently.

Acceptance criteria:

- The full flow works without manual database edits.
- All major actions are logged.
- Customer data is not deleted.
- Emergency access remains available when locked.
- Seller can see accurate financial and device status at every step.

## Recommended Build Order

Build in this order to get useful business value quickly:

1. [x] Attach customer + loan + demo data to currently enrolled device.
2. [x] Complete sale wizard and customer/loan assignment.
3. [x] Add Pay Now to buyer app and lock screen.
4. [x] Complete reminder engine.
5. [x] Improve dashboard operational pages.
6. [x] Add contract/consent flow.
7. [x] Harden real device-owner enrollment.
8. [x] Add offline policy.
9. [x] Add SIM-swap protection.
10. [x] Add SMS command fallback.
11. [x] Add voice/IVR reminders.
12. [x] Add call-centre workflow.
13. [x] Add billing/pricing.
14. [x] Finish pilot/onboarding/reporting.

## Implementation Progress

### Completed: Attach Customer + Loan + Demo Data To Currently Enrolled Device

Status: Done

Completed on: 2026-07-13

Summary:

- Created/reused customer `Abdulmalik Abu` with phone `0692251043`.
- Linked customer to enrolled backend device `seed-device-a`.
- Created active loan `306ac3dd-eda7-499b-a982-efff7a739ce7` for `seed-device-a`.
- Generated 6 monthly installments for a TZS 600,000 phone, TZS 100,000 down payment, 10% flat interest.
- Recorded a confirmed TZS 100,000 demo payment.
- Verified the Android buyer app now displays real customer/account data:
  - Name: `Abdulmalik Abu`
  - Paid: `TZS 100,000`
  - Remaining: `TZS 450,000`
  - Next payment: `TZS 83,333.32 due 13 Sep 2026`
  - Payments screen shows installment schedule and confirmed payment history.

Notes:

- This was done through existing backend APIs, not manual database edits.
- Device is enrolled and active, but still reports `Device owner: false` on the test phone. Production hardening remains scheduled under `Harden real device-owner enrollment`.

### Completed: Complete Sale Wizard And Customer/Loan Assignment

Status: Done

Completed on: 2026-07-13

Summary:

- Added a new dashboard route: `/sales`.
- Added `Sales` to the dashboard sidebar.
- The Sales page now displays a list of existing credit sales first.
- Added an `Add new sale` button that opens the guided sale wizard in a modal.
- Implemented a guided credit-sale wizard that creates the complete operational sale chain through existing backend APIs:
  - Customer registration.
  - Device registration linked to that customer.
  - Loan creation linked to that customer and device.
  - Enrollment token display for phone setup.
- Added repayment preview before submission:
  - Financed amount.
  - Total repayable.
  - Estimated monthly installment.
- Added a success summary after creation:
  - Customer details.
  - Device details.
  - Loan amount and term.
  - Copyable enrollment token.
- Invalidates dashboard customer, device, loan, and summary queries after successful sale creation.
- Verified the dashboard production build succeeds with `npm run build`.
- `/sales/new` redirects back to `/sales` so sales stay under one list page.

Notes:

- This completes the first practical sale-wizard implementation using the current backend models.
- Contract/PDF signing is still planned separately under `Add contract/consent flow`.
- Branch and staff attribution are still planned under `Data Model Completion` and `Seller Dashboard Completion`.

### Completed: Add Pay Now To Buyer App And Lock Screen

Status: Done

Completed on: 2026-07-13

Summary:

- Added a device-authenticated backend endpoint: `POST /agent/pay-now`.
- The endpoint derives the loan from the enrolled device token, so the buyer app does not send or choose a `loanId`.
- The endpoint defaults the payment amount to the next unpaid installment amount, or remaining balance if there is no next installment.
- Reused the existing mobile-money initiation path through `PaymentsService.initiateMobileMoney`.
- Added Android API support for `/agent/pay-now`.
- Added `AgentManager.payNow(...)` for UI screens.
- Added a `Pay Now` button on the buyer Home screen.
- Added a `Pay Now` button on the lock screen above `I've paid — check now`.
- Home screen Pay Now uses the visible customer phone and next due amount.
- Lock screen Pay Now lets the backend choose the due amount and customer phone from the enrolled device.
- After Pay Now starts, the app requests an immediate sync so confirmed payments can unlock/update the device quickly.
- Verified backend build succeeds with `npm run build`.
- Verified Android build succeeds with `./gradlew :app:assembleDebug`.
- Installed and launched the updated Android app on the connected test device.

Notes:

- In development, if ClickPesa credentials are not configured, the backend records the payment intent and returns a pending status without sending a real USSD push.
- Automatic unlock after real payment confirmation depends on provider webhook/status confirmation, which is covered further under `Mobile-Money Reconciliation`.

### Completed: Complete Reminder Engine

Status: Done

Completed on: 2026-07-13

Summary:

- Replaced the basic overdue-only evaluator with a staged repayment reminder engine.
- The daily job now handles:
  - Reminder 1 day before due date.
  - Reminder on due date.
  - Grace-period overdue reminder.
  - Final lock warning on the last grace day.
  - Lock command after grace expires.
- Reminder messages include:
  - Customer name.
  - Installment number.
  - Amount due.
  - Grace/lock timing where applicable.
- Reminder events are audited through existing `DeviceEvent` records, avoiding a database migration for this step.
- Each reminder type is de-duplicated per device/installment/day so manual job re-runs do not spam the same reminder repeatedly.
- Lock queue events are audited as `LOCK_QUEUED_OVERDUE`.
- Existing manual trigger `POST /jobs/run-overdue` continues to work for ops/testing.
- Verified backend build succeeds with `npm run build`.

Notes:

- This completes SMS reminder scheduling and audit behavior.
- Actual SMS delivery still depends on valid Beem credentials; without them the SMS service logs/stubs the send in development.
- Voice/IVR reminders remain scheduled separately under `Add voice/IVR reminders`.

### Completed: Improve Dashboard Operational Pages

Status: Done

Completed on: 2026-07-13

Summary:

- Extended `GET /dashboard/summary` with operational seller data:
  - Installments due today.
  - Overdue amount.
  - Due-today account list.
  - Overdue account list.
  - Locked device list.
- Added dashboard stat cards for:
  - Due today.
  - Overdue amount.
  - Customers.
  - Active loans.
- Added operational dashboard panels:
  - `Due today`: customers to remind before close of business.
  - `Overdue accounts`: high-priority collection follow-up list.
  - `Locked devices`: phones currently restricted.
- Each operational row shows customer, phone, device, installment number, amount due, status, and due/locked date where relevant.
- Kept existing charts and recent payments section.
- Verified backend build succeeds with `npm run build`.
- Verified dashboard build succeeds with `npm run build`.

Notes:

- This makes the dashboard more useful for daily seller operations.
- Branch and agent performance are still scheduled under branch/staff attribution and later reporting work.

### Completed: Add Contract/Consent Flow

Status: Done

Completed on: 2026-07-13

Summary:

- Added a persistent `Contract` model tied one-to-one to each loan.
- Added contract fields for:
  - Customer.
  - Loan.
  - Accepted timestamp.
  - Staff/user who accepted the contract.
  - Terms language.
  - Terms version.
  - Full terms text.
  - Metadata for audit context.
- Added Prisma migration `20260713090000_contract_consent` and applied it locally with `npx prisma migrate deploy`.
- Added tenant scoping and RLS policy support for `Contract`.
- Added backend contracts module:
  - `POST /contracts` to create accepted contract records.
  - `GET /contracts` to list contracts.
  - `GET /contracts/:id` to view one contract.
- Updated loan queries to include contract status.
- Updated Sales page:
  - Sales list now shows contract status.
  - Add-new-sale modal now includes fair-use/consent terms.
  - Staff must tick consent acceptance before sale creation.
  - Sale creation now creates customer, device, loan, and contract.
- Generated Prisma client with `npx prisma generate`.
- Verified backend build succeeds with `npm run build`.
- Verified dashboard build succeeds with `npm run build`.

Notes:

- Existing running backend processes must be restarted to expose the new `/contracts` route.
- Printable/PDF contract output is still a future enhancement, but the accepted contract data is now persisted and auditable.

### Completed: Harden Real Device-Owner Enrollment

Status: Done

Completed on: 2026-07-13

Summary:

- Added device-owner health reporting to Android check-ins.
- Android now reports:
  - Whether the app is actually Device Owner.
  - Whether managed anti-removal restrictions are applied.
- Backend now audits management health from check-ins:
  - `MANAGEMENT_HEALTH_OK` when the phone is properly controlled.
  - `MANAGEMENT_HEALTH_WARNING` when the app is enrolled but not fully Device Owner or restrictions are missing.
- Management health events are de-duplicated daily to avoid noisy audit logs.
- Device detail page now shows a warning when the phone is enrolled but not fully controlled.
- Removed the hidden debug enrollment intent-extra shortcut from `MainActivity`; production enrollment should happen through staff enrollment or proper QR/device-owner provisioning.
- Android status summary now shows `Managed restrictions: true/false`.
- Verified backend build succeeds with `npm run build`.
- Verified dashboard build succeeds with `npm run build`.
- Verified Android build succeeds with `./gradlew :app:assembleDebug`.
- Installed and launched the updated Android app on the connected test device.

Notes:

- This does not magically convert an already-normal-installed phone into Device Owner. Android requires QR/factory setup or `dpm set-device-owner` before handover.
- The system can now detect and warn when a phone is not truly production-hardened.

### Completed: Add Offline Policy

Status: Done

Completed on: 2026-07-13

Summary:

- Android now parses backend policy returned by enroll/check-in:
  - `graceDays`.
  - `maxOfflineDays`.
- Android stores offline enforcement state locally in encrypted preferences:
  - Last successful check-in time.
  - Effective grace days.
  - Effective max-offline days.
  - Cached next due date.
  - Cached next amount due.
- Successful enrollment and check-in now refresh local policy state.
- Successful customer-summary refresh now caches next-payment due state for local enforcement.
- Background check-in failures now evaluate local offline policy before retrying WorkManager.
- Boot restore now evaluates local offline policy after scheduling immediate sync.
- Local lock enforcement now triggers when:
  - The enrolled Device Owner phone has been offline longer than `maxOfflineDays`.
  - The cached active installment is unpaid past due date plus `graceDays`.
- Local enforcement is intentionally skipped when the app is not Device Owner, because Android cannot reliably enforce lock policy without Device Owner privileges.
- Verified Android build succeeds with `./gradlew :app:assembleDebug`.

Notes:

- Backend already returned effective policy from enroll/check-in by resolving device override first and tenant default second, so no backend API change was required for this task.
- Offline unlock/payment reconciliation still depends on reconnecting and receiving the current backend state.

### Completed: Add SIM-Swap Protection

Status: Done

Completed on: 2026-07-13

Summary:

- Added tenant policy field `lockOnSimChange`, defaulting to blocked/lock behavior.
- Added device SIM tracking fields:
  - ICCID where Android exposes it.
  - Operator.
  - Country ISO.
  - Phone number where Android exposes it.
  - Current SIM fingerprint.
  - Approved SIM fingerprint.
  - Last changed timestamp.
  - Last approval timestamp.
- Added Prisma migration `20260713100000_sim_swap_protection` and applied it locally with `npx prisma migrate deploy`.
- Android now requests phone-state/phone-number permissions and grants them automatically when running as Device Owner.
- Android now captures available SIM metadata during enrollment and check-in.
- Enrollment stores the first reported SIM as the approved baseline.
- Check-in compares the current SIM fingerprint against the approved baseline.
- Backend now creates `SIM_CHANGED` audit events when a new unapproved SIM is reported.
- Backend queues a `LOCK` command with reason `unauthorized SIM change detected` when tenant policy blocks SIM changes.
- Duplicate pending SIM-lock commands are avoided.
- Added staff approval endpoint `POST /devices/:id/approve-sim-change` for owner/manager review of legitimate SIM replacements.
- Dashboard device detail now shows SIM protection status, SIM metadata, SIM-change warning, and an `Approve SIM` action.
- Generated Prisma client with `npx prisma generate`.
- Verified backend build succeeds with `npm run build`.
- Verified dashboard build succeeds with `npm run build`.
- Verified Android build succeeds with `./gradlew :app:assembleDebug`.

Notes:

- Android may not expose ICCID or phone number on every OS/carrier, so enforcement uses the stable metadata available on that specific device.
- A backend process restart is required before the new approval route and Prisma fields are available to the running API process.

### Completed: Add SMS Command Fallback

Status: Done

Completed on: 2026-07-13

Summary:

- Added per-device `smsSecret` for signed fallback commands.
- Added Prisma migration `20260713110000_sms_command_fallback` and applied it locally with `npx prisma migrate deploy`.
- Enrollment now generates and returns an SMS command secret to the Android agent.
- Check-in now backfills and returns an SMS command secret for already-enrolled devices that do not have one yet.
- Backend command queue now sends signed SMS fallback messages for:
  - `LOCK`.
  - `UNLOCK`.
  - `RELEASE`.
- SMS command format includes command id, command type, expiry timestamp, and HMAC signature.
- Backend sends SMS fallback to the current SIM phone number when known, otherwise the customer phone number.
- Backend writes audit events for SMS command delivery/stub behavior:
  - `SMS_COMMAND_SENT`.
  - `SMS_COMMAND_STUBBED`.
- Android now requests and Device Owner grants `RECEIVE_SMS`.
- Added `SmsCommandReceiver` to receive signed command SMS messages.
- Android verifies SMS HMAC signatures before executing commands.
- Android rejects expired SMS commands.
- Android stores executed SMS command ids and rejects replayed command SMS messages.
- Android executes valid SMS `LOCK`, `UNLOCK`, and `RELEASE` commands through the same device policy controller used by online commands.
- Android attempts online ack after executing an SMS command when data is available.
- Generated Prisma client with `npx prisma generate`.
- Verified backend build succeeds with `npm run build`.
- Verified Android build succeeds with `./gradlew :app:assembleDebug`.

Notes:

- Beem credentials are still optional; without them the backend logs/stubs SMS sending and records `SMS_COMMAND_STUBBED`.
- Existing enrolled devices receive `smsSecret` on their next successful check-in before SMS fallback can work for them.
- A backend process restart is required before the new Prisma field and SMS fallback behavior are active in the running API process.

### Completed: Add Voice/IVR Reminders

Status: Done

Completed on: 2026-07-13

Summary:

- Added generic `VoiceService` for automated reminder calls.
- Added voice provider configuration:
  - `VOICE_CALL_URL`.
  - `VOICE_API_KEY`.
  - `VOICE_SENDER_ID`.
- Voice provider is safe in development: when credentials are absent, calls are logged/stubbed instead of failing the reminder job.
- Daily installment evaluation now attempts voice calls alongside SMS reminders for due-date, grace, and final lock-warning stages.
- Reminder audit metadata now records:
  - SMS outcome.
  - Voice attempted flag.
  - Voice sent/stubbed outcome.
  - Provider reference when returned.
- Added `POST /webhooks/voice` callback endpoint for provider call-status updates.
- Voice callbacks are stored as `VOICE_CALLBACK` device audit events when a device id is supplied.
- Dashboard device timeline now shows SMS/voice reminder outcomes and voice callback status details.
- Verified backend build succeeds with `npm run build`.
- Verified dashboard build succeeds with `npm run build`.

Notes:

- The IVR provider integration is generic JSON POST so Beem, Africa's Talking, or another provider can be connected by environment config.
- A backend process restart is required before voice reminder config and callback route are active in the running API process.

### Completed: Add Call-Centre Workflow

Status: Done

Completed on: 2026-07-13

Summary:

- Added persistent `CallFollowUp` model for human collection calls.
- Added persistent `CallAttempt` model for system-started call evidence.
- Added fields for:
  - Customer.
  - Loan.
  - Device.
  - Assigned staff member.
  - Staff member who created the note.
  - Call outcome.
  - Notes.
  - Promise-to-pay date.
  - Escalation status.
  - Next follow-up date.
  - Call timestamp.
- Added Prisma migration `20260713120000_call_centre_workflow` and applied it locally with `npx prisma migrate deploy`.
- Added Prisma migration `20260713140000_verified_call_attempts` and applied it locally with `npx prisma migrate deploy`.
- Added tenant scoping for `CallFollowUp`.
- Added tenant scoping for `CallAttempt`.
- Added backend call-centre API:
  - `GET /call-centre/queue` for overdue customer call queue.
  - `GET /call-centre/follow-ups` for recent call history.
  - `GET /call-centre/performance` for outcome counts.
  - `GET /call-centre/attempts` for verified/system-started call attempts.
  - `POST /call-centre/assignments` for manager/owner assignment of customers to staff.
  - `POST /call-centre/calls/start` to initiate a provider-backed staff/customer bridge call.
  - `POST /call-centre/calls/complete` to complete notes against a tracked attempt.
  - `POST /call-centre/calls/callback` for provider call-status callbacks.
  - `POST /call-centre/follow-ups` to log call outcomes.
- Logging a call creates a `CALL_FOLLOW_UP` device audit event.
- Starting a system call creates `CALL_ATTEMPT_STARTED` audit events.
- Assigning a customer creates `CALL_ASSIGNED` audit events.
- Provider callbacks create `CALL_ATTEMPT_VERIFIED` audit events.
- Call attempt evidence records include:
  - Staff phone.
  - Customer phone.
  - Provider name.
  - Provider call id.
  - Provider status.
  - Verification status.
  - Duration.
  - Recording URL when supplied.
- Verification statuses distinguish real provider evidence from staff self-reporting:
  - `VERIFIED_CONNECTED`.
  - `VERIFIED_ATTEMPTED`.
  - `MISSED_BY_STAFF`.
  - `ATTEMPTED`.
  - `FAILED`.
  - `SELF_REPORTED`.
- Added dashboard `Call Centre` navigation item and page.
- Dashboard call-centre page now shows:
  - Overdue customer queue.
  - Amount due and days overdue.
  - Device lock status.
  - Last follow-up outcome.
  - Assigned staff member.
  - Assignment form for manager/owner.
  - Call logging form.
  - Promise-to-pay and next-follow-up dates.
  - Escalation status.
  - System-started verified call button.
  - Active attempt verification status.
  - Verified call attempt history.
  - Evidence label on recent follow-ups.
  - Recent follow-up history.
  - Simple outcome and verification performance counts.
- Generated Prisma client with `npx prisma generate`.
- Verified backend build succeeds with `npm run build`.
- Verified dashboard build succeeds with `npm run build`.

Notes:

- A backend process restart is required before the new `/call-centre` routes are active in the running API process.
- Branch-level and advanced staff performance analytics can still be expanded in the final pilot/reporting phase.

### Completed: Add Billing/Pricing

Status: Done

Completed on: 2026-07-13

Summary:

- Added tenant subscription fields:
  - `billingPlan`.
  - `subscriptionStatus`.
- Added persistent `BillingInvoice` model for monthly shop invoices.
- Added billing invoice fields for:
  - Billing period.
  - Plan name.
  - Invoice status.
  - Active device count.
  - SMS usage count.
  - Voice/IVR usage count.
  - Call-centre follow-up count.
  - Subtotal, tax, total, and line items.
- Added Prisma migration `20260713130000_billing_pricing` and applied it locally with `npx prisma migrate deploy`.
- Added tenant scoping for `BillingInvoice`.
- Added backend billing API:
  - `GET /billing/summary` for current plan, usage, estimate, and recent invoices.
  - `GET /billing/invoices` for invoice history.
  - `POST /billing/invoices/generate` to generate/upsert the current month invoice.
- Added default plan pricing for `STARTER`, `GROWTH`, and `BUSINESS`.
- Billing usage now derives from existing auditable system activity:
  - Active/locked devices for device count.
  - SMS command/reminder events for SMS usage.
  - Voice reminder/callback events for IVR usage.
  - Call follow-up records for call-centre add-on usage.
- Added dashboard `Billing` page under account management.
- Dashboard billing page shows:
  - Current plan.
  - Subscription status.
  - Active devices.
  - Current month estimate.
  - Usage bundle counts.
  - Generated invoice history.
  - Manual current invoice generation.
- Generated Prisma client with `npx prisma generate`.
- Verified backend build succeeds with `npm run build`.
- Verified dashboard build succeeds with `npm run build`.

Notes:

- A backend process restart is required before `/billing` routes and new tenant billing fields are active in the running API process.
- Payment collection for SimuLinda invoices is tracked as invoice status data but full provider payment reconciliation for platform invoices can still be expanded later.

### Completed: Finish Pilot/Onboarding/Reporting

Status: Done

Completed on: 2026-07-13

Summary:

- Added backend pilot report API `GET /pilot/report`.
- Added pilot readiness checklist covering:
  - Active shop profile.
  - Staff accounts.
  - Customers loaded.
  - Pilot phones registered.
  - Test/enrolled devices.
  - Active credit sales.
  - Accepted contracts.
  - Payment path tested.
  - Collections workflow activity.
- Added pilot KPI report for:
  - Registered phones.
  - Enrolled phones.
  - Active loans.
  - Confirmed collections.
  - Collection rate.
  - Overdue installments.
  - Locked devices.
  - Lock/unlock counts.
  - Support issue count.
  - Call follow-up count.
- Pilot report includes recent device audit events for review before scaling.
- Added dashboard `Pilot` page and navigation item.
- Dashboard pilot page shows:
  - Readiness percentage.
  - 10-phone pilot enrollment progress.
  - Checklist status and details.
  - Pilot performance KPIs.
  - Recent pilot activity/audit trail.
- Verified backend build succeeds with `npm run build`.
- Verified dashboard build succeeds with `npm run build`.

Notes:

- This completes the 14-item implementation checklist created from the proposal.
- The separate dashboard `Pilot` menu/page was removed after review; onboarding/pilot reporting should not appear as a daily operations menu item.
- Branch setup can still be added later if multi-branch rollout requires it.

### Completed: Production Operations

Status: Done

Completed on: 2026-07-13

Summary:

- Added production readiness endpoint `GET /health/readiness`.
- Readiness checks now verify required operational dependencies without exposing secret values:
  - Database connectivity.
  - JWT access secret.
  - JWT refresh secret.
  - Provisioning signature checksum.
- Readiness also reports optional integration configuration:
  - Public base URL.
  - ClickPesa credentials.
  - Beem SMS credentials.
  - Voice/IVR provider credentials.
  - Firebase/FCM service account.
- Added production operations runbook `backend/docs/OPERATIONS.md`.
- Runbook covers:
  - Deployment checklist.
  - Health and monitoring.
  - Backups and recovery.
  - Security review.
  - Incident playbooks.
  - Release verification.
- Verified backend build succeeds with `npm run build`.

Notes:

- The readiness endpoint reports configured/unconfigured status only; it does not return secret values.
- External monitoring/alert delivery can be wired to `/health` and `/health/readiness` in the deployment environment.

## Definition Of 100% Coverage

The implementation is considered 100% covered when every promise in the proposal can be demonstrated in a real end-to-end pilot with no manual database edits and no hidden developer-only steps.

The final demo must show:

- Shop creates a credit sale.
- Phone enrolls as device owner.
- Buyer sees balance and profile.
- Customer receives reminders.
- Missed payment triggers fair restriction.
- Pay Now unlocks automatically.
- Dashboard shows accurate sales, collections, late accounts, and branch/agent performance.
- Final payment releases the phone permanently.
- All activity is auditable.
