# Mobile E2E (Maestro)

เทสระดับ end-to-end ของแอปพนักงาน ครอบ critical path ตาม Phase 8 ของ
[แผน Mobile Feature Parity](../../docs/mobile-role-feature-parity-plan.md)

## ทำไมเลือก Maestro ไม่ใช่ Detox

Detox ต้อง build native ทุกครั้งที่แก้โค้ด และผูกกับ JS runtime ของแอป —
ได้ความแม่นยำสูงกว่าแต่รอบการรันช้ามาก สำหรับแอปที่ยัง iterate เร็วและทีมเล็ก
Maestro คุ้มกว่า เพราะ:

- เขียนเป็น YAML ที่คนไม่ได้เขียน React Native ก็อ่านออก (QA เขียน flow เองได้)
- ใช้ build เดิมซ้ำได้ ไม่ต้อง compile ใหม่ต่อการแก้เทสหนึ่งบรรทัด
- ทนต่อ animation เพราะรอ element เองโดยไม่ต้องใส่ sleep กระจาย

ข้อแลกคือ Maestro มองแอปจากภายนอก จึงตรวจ state ภายในไม่ได้ — เทสจึงยืนยัน
"ผู้ใช้ทำงานสำเร็จไหม" ไม่ใช่ "ตัวแปรถูกไหม" ซึ่งเป็นสิ่งที่ต้องการอยู่แล้ว
ในระดับนี้ (ตรรกะภายในมี unit test คุมอยู่แล้ว)

## เตรียมเครื่อง

```bash
# ติดตั้ง Maestro (macOS / Linux)
curl -Ls "https://get.maestro.mobile.dev" | bash

# Android: เปิด emulator ไว้ก่อน แล้วติดตั้ง dev build
npx expo run:android

# iOS (เฉพาะ macOS)
npx expo run:ios
```

Maestro คุยกับแอปผ่าน `appId` ซึ่งต่างกันตามสภาพแวดล้อม:

| สภาพแวดล้อม | appId |
|---|---|
| development | `com.tjc.employeemobile.development` |
| staging | `com.tjc.employeemobile.staging` |
| production | `com.tjc.employeemobile` |

flow ทุกไฟล์อ่านค่าจากตัวแปร `APP_ID` จึงสลับได้โดยไม่ต้องแก้ไฟล์

## รัน

```bash
# ทั้งชุด
maestro test -e APP_ID=com.tjc.employeemobile.development \
             -e EMAIL=employee@tjc.co.th \
             -e PASSWORD='<รหัสของบัญชีทดสอบ>' \
             -e PIN=246813 \
             e2e/flows

# เฉพาะ flow เดียว
maestro test -e APP_ID=... -e EMAIL=... -e PASSWORD=... -e PIN=... \
             e2e/flows/01-login-and-pin.yaml
```

## บัญชีทดสอบที่ต้องมี

flow ชุดนี้ต้องการบัญชีสามแบบใน staging (ดู `.github/workflows/mobile-e2e.yml`):

| ตัวแปร | ต้องมีสิทธิ์ | ใช้ใน flow |
|---|---|---|
| `EMAIL` / `PASSWORD` | `ESS_ACCESS` + สิทธิ์ยื่นคำขอ | 01–05 |
| `MANAGER_EMAIL` / `MANAGER_PASSWORD` | เพิ่ม `APPROVAL_ACCESS` + `TEAM_VIEW` | 06–07 |
| `EXEC_EMAIL` / `EXEC_PASSWORD` | เพิ่ม `EXECUTIVE_VIEW` | 08 |

**ห้ามใช้บัญชีจริงของพนักงาน** — flow มีการยื่นและยกเลิกคำขอจริง

## ครอบคลุมอะไรบ้าง

| ไฟล์ | Critical path ตามแผน |
|---|---|
| `01-login-and-pin.yaml` | เข้าสู่ระบบ ตั้ง PIN และปลดล็อก |
| `02-attendance-punch.yaml` | ลงเวลา (ข้อ 4 บางส่วน — ในพื้นที่) |
| `03-leave-request.yaml` | พนักงานส่งใบลา (ข้อ 1 ครึ่งแรก) |
| `04-payslip.yaml` | เปิดสลิปเงินเดือนและ 50 ทวิ (ข้อ 5) |
| `05-permission-boundary.yaml` | ผู้ไม่มีสิทธิ์ต้องไม่เห็นเมนู (ข้อ 9) |
| `06-approval.yaml` | หัวหน้าอนุมัติคำขอ (ข้อ 1 ครึ่งหลัง) |
| `07-team.yaml` | หัวหน้าดูทีมและเจาะลึกรายคน |
| `08-executive.yaml` | ผู้บริหารเปลี่ยนตัวกรองและ drill-down (ข้อ 8) |

ยังไม่ครอบ: ข้อ 2 (ไฟล์แนบ OT), ข้อ 3 (ตีกลับแล้วส่งใหม่), ข้อ 6 (คำร้อง
เอกสารจนได้ไฟล์), ข้อ 7 (ข้อร้องเรียน), ข้อ 10 (retry ไม่เกิดข้อมูลซ้ำ) —
สี่ข้อแรกต้องรัน flow สองบัญชีสลับกันในรอบเดียว ส่วนข้อ 10 ต้องคุมสภาพ
เครือข่ายซึ่ง Maestro ทำเองไม่ได้ ต้องใช้ proxy ช่วย
