# Mobile API Mapping Matrix — `/api/mobile/v1`

เอกสารบังคับตาม ADR-001 และบทที่ 12.6 ของ Blueprint
**Pull Request ที่เพิ่ม/แก้ Mobile endpoint จะ merge ไม่ได้ ถ้าไม่มีแถวในตารางนี้**

## กติกาที่ตารางนี้บังคับ

1. ทุก endpoint ต้องระบุว่า reuse Service เดิมตัวไหน
2. ช่อง `New business rule` ต้องเป็น `NONE` เสมอ — ถ้าไม่ใช่ ต้องมี ADR ใหม่ก่อน
3. `Mobile-only concern` ระบุได้เฉพาะเรื่อง transport: DTO shape, mapper, header, idempotency, device
4. ต้องระบุ Web regression test ที่ครอบเส้นทางเดิมของ Service ตัวนั้น

## ประเภท Endpoint

| ประเภท | ความหมาย |
|---|---|
| `ADAPTER` | เปลี่ยนช่องทางรับ/ส่งให้เหมาะกับ Native App แล้วเรียก Service เดิม |
| `ORCHESTRATOR` | รวมผลจากหลาย Service เดิมให้จบใน request เดียว |
| `PASSTHROUGH` | ตรวจ DTO/สิทธิ์ แล้วส่งต่อ Service เดิมตรง ๆ |
| `MOBILE_OWNED` | ข้อมูลที่เป็นของ Mobile จริง ๆ และเว็บไม่มี |

---

## Auth — BE-MOB-001

| Mobile endpoint | ประเภท | Existing service | New business rule | Mobile-only concern | Web regression |
|---|---|---|---|---|---|
| `POST /api/mobile/v1/auth/login` | `ADAPTER` | `AuthService.login()` | `NONE` | refresh token ออกทาง response body แทน HttpOnly cookie, ผูก session กับ installationId, อัปเดตทะเบียนเครื่อง | `auth.service.session-metadata.spec.ts` — เว็บที่ไม่ส่งข้อมูลเครื่องต้องได้ `sessionType = WEB` และ `installationId = null` |
| `POST /api/mobile/v1/auth/2fa/verify` | `ADAPTER` | `AuthService.verifyTwoFactor()` | `NONE` | เหมือน login + กันคืน `debugTwoFactorCode` บน production | เดียวกับด้านบน |
| `POST /api/mobile/v1/auth/refresh` | `ADAPTER` | `AuthService.refresh()` | `NONE` | รับ refresh token จาก body, ตรวจว่า session ผูกกับเครื่องนี้ (`expectedInstallationId`) | `auth.service.session-metadata.spec.ts` — refresh ของเว็บ (ไม่ส่ง `expectedInstallationId`) ต้องไม่ถูกตรวจ device binding |
| `POST /api/mobile/v1/auth/logout` | `ADAPTER` | `AuthService.logout()` | `NONE` | เลิกผูก Expo push token ของเครื่องนั้นด้วย | เดียวกับด้านบน |

### BE-MOB-002 — นโยบาย 2FA แยกตามช่องทาง (ตัดสินใจแล้ว)

ระบบยังไม่มีช่องทางส่ง OTP จริง (ไม่มี nodemailer/SendGrid/Twilio ในโปรเจกต์)
พนักงานที่เข้าเงื่อนไขบังคับ 2FA จึงล็อกอินผ่านแอปไม่ได้ถาวรเพราะไม่มีทางรู้รหัส

**ทางที่เลือก:** ปิดการบังคับ 2FA เฉพาะช่องทาง `MOBILE` ไว้ก่อน

| เรื่อง | รายละเอียด |
|---|---|
| ตัดสินใจที่ไหน | `AuthService.canDeliverTwoFactorCode()` — อยู่ใน Domain Service ไม่ใช่ adapter ตาม ADR-001 |
| เงื่อนไข | `context.device.sessionType === 'MOBILE'` เท่านั้น เว็บไม่กระทบ |
| เปิดคืน | ตั้ง `MOBILE_TWO_FACTOR_ENABLED=true` — ไม่ต้องแก้โค้ด |
| ร่องรอย | ทุกครั้งที่ข้าม เขียน Audit Log `LOGIN` พร้อม `metadata.twoFactorSuppressed = true` และ `installationId` |
| เทสที่คุ้ม | `auth.service.two-factor-channel.spec.ts` |

