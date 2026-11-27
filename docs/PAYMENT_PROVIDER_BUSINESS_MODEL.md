# Linda (SimuLinda) — Business model for payment integration

**Prepared for:** Payment service provider (onboarding / product review)  
**Product:** Linda — credit-sale and device-control platform for phone shops in Tanzania  
**Console:** https://client.linda.co.tz  
**Currency:** TZS  
**Gateway in production:** Snippe (mobile-money collections and disbursements)  
**Primary collection method:** Mobile money (USSD push), with optional cash recorded at the shop  
**Document purpose:** Explain how money moves in the current build: who pays, who is owed, where funds sit and for how long, and who bears the fees.

---

## 1. One-sentence summary

Linda is a **software platform**. Phone shops use it to sell devices on instalment. **The shop (seller) owns the loan and is owed every repayment.** Linda is **not** a lender. Customer repayments are collected by mobile money into Linda's gateway balance and **passed on automatically to the shop owner's mobile-money number as soon as they clear**. Linda keeps none of the instalment; it is paid separately by shops for software and optional collections services.

---

## 2. Parties

| Role | Who | What they do with money |
| --- | --- | --- |
| **End customer (buyer)** | Person who takes a phone on credit | Pays deposit and instalments |
| **Shop / seller (tenant)** | Independent phone shop; Owner / Manager / Agent staff | Finances the phone from their own stock and capital; is owed the loan; receives repayments |
| **Shop payout account** | A Tanzanian mobile-money number and registered name, set by the shop owner | **Destination of every instalment collected by mobile money** |
| **Linda (platform operator)** | Software company operating the dashboards, Android lock agent, reminders, and APIs | Holds the gateway merchant account; collects and forwards repayments; invoices shops for its own fees |
| **Snippe (gateway)** | Payment service provider | Sends the USSD push, settles to Linda's balance, sends payouts to shops |

Linda is **multi-tenant**: many shops on one platform. Each shop has its own customers, loans, devices, and **its own payout account**. Every collected payment is tagged with the shop it belongs to and can only be paid out to that shop.

---

## 3. What the product does (non-payment)

1. Shop creates a **credit sale**: customer name, mobile-money number, ID document, three guardians, device IMEI, price, deposit, term, and a daily, weekly or monthly instalment schedule with a contract.
2. Phone is enrolled with a **Device Policy Controller**. Until the loan is fully paid, Linda can **restrict the phone** after a missed payment and grace period.
3. Customer sees due dates and **Pay Now** on the phone, including on the lock screen. Staff can start the same collection from the shop console.
4. On **confirmed payment**, the platform allocates the amount to instalments, oldest first, and **unlocks** the device if its arrears are cleared.
5. When the **whole loan** is paid, the platform **releases** the device automatically so the agent no longer restricts the phone.

Lock/unlock is a **control signal**. It is not a payment. Unlock happens only after the gateway's own record shows the payment completed.

---

## 4. Two separate money streams (do not mix)

### Stream A — Customer loan repayments

