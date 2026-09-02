# Linda (SimuLinda) — Business model for payment integration

**Prepared for:** Payment service provider (onboarding / product review)  
**Product:** Linda — credit-sale and device-control platform for phone shops in Tanzania  
**Console:** https://client.linda.co.tz  
**Currency:** TZS  
**Primary collection method:** Mobile money (USSD push / STK), with optional cash recorded at the shop  
**Document purpose:** Explain how money moves, who the merchant is, and why **customer installment collections must settle directly to the shop owner’s account**, not to the platform’s operating account.

---

## 1. One-sentence summary

Linda is a **software platform**. Phone shops use it to sell devices on installment. **The shop (seller) is the merchant of record for loan repayments.** Linda is **not** a lender and **does not take custody** of customer installment funds. Those funds must go **straight to the shop owner’s nominated mobile-money or bank account**. Linda is paid separately by shops for software and optional collections services.

---

## 2. Parties

| Role | Who | What they do with money |
| --- | --- | --- |
| **End customer (buyer)** | Person who takes a phone on credit | Pays deposit and monthly installments |
| **Shop / seller (tenant)** | Independent phone shop; Owner / Manager / Agent staff | Finances the phone from their own stock and capital; is owed the loan; receives repayments |
| **Shop owner account** | Owner’s registered M-Pesa / Airtel Money / Tigo Pesa / bank account | **Destination of every confirmed installment and digital deposit** |
| **Linda (platform operator)** | Software company operating the dashboards, Android lock agent, reminders, and APIs | Does **not** receive loan principal or interest; invoices shops for SaaS and add-ons |

Linda is **multi-tenant**: many shops on one platform. Each shop has its own customers, loans, devices, and **its own settlement destination**.

---

## 3. What the product does (non-payment)

1. Shop creates a **credit sale**: customer name, **registered mobile-money number** (typed by staff), ID document, device IMEI, price, deposit, term, installment schedule, contract.
2. Phone is enrolled with a **Device Policy Controller**. Until the loan is fully paid, Linda can **restrict the phone** after a missed payment and grace period.
3. Customer sees due dates and **Pay Now** on the phone (and staff can initiate the same collection from the shop console).
4. On **confirmed payment**, the platform allocates the amount to installments and **unlocks** the device if it was locked.
5. After the **final installment**, the shop **releases** the device so the agent no longer restricts the phone.

Lock/unlock is a **control signal**. It is not a payment. Unlock happens only after the provider confirms funds (webhook + status query). Reversals/refunds can re-lock.

---

## 4. Two separate money streams (do not mix)

### Stream A — Customer loan repayments (this request)

- **Payer:** End customer  
- **Payee:** Shop owner (seller of the phone)  
- **Amounts:** Deposit (if paid digitally) and scheduled installments (principal + shop’s interest)  
- **Nature:** Commercial repayment of a credit sale between customer and shop  
- **Linda’s role:** Initiate collection, match `orderReference` to the loan, update the ledger, unlock/lock the device  
- **Settlement:** **100% of collected installment amount (minus the provider’s own transaction fee, if any) to the shop owner’s account**

Linda must **not** sit in the middle of Stream A (no aggregation into a Linda float, then later payout). That would make Linda look like a money aggregator / lender and delay shops getting paid.

### Stream B — Platform fees (separate, later or existing)

- **Payer:** Shop (not the end customer)  
- **Payee:** Linda  
- **Amounts:** Monthly SaaS (active devices, SMS, voice) and optional managed collections subscription  
- **Collection:** Invoice the shop; collect from the **shop**, not by skimming installments  

If the provider later supports **split payments**, a small platform fee *could* be deducted on Stream A. **That is not the current request.** Current request: **full installment amount to the owner.**

---

## 5. Requested collection and settlement model

### 5.1 Model name

**Marketplace / sub-merchant collections with direct settlement to the seller.**

Also described as: **pay-in on behalf of a registered sub-merchant**, or **dynamic destination account per transaction**.

### 5.2 What we need from the provider

For each digital repayment:

1. Customer is charged via **USSD push / STK** on the **registered payer MSISDN** stored on the loan (already used in Pay Now).
2. Provider sends **webhooks** and allows **status query** by `orderReference` (SUCCESS / SETTLED / FAILED / REVERSED).
3. **Settlement destination is the shop owner’s account**, identified per tenant (see below), **not** a single Linda collection account.
4. Linda receives only **payment confirmation metadata** (reference, amount, channel, status) so the loan and device state stay correct.

### 5.3 How the destination is chosen

Each shop (tenant) stores, after KYC:

- Owner legal/business name  
- Mobile-money number and/or bank account + bank name  
- Preferred channel (e.g. M-Pesa till / wallet)

When Linda calls **initiate payment**, the API must include:

- Amount (TZS)  
- **Registered payer MSISDN** (shop-entered at sale; see §8)  
- Unique `orderReference`  
- **Shop settlement identifier** (sub-merchant ID, till, or account number issued by the provider)

All repayments for that shop’s loans settle to **that** account.

### 5.4 What we are not asking for (unless you recommend it)

- Holding funds in a Linda wallet and paying shops on T+N  
- Linda acting as the single merchant of record for all shops’ loan books  
- Deducting Linda SaaS from the customer’s installment  

---

## 6. End-to-end payment flow (Stream A)

