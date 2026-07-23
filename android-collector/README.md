# Device Lock Collector (Phase 2b companion)

Separate **staff** Android app for collectors. It is **not** the customer DPC agent (`android-dpc`).

## Purpose

1. Sign in as `COLLECTOR` / `COLLECTIONS_ADMIN` / platform staff.
2. See **My queue** (cases assigned in the web console).
3. **Start** Call / SMS / WhatsApp from the system (creates a `ContactSession`).
4. After the contact, **Verify from phone logs** using:
   - `READ_CALL_LOG` for outgoing calls
   - `READ_SMS` for sent SMS  
   Match is uploaded to `POST /v1/collections/contact-sessions/:id/proof` → `DEVICE_LOG_MATCHED`.
5. WhatsApp stays deep-link only (personal WA cannot be proven via logs; use Business API later).

## Build

```bash
cd android-collector
./gradlew :app:assembleDebug
```

APK: `app/build/outputs/apk/debug/app-debug.apk`

### API URL

Both **debug and release** point at production (same as the DPC agent):

```text
https://api.linda.co.tz/v1
```

Configured in `app/build.gradle.kts` (`API_BASE_URL`). Change there only if the production host moves.

## Install

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Grant Call log + SMS permissions when prompted (required for verification).

## Test users (after seed)

| Email | Password |
|-------|----------|
| `collector@devicelock.test` | `Collector@2026` |

Assign cases to the collector from the web **Collections** page first.

## Privacy

- Only logs matching a **system-started** session window and customer number are used.
- Full call/SMS history is never uploaded.
- Intended for company handsets or collectors who consent to log access.

## Related

- Plan: `docs/COLLECTIONS_CALL_CENTRE_PLAN.md` §3A + Phase 2b  
- Backend proof API: `POST /collections/contact-sessions/:id/proof`
