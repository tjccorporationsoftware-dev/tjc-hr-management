#!/bin/sh
#
# สำรองข้อมูลระบบจริง — รันจาก "เครื่องโฮสต์" ไม่ใช่ในคอนเทนเนอร์
#
#   ./scripts/backup-host.sh
#
# ## ทำไมต้องมีไฟล์นี้ ทั้งที่มี backend/scripts/backup.ts อยู่แล้ว
#
# ใช้เฉพาะกรณีที่ยกระบบไปรันบน Linux ด้วย Docker เอง — การติดตั้งจริงบน Windows Server
# ใช้ backend/scripts/backup.ts ผ่าน Scheduled Task ตาม DEPLOYMENT-WINDOWS.md แทน
#
# backup.ts เรียก `docker exec ... pg_dump` ซึ่งในคอนเทนเนอร์ backend ไม่มีคำสั่ง
# docker จึงรันจากในคอนเทนเนอร์ไม่ได้ และถ้ารันจากโฮสต์ก็ยังหาไฟล์ที่ผู้ใช้อัปโหลด
# ไม่เจอ เพราะ compose ฝั่ง Docker เก็บไว้เป็น named volume ไม่ใช่โฟลเดอร์บนโฮสต์
# ไฟล์นี้จึงทำงานผ่าน docker ล้วน ๆ ไม่ต้องมี node หรือ pg_dump บนโฮสต์เลย
#
# backup.ts ยังใช้ได้ตามเดิมบนเครื่องพัฒนาที่ผูกโฟลเดอร์ตรง ๆ
#
# ## กู้คืน
#   docker exec -i hr_postgres_prod pg_restore -U hr_admin -d hr_workforce \
#     --clean --if-exists < backups/<วันที่>/database.dump
#   docker run --rm --volumes-from hr_backend -v "$PWD/backups/<วันที่>:/b" \
#     alpine tar xzf /b/files.tar.gz -C /

set -eu

BACKUP_ROOT="${BACKUP_ROOT:-./backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
DB_CONTAINER="${POSTGRES_CONTAINER_NAME:-hr_postgres_prod}"
APP_CONTAINER="${BACKEND_CONTAINER_NAME:-hr_backend}"
DB_USER="${POSTGRES_USER:-hr_admin}"
DB_NAME="${POSTGRES_DB:-hr_workforce}"

STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="$BACKUP_ROOT/backup-$STAMP"

# ล้มทันทีถ้าคอนเทนเนอร์ไม่ได้รันอยู่ ดีกว่าได้ไฟล์สำรองเปล่า ๆ แล้วเพิ่งรู้ตอนจะกู้
for container in "$DB_CONTAINER" "$APP_CONTAINER"; do
  if [ -z "$(docker ps -q -f "name=^${container}$")" ]; then
    echo "ไม่พบคอนเทนเนอร์ที่รันอยู่: $container" >&2
    exit 1
  fi
done

mkdir -p "$TARGET"
echo "สำรองข้อมูลไปที่ $TARGET"

# --- ฐานข้อมูล ---------------------------------------------------------------
# -Fc = รูปแบบบีบอัดของ pg_dump กู้ด้วย pg_restore ได้ทีละตาราง
# --no-owner / --no-acl ให้กู้ขึ้นเครื่องที่ชื่อผู้ใช้ฐานข้อมูลต่างกันได้
echo "  ฐานข้อมูล..."
docker exec "$DB_CONTAINER" \
  pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc --no-owner --no-acl \
  > "$TARGET/database.dump"

# ไฟล์ dump ที่ว่างแปลว่า pg_dump ล้มแต่ท่อไม่ได้บอก — ต้องดักเอง
if [ ! -s "$TARGET/database.dump" ]; then
  echo "ไฟล์สำรองฐานข้อมูลว่างเปล่า — ยกเลิก" >&2
  rm -rf "$TARGET"
  exit 1
fi

# --- ไฟล์ที่ผู้ใช้อัปโหลด --------------------------------------------------------
# --volumes-from ทำให้เห็น volume ชุดเดียวกับ backend โดยไม่ต้องเดาชื่อ volume
# (compose เติมชื่อโปรเจกต์นำหน้าให้ ชื่อจริงจึงไม่ใช่ hr_uploads ตรง ๆ)
#
# ไม่เก็บ storage/exports กับ storage/temp เพราะเป็นไฟล์ที่ระบบสร้างใหม่ได้
echo "  ไฟล์อัปโหลด..."
docker run --rm \
  --volumes-from "$APP_CONTAINER" \
  -v "$(pwd)/$TARGET:/backup" \
  alpine:3.20 \
  tar czf /backup/files.tar.gz \
    --exclude='app/storage/exports' \
    --exclude='app/storage/temp' \
    -C / app/uploads app/storage

# --- ลบของเก่า ---------------------------------------------------------------
if [ "$KEEP_DAYS" -gt 0 ]; then
  echo "  ลบไฟล์สำรองที่เก่ากว่า $KEEP_DAYS วัน..."
  find "$BACKUP_ROOT" -maxdepth 1 -type d -name 'backup-*' -mtime "+$KEEP_DAYS" \
    -exec rm -rf {} +
fi

echo "เสร็จ: $(du -sh "$TARGET" | cut -f1)"