```
Customer taps Pay Now (phone or shop initiates)
        ↓
Linda creates pending payment + unique orderReference
        ↓
Linda calls provider: USSD push
   amount, registered payer MSISDN, orderReference, shop settlement ID
        ↓
Customer approves on phone (PIN)
        ↓
Provider collects from customer wallet
        ↓
Provider settles to SHOP OWNER account
        ↓
Provider webhook → Linda verifies via status API
        ↓
Linda marks payment CONFIRMED, allocates to installments
        ↓
If device was locked for arrears → UNLOCK
If last installment cleared → shop can RELEASE device
```

**Failed / cancelled:** payment stays failed; device state unchanged.  
**Reversed / refunded:** Linda marks reversed, rebuilds allocations, may re-lock.

Cash at the counter is **out of band**: staff records it in Linda; the provider is not involved.

---

## 7. Typical transaction profile

| Item | Description |
| --- | --- |
| Geography | Tanzania |
| Currency | TZS |
| Ticket size | Typical phone installment (shop-set; often tens to hundreds of thousands TZS per month) |
| Frequency | Recurring monthly per loan; extra/partial payments allowed |
| Volume | Grows with number of enrolled devices per shop and number of shops |
| Payer | Consumer (shop’s customer) |
| Payer MSISDN | Registered at sale by shop staff; USSD/STK PIN is wallet proof. Not SIM-captured. |
| Payee | Registered shop / owner (B2B sub-merchant) |
| Use of funds | Repayment of financed handset (goods already delivered) |

Linda does **not** collect donations, gambling, crypto, or unlicensed lending in its own name.

---

## 8. Risk, KYC, and compliance (how we expect to work with you)

- **Shop onboarding:** Each seller should be a **sub-merchant** under your KYC (business registration, owner ID, mobile-money/bank proof). Linda will collect and store the settlement account the shop nominates and pass your sub-merchant ID on each collection.
- **Customer identity:** At sale the shop records name, ID (national ID / voter ID / driving licence), and a **registered payer MSISDN**. That number is typed by shop staff (or later overridden when staff initiates Pay Now). It is **not** a carrier-verified capture from the SIM. Many prepaid SIMs in Tanzania do not expose MSISDN via `line1Number`; Linda does not use SIM readout to start a collection.
- **Proof of wallet control:** The customer approves the USSD/STK prompt with their mobile-money PIN. That PIN, plus your SUCCESS/SETTLED status, is the payment authentication — not SIM-extracted MSISDN.
- **Linda’s role on KYC:** Linda is the shop’s system of record for the declared number and ID. Linda is not the credit provider.
- **Credit risk:** Sits with the **shop**. Device lock is collateral-style enforcement of the shop’s contract, not a Linda loan.
- **Fraud:** Unlock only after **verified** SUCCESS/SETTLED. Webhook bodies are not trusted alone; Linda queries your API. Duplicate webhooks are ignored.
- **Chargebacks / reversals:** Provider notifies Linda; ledger and lock state are corrected.
- **AML:** High-value or unusual patterns can be flagged with you; shops remain responsible for their customer relationships.

---

## 9. Why this model (business rationale)

1. **Shop cash flow:** Owners financed the stock. They need installment money the same day, in **their** wallet, to restock and operate.
2. **Trust:** Shops will not put their loan book through a platform float they do not control.
3. **Regulatory clarity:** Linda is a **technology / device-management SaaS**, not an e-money issuer or deposit-taker for repayments.
4. **Operations:** One Linda API, many shops; your split/sub-merchant product is the correct rails.

---

## 10. Technical integration (current + required change)

**Already in production / built:**

- Initiate USSD push (`amount`, `currency: TZS`, `orderReference`, `phoneNumber` = registered payer MSISDN from the customer record)  
- Webhook + authoritative status query  
- Idempotent confirm / fail / reverse on the loan ledger  
- Device unlock on confirmed payment  

**Required from provider to complete direct-to-owner settlement:**

- Sub-merchant (or till/account) **per shop**  
- Initiate-payment field for **destination / sub-merchant ID**  
- Confirmation that **customer debit settles to that destination**, not to Linda’s master merchant account  
- Sandbox shops with two destinations so we can prove Shop A never receives Shop B’s money  

If your product uses **bill pay / till / collection account numbers** instead of API sub-merchant IDs, we can store that number per shop and pass it on initiate.

---

## 11. What we are asking you to enable

Please confirm and onboard Linda for:

1. **Consumer collections (mobile money USSD push) in TZS**  
2. **Direct settlement to each registered shop owner’s account / till**  
3. **Webhooks and query API** as documented  
4. Guidance on **sub-merchant KYC** (Linda collects vs you collect)  
5. **Transaction fees:** billed to Linda or to the sub-merchant — we prefer **fee on the shop**, not a silent cut of the customer installment without the shop’s agreement  

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
| Expected go-live for direct settlement | *[date]* |
| Estimated shops at start | *[n]* |
| Estimated monthly collection volume (TZS) | *[amount]* |

---

## 13. Short version (if they only read one page)

Linda helps phone shops sell handsets on installment and lock the device if the buyer does not pay. **The shop owns the loan.** Pay Now sends a USSD push to the **MSISDN registered at sale** (staff-entered; not SIM-captured). The customer confirms with their PIN. **Collected funds must land in the shop owner’s account.** Linda only needs a confirmed payment notification to update the loan and unlock the phone. Linda’s own revenue is a **separate SaaS invoice to the shop**, not a share of the customer’s installment (unless we later agree a transparent split).
