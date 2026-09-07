import type { NotificationItem } from '../../notifications/types/notification.types';

/**
 * แจ้งเตือนหนึ่งรายการสำหรับมือถือ
 *
 * ส่ง `actor` ต่อไปด้วย (ชื่อ + รูป) เพราะรายการที่มีคนเกี่ยวข้องจริง เช่น
 * "ผดุงเดช อนุมัติใบลาของคุณแล้ว" อ่านเร็วกว่ามากเมื่อเห็นหน้าคนพร้อมข้อความ
 * — และช่วยแยกออกทันทีว่ารายการไหนมาจากคน รายการไหนระบบสร้างเอง (มาสาย
 * เวลาไม่ครบ) ซึ่งไม่มี actor
 *
 * ไม่ส่ง `href` ของเว็บ เพราะเส้นทางในแอปตัดสินจาก entityType + type ฝั่งมือถือ
 */
export function toMobileNotificationItem(item: NotificationItem) {
  return {
    actor: item.actor
      ? {
          avatarUrl: item.actor.avatarUrl ?? null,
          departmentName: item.actor.departmentName ?? null,
          displayName: item.actor.displayName,
          employeeCode: item.actor.employeeCode ?? null,
          position: item.actor.position ?? null,
        }
      : null,
    createdAt: item.createdAt ?? null,
    entityId: item.entityId ?? null,
    entityType: item.entityType ?? null,
    id: item.id ?? item.key,
    message: item.message,
    readAt: item.readAt ?? null,
    severity: item.severity,
    title: item.title,
    type: item.type ?? null,
  };
}
