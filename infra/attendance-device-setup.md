# ต่อเครื่องสแกนลายนิ้วมือเข้าระบบ

ระบบรับข้อมูลด้วยโปรโตคอล **ADMS/iclock** — เครื่องยิงข้อมูลเข้ามาเอง
ไม่ต้องมีคนกดดึง ใช้ได้กับ ZKTeco และรุ่นที่ใช้โปรโตคอลเดียวกัน

ตัวรับอยู่ที่ `backend/src/modules/attendance/device-push.controller.ts`
เปิดที่ root ไม่ใช่ใต้ `/api` เพราะเครื่องกำหนด path เอง

เลือกทางตามสภาพแวดล้อม:

| สภาพแวดล้อม | ต้องมีตัวคั่นหน้าไหม | ตั้งค่าที่เครื่องสแกน |
|---|---|---|
| เครื่องที่พัฒนาอยู่ (`NODE_ENV=development`) | **ไม่ต้อง** | ชี้ตรงที่พอร์ต 4000 |
| Windows Server | ต้องมี — service `HRDeviceProxy` | พอร์ต 8080 |
| Linux + Caddy/nginx อยู่แล้ว | ต้องมี — เพิ่มบล็อกใน proxy เดิม | พอร์ต 8080 |
| docker compose | ต้องมี — service `device-proxy` | พอร์ต 8080 |

---

## 1. ตอนพัฒนา — ชี้ตรงเข้าพอร์ต 4000

`DevicePushGuard` บังคับโทเคนเฉพาะตอน `NODE_ENV=production` ตอน dev ถ้าไม่ได้ตั้ง
`ATTENDANCE_DEVICE_PUSH_TOKEN` มันจะปล่อยผ่านพร้อมเขียนเตือนไว้ใน log
**จึงต่อเครื่องจริงเข้ามาทดสอบได้เลยโดยไม่ต้องลง nginx/Caddy/docker อะไรทั้งนั้น**

### หา IP ของเครื่องที่รัน backend

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' } |
  Select-Object IPAddress, InterfaceAlias
```

เอาเลขของวงที่**เครื่องสแกนเสียบอยู่วงเดียวกัน** ถ้าคนละวงกันคุยกันไม่ได้

### เปิด Windows Firewall ให้พอร์ต 4000 เฉพาะ IP ของเครื่องสแกน

```powershell
# Run as Administrator
New-NetFirewallRule -DisplayName "HR attendance scanner (dev)" `
  -Direction Inbound -Protocol TCP -LocalPort 4000 `
  -RemoteAddress <IP ของเครื่องสแกน> -Action Allow -Profile Private
