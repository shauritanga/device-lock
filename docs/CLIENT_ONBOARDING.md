# Onboarding a new client: from signed deal to first customer

For Linda staff. A "client" is a lender: a phone shop selling on credit, or a microfinance lender
taking phones as collateral. This guide takes one client from a lead to the day their first customer
walks out with an enrolled phone. The counter workflow itself is in
[PHONE_HANDOVER.md](PHONE_HANDOVER.md).

**Consoles:** staff work in `admin.linda.co.tz`. The client works in `client.linda.co.tz`.

---

## 0. Before you start (once, and when anything looks wrong)

These are platform-wide. If one fails, every client is affected.

| Check | How | Why it matters |
| --- | --- | --- |
| API is up | `curl -s -o /dev/null -w "%{http_code}" https://api.linda.co.tz/v1/auth/me` returns `401` | `401` means alive. Anything else is an outage. |
| SMS balance (Beem) | Top up the Beem account | Payment reminders, voice calls and the SMS lock fallback all use it. At zero, offline phones cannot be reached. |
| Payment provider (Snippe) | Keys set in `backend/.env` | Mobile-money payments and payouts to the client. |
| Push (Firebase) | Service account set | Locks reach phones within seconds. |
| Phone app on the server | `https://api.linda.co.tz/v1/provisioning/agent.apk` serves the latest signed build | New phones enrol with whatever is served. The server's `PROVISIONING_SIGNATURE_CHECKSUM` must match its signing key. |

---

## Part A: What you do (admin console)

### 1. Capture the lead
Open **Demo requests**. Make sure the lead has the company name, the contact person, how many
phones they expect, and a **work email**. That email becomes the owner's login, so it must be real.

### 2. Convert the lead to a company
Open the lead and choose **Convert to company**. This creates:
- the company (status *pending*),
- an **OWNER** login for the work email, with a **temporary password**.

The welcome email is sent automatically. If it could not be sent, the screen shows the email and
temporary password so you can send them yourself through a safe channel. **Write nothing down in
chat groups.**

### 3. Pick the package and activate it
Open **Companies**, then the company, then the **Billing** tab, then **Activate package**.

| Package | Phones | Price |
| --- | --- | --- |
| Starter | 1 to 39 | 18,000 per phone per month. Set the **phone allowance** the client has paid for. |
| Growth | 40 to 59 | 700,000 flat |
| Business | 60 to 75 | 900,000 flat |
| Negotiation | lenders with no phones | the fee you agree, entered as the agreed monthly fee |

The **phone allowance** is a hard limit: the client cannot register more phones than this.

### 4. The client must pay before they can work
New companies are **read-only** until the first package invoice is paid. The invoice is created when
you activate the package. When the money arrives, open **Billing** and **Mark as paid** on that
invoice. The client's read-only banner disappears within seconds. Do this only when the money is
actually received.

### 5. Agreement
Open the **Agreement** tab. Fill in the details, **Send to client**. The client signs in their own
console (**Agreement**). When they have signed, **Countersign**. Keep the signed copy.

### 6. Set the policy for what happens after repayment
Open the company **Overview**, **After repayment**:
- **Release the phone** (default). The phone is handed to the customer when the loan is repaid.
  This is right for shops selling phones on credit.
- **Keep the phone enrolled for the next loan.** For lenders that take the customer's own phone as
  collateral and lend again. Between loans the phone is unlocked and unrestricted. It is released
  after the retention days you set (90 by default) if no new loan starts.

Choose this **before the client's first sale**, because customers are asked to agree to it. For the
second option, make sure the loan contract wording is approved by your lawyer.

### 7. Collections (call centre)
If the package includes managed collections, phones are sent to the call centre **automatically** as
soon as they are enrolled. Nothing is handed over by the shop. Collectors work the case once a
payment is overdue. Make sure you have active collectors (**Collectors**).

---

## Part B: What the client does (client console), first day

Send the client this part together with their login. The owner does steps 1 to 5.

### 1. Sign in
Go to `client.linda.co.tz` with the email and temporary password. If you land on the admin site,
use the link to the seller console.

> Known gap: there is no screen for changing the password yet. Treat the temporary password as the
> permanent one for now, and keep it safe. A password-change screen is on the to-do list.

### 2. Check Billing and sign the agreement
- **Billing**: the invoice and plan are visible. If a banner says the company is read-only, the first
  invoice is not marked paid yet.
- **Agreement**: review and sign.

### 3. Set the payout account
Open **Payouts**. Enter the **mobile-money number** and the **name registered on it**. The system
asks for the owner's password. This is where the shop's instalments are sent. After the number is
changed, payouts pause for a safety period, so set it correctly the first time and test with a small
payment.

### 4. Add the team
- **Staff**: add managers and counter staff.
- **Agents**: add sales agents, who sell phones on credit on the owner's behalf.

| Role | Can do |
| --- | --- |
| Owner | Everything, including force-releasing a phone and approving customers. |
| Manager | Daily operations, payments, devices, customers, reviews. |
| Agent | Sell phones allocated to them, register customers, see their own sales. **Cannot** mark money as received, lock or unlock, or release phones. |

### 5. Register the phones
Open **Devices**, **Registered**, **Register phones**. Paste the **IMEIs** (one per line), add make
and model, optionally allocate them to an agent. The number of phones is limited by the package
allowance.

### 6. Do a test sale first
Before real customers, run one complete sale on a **shop test phone**:
1. Register a test customer, verify them, add a guardian.
2. Create the sale with a small deposit.
3. Factory-reset the phone, enrol it with the QR, confirm it locks for the deposit.
4. Pay the deposit (cash recorded by an owner or manager, or mobile money) and watch it unlock.

If that works, the shop is ready for real customers. The detailed counter steps are in
[PHONE_HANDOVER.md](PHONE_HANDOVER.md).

---

## Go-live checklist

- [ ] Platform checks in section 0 pass
- [ ] Company converted, OWNER login delivered
- [ ] Package activated with the right phone allowance
- [ ] First invoice paid and marked paid, read-only banner gone
- [ ] Agreement signed by the client and countersigned
- [ ] After repayment policy chosen
- [ ] Owner changed nothing risky: payout number set and tested
- [ ] Staff and agents created with the right roles
- [ ] Phones registered
- [ ] Test sale completed end to end, including lock and unlock
- [ ] Owner knows who to call (support number) and how to read the dashboard

---

## Common problems on day one

| Problem | Cause and fix |
| --- | --- |
| Client sees "read-only" and cannot register or sell | First invoice not paid or not marked paid. Check **Billing**. |
| "Your package covers N phones" when registering | Phone allowance reached. Raise the allowance. |
| A verified customer is missing from the sale dropdown | They have no guardian yet, or (for microfinance) no recorded factory-reset agreement. The dropdown lists what is missing. |
| Verification link says it has expired | The QR works for 15 minutes and only once. Start verification again. |
| Phone does not lock after enrolling | Not Device Owner. Factory-reset and enrol again with a fresh QR. |
| Phone stays locked after payment | Check it has internet. It unlocks within seconds once online. Offline phones depend on the SMS, which needs Beem balance. |
| Agent cannot mark a payment paid | By design. An owner or manager records it. |
| Reminders or SMS locks not arriving | Beem balance is empty. |
