# ติดตั้งบน Windows Server (ไม่ใช้ Docker)

คู่มือนี้ใช้กับการติดตั้งตรงบน Windows Server ซึ่งเป็นวิธีเดียวที่โปรเจกต์นี้ใช้จริง
(ไฟล์ Docker ฝั่ง production ถูกถอดออกแล้ว เหลือ docker-compose.yml ไว้รัน Postgres/Redis ตอนพัฒนาเท่านั้น)

ตัวอย่างทั้งหมดสมมติว่าวางโปรเจกต์ไว้ที่ `D:\hr` ปรับตามจริงได้

> **ระบบนี้ไม่มีการส่งอีเมล** พนักงานที่ลืมรหัสผ่านต้องให้ HR กดรีเซ็ตให้จากหน้า
> ผู้ใช้งานระบบ ไม่มีปุ่ม "ลืมรหัสผ่าน" ให้กดเอง — ต้องแจ้งลูกค้าก่อนเปิดใช้

---

## 1. ของที่ต้องลงบนเครื่องก่อน

| อย่าง | รุ่น | หมายเหตุ |
|---|---|---|
| Windows Server | 2019 ขึ้นไป | ต้องเป็น **Desktop Experience** ไม่ใช่ Server Core (ดูหัวข้อฟอนต์) |
| Node.js | 24 LTS | เลือก "Automatically install the necessary tools" ตอนติดตั้งได้ ไม่จำเป็นแต่ไม่เสียหาย |
| PostgreSQL | 16 | จำเลขรหัสผ่าน `postgres` ไว้ และจำเส้นทาง `bin` ไว้ด้วย |
| NSSM | 2.24 | ใช้ทำ Windows Service — <https://nssm.cc/download> |
| reverse proxy | IIS / Caddy / nginx | ต้องมี HTTPS |

**ปกติไม่ต้องลง Visual Studio Build Tools** — ตัวที่ใช้อยู่มีไบนารีสำเร็จรูปสำหรับ
Windows มาให้หมด (Prisma, esbuild, SWC ของ Next) และตัวเข้ารหัสรหัสผ่านเป็น
`bcryptjs` ซึ่งเป็น JavaScript ล้วน ไม่ใช่ `bcrypt` ที่ต้องคอมไพล์

ข้อยกเว้นเดียวคือ `msgpackr-extract` (ตัวเร่งความเร็วของคิวงาน) ถ้า `npm ci` ขึ้น
คำเตือนเรื่องตัวนี้ **ข้ามได้** ระบบจะถอยไปใช้โค้ด JavaScript แทนเองโดยอัตโนมัติ
ไม่กระทบการทำงาน

**ต้องมีอินเทอร์เน็ตตอนติดตั้ง** เพราะ `npm ci` ของ backend จะโหลด Chrome
ของ puppeteer ลงมาด้วย (~150 MB) ใช้ออกสลิปเงินเดือนและหนังสือรับรองเป็น PDF

### 1.1 ไม่ต้องลง Redis แล้ว

ระบบมีคิวงานสี่ตัว — คำนวณเวลาใหม่ · ออกรายงาน · งานบำรุงรักษา · งานฝั่งมือถือ
เดิมทั้งหมดวิ่งผ่าน Redis ซึ่งเป็นปัญหาบน Windows เพราะ Redis ไม่มีรุ่นสำหรับ
Windows อย่างเป็นทางการ

ตอนนี้คิวทำงานอยู่ในโปรเซสเดียวกับตัวแอป (`QUEUE_DRIVER=memory` เป็นค่าเริ่มต้น)
**ไม่ต้องลง Redis ไม่ต้องหา Memurai และไม่มีค่าลิขสิทธิ์**

ใช้แบบนี้ได้เพราะระบบรัน backend ตัวเดียว และสถานะงานจริงถูกเก็บใน PostgreSQL
อยู่แล้ว งานที่ค้างตอนรีสตาร์ตจึงถูกกวาดกลับเข้าคิวให้เองตอนบูต
(ดูใน log ว่า `กวาดงานคำนวณเวลาที่ค้างจากรอบก่อนกลับเข้าคิว N รายการ`)

> **ข้อจำกัดที่ต้องรู้** ถ้าวันหนึ่งต้องรัน backend มากกว่าหนึ่งตัว ต้องกลับไปใช้
> Redis โดยตั้ง `QUEUE_DRIVER=redis` ไม่งั้นแต่ละตัวจะมีคิวของตัวเองแยกกัน
> และงานตามตาราง (สำรองข้อมูล/ล้างไฟล์) จะยิงซ้ำเท่าจำนวน instance

