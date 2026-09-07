-- ผู้ใช้ปิดแจ้งเตือนเข้ามือถือเป็นรายหมวดได้
--
-- เก็บเฉพาะแถวที่ผู้ใช้แตะแล้ว ไม่มีแถว = เปิดอยู่ ซึ่งทำให้หมวดที่เพิ่มทีหลัง
-- เปิดให้ทุกคนโดยอัตโนมัติ ไม่ใช่ปิดเงียบ ๆ ให้คนที่สมัครไว้ก่อน

CREATE TABLE "mobile_push_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobile_push_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mobile_push_preferences_userId_category_key"
    ON "mobile_push_preferences"("userId", "category");

CREATE INDEX "mobile_push_preferences_userId_idx"
    ON "mobile_push_preferences"("userId");

ALTER TABLE "mobile_push_preferences"
    ADD CONSTRAINT "mobile_push_preferences_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
