# manual-sql

โฟลเดอร์นี้เก็บ SQL ที่ไม่ได้เป็น Prisma production migration โดยตรง

- `legacy-add/` = SQL เก่าที่เคยเพิ่ม field/table แบบ manual
- `repair/` = SQL ซ่อมกรณี object มีอยู่แล้ว แต่ Prisma migration history ยังไม่ applied
- `migration-history/` = SQL ตรวจ/ซ่อม `_prisma_migrations`

ห้ามเอาไฟล์เหล่านี้กลับไปปนใน `prisma/migrations/`
