import { Prisma } from '../../../generated/prisma/client';

/*
 * CurrentUserLike
 * ---------------------------------------------------------
 * รูปแบบ user payload ที่ได้จาก @CurrentUser()
 * บาง guard ส่ง id บาง guard ส่ง userId จึงต้องรองรับทั้งสองแบบ
 */
export type CurrentUserLike = {
  id?: string;
  userId?: string;
  email?: string;
};

/*
 * TimeAdjustRequestWithOriginalLog
 * ---------------------------------------------------------
 * ใช้ตอนอนุมัติคำขอแก้เวลา เพราะต้องรู้ว่าคำขอนี้แก้ log เดิม
 * หรือสร้าง attendance log ใหม่
 */
export type TimeAdjustRequestWithOriginalLog =
  Prisma.TimeAdjustRequestGetPayload<{
    include: {
      originalAttendanceLog: true;
    };
  }>;