- **Payer:** End customer (or anyone paying on their behalf, see §8)  
- **Payee:** Shop owner (seller of the phone)  
- **Amounts:** Scheduled instalments (principal + shop's interest); partial and early payments are allowed, overpayments are refused  
- **Nature:** Commercial repayment of a credit sale between customer and shop  
- **Linda's role:** Start the collection, match it to the loan, update the ledger, lock/unlock the device, and forward the money to the shop  
- **Settlement:** Collected into Linda's Snippe balance, then disbursed to the shop's payout account. Linda takes no share.

### Stream B — Platform fees

- **Payer:** Shop (not the end customer)  
- **Payee:** Linda  
- **Amounts:** Collections package (Starter per phone, Growth and Business flat monthly, Negotiation agreed per client) and usage-based platform billing  
- **Collection:** Invoiced to the shop and marked paid by a platform admin. **Not** collected through the gateway and **never** deducted from customer instalments.

---

## 5. Collection and settlement model (as built)

### 5.1 Model name

**Collect to the platform's merchant balance, then disburse to the seller.** Linda is the single gateway merchant; shops are not sub-merchants at the gateway.

### 5.2 Why funds pass through Linda's balance

The gateway settles collections to one merchant balance. Linda therefore receives each repayment and forwards it, rather than the gateway settling to each shop directly. The build is designed so that this is a pass-through and not a float:

- A payout is triggered **the moment a payment is confirmed**, not on a schedule.
- A sweep every 5 minutes pays out anything still owed.
- Linda's ledger records, per payment, what is owed to which shop and which payout settled it.

### 5.3 When money waits in Linda's balance

Money owed to a shop stays in the balance only in these cases:

| Case | What happens |
| --- | --- |
| Amount owed is below the gateway's minimum payout (5,000 TZS after the payout fee) | It accumulates until the total clears the minimum |
| Shop has not set a payout account | It stays queued until the owner sets one |
| Shop owner changed the payout number | Payouts pause for 24 hours (configurable), then resume |
| A payout failed or was reversed | The payments return to the owed pool; automatic retries wait 6 hours, and a platform admin can trigger one sooner |
| A payout's outcome is unknown for 20 hours | It is parked for a person to check against the gateway before any retry, so nothing is paid twice |

### 5.4 Fees

- The **customer is credited the full amount they paid** against their loan.
- The gateway's **collection fee** is deducted at settlement; what the gateway settled, net of that fee, is what is owed to the shop.
- The gateway's **payout fee** is deducted from the shop's share when the payout is sent.
- **Linda takes nothing** from either leg. Both gateway fees fall on the shop.

### 5.5 What is not built

- Direct settlement from the gateway to each shop (sub-merchant or per-shop till).
- Payouts to bank accounts; the payout account is a mobile-money number only.
- Split payments or any platform fee taken from an instalment.
- Collecting Linda's own invoices through the gateway.

---

## 6. End-to-end payment flow (Stream A)

```
Customer taps Pay Now (phone or lock screen), or shop staff start it
        ↓
Linda creates a pending payment with a unique order reference
        ↓
Linda asks Snippe for a USSD push: amount, payer number, order reference
        ↓
Customer approves on their phone (mobile-money PIN)
        ↓
Snippe collects from the customer's wallet into Linda's balance
        ↓
Snippe webhook → Linda verifies the signature and re-reads the payment from Snippe
        ↓
Linda marks the payment CONFIRMED, records the net amount settled,
allocates it to instalments
        ↓
If the device was locked and arrears are cleared → UNLOCK
If the whole loan is now paid → RELEASE
        ↓
Linda claims everything owed to that shop into one payout
and asks Snippe to send it to the shop's payout number
        ↓
Snippe payout webhook → Linda marks the payout COMPLETED
```

**Failed, cancelled or expired:** the payment is marked failed; the loan and device are unchanged.  
**No webhook:** a poller checks pending payments every minute, so a missed webhook only delays the result. A payment still pending after 5 hours is closed as failed.

Cash at the counter is **out of band**: staff record it in Linda, it is applied to the loan the same way, and it is never disbursed because the shop already holds it.

---

## 7. Typical transaction profile

| Item | Description |
| --- | --- |
| Geography | Tanzania |
| Currency | TZS, whole shillings |
| Ticket size | Shop-set phone instalment; minimum 500 TZS per mobile-money payment |
| Frequency | Daily, weekly or monthly per loan; extra and partial payments allowed |
| Volume | Grows with number of enrolled devices per shop and number of shops |
| Payer | Consumer (shop's customer) or someone paying for them |
| Payee | The shop, by mobile-money payout |
| Payouts | One per shop each time money clears, minimum 5,000 TZS |
| Use of funds | Repayment of financed handset (goods already delivered) |

Linda does **not** collect donations, gambling, crypto, or lending in its own name.

---

## 8. Risk, KYC, and compliance

- **Custody:** Repayments do pass through Linda's gateway balance on their way to the shop. They are forwarded automatically and are ring-fenced in Linda's ledger per shop, but Linda is the merchant that receives them. Any licensing or KYC consequence of that is something we want the provider's guidance on.
- **Customer identity:** At sale the shop records name, an ID document (national ID, voter ID, driving licence or passport) and a mobile-money number. That number is typed by shop staff; it is not read from the SIM.
- **Who can pay:** Pay Now defaults to the customer's registered number. The payer may enter a **different Tanzanian mobile-money number** (a relative's wallet, another SIM); the payment is still credited to that device's loan.
- **Proof of wallet control:** The payer approves the USSD prompt with their mobile-money PIN. That, plus the gateway's completed status, is the payment authentication.
- **Credit risk:** Sits with the **shop**. Device lock is collateral-style enforcement of the shop's contract, not a Linda loan.
- **Fraud on confirmation:** Webhooks must carry a valid HMAC signature with a recent timestamp, and the outcome is re-read from the gateway's API before anything is applied. Duplicate webhooks are ignored.
- **Fraud on payout:** A payment can be claimed into only one payout. Only the shop **owner** can change the payout account, and must re-enter their password; changes are rate-limited and logged, the old number is alerted by SMS and the owners by email, and payouts pause for 24 hours so a hijacked login cannot redirect money immediately.
- **Reversals:** A reversed **payout** returns its payments to the owed pool and is retried. A reversed **customer payment** is supported in the ledger (allocations are rebuilt and the phone can be re-locked) but nothing in the gateway integration triggers it today; it would need to be applied by hand.
- **AML:** High-value or unusual patterns can be flagged with the provider; shops remain responsible for their customer relationships.

---

## 9. Why this model

1. **Shop cash flow:** Owners financed the stock. Payouts fire as each payment clears, so money reaches their wallet the same day in normal operation.
2. **One integration:** A single gateway merchant account serves every shop, with no per-shop gateway onboarding before a shop can start collecting.
3. **Auditability:** Each payment records the amount paid, the net settled, the fee, and the payout that passed it on.

**Trade-off:** Linda is in the flow of funds. Direct settlement to each shop would remove that, and remains the preferred model if the provider offers sub-merchant or per-shop settlement.

---

## 10. Technical integration (current)

- **Collection:** `POST /v1/payments` at Snippe with amount, payer number and an idempotency key equal to Linda's order reference; the loan, payment and shop ids travel in metadata.
- **Confirmation:** `payment.*` webhooks to `https://api.linda.co.tz/v1/webhooks/snippe`, plus a status poll every minute as a fallback.
- **Disbursement:** `POST /v1/payouts/send` to the shop's payout number, with the payout id as the idempotency key; the fee is looked up first so that amount plus fee equals what is owed.
- **Payout confirmation:** `payout.*` webhooks, plus a sweep every 5 minutes that settles in-flight payouts and pays out anything waiting.
- **Unknown outcomes:** If a send times out, Linda looks the payout up at the gateway before deciding anything, and never re-sends once the idempotency window has passed.

---

## 11. What we would ask a provider to confirm

1. **Consumer collections (mobile-money USSD push) in TZS** and **mobile-money disbursements** on the same account.
2. **Webhooks and query APIs** for both payments and payouts.
3. Whether the provider supports **direct settlement to each shop** (sub-merchant, till or per-shop account), which would replace the collect-then-disburse step.
4. Guidance on **KYC and licensing** for the pass-through model in §5, and on shop KYC if shops become sub-merchants.
5. **Reversal notifications** for customer payments, so they can be applied automatically.

---

## 12. Contact / product identity (fill before sending)

| Field | Value |
| --- | --- |
| Legal entity name | *[your company legal name]* |
| Trading name | Linda / SimuLinda |
| Country of operation | Tanzania |
| Contact person | *[name]* |
| Email / phone | *[contact]* |
| Website / console | https://client.linda.co.tz |
| Estimated shops at start | *[n]* |
| Estimated monthly collection volume (TZS) | *[amount]* |

---

## 13. Short version (if they only read one page)

Linda helps phone shops sell handsets on instalment and lock the device if the buyer does not pay. **The shop owns the loan.** Pay Now sends a USSD push to the customer's number, or to another wallet the payer chooses, and the payer confirms with their PIN. The money lands in Linda's gateway balance and is **forwarded automatically to the shop owner's mobile-money number** as soon as it clears, less the gateway's collection and payout fees. Linda keeps none of it; its own revenue is a **separate invoice to the shop**. Funds wait only when the amount is under the 5,000 TZS payout minimum, the shop has no payout account, the payout number was just changed, or a payout failed.
