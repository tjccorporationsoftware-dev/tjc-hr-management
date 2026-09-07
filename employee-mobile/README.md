# Employee Mobile

Expo/React Native application for employees. This project is the mobile client for the existing NestJS backend and must not duplicate backend business rules.

## Technology baseline

- Expo SDK 57
- React Native 0.86
- Expo Router
- TypeScript strict mode
- Expo Development Client
- npm package manager

## Install dependencies

```bash
npm install
```

## Environment

Copy the example file:

```bash
cp .env.example .env
```

Set `EXPO_PUBLIC_API_BASE_URL` to the existing backend API URL.

In **development only**, a `localhost`/`127.0.0.1` host is rewritten at runtime so the app
can actually reach the backend from another device (`src/config/dev-host.ts`):

- Android emulator → `10.0.2.2` (the emulator's alias for the host machine)
- Physical device → the LAN IP Metro already reports through `hostUri`

The value is left untouched when it is not a loopback host, when the LAN IP is unknown, and
in every non-development environment — a production build always calls exactly what was configured.

Do not commit `.env` or production secrets.

## Run

The project depends on `expo-dev-client`, so plain `npm start` waits for a **development build**
— an APK/IPA of this app that does not exist until someone builds it. Scanning that QR code
with Expo Go will not open anything.

**Fastest way to see the app today** — Expo Go, no native build required:

```bash
npm run start:go        # then scan the QR with Expo Go on a device on the same Wi-Fi
npm run start:tunnel    # same, but for a device on a different network
```

Everything in Phase 0–2 runs in Expo Go: secure store, SQLite, biometrics, and the router are
all bundled into Expo Go itself. Push notifications (Phase 4) are the first feature that will
require a real build.

**Development build** — needed once native modules outside Expo Go are added:

```bash
eas build --profile development --platform android   # cloud build, no local SDK needed
npm run start:dev-client                             # then open the installed app
```

Or build locally when the Android/iOS toolchain is installed (this generates `android/`/`ios/`):

```bash
npm run android
npm run ios
```

## Quality checks

```bash
npm run validate   # typecheck + lint + tests (same gates as CI)
npm run typecheck
npm run lint
npm test
npm run doctor
```

## Architecture rule

The application is a client of the existing backend. Attendance, leave, overtime, approvals, payroll, permissions, and audit behavior remain authoritative in the backend. The mobile application only presents data, collects user input, and calls approved APIs.

## Backend contract

The app talks only to `/api/mobile/v1/*`, served by `MobileModule` inside the existing backend — there is no separate mobile backend.

- Endpoint → existing-service mapping: `backend/docs/mobile/API_MAPPING_MATRIX.md`
- Request/response schemas: `backend/docs/mobile/openapi.yaml`

Every authenticated request sends `X-Request-Id`, `X-App-Version`, `X-App-Build`, `X-Platform`, `X-OS-Version` and `X-Installation-Id`. These are metadata only — the backend always derives identity from the access token.

## Session handling

- Refresh token lives in `expo-secure-store` only, never in AsyncStorage and never in logs.
- Access token stays in memory (Zustand) and is dropped when the app is killed.
- The session is bound to `installationId`; a refresh from a different install is rejected.
- Concurrent 401s share one refresh through `tokenRefreshManager` (rotation makes parallel refreshes unsafe).
- On launch the app performs a real refresh rather than trusting a stored token, so a session revoked from another device logs out immediately.

Two-factor authentication is disabled for the mobile channel by default (BE-MOB-002): the system has no OTP delivery yet, so enforcing it would lock affected users out permanently. The login screen still handles the challenge flow, because the backend can re-enable it with `MOBILE_TWO_FACTOR_ENABLED=true` without a new app release.

## Phase 3 backend endpoints

Phase 3 required new mobile controllers, all pure pass-throughs over existing services:

| Route | Wraps |
|---|---|
| `GET /mobile/v1/attendance/history?month=YYYY-MM` | `AttendanceService.findMyDailySummaries` |
| `GET /mobile/v1/requests` (+ `/{slug}`, `/{slug}/:id`, `/{slug}/:id/cancel`) | leave / overtime / time-adjust / offsite services |
| `GET /mobile/v1/requests/leave/catalog` | `LeaveBalancesService.findMy` |
| `GET /mobile/v1/payroll/slips` (+ `/:id`, `/:id/pdf`) | `EssSalarySlipService` |
| `GET /mobile/v1/payroll/tax-certificate` | `EssSalarySlipService.getMyWithholdingCertificate` |
| `GET /mobile/v1/notifications` (+ read / read-all) | `NotificationsService` |
| `POST /mobile/v1/requests/{leave\|overtime\|time-adjust}/:id/attachments` | the three attachment services |

Attachment routes call `findMyOne` before touching the attachment service. The service resolves
the request by **tenant scope**, which is company-wide — calling it directly would let any
employee attach a file to a colleague's leave request. Offsite has no attachment route because
that module stores evidence as an `attachmentUrl` supplied at create time.

`LeaveAttachmentService.uploadAttachment` existed with all its storage helpers but no route
anywhere called it, so leave attachments could not be uploaded from the web either. The mobile
route is currently the only way to upload one.

## Offline punching is deliberately not supported

`src/features/attendance/punch-queue.ts` retries a punch that failed to reach the server, but
only for 10 minutes. Anything older is dropped and the user is told to file a time-adjust
request instead.

The reason is that `MobileAttendanceService` intentionally does not send `punchedAt`, so the
recorded time is the moment the **server** receives the punch. A punch queued at 08:00 and
synced at 12:00 would be recorded as 12:00 — worse than no queue at all, because the employee
already believes they clocked in on time.

Accepting a device-supplied time cannot be made safe by technical means: set the clock back,
enable airplane mode, punch, set the clock forward, then sync — the drift measured at sync is
zero and nothing looks wrong. The only real control is human review, which the existing
time-adjust approval chain already provides. `offlinePunch` therefore stays `false`.

`MobileRequestsOrchestrator` strips `employeeId` from every create payload. The underlying
DTOs accept it so HR can file on someone's behalf; leaving it open would let any employee
with self-service rights file a leave request for a colleague.

## What is implemented (Phase 0–2)

Working: launch gate, login, 2FA verification, session restore, forced password change, forced-update
screen, device registration, logout, theme, local SQLite migrations, error boundary and crash reporting.

Phase 2 added the design system in `src/design/` and role-based tabs. Screens must not import colours
directly — go through `useAppTheme()` or a design component, otherwise dark mode silently breaks.
Tab visibility is derived from the backend's `featureFlags`, never from a role name, because
permissions are edited per person (`src/features/bootstrap/use-role-tabs.ts`).

Not yet built (later phases): punch flow and geofence, request forms, payslips (Phase 3),
push notifications and supervisor approvals (Phase 4), executive overview and offline queue (Phase 5).
The `approvals` and `overview` tabs exist but show an explicit "not enabled yet" state rather than
placeholder data.

## Monitoring

`src/lib/monitoring/monitoring.ts` is the single funnel for crash/error events. It redacts token-, password-, OTP-, salary- and bank-shaped keys before anything leaves the device.

`telemetry-transport.ts` ships `warning` and `error` events to `POST /api/mobile/v1/telemetry`, where they join the backend's own logs and can be correlated through `requestId`. Sentry is deliberately not used — it would add a native module and require a DSN plus source-map upload in CI. Swap in Sentry later by calling `setMonitoringTransport()` with a different implementation; nothing else changes.

Batching rules: events queue in memory (max 50, oldest dropped first), flush in batches of 20 or after 5 seconds, and are held until the user is authenticated. Failures of the telemetry request itself are never re-queued, otherwise a broken network would loop forever.

## Builds (EAS)

`eas.json` defines four profiles per blueprint §23.2:

| Profile | Distribution | Channel | Android artifact |
|---|---|---|---|
| `development` | internal | development | APK, dev client |
| `preview` | internal | preview | APK |
| `staging` | internal | staging | AAB |
| `production` | store | production | AAB, auto-incremented |

```bash
npm install -g eas-cli
eas login
eas init
eas build --profile development --platform android
```

`appVersionSource` is `remote`, so EAS owns the build number — `app.config.ts` deliberately does not declare `buildNumber` or `versionCode`.

`EXPO_PUBLIC_API_BASE_URL` is not committed to `eas.json`. Set it per profile as an EAS environment variable so a staging build can never point at production:

```bash
eas env:create --name EXPO_PUBLIC_API_BASE_URL --value https://api.example.com/api --environment production
```