### 1.2 เรื่องฟอนต์ไทยใน PDF

สลิปเงินเดือนและหนังสือรับรองออกเป็น PDF ผ่าน Chrome
**ถ้าเครื่องไม่มีฟอนต์ไทย ตัวอักษรจะออกมาเป็นกล่องสี่เหลี่ยม** และจะรู้ตัวก็ตอน
มีคนกดออกเอกสารจริงแล้วเท่านั้น ไม่มีอะไรเตือนตอนบูต

Windows Server แบบ Desktop Experience มี Leelawadee UI กับ Tahoma มาให้แล้ว
ถ้าเป็น Server Core ต้องลงฟอนต์เพิ่มเอง

ตรวจว่ามีจริง:

```powershell
Get-ChildItem C:\Windows\Fonts | Where-Object { $_.Name -match 'leelawad|tahoma' }
```

---

## 2. เตรียมฐานข้อมูล

เปิด **SQL Shell (psql)** หรือ pgAdmin แล้วสร้างผู้ใช้กับฐานข้อมูล

```sql
CREATE USER hr_admin WITH PASSWORD 'รหัสผ่านที่ตั้งเอง';
CREATE DATABASE hr_workforce OWNER hr_admin ENCODING 'UTF8';
```

ตรวจว่าเขตเวลาถูก — **ทั้งเครื่องและฐานข้อมูลต้องเป็นเวลาไทย**
การคำนวณเวลาเข้างานและรอบเงินเดือนอิงเขตเวลานี้ ตั้งผิดแล้วยอดเพี้ยนทั้งงวด

```powershell
Set-TimeZone -Id "SE Asia Standard Time"
Get-TimeZone
```

---

## 3. วางโค้ดและตั้งค่า

```powershell
cd D:\
git clone <ที่อยู่ repo> hr
cd D:\hr
```

### ค่าตั้งระบบ

```powershell
copy backend\.env.example backend\.env
cd backend
npm ci
npm run gen:secrets
```

เอาค่าที่สุ่มได้ไปวางใน `backend\.env` แล้วเติมค่าที่เหลือให้ครบ —
ทุกบรรทัดที่เป็น `<<< ... >>>`

> **รหัสผ่านฐานข้อมูลที่มีอักขระพิเศษ** (`@ : / ?`) ต้อง percent-encode ก่อนใส่ใน
> `DATABASE_URL` เช่น `p@ss` เขียนเป็น `p%40ss` ไม่งั้นระบบจะอ่านที่อยู่ผิด
> โดยไม่มีข้อความบอกว่าเพราะอะไร

### ตรวจค่าตั้งระบบก่อนทำอย่างอื่น

```powershell
npm run check:prod
```

**ต้องไม่มี `[FAIL]` เหลือเลย** ก่อนไปขั้นถัดไป
`[WARN]` อ่านให้เข้าใจว่าแลกอะไรแล้วค่อยตัดสินใจ

---

## 4. สร้างตารางและใส่ข้อมูล

```powershell
cd D:\hr\backend
npm run db:migrate:deploy
```

### ใส่ข้อมูล — เลือกทางใดทางหนึ่ง

**ทาง ก. ย้ายจากเครื่องที่ทำไว้แล้ว** (แนะนำ — ทะเบียนพนักงาน โครงสร้างองค์กร
เวลาเข้างาน และงวดเงินเดือนที่ตรวจแล้วอยู่ในนั้นครบ)

```powershell
# บนเครื่องเดิม (ที่รัน PostgreSQL ผ่าน Docker อยู่)
docker exec hr_postgres pg_dump -U hr_admin -d hr_workforce -Fc > hr.dump

# คัดลอกไฟล์มาที่เซิร์ฟเวอร์ แล้วบนเซิร์ฟเวอร์
$env:PGPASSWORD = "รหัสผ่านฐานข้อมูล"
& "C:\Program Files\PostgreSQL\16\bin\pg_restore.exe" `
    -h 127.0.0.1 -U hr_admin -d hr_workforce --clean --if-exists D:\hr.dump
