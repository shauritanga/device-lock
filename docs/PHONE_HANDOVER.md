# Shop guide: from a new customer to handing over the phone

This is the **seller** workflow on the live system. Follow it in order. Do **not** give the customer
the phone until the handover checklist at the end is complete.

**Console:** [https://client.linda.co.tz](https://client.linda.co.tz)
**Who can do what:** `OWNER`, `MANAGER` and `AGENT` all work here. Agents sell and register
customers, but only owners and managers can record money as received.

The customer takes a phone on credit (or, for a microfinance lender, gives their own phone as
collateral). The Linda agent stays on the phone as Device Owner until the loan is repaid.

New company? Start with [CLIENT_ONBOARDING.md](CLIENT_ONBOARDING.md).

---

## What you will do

1. Sign in.
2. Register the phones in stock (once, ahead of time).
3. Register the customer and **verify their identity** on your phone.
4. Create the sale.
5. Factory-reset the phone and enrol it with the QR code.
6. Check the buyer app and the lock.
7. Deposit.
8. Hand over the phone.

---

## 1. Sign in

1. Open [https://client.linda.co.tz](https://client.linda.co.tz) on the shop computer.
2. Sign in with the email and password issued to your shop.
3. If you land on the **admin** site, use the link to open the **seller** console instead.

Do not share the Owner password. Create staff and agent logins instead (**Staff**, **Agents**).

---

## 2. Register the phones in stock (ahead of time)

You register phones **before** a customer arrives, so the counter only has to pick one.

1. Open **Devices**, then the **Registered** tab.
2. Click **Register phones**.
3. Paste the **IMEIs**, one per line (dial `*#06#` or read the box). Add make and model.
4. Optionally choose a **sales agent** to hold them. Agents can only sell phones allocated to them.
5. Save.

Your package limits how many phones you can register. A mistaken entry can be removed with the
trash icon while it is unsold.

---

## 3. Register the customer and verify their identity

Customers are registered on the **Customers** page, not in the sale.

1. Open **Customers**, click **Register customer**.
2. Enter the phone / mobile-money number, full name **as on the ID**, ID type and number, and address.
   A National ID (NIDA) number is 20 digits and is formatted as you type.
   *Microfinance lenders:* also tick that the customer agreed to a factory reset of their own phone
   and has backed up their data.
3. Click **Save and verify**. The screen shows a **QR code**.
4. On **your phone**, scan the QR code with the camera and follow the steps. No login is needed.
   - **Front of the ID.** Photograph it with the camera (no uploads).
   - **Back of the ID.**
   - **Live check.** The customer looks at the camera and blinks once. The face is matched to the ID.
5. The computer shows the result when your phone finishes: **Verified**, **Needs review**, or **Failed**.
   - **Needs review:** a manager looks at the photos on the customer's page and approves or rejects it.
   - **Failed:** read the failed check on the customer's page (for example, the ID number is already
     used by another customer) and fix the cause.
6. Add **one guardian** (a person who vouches for the customer). You can add up to three.

The verification link works once and expires after 15 minutes. If it expires, start verification
again.

A customer can buy on credit only when they are **verified** and have **at least one guardian**.

---

## 4. Create the sale

1. Open **Sales**, click **New sale**.
2. Choose the **Customer** (the list shows only customers who are ready) and the **Phone** from stock.
3. Enter the **phone price**, **deposit**, **flat interest** and the **repayment plan**: daily, weekly
   or monthly, the number of periods, and the start date.
4. Check the figures: **Financed**, **Total repayable**, **Each month**, and the payment list.
5. Read the terms with the customer and tick the confirmation.
6. Click **Create sale**.

**The deposit.** A phone sold with a deposit **stays locked until the deposit is paid**. After that it
follows the instalment schedule. If the customer paid the deposit in **cash just now**, tick "The
customer paid the deposit in cash just now" (owners and managers only). Otherwise the customer pays
the deposit by mobile money, or an owner or manager records the cash under **Payments**.

---

## 5. Enrol the phone (Device Owner)

The phone must be on the **first Android setup screen** after a factory reset. Installing the app from
a file or the Play Store is **not** enough, because the customer could remove it.

1. Note the IMEI, insert the customer's SIM if that is shop policy, charge the phone.
2. **Factory-reset** the phone (Settings, System, Reset). Leave it on the setup wizard.
3. In the console open **Devices**, **Sold**, then this phone. The **Enrollment** card shows the QR.
4. On the phone: connect to **Wi-Fi**, then tap the first setup screen **6 times** until the QR scanner
   opens, and scan the QR.
5. Wait until Android installs the Linda agent and setup finishes. Do not skip or cancel.

**What you must see in the console after a few minutes:**
- Device status **Active** (or **Locked** if the deposit is unpaid, which is correct),
- Enrollment shows **Device enrolled**,
- A recent last contact time, and **no** amber warning "Device is enrolled but not fully controlled".

If that warning appears, the app is **not** Device Owner. **Do not hand over.** Factory-reset and scan
a fresh QR (use the refresh icon on the Enrollment card).

---

## 6. Check the buyer app and the lock

Open the buyer app on the phone and confirm with the customer: their name, the amount paid and
remaining, the next due date (the deposit shows as **Deposit**), **Pay Now**, and support. On the
payment screen the customer can choose **Pay with a different number** if another mobile-money
wallet will pay.

Explain in plain language:
- They must pay by the due date. Reminders may come by SMS or call.
- After the grace period the phone can be **restricted** until payment is confirmed.
- After the last instalment the phone is released to them (or stays enrolled for their next loan, if
  that is your lender's policy).

**Test it before handover.** If there is a deposit, the phone should already be locked. Pay the
deposit and confirm it unlocks. You cannot unlock a phone by hand while a payment is overdue: pay it
or record the payment, and it unlocks by itself.

---

## 7. Record the deposit if it was paid in the shop

If the customer paid cash and you did not tick the box in the sale, an **owner or manager** records it
under **Payments**, **Record cash**. Agents cannot record money as received. The phone then unlocks
automatically.

---

## 8. Handover checklist: only then give the phone

Give the customer the phone **only if every box is true**:

- [ ] Customer verified, guardian added
- [ ] Sale created with the right customer, IMEI, price, deposit, plan and start date
- [ ] Terms ticked in the sale
- [ ] Phone enrolled by **QR on factory-reset setup** (not a sideloaded app)
- [ ] Device enrolled, recent contact, **no** "not fully controlled" warning
- [ ] Buyer app shows the right customer and figures
- [ ] Deposit paid or recorded, phone unlocked
- [ ] Customer knows the due dates, Pay Now, and that a missed payment can restrict the phone

Then hand over the phone, charger and box. The customer must **not** factory-reset the phone: they
would have to return to the shop for re-enrolment.

---

## After handover

These run on their own:
- **Dashboard:** due today, overdue, locked phones.
- **Reminders and locks:** reminders before the due date, a lock after the grace period, an unlock as
  soon as payment is confirmed.
- **Collections:** enrolled phones go to the call centre automatically (if your package includes it).
  Collectors work cases once a payment is overdue.
- **Final payment:** the phone is released to the customer automatically. For lenders that keep
  phones enrolled, it stays enrolled and unrestricted, ready for the next loan, and is released
  after the retention period if there is none.

---

## Do not

- Do not give out a phone that only has the app installed as a normal app.
- Do not finish Android setup with a personal Google account **before** scanning the QR.
- Do not ignore the amber "not fully controlled" banner.
- Do not use a customer's real phone to try enrolment. Use a shop test phone first.

---

## If something goes wrong

| Problem | What to do |
| --- | --- |
| Cannot sign in | Confirm you are on **client.linda.co.tz**, not admin. Ask the owner to reset the staff password. |
| Customer missing from the sale list | They are not verified, have no guardian yet, or (microfinance) have no recorded factory-reset agreement. The list says what is missing. |
| Verification link expired | It works once for 15 minutes. Start verification again. |
| Live check keeps failing | Face the camera in good light, hold the phone at eye level and blink slowly. The customer's page shows what the camera saw. A manager can approve after reviewing the photos. |
| Cannot register more phones | The package phone allowance is full. Contact Linda. |
| QR expired or already used | On the device page, regenerate the enrolment token, factory-reset again, scan the new QR. |
| Phone says **Something went wrong** after scanning | On a **Pixel** or any phone with Google Play Protect, this QR cannot make Linda Device Owner. Use a Tecno, Infinix, Itel or similar. On those: factory-reset, Wi-Fi, 6 taps, scan a fresh QR. |
| Phone never shows active | Check Wi-Fi, wait for the first contact, and confirm you scanned this phone's QR, not another sale's. |
| Phone locked and the customer already paid | The phone needs internet to hear about it. Ask them to switch on data or Wi-Fi. If the payment is not recorded yet, an owner or manager records it. |
| Lock does nothing | Not Device Owner. Factory-reset and enrol again. |
| Buyer app empty | Wait for the first contact and confirm the sale linked this IMEI to the customer. |
| An agent cannot mark a payment paid | By design. An owner or manager records it. |
