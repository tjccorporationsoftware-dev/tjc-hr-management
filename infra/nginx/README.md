# ตัวคั่นหน้าสำหรับเครื่องสแกนลายนิ้วมือ (ทางที่ใช้ docker)

> ไม่ใช้ docker → ใช้ `../caddy/attendance-device.Caddyfile` แทน
> ต่อกับเครื่องที่กำลังพัฒนา → ไม่ต้องมีตัวคั่นหน้าเลย
> ภาพรวมทุกทางอยู่ที่ `../attendance-device-setup.md`

`attendance-device-proxy.conf.template` คือ nginx ที่รับข้อมูลจากเครื่องสแกน
แล้วเติมโทเคนให้ก่อนส่งเข้า backend

**ทำไมต้องมี:** `/iclock/*` ของ backend บังคับ shared secret แต่เครื่องสแกน
ตั้งค่าได้แค่ที่อยู่เซิร์ฟเวอร์กับพอร์ต ใส่ `?token=` หรือ header เองไม่ได้
ถ้าไม่มีตัวนี้ ทางเลือกที่เหลือคือปล่อย `/iclock/*` ไว้โดยไม่ตรวจโทเคน
ซึ่งแปลว่าใครก็ตามที่ยิงถึงพอร์ตนั้นได้ **สร้างรายการลงเวลาปลอมเข้าระบบได้ทันที**

## รันด้วย docker (ทางปกติ)

`docker-compose.prod.yml` มี service `device-proxy` เรียกไฟล์นี้ให้แล้ว
ต้องมี `ATTENDANCE_DEVICE_PUSH_TOKEN` ใน `.env` ที่โฟลเดอร์บนสุด
**ค่าเดียวกับที่อยู่ใน `backend/.env`** ไม่ตรงกัน = backend ตอบ 401
ข้อมูลลงเวลาไม่เข้า และไม่มีอะไรเตือนที่หน้าเว็บ

```bash
docker compose -f docker-compose.prod.yml up -d device-proxy
```

## รันด้วย nginx ที่ติดตั้งบนเครื่อง (ไม่ผ่าน docker)

1. คัดลอกไฟล์ไปที่ `/etc/nginx/conf.d/attendance-device-proxy.conf`
   (ตัด `.template` ออก)
2. แทน `${ATTENDANCE_DEVICE_PUSH_TOKEN}` ด้วยโทเคนจริง — ไม่มีใครแทนให้
3. แก้ `set $backend_upstream http://backend:4000;` เป็นที่อยู่จริงของ backend
   เช่น `http://127.0.0.1:4000` แล้วลบบรรทัด `resolver 127.0.0.11 ...` ทิ้ง
   (เป็น DNS ภายในของ docker ใช้นอก docker ไม่ได้)
4. `nginx -t && systemctl reload nginx`

## ตรวจว่าใช้ได้จริง

ยิงจากเครื่องที่อยู่วงเดียวกับเครื่องสแกน:

```bash
curl -i "http://<ที่อยู่ proxy>:8080/iclock/cdata?SN=TEST123"
```

| ผลที่ได้ | แปลว่า |
|---|---|
| `GET OPTION FROM: TEST123` พร้อมค่า config | ทางเดินครบแล้ว โทเคนถูก |
| `401` / `invalid device token` | โทเคนสองไฟล์ไม่ตรงกัน |
| `444` / ไม่มีคำตอบ | ผิด path หรือถูก IP allowlist ปัดตก |
| ต่อไม่ติด | firewall / พอร์ตไม่ได้ map |

ส่งข้อมูลสแกนทดสอบ (ATTLOG คั่นด้วย tab):

```bash
printf '1\t2026-08-25 08:01:25\t0\t1\n' | \
  curl -i --data-binary @- \
  "http://<ที่อยู่ proxy>:8080/iclock/cdata?SN=<SN จริงของเครื่อง>&table=ATTLOG"
```

ได้ `OK: 1` = backend รับแล้ว ถ้าได้ `500` แปลว่ายังไม่ได้เพิ่มเครื่องที่มี SN นี้
ในหน้า ตั้งค่า › การลงเวลา › เครื่องสแกน (ข้อมูลไม่หาย เครื่องจะยิงซ้ำให้เอง
หลังเพิ่ม SN ถูกแล้ว)

## ข้อควรระวัง

- **อย่าเปิดพอร์ต 8080 ออกอินเทอร์เน็ต** เครื่องสแกนพูด HTTP ล้วน
  ต่อ TLS ไม่ได้ ให้อยู่วงเดียวกันหรือลากผ่าน VPN
- เปิด IP allowlist ในไฟล์ conf ด้วยถ้าทำได้ — เป็นด่านที่สองต่อจากโทเคน
- `ATTENDANCE_DEVICE_PUSH_ALLOWED_IPS` ใน `backend/.env` เป็นด่านเดียวกัน
  แต่ตรวจที่ backend ใช้ควบคู่กันได้ ต้องตั้ง `TRUST_PROXY=true` ด้วย
  ไม่งั้น backend เห็นแต่ IP ของ proxy ตัวนี้ทุกคำขอ