Remove-Item Env:\PGPASSWORD
```

คัดลอกไฟล์ที่ผู้ใช้อัปโหลดตามมาด้วย ไม่งั้นรูปพนักงานกับโลโก้บริษัทหาย:

```powershell
robocopy <เครื่องเดิม>\backend\uploads D:\hr\backend\uploads /MIR
robocopy <เครื่องเดิม>\backend\storage D:\hr\backend\storage /MIR /XD exports temp
```

**ทาง ข. เริ่มจากฐานข้อมูลเปล่า**

```powershell
npm run db:seed
```

ได้แค่โครงสิทธิ์กับบัญชี superadmin ต้องกรอกข้อมูลพนักงานเองทั้งหมด

---

## 5. build ทั้งสองฝั่ง

```powershell
cd D:\hr\backend
npm run build

cd D:\hr\frontend
npm ci
```

**ก่อน build frontend ต้องตั้งที่อยู่ API ก่อน** เพราะค่านี้ถูกฝังลงบันเดิลตอน build
เปลี่ยนทีหลังตอนรันไม่ได้ ต้อง build ใหม่อย่างเดียว

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = "https://<โดเมน>/api"
npm run build
```

ให้ค่านี้อยู่ถาวรด้วย เพื่อไม่ให้ build ครั้งหน้าลืม:

```powershell
[Environment]::SetEnvironmentVariable(
    "NEXT_PUBLIC_API_BASE_URL", "https://<โดเมน>/api", "Machine")
```

---

## 6. ทำเป็น Windows Service

ต้องเป็น service ไม่ใช่ Task Scheduler เพราะต้องเริ่มเองตอนเครื่องบูตโดยไม่ต้องมี
ใครล็อกอิน และต้องเปิดใหม่ให้เองเมื่อโปรเซสตาย

วาง `nssm.exe` ไว้ใน PATH แล้วเปิด **PowerShell แบบ Run as Administrator**

```powershell
cd D:\hr
.\scripts\windows\install-services.ps1 -AppRoot D:\hr
```

สคริปต์จะตรวจให้ก่อนว่า build มาแล้วจริงและมี `.env` แล้ว ถ้าขาดจะหยุดพร้อมบอกว่าขาดอะไร

**frontend รันแบบ standalone ไม่ใช่ `next start`** เพราะ `next.config.ts` ตั้ง
`output: "standalone"` ไว้ ซึ่ง Next บอกตรง ๆ ว่า `next start` ใช้กับโหมดนี้ไม่ได้

สคริปต์คัดลอก `.next\static` กับ `public` เข้าไปใน standalone ให้อัตโนมัติด้วย —
`next build` ไม่ทำให้เอง **ขาดสองอย่างนี้แล้วหน้าเว็บจะขึ้นแต่ไม่มี CSS ไม่มีรูป
และ JS โหลด 404** เหมือนเว็บพัง แต่ไม่มี error ใน log ของ service เลย หายากมาก

ตรวจว่าขึ้นจริง:

```powershell
Get-Service HRBackend, HRFrontend
Invoke-RestMethod http://127.0.0.1:4000/api/health
Invoke-WebRequest http://127.0.0.1:3000 -UseBasicParsing | Select-Object StatusCode
```

`/api/health` ตรวจการต่อฐานข้อมูลจริง ไม่ใช่ตอบ 200 เปล่า ๆ เชื่อผลได้

log ของทั้งสอง service อยู่ที่ `D:\hr\logs`

---

## 7. reverse proxy และ HTTPS

service ทั้งสองฟังที่ `127.0.0.1` เท่านั้น ต้องมีตัวหน้าบ้านรับ HTTPS แล้วส่งต่อ

- `/api/*` → `http://127.0.0.1:4000`
- ที่เหลือ → `http://127.0.0.1:3000`

**Caddy ง่ายที่สุด** เพราะขอใบรับรองและต่ออายุให้เอง — `Caddyfile`:

```
<โดเมน> {
    handle /api/* {
        reverse_proxy 127.0.0.1:4000
    }
    handle {
        reverse_proxy 127.0.0.1:3000
    }
}
```

ถ้าใช้ IIS ต้องลง **URL Rewrite** กับ **Application Request Routing** เพิ่ม
แล้วตั้ง rule สองข้อตามด้านบน

ไม่ว่าใช้ตัวไหน **ต้องส่ง header เหล่านี้ต่อไปให้ backend** ไม่งั้นระบบเห็น IP ของ
proxy แทน IP ผู้ใช้จริง แล้วการล็อกบัญชีหลังใส่รหัสผิดหลายครั้งจะไร้ผลทันที:
`X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host`
(และต้องตั้ง `TRUST_PROXY=true` ใน `.env` ด้วย)

