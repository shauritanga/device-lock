# First Device Test Checklist

Use this when testing the first real financed phone after factory reset.

## 1. Start The System

- Start the backend.
- Start the dashboard.
- Make sure database migrations are applied:

```bash
npx prisma migrate deploy
```

- Log in to the dashboard with an owner, manager, or agent account.

## 2. Create The First Sale

In the dashboard:

1. Open `Sales`.
2. Click `Add new sale`.
3. Enter customer details.
4. Enter device details.
5. Enter loan details:
   - Device price.
   - Down payment.
   - Term months.
   - Interest rate.
6. Tick the contract/consent checkbox.
7. Create the sale.

This should create:

- Customer.
- Device.
- Loan and installments.
- Contract record.
- Enrollment token/QR for the device.

## 3. Enroll The Formatted Phone

The phone must be factory reset/formatted before Device Owner enrollment.

On the phone:

1. Turn on the phone after factory reset.
2. Connect to Wi-Fi.
3. On the first Android setup screen, tap the screen 6 times to open the QR provisioning scanner.
4. In the dashboard, open the device detail page for the sale.
5. Scan the enrollment QR code.
6. Wait for Android to install/provision the agent app.
7. Let setup finish.

Expected result:

- The app becomes Device Owner.
- The phone enrolls with the backend.
- Dashboard device status becomes `ACTIVE`.
- Device detail should not show management health warning after check-in.

## 4. Check Buyer App

On the phone, open the app and confirm the buyer can see:

- Customer profile.
- Paid amount.
- Remaining amount.
- Next due date.
- Payment history.
- `Pay Now`.
- Support page.

## 5. Test Payment

If ClickPesa is configured:

1. Tap `Pay Now` on the phone.
2. Confirm the mobile-money request.
3. Wait for payment confirmation/webhook.

If ClickPesa is not configured:

1. Open dashboard.
2. Go to `Payments`.
3. Record a manual payment for the loan.

Expected result:

- Paid amount increases.
- Remaining amount decreases.
- Installment status updates.
- If the phone was locked, a confirmed payment should unlock it.

## 6. Test Lock And Unlock

From dashboard device detail:

1. Click `Lock`.
2. Confirm the phone enters the lock screen.
3. Click `Unlock`.
4. Confirm the phone returns to normal use.

If lock/unlock does not work, the phone is probably not truly Device Owner.

## 7. Test Call-Centre Assignment

After an installment becomes overdue:

1. Open `Call Centre`.
2. Select an overdue customer.
3. Use `Assign follow-up` to assign the customer to a staff member.
4. Staff starts the call from the system using `Start verified call`.
5. Staff completes the call note.

If a call provider is configured, provider callbacks can verify the call. Otherwise the attempt is marked `SELF_REPORTED`.

## Important Notes

- Installing the APK normally is not enough for production control.
- The phone must be enrolled during Android setup as Device Owner.
- Since the phone is formatted, use QR/factory provisioning.
- Restart the backend after recent route/schema changes before testing.
- Use dashboard device detail to confirm the phone is healthy and managed.
