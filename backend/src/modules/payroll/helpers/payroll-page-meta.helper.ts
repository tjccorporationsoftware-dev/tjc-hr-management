/**
 * Payroll page-meta helper
 *
 * ใช้สร้าง meta สำหรับ response แบบ pagination ใน Payroll module
 * เพื่อให้ทุก endpoint คืนรูปแบบ page/pageSize/total/totalPages เหมือนกัน
 */
export function toPageMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}