> **ข้อแลกที่รับไว้:** ผู้ใช้ที่เปิด 2FA ด้วยตัวเอง (`user.twoFactorEnabled = true`)
> ก็ถูกข้ามด้วยบนช่องทางมือถือ เพราะไม่มีทางส่งรหัสให้เขาเช่นกัน
> เมื่อทำ delivery จริงแล้ว ให้เปิด flag คืนทันที

นอกจากนี้ adapter ยังกัน "ไม่คืนรหัส debug บน production" ไว้เหมือนเดิม

---

## Bootstrap / Today — BE-MOB-003

| Mobile endpoint | ประเภท | Existing service | New business rule | Mobile-only concern | Web regression |
|---|---|---|---|---|---|
| `GET /api/mobile/v1/bootstrap` | `ORCHESTRATOR` | `EssService.getMe()`, `EssService.getDashboard()`, `AttendanceService.findMyToday()`, `NotificationsService.getSummary()`, `SystemSettingsService.getSystemSettings()` | `NONE` | รวม payload, feature flag resolution, compatibility, timeout ของส่วนที่ไม่ critical | ESS/Attendance/Notifications spec เดิมทั้งชุด (ไม่มีการแก้ service เหล่านี้) |
| `GET /api/mobile/v1/today` | `ORCHESTRATOR` | `EssService.getMe()`, `AttendanceService.findMyToday()` | `NONE` | map เป็น `heroState` + `quickActions` | เดียวกับด้านบน |

**การกำหนดสิทธิ์:** ทั้งสอง endpoint ใช้ `@Auth('ESS_ACCESS')` โดยตั้งใจ **ไม่** ใส่ `MobileClientGuard`
เพราะแอปเวอร์ชันต่ำกว่าขั้นต่ำต้องยังอ่าน `compatibility` มาแสดงหน้าบังคับอัปเดตได้

**ข้อมูลที่ยังไม่ตอบ (จงใจ ไม่ใช่ลืม):**

| Field ใน Blueprint | สถานะ | เหตุผล |
|---|---|---|
| `summary.overtimeHoursThisMonth` | ยังไม่ตอบ | ต้องรวมชั่วโมง OT ซึ่งเป็นการคำนวณธุรกิจ ยังไม่มี Domain Service ที่ให้ตัวเลขนี้ — ถ้า MobileModule คำนวณเองจะผิด ADR-001 |
| `summary.pendingActions` | ตอบ `0` | ต้นทางจริงคือหน้า attendance issues (Phase 3) ยังไม่ทำ จึงไม่ตอบตัวเลขที่เดาเอา |
| `today.shift` | ยังไม่ตอบแยก | ข้อมูลกะอยู่ใน `punch-context` แล้ว จะรวมเข้ามาตอน Phase 2 |

---

## Attendance — BE-MOB-005

| Mobile endpoint | ประเภท | Existing service | New business rule | Mobile-only concern | Web regression |
|---|---|---|---|---|---|
| `GET /api/mobile/v1/attendance/punch-context` | `PASSTHROUGH` | `AttendanceService.getPunchContext()` | `NONE` | ปั้น payload ให้เล็กลงและตั้งชื่อ field ตาม contract ของแอป | `attendance.service.workflow.spec.ts`, `attendance.locked-period-guard.spec.ts` |
| `POST /api/mobile/v1/attendance/punch` | `PASSTHROUGH` + ซอง Idempotency | `AttendanceService.punch()` | `NONE` | `Idempotency-Key`, source = `MOBILE_APP`, ไม่ส่งเวลาจากเครื่อง | เดียวกับด้านบน + `mobile-attendance.service.spec.ts` |

**เจตนาที่ต้องรักษาไว้:**

- **ไม่ส่ง `punchedAt` จาก client** — เวลาที่บันทึกมาจาก server เท่านั้น
  ถ้าส่ง เวลาจากเครื่องที่ถูกปรับจะกลายเป็นเวลาลงงานจริงทันที
- **geofence/นโยบาย/กันซ้ำ** ยังตัดสินโดย `AttendanceService` ทั้งหมด
  MobileModule ไม่คำนวณระยะทางหรือสถานะสายเอง
- **`Idempotency-Key` บังคับ** — ถ้าไม่ส่งมาจะ 400 ทันที ไม่ปล่อยผ่าน

**ความต่างจาก Blueprint บทที่ 14.5 (ตั้งใจ + เหตุผล):**