```

ลบทิ้งเมื่อเลิกทดสอบ: `Remove-NetFirewallRule -DisplayName "HR attendance scanner (dev)"`

### ตั้งค่าที่ตัวเครื่องสแกน

เมนู Comm / Cloud Server / ADMS

| ช่อง | ค่า |
|---|---|
| Server Address | IP ของเครื่องที่รัน backend |
| Server Port | 4000 |
| Enable Domain Name | ปิด |
| Time Zone | GMT+7 |

### จำกัด IP อีกชั้น (จะทำหรือไม่ก็ได้ตอน dev)

ใน `backend/.env` — ค่านี้ใช้ได้แม้ไม่ได้ตั้งโทเคน

```
ATTENDANCE_DEVICE_PUSH_ALLOWED_IPS=<IP ของเครื่องสแกน>
```

> ห้ามใช้ท่านี้บนเครื่องจริง — `NODE_ENV=production` จะปฏิเสธทุกคำขอถ้าไม่มีโทเคน
> (ตั้งใจให้ fail closed) ต้องมีตัวคั่นหน้าเสมอ ดูข้อ 2 หรือ 3

---

## 2. Windows Server — service HRDeviceProxy

ใช้ได้ไม่ว่าหน้าบ้านจะเป็นอะไร (Cloudflare Tunnel, IIS, ไม่มีเลย) เพราะตัวนี้
ไม่เกี่ยวกับ proxy ที่ทำ HTTPS ให้หน้าเว็บ — เครื่องสแกนพูด HTTP ล้วน
ต้องยิงตรงเข้าเซิร์ฟเวอร์ในวง LAN ไม่ผ่านโดเมนภายนอก

ตัว proxy คือ `scripts/windows/attendance-device-proxy.js` — Node ล้วน ไม่มี
dependency รับที่พอร์ต 8080 เติม header แล้วส่งต่อ `127.0.0.1:<PORT ของ backend>`

```powershell
# Run as Administrator บนเซิร์ฟเวอร์
cd D:\hr
.\scripts\windows\install-device-proxy-service.ps1 -AppRoot D:\hr -ScannerIps 192.168.100.90
```

สคริปต์อ่าน `ATTENDANCE_DEVICE_PUSH_TOKEN` กับ `PORT` จาก `backend\.env` ให้เอง
(กันตั้งโทเคนไม่ตรงกันจนข้อมูลถูกปฏิเสธเงียบ ๆ) ติดตั้ง service ด้วย nssm
และเปิด firewall ให้พอร์ต 8080 เฉพาะ IP ที่ระบุ

ถ้ายังไม่มีโทเคนใน `backend\.env` สคริปต์จะหยุดพร้อมบอกวิธีสุ่ม
ตั้งเสร็จต้องรีสตาร์ต `HRBackend` ด้วย ไม่งั้น backend ยังใช้ค่าเดิมอยู่

## 3. Linux ที่มี Caddy อยู่แล้ว

`caddy/attendance-device.Caddyfile` คือบล็อกที่เอาไปต่อท้าย Caddyfile เดิม
แทน `<<<ATTENDANCE_DEVICE_PUSH_TOKEN>>>` ด้วยค่าจาก `backend/.env`
แล้ว `caddy validate` → `caddy reload`

## 4. docker compose

`docker-compose.prod.yml` มี service `device-proxy` (nginx) ทำหน้าที่เดียวกัน
รายละเอียดใน `nginx/README.md`

---

## ทำในระบบ (ทุกทางต้องทำเหมือนกัน)

### เพิ่มเครื่อง

ตั้งค่า › การลงเวลา › แท็บเครื่องสแกน → เพิ่มเครื่อง

**Serial Number ต้องตรงกับที่พิมพ์ติดตัวเครื่องเป๊ะ ๆ** ระบบหาเครื่องด้วยเลขนี้
ไม่ตรง = ข้อมูลถูกปฏิเสธ ไม่หาย เครื่องเก็บไว้ยิงซ้ำจนกว่าจะแก้ SN ให้ถูก

### ผูกพนักงานกับรหัสในเครื่อง

เครื่องส่งมาแค่รหัสผู้ใช้ (enroll no.) ต้องบอกระบบว่ารหัสไหนคือใคร
**ที่ยังไม่ผูก = สแกนแล้วตกเป็นรายการไม่มีเจ้าของ ไม่กลายเป็นการลงเวลา**
ดูได้ที่ประวัติการสแกนของเครื่อง

ตัวลายนิ้วมือยังต้องไปเก็บที่ตัวเครื่องเอง ระบบไม่ push ทะเบียนผู้ใช้ลงเครื่องให้

---

## ตรวจว่าใช้ได้จริง

```powershell
Invoke-WebRequest -UseBasicParsing `
  "http://<ที่อยู่>:<พอร์ต>/iclock/cdata?SN=TEST123" | Select-Object -Expand Content
```

| ผลที่ได้ | แปลว่า |
|---|---|
| `GET OPTION FROM: TEST123` + ค่า config | ทางเดินครบแล้ว |
| `401 invalid device token` | โทเคนที่ตัวคั่นหน้าเติมไม่ตรงกับใน `backend/.env` |
| `401 device ip not allowed` | ติด `ATTENDANCE_DEVICE_PUSH_ALLOWED_IPS` |
| ต่อไม่ติด | firewall หรือคนละวง LAN |

ส่งรายการสแกนทดสอบ (คั่นด้วย tab):

```powershell
$body = "1`t2026-08-25 08:01:25`t0`t1`n"
Invoke-WebRequest -UseBasicParsing -Method Post -Body $body `
  "http://<ที่อยู่>:<พอร์ต>/iclock/cdata?SN=<SN จริง>&table=ATTLOG"
```

`OK: 1` = รับแล้ว — `500` = ยังไม่ได้เพิ่มเครื่องที่มี SN นี้ในระบบ

จากนั้นให้คนไปแตะนิ้วที่เครื่องจริง แล้วดูที่ประวัติการสแกนของเครื่อง
ควรขึ้นภายในไม่กี่วินาที

---

## ข้อจำกัดที่ต้องรู้

- เครื่องสแกนพูด **HTTP ล้วน ต่อ TLS ไม่ได้** พอร์ตที่เปิดรับต้องอยู่ในวง LAN
  เดียวกันหรือลากผ่าน VPN เท่านั้น **ห้ามเปิดออกอินเทอร์เน็ต**
- ระบบตีความเวลาที่เครื่องส่งมาเป็นเวลาไทยเสมอ **เครื่องตั้งเวลาผิด = ลงเวลาผิด
  ทั้งงวด** ไม่มีตัวไหนจับให้
- แตะซ้ำภายใน 3 นาที ถือเป็นการสแกนซ้ำ ตัดทิ้งอัตโนมัติ
- ไม่ push ทะเบียนผู้ใช้/ลายนิ้วมือลงเครื่อง
- ไม่เก็บรูปถ่ายตอนสแกน (รับแล้วทิ้ง)
