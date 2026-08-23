# Shop guide: from login to handing the phone to the customer

This is the **seller** workflow on the live system. Follow it in order. Do **not** give the customer the phone until the handover checklist at the end is complete.

**Console:** [https://client.linda.co.tz](https://client.linda.co.tz)  
**Who can do this:** `OWNER`, `MANAGER`, or `AGENT`

The customer is taking a **financed / credit-sale** phone (rent-to-own). The Linda agent stays on the phone as Device Owner until the loan is fully paid.

---

## What you will do

1. Sign in.
2. (Optional) Add shop staff.
3. Create the credit sale (customer + phone + loan + contract).
4. Factory-reset the phone and enroll it with the QR code.
5. Confirm the buyer app and lock control work.
6. Record the deposit if it was paid in cash.
7. Hand the phone to the customer.

---

## 1. Sign in

1. Open [https://client.linda.co.tz](https://client.linda.co.tz) on the shop computer.
2. Sign in with the email and password issued to your shop.
3. If you land on the **admin** site (`admin.linda.co.tz`), use the link to open the **seller** console instead. Collectors and platform admins use admin; shops use **client**.

Keep the browser on this shop account. Do not share Owner passwords with counter staff; create Agent accounts instead (step 2).

---

## 2. Add staff (owners / managers)

Skip this if you already have counter logins.

1. Open **Staff**.
2. Click **Add staff**.
3. Enter full name, email, password, and role:
   - **AGENT** — sales, customers, devices, payments (typical counter).
   - **MANAGER** — same plus billing and collections subscription view.
   - **OWNER** — full shop control.
4. Save. The staff member signs in at the same seller URL.

---

## 3. Prepare the physical phone

Do this **before** or **during** the sale — the phone must be empty and ready for Android setup.

1. Note the **IMEI** (dial `*#06#` or read the box). You will type it into the sale.
2. Insert the **customer’s SIM** if that is shop policy (recommended so SIM protection has a baseline).
3. Charge the phone.
4. **Factory reset** the phone (Settings → System → Reset, or recovery wipe).  
   Enrollment only works on a phone that is still on the **first Android setup screen**. Installing the Linda app from a file or Play Store is **not** enough. The customer could uninstall it.

Leave the phone on the setup wizard. Do not finish setup as a normal user.

---

## 4. Create the credit sale

1. Open **Sales**.
2. Click **New credit sale**.
3. Fill **Customer**:
   - Full name
   - Phone / mobile money number (this is used for Pay Now and reminders)
   - Person ID type: National ID, Voter ID, or Driving licence
   - ID number
   - Address (optional)
4. Fill **Device**:
   - IMEI / device ID
   - Make and model (for example Tecno Spark 20)
5. Fill **Repayment plan**:
   - Phone price (TZS)
   - Deposit (TZS)
   - Flat interest (%)
   - Term (months)
   - Start date
6. Check the preview: **Financed**, **Total repayable**, **Est. monthly**.
7. Read the consent / fair-use points with the customer (reminders before lock, restriction after grace, emergency access, no deletion of personal data, permanent release when fully paid).
8. Tick **I confirm the customer accepted these SimuLinda credit-sale terms.**
9. Click **Create sale & enrollment token**.

The system creates the customer, device, loan, installments, contract, and enrollment token. A success card appears. Next step is always **enroll the phone**.

If the same mobile number already exists, the sale **updates that customer** instead of creating a duplicate.

---

## 5. Enroll the phone (Device Owner)

The phone must still be on **factory-reset first setup**.

1. From the sale success card click **Open device QR**, or go to **Devices**, open this phone, and use the **Enrollment** card.
2. On the phone: turn on, connect **Wi-Fi**.
3. On the **first** setup screen, tap the screen **6 times** until the QR scanner opens.
4. Scan the QR on the device page.
5. Wait until Android installs the Linda agent and setup finishes. Do not skip or cancel.

**What you must see in the seller console after a few minutes:**

- Device status **ACTIVE**
- Enrollment card: **Device enrolled** (token used)
- A recent **Last check-in** time
- **No** amber warning: “Device is enrolled but not fully controlled”

If that warning appears, the app is **not** Device Owner. **Do not hand over.** Factory-reset again and scan a fresh QR (use the refresh icon on the Enrollment card if the old token was consumed or expired).

---

## 6. Check the buyer app on the phone

Open the Linda / buyer app on the enrolled phone and confirm with the customer:

- Their name
- Amount paid (deposit if already recorded)
- Amount remaining
- Next due date
- Payment history
- **Pay Now**
- Support

Explain in plain language:

- They must pay by the due date.
- Reminders may come by SMS or call.
- After the grace period the phone can be **restricted** until payment is confirmed.
- **Pay Now** uses their mobile-money number.
- After the last installment the shop **releases** the phone permanently.

---

## 7. Prove lock and unlock (shop test, before handover)

On the **device** page in the console:

1. Click **Lock**. The phone should show the lock screen (amount due and Pay Now).
2. Click **Unlock**. The phone should return to normal use.

If lock does nothing, enrollment failed. Reset and enroll again. **Do not hand over.**

Leave the phone **unlocked** for the customer unless shop policy says otherwise.

---

## 8. Record the deposit if they paid cash at the counter

The sale records the **agreed** deposit on the loan. If they paid cash/mobile money in the shop, also record it under **Payments** so paid/remaining and the buyer app stay correct.

If they will pay only through **Pay Now** on the phone, you can skip a manual payment.

---

## 9. Handover checklist — only then give the phone

Give the customer the phone **only if every box is true**:

- [ ] Sale created with correct name, ID, IMEI, price, deposit, term, and start date
- [ ] Contract / consent ticked in the sale wizard
- [ ] Phone enrolled via **QR on factory-reset setup** (not a sideloaded APK)
- [ ] Device **ACTIVE**, check-in recent, **no** management-health warning
- [ ] Buyer app shows the right customer and loan figures
- [ ] Shop lock test worked, then phone left unlocked
- [ ] Deposit recorded if it was collected in the shop
- [ ] Customer knows due dates, Pay Now, and that missed payment can restrict the phone

Then hand over the device, charger, and box. The customer must **not** factory-reset the phone or they will break enrollment; if they do, they must return to the shop for re-enrollment.

---

## After handover (not required before giving the phone)

These run in the background. You do not need them to complete handover:

- Dashboard: due today, overdue, locked devices
- **Payments**: later collections and manual receipts
- **Loans**: installment schedule
- **Collections** (owner/manager): managed follow-up subscription (calling is done by platform collectors on the admin console, not by the shop queue)
- Missed payments: reminders, then lock after grace
- Confirmed payment: unlock
- Final payment: use **release** from operations so the agent no longer restricts the phone

---

## Do not

- Do not give out a phone that only has the APK installed as a normal app.
- Do not finish Android setup as a personal Google account **before** scanning the QR.
- Do not ignore the yellow “not fully controlled” banner.
- Do not use a customer’s production phone to “try” enrollment. Use a shop test unit first, then this same process for the real sale.

---

## If something goes wrong

| Problem | What to do |
| --- | --- |
| Cannot sign in | Confirm you are on **client.linda.co.tz**, not admin. Ask the owner to reset staff password. |
| Sale will not create | Check IMEI uniqueness, required fields, and consent tick. |
| QR expired or already used | On the device page, regenerate the enrollment token, factory-reset again, scan the new QR. |
| Phone says **Something went wrong** after scanning / while installing | Factory-reset again. On the **very first** welcome screen, connect **Wi-Fi**, then tap **6 times** (do not finish Google/HiOS setup). Scan **this sale’s** QR, not a screenshot of an old one. If it still fails, the shop must publish a new agent APK (Android 10+ needs the setup activities); then regenerate the QR and retry. |
| Phone never shows ACTIVE | Wi-Fi, wait for check-in, confirm you scanned this device’s QR not another sale’s. |
| Lock does nothing | Not Device Owner. Factory-reset and QR enroll again. |
| Buyer app empty | Wait for check-in; confirm the sale linked this IMEI to the customer. |
