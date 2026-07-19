# Production Operations Runbook

## Deployment Checklist

- Set `NODE_ENV=production`.
- Set strong `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` values.
- Set `DATABASE_URL` to the production PostgreSQL database.
- Run database migrations with `npx prisma migrate deploy` before starting the API.
- Run `npx prisma generate` during build/release packaging.
- Configure `PUBLIC_BASE_URL`, `PROVISIONING_APK_URL`, and `PROVISIONING_SIGNATURE_CHECKSUM` for QR/device-owner enrollment.
- Configure ClickPesa credentials for real mobile-money payment initiation and webhook verification.
- Configure Beem SMS credentials for customer reminders and SMS command fallback.
- Configure `VOICE_CALL_URL` and `VOICE_API_KEY` for real IVR calls.
- Configure `CALL_PROVIDER_URL` and `CALL_PROVIDER_API_KEY` for provider-verified staff/customer bridge calls.
- Configure `FCM_SERVICE_ACCOUNT_JSON` for instant command wakeups.

## Health And Monitoring

- `GET /v1/health` verifies API process and database connectivity.
- `GET /v1/health/readiness` reports required and optional production integration readiness without exposing secrets.
- Alert if database readiness fails.
- Alert if command failure events, management health warnings, SIM changes, or overdue locked devices spike.
- Review `DeviceEvent` audit timeline for operational incidents.

## Backups And Recovery

- Take automated PostgreSQL backups at least daily.
- Retain point-in-time recovery logs where supported.
- Test restore into a non-production database before every major release.
- Do not restore production data into developer machines unless it is anonymized.

## Security Review

- Ensure dashboard/API are served only over HTTPS.
- Rotate JWT secrets, ClickPesa keys, Beem keys, voice keys, and Firebase credentials on staff departure or suspected exposure.
- Confirm Android release APK signature checksum matches `PROVISIONING_SIGNATURE_CHECKSUM`.
- Confirm enrolled phones report `MANAGEMENT_HEALTH_OK` before customer handover.
- Review tenant isolation and RLS migrations after schema changes.

## Incident Playbooks

- Payment webhook outage: payments remain pending; staff can record verified manual payments from dashboard.
- Push outage: devices still poll by WorkManager; SMS command fallback can deliver signed lock/unlock/release commands.
- SMS provider outage: reminders are logged/stubbed; collection staff should use call-centre queue.
- Device not truly managed: dashboard shows management health warning; re-enroll by QR/factory setup before handover.
- SIM swap alert: review with customer, approve legitimate replacement, or keep policy lock active.

## Release Verification

- Backend: `npm run build`.
- Dashboard: `npm run build`.
- Android: `./gradlew :app:assembleDebug` or release variant.
- Database: `npx prisma migrate deploy`.
- Smoke test: login, create sale, enroll/check in, view buyer app, record/confirm payment, and verify unlock command path.