เปิด Windows Firewall เฉพาะ 80/443 **ห้ามเปิด 4000 / 3000 / 5432 / 6379 ออกนอกเครื่อง**

### เครื่องสแกนลายนิ้วมือ

ข้ามได้ถ้ายังไม่ใช้เครื่องสแกน

เครื่องสแกนต่อ HTTPS ไม่ได้ และตั้งค่าได้แค่ที่อยู่กับพอร์ต แนบโทเคนที่ backend
บังคับเองไม่ได้ **จึงต้องยิงตรงเข้าเซิร์ฟเวอร์ในวง LAN ไม่ผ่านโดเมนภายนอก**
ไม่ว่าหน้าบ้านจะเป็น Caddy, IIS หรือ Cloudflare Tunnel ก็ตาม

ติดตั้ง service ที่คอยเติมโทเคนให้ — Run as Administrator:

```powershell
cd D:\hr
.\scripts\windows\install-device-proxy-service.ps1 -AppRoot D:\hr -ScannerIps <IP ของเครื่องสแกน>
```

สคริปต์อ่านโทเคนกับพอร์ตจาก `backend\.env` เอง ติดตั้ง service `HRDeviceProxy`
(รับที่พอร์ต 8080 ส่งต่อ `127.0.0.1` เข้า backend) และเปิด firewall
ให้พอร์ตนั้น**เฉพาะ IP ของเครื่องสแกน**

ตั้งโทเคนใหม่ใน `backend\.env` แล้วต้องรีสตาร์ต `HRBackend` ด้วยทุกครั้ง

ขั้นตอนที่เหลือ (เพิ่มเครื่อง ผูกพนักงาน ตั้งค่าที่ตัวเครื่อง วิธีตรวจ)
อยู่ใน `infra/attendance-device-setup.md`

---

## 8. ตั้งงานตามเวลา

```powershell
# PowerShell แบบ Run as Administrator
cd D:\hr
.\scripts\windows\register-scheduled-tasks.ps1 -AppRoot D:\hr
```

ได้งานสี่ตัวใต้ `\HR Workforce\` — สำรองข้อมูลตีสอง และล้างไฟล์เก่าตีสามครึ่ง

**ทดสอบงานสำรองข้อมูลเดี๋ยวนั้นเลย อย่ารอถึงตีสอง:**

```powershell
Start-ScheduledTask -TaskName "HR-Backup" -TaskPath "\HR Workforce\"
Get-ChildItem D:\hr\backups | Sort-Object LastWriteTime -Descending | Select-Object -First 1
```

**แล้วลองกู้คืนจริงอย่างน้อยหนึ่งครั้ง** ลงฐานข้อมูลเปล่าอีกตัวหนึ่ง
การสำรองข้อมูลที่ยังไม่เคยกู้กลับมาได้ ไม่นับว่ามีการสำรองข้อมูล

ไฟล์สำรองอยู่ที่ `D:\hr\backups` **ต้องคัดลอกออกนอกเครื่องด้วย**
เก็บไว้บนเครื่องเดียวกับระบบไม่ช่วยอะไรตอนเครื่องพัง

---

## 9. อัปเดตครั้งถัดไป

```powershell
cd D:\hr
git pull

Stop-Service HRFrontend
Stop-Service HRBackend

cd backend
npm ci
npm run db:migrate:deploy   # ต้องมาก่อน build เสมอ
npm run build

cd ..\frontend
npm ci
npm run build

