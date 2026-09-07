import { ConflictException } from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma/client";

/**
 * รหัสพนักงาน — ออกแบบรายบริษัท
 * =============================
 * รูปแบบ  {รหัสบริษัท}-{ปี พ.ศ. 2 หลัก}-{ลำดับ 4 หลัก}   เช่น  TJC-69-0001
 *
 * ทำไมต้องมีรหัสบริษัทนำหน้า
 * --------------------------
 * ฐานข้อมูลบังคับไม่ซ้ำแบบ UNIQUE(companyId, employeeCode) อยู่แล้ว รหัสจึงซ้ำ
 * ข้ามบริษัทได้โดยไม่ชนกัน แต่ตัวออกรหัสเดิมไล่หาเลขสูงสุด "จากทั้งแพลตฟอร์ม"
 * บริษัทที่เปิดทีหลังจึงได้เลขต่อจากบริษัทอื่น เช่นคนแรกได้ EMP-0013
 *
 * นอกจากดูแปลกแล้วยังรั่วข้อมูลข้ามบริษัท — เห็นรหัสตัวเองก็เดาได้ว่าทั้งระบบ
 * มีพนักงานไปแล้วกี่คน และยังต้องโหลดรหัสพนักงานทุกแถวทั้งระบบมานับทุกครั้ง
 *
 * ปีในรหัสใช้ปีของ "วันเริ่มงาน" ไม่ใช่วันที่กดสร้าง เพื่อให้คนที่บันทึกย้อนหลัง
 * ได้รหัสตรงกับปีที่เข้าทำงานจริง และลำดับเริ่มนับใหม่ทุกปีของแต่ละบริษัท
 */

export const LEGACY_EMPLOYEE_CODE_PREFIX = "EMP-";
const SEQUENCE_DIGITS = 4;

/** ปี พ.ศ. สองหลักท้าย — 2569 -> "69" */
function buddhistYearSuffix(date: Date) {
  return String((date.getFullYear() + 543) % 100).padStart(2, "0");
}

function normalizeCompanyCode(code?: string | null) {
  const trimmed = code?.trim().toUpperCase();
  if (!trimmed) return null;

  // กันอักขระที่ทำให้รหัสอ่านยากหรือไปชนกับตัวคั่น
  return trimmed.replace(/[^A-Z0-9]/g, "") || null;
}

export function buildEmployeeCodePrefix(
  companyCode: string | null,
  startDate: Date,
) {
  const normalized = normalizeCompanyCode(companyCode);

  // บริษัทที่ยังไม่ตั้งรหัส ถอยไปใช้รูปแบบเดิม จะได้ยังสร้างพนักงานได้
  if (!normalized) return LEGACY_EMPLOYEE_CODE_PREFIX;

  return `${normalized}-${buddhistYearSuffix(startDate)}-`;
}

/**
 * ออกรหัสถัดไปของบริษัทนั้น ๆ
 *
 * นับเฉพาะรหัสที่ขึ้นต้นด้วย prefix เดียวกันและอยู่ในบริษัทเดียวกัน
 * ลำดับจึงเริ่มที่ 0001 เสมอสำหรับบริษัทใหม่หรือปีใหม่
 */
export async function generateEmployeeCode(
  tx: Prisma.TransactionClient,
  params: { companyId: string; companyCode: string | null; startDate: Date },
): Promise<string> {
  const prefix = buildEmployeeCodePrefix(params.companyCode, params.startDate);
  const pattern = new RegExp(
    `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)$`,
  );

  const rows = await tx.employee.findMany({
    where: {
      companyId: params.companyId,
      employeeCode: { startsWith: prefix },
    },
    select: { employeeCode: true },
  });

  let highest = 0;

  for (const row of rows) {
    const matched = pattern.exec(row.employeeCode);
    if (!matched) continue;

    const value = Number.parseInt(matched[1], 10);
    if (Number.isSafeInteger(value) && value > highest) highest = value;
  }

  const next = highest + 1;

  if (!Number.isSafeInteger(next)) {
    throw new ConflictException(
      "ไม่สามารถสร้างรหัสพนักงานอัตโนมัติได้ เนื่องจากลำดับรหัสเกินขอบเขตที่รองรับ",
    );
  }

  return `${prefix}${String(next).padStart(SEQUENCE_DIGITS, "0")}`;
}