| Blueprint | ของจริง | เหตุผล |
|---|---|---|
| `action: "CHECK_IN" \| "CHECK_OUT"` | `punchType: MORNING_IN \| AFTERNOON_IN \| CHECK_OUT \| OFFSITE_IN \| OFFSITE_OUT \| CUSTOM` | นโยบายจริงมีรอบเช้า/บ่ายแยกกัน การยุบเหลือ 2 ค่าแล้วให้ adapter เดาว่ารอบไหน = ตัดสินใจเชิงธุรกิจใน adapter ซึ่ง ADR-001 ห้าม (ส่ง `punchType` ว่างได้ แล้ว server จะเลือกรอบตามเวลาให้เอง) |
| `photoUploadId` | ยังไม่รับ | flow อัปโหลดรูป (บทที่ 16.5) เป็นงาน Phase 3/5 — รับ field แล้วเงียบ ๆ ไม่ใช้ จะหลอกฝั่งแอปว่าทำงานแล้ว |
| `location.isMockedSignal` | รับแล้ว แต่ยังไม่บันทึก | `AttendanceLog` ยังไม่มีคอลัมน์เก็บ risk signal — จะเพิ่มพร้อม field audit ของ offline punch (บทที่ 13.8) ใน Phase 6 |

---

## Devices — BE-MOB-004

| Mobile endpoint | ประเภท | Existing service | New business rule | Mobile-only concern | Web regression |
|---|---|---|---|---|---|
| `POST /api/mobile/v1/devices/register` | `MOBILE_OWNED` | — (`AuthService` สำหรับ revoke session) | `NONE` | ทะเบียนเครื่อง + Expo push token | ไม่กระทบเว็บ (ตารางใหม่ล้วน) |
| `PATCH /api/mobile/v1/devices/current` | `MOBILE_OWNED` | — | `NONE` | อัปเดต push token/permission/locale | เดียวกับด้านบน |
| `GET /api/mobile/v1/devices` | `MOBILE_OWNED` | — | `NONE` | รายการเครื่องของตัวเอง | เดียวกับด้านบน |
| `DELETE /api/mobile/v1/devices/:deviceId` | `MOBILE_OWNED` | `AuthService.revokeSessionsByInstallationId()` | `NONE` | ถอนสิทธิ์เครื่อง + ยกเลิก session ของเครื่องนั้น | `auth.service.session-metadata.spec.ts` |
| `POST /api/mobile/v1/devices/revoke-others` | `MOBILE_OWNED` | `AuthService.revokeSessionsByInstallationId()` | `NONE` | ถอนสิทธิ์เครื่องอื่นทั้งหมด | เดียวกับด้านบน |

---

## Telemetry — MOB-005

| Mobile endpoint | ประเภท | Existing service | New business rule | Mobile-only concern | Web regression |
|---|---|---|---|---|---|
| `POST /api/mobile/v1/telemetry` | `MOBILE_OWNED` | — | `NONE` | รับ crash/error จากแอปแล้วออกทาง Logger เดิม | ไม่กระทบเว็บ (endpoint ใหม่ล้วน) |

แอปไม่ได้ต่อ Sentry (ไม่มี DSN และไม่อยากเพิ่ม native module ที่บังคับให้ build ใหม่)
จึงส่งเหตุการณ์กลับมาที่ backend ให้ไปรวมกับ log ของ server ตามบทที่ 21.4

**สิทธิ์:** ใช้ `@Auth()` เปล่า ไม่บังคับ `ESS_ACCESS` โดยตั้งใจ — บัญชีที่ยังไม่ผูกพนักงาน
คือกลุ่มที่แอปพังให้เห็นพอดี ถ้าบังคับสิทธิ์จะมองไม่เห็น error ของกลุ่มที่มีปัญหามากที่สุด
และไม่ใส่ `MobileClientGuard` ด้วยเหตุผลเดียวกับ bootstrap

**กันของต้องห้ามหลุด (บทที่ 21.1):** redact สองชั้น — ฝั่งแอปชั้นหนึ่ง
และ server อีกชั้น เพราะแอปเวอร์ชันเก่าที่ redact ไม่ครบก็ยิงเข้า endpoint เดียวกันนี้
คีย์ที่โดน redact: `token|password|passcode|otp|secret|authorization|refresh|salary|netpay|bank|citizen`

**ข้อจำกัด:** แบตช์ละไม่เกิน 50 event, ข้อความยาวไม่เกิน 500 ตัวอักษร,
rate limit 60 ครั้ง/นาที ต่อผู้ใช้, ฝั่งแอปส่งเฉพาะ level `warning` และ `error`

---

## งานเบื้องหลัง — คิว `mobile-maintenance`

| งาน | รอบเวลา | ทำอะไร |
|---|---|---|
| `purge-expired-idempotency-records` | `0 3 * * *` (ตี 3 ทุกวัน) | ลบ `mobile_idempotency_records` ที่ `expiresAt` ผ่านมาแล้ว |