# ต้องรันซ้ำทุกครั้งที่ build frontend ใหม่ — ไฟล์ static ชุดใหม่ต้องถูกคัดลอก
# เข้า standalone อีกรอบ ข้ามแล้วหน้าเว็บจะขึ้นแต่ไม่มี CSS
cd ..
.\scripts\windows\install-services.ps1 -AppRoot D:\hr
```

สคริปต์ตัวสุดท้ายเปิด service ให้เองแล้ว ไม่ต้องสั่ง `Start-Service` ซ้ำ

**ลำดับสำคัญ** — migrate ก่อนเปิด service เสมอ ไม่งั้นโค้ดใหม่จะเจอตารางเก่า

ย้อนกลับ: `git checkout <commit เดิม>` แล้ว build ใหม่
migration ย้อนอัตโนมัติไม่ได้ ถ้าต้องย้อนสคีมาให้กู้จากไฟล์สำรองของคืนก่อน

---

## 10. ที่ต้องกรอกก่อนใช้งานจริงแต่ละเรื่อง

ระบบขึ้นได้โดยไม่มีของพวกนี้ แต่ฟีเจอร์ที่เกี่ยวข้องจะใช้ไม่ได้

| ต้องกรอก | ที่ไหน | ไม่มีแล้วทำอะไรไม่ได้ |
|---|---|---|
| เลขประจำตัวผู้เสียภาษี + ที่อยู่บริษัท | ตั้งค่า › ข้อมูลบริษัท | หัวแบบ ภ.ง.ด.1 ไม่สมบูรณ์ |
| เลขที่บัญชีนายจ้าง (สปส.) | ตั้งค่า › ข้อมูลบริษัท | ยื่น สปส.1-10 ไม่ได้ |
| รหัสบริษัทที่ธนาคารออกให้ + บัญชีตัดจ่าย | ตั้งค่า › เงินเดือน | สร้างไฟล์โอนเงิน KTB ไม่ได้ |
| ชื่อผู้ลงนาม | ตั้งค่าระบบ › แม่แบบเอกสาร | ออกหนังสือรับรองเงินเดือนไม่ได้ |
| ยอดรายได้สะสมยกมา | พนักงาน › ภาษี | บริษัทที่เริ่มใช้กลางปีจะหักภาษีต่ำกว่าจริง |

---

## 11. ความปลอดภัยที่ห้ามลืม

- **เปิดไฟร์วอลล์เฉพาะ 80/443** พอร์ต 4000 / 3000 / 5432 ต้องอยู่ในเครื่องเท่านั้น
- **`TRUST_PROXY=true`** และ proxy ต้องส่ง `X-Forwarded-*` ต่อมาจริง
- **`TWO_FACTOR_DEV_SHOW_CODE=false`** — true คือโชว์รหัสยืนยันออกมาตรง ๆ
- **เปลี่ยนรหัส superadmin หลังติดตั้งเสร็จ** และเก็บไว้นอกเครื่อง
- ให้ service รันด้วยบัญชีเฉพาะงาน ไม่ใช่ LocalSystem ถ้าทำได้
  (`install-services.ps1` มี `-ServiceAccount` ให้ระบุ)
- ไฟล์ `backend\.env`, โฟลเดอร์ `credentials\` และ `docs\*.xlsx`
  ถูก git ignore ไว้แล้ว — มีเลขบัตรประชาชนและเงินเดือนรายคนอยู่ในนั้น
  **อย่าใช้ `git add -f` กับไฟล์พวกนี้** ลบออกจากประวัติย้อนหลังทำได้ยากมาก

---

## 12. ที่ยังไม่พร้อมและต้องรู้

- **แอปมือถือยังใช้จริงไม่ได้** ตอนนี้รันผ่าน Expo Go เพื่อทดสอบเท่านั้น
  ผู้ใช้จริงต้องรอ build ขึ้น App Store / Play Store ก่อน
- **ยืนยันตัวตนสองชั้นปิดอยู่** (`TWO_FACTOR_ENABLED=false`) รอเฟส TOTP
- **ไม่มีระบบส่งอีเมล** การแจ้งเตือนทั้งหมดอยู่ในแอปและ push ของมือถือเท่านั้น

---

## แก้ปัญหาที่เจอบ่อย

**service เปิดแล้วดับทันที** — ดู `D:\hr\logs\HRBackend.err.log`
เกือบทั้งหมดเป็นเรื่องต่อฐานข้อมูลไม่ได้ ลองสั่ง `npm run check:prod` ซ้ำ

**หน้าเว็บขึ้นแต่กดอะไรก็ error** — ที่อยู่ API ผิด ตรวจว่า build frontend ตอนที่
`NEXT_PUBLIC_API_BASE_URL` ตั้งไว้ถูกแล้วจริง ค่านี้แก้ตอนรันไม่ได้ ต้อง build ใหม่

**PDF ออกมาเป็นกล่องสี่เหลี่ยม** — เครื่องไม่มีฟอนต์ไทย ดูหัวข้อ 1.2

**ล็อกอินผิดกี่ครั้งก็ไม่โดนล็อก** — proxy ไม่ได้ส่ง `X-Forwarded-For` มา
หรือ `TRUST_PROXY` ยังเป็น false ระบบเลยเห็นทุกคำขอมาจาก IP เดียวกัน

**เวลาเข้างานเพี้ยนไปหลายชั่วโมง** — เขตเวลาเครื่องไม่ใช่ `SE Asia Standard Time`