ใช้ repeatable job ของ BullMQ ที่มีอยู่แล้วในระบบ ไม่เพิ่ม scheduler ตัวใหม่
และ `upsertJobScheduler` ด้วย id คงที่ เพื่อให้รันหลาย instance แล้วยังมีตารางเดียว

> ลบเฉพาะแถวที่หมดอายุแล้วเท่านั้น — แถวที่ยังไม่หมดอายุคือเกราะกันลงเวลาซ้ำที่ยังทำงานอยู่
> Redis ล่มไม่ทำให้ backend เปิดไม่ขึ้น เพราะงานนี้เป็นงานบ้าน ไม่ใช่เส้นทางผู้ใช้

---

## Header ที่ทุก request ต้องส่ง

```http
Authorization: Bearer <access-token>
X-Request-Id: <uuid>
X-App-Version: 1.0.0
X-App-Build: 100
X-Platform: android|ios
X-OS-Version: 16
X-Installation-Id: <uuid>
Accept-Language: th-TH
```

Mutation ที่กำหนดเพิ่ม:

```http
Idempotency-Key: <uuid>
```

> **สำคัญ:** header เหล่านี้เป็น *metadata เท่านั้น*
> ตัวตนผู้ใช้มาจาก Access Token เสมอ และ MobileModule ไม่รับ `employeeId`/`companyId`/`branchId`
> จาก request body ของพนักงานเด็ดขาด (บทที่ 12.2)

---

## Environment variables ที่เพิ่ม

| ตัวแปร | ค่า default | ใช้ทำอะไร |
|---|---|---|
| `MOBILE_MINIMUM_BUILD` | `1` | build ต่ำกว่านี้ถูกบล็อกที่ endpoint ที่เขียนข้อมูล (`APP_UPDATE_REQUIRED`) |
| `MOBILE_LATEST_BUILD` | `1` | ใช้ตั้งค่า `updateRecommended` |
| `MOBILE_ANDROID_STORE_URL` | — | ลิงก์ให้ผู้ใช้ไปอัปเดต |
| `MOBILE_IOS_STORE_URL` | — | ลิงก์ให้ผู้ใช้ไปอัปเดต |
| `MOBILE_IDEMPOTENCY_TTL_HOURS` | `48` | อายุของ Idempotency Record |
| `MOBILE_TWO_FACTOR_ENABLED` | `false` | `true` เมื่อทำช่องทางส่ง OTP จริงแล้ว แล้วมือถือจะกลับมาบังคับ 2FA |
| `MOBILE_IDEMPOTENCY_CLEANUP_ENABLED` | `true` | ตั้ง `false` เพื่อปิดงานล้างอัตโนมัติ |
| `MOBILE_IDEMPOTENCY_CLEANUP_CRON` | `0 3 * * *` | รอบเวลาของงานล้าง |

---

## Database changes (Additive เท่านั้น)

Migration: `prisma/migrations/20260803120000_add_mobile_module_tables`

| การเปลี่ยนแปลง | ประเภท | ผลกับเว็บเวอร์ชันเดิม |
|---|---|---|
| `UserSession` + `installationId`, `platform`, `appVersion`, `appBuild`, `sessionType`, `lastSeenAt` | เพิ่มคอลัมน์ (nullable / มี default) | ไม่มี — เว็บเวอร์ชันเดิมยังเขียน/อ่านได้ตามเดิม รองรับ rolling deploy |
| `mobile_devices` | ตารางใหม่ | ไม่มี |
| `mobile_idempotency_records` | ตารางใหม่ | ไม่มี |

**ไม่มี** การสร้าง `MobileEmployee` / `MobileAttendance` / `MobileLeave` / `MobilePayroll`
ตามข้อห้ามในบทที่ 13.1

### งานที่ต้องทำก่อน production

- [x] Cleanup job ลบ `mobile_idempotency_records` ที่ `expiresAt` ผ่านมาแล้ว (บทที่ 13.4)
- [x] ตัดสินใจเรื่อง 2FA สำหรับ Mobile — ปิดการบังคับไว้ก่อน (BE-MOB-002)
- [ ] ทำช่องทางส่ง OTP จริง แล้วตั้ง `MOBILE_TWO_FACTOR_ENABLED=true` (เลื่อนไป ไม่ใช่ยกเลิก)
- [ ] ย้ายไฟล์แนบ/สลิปจาก local disk ไป private object storage (บทที่ 19.3)
