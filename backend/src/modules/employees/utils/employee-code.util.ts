import { BadRequestException, ConflictException } from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma/client";

/**
 * รหัสพนักงาน — กติกาเดียวทั้งระบบ
 * ================================
 * ตัวอักษรอังกฤษ (พิมพ์เล็ก/ใหญ่) กับตัวเลขเท่านั้น ห้ามมีเว้นวรรค ขีด จุด หรืออักขระพิเศษ
 *
 * เหตุผล: รหัสนี้กลายเป็น "ชื่อผู้ใช้" สำหรับเข้าเว็บและแอปแล้ว (ดู AuthService.login)
 * อักขระพิเศษทำให้พิมพ์ผิดง่าย (ขีดสั้น/ขีดยาว, ช่องว่างท้าย) และไปชนกับตัวคั่น
 * ในไฟล์ลงเวลา/ไฟล์นำเข้า ทุกทางเข้าที่รับรหัสจากคน (ฟอร์มแก้ไข, ไฟล์นำเข้า)
 * ต้องผ่าน assertValidEmployeeCode ส่วนตัวออกรหัสอัตโนมัติผลิตเฉพาะตัวเลข
 *
 * รูปแบบที่ออกให้อัตโนมัติ  {ปี พ.ศ. 2 หลัก}{ลำดับ 4 หลัก}   เช่น  690055
 * -----------------------------------------------------------------
 * เป็นรูปแบบเดียวกับทะเบียนจริงของลูกค้าที่นำเข้ามา (670028, 680007, 690034 ...)
 * ตัวออกรหัสจึงนับต่อจากเลขสูงสุดของปีนั้นในบริษัทนั้น ไม่ใช่เริ่มชุดใหม่
 *
 * รูปแบบเดิม {รหัสบริษัท}-{ปี}-{ลำดับ} (TJC-69-0001) เลิกใช้เพราะมีขีดคั่น
 * ฐานข้อมูลบังคับไม่ซ้ำแบบ UNIQUE(companyId, employeeCode) เลขจึงซ้ำข้ามบริษัทได้
 * โดยไม่ชนกัน (กรณีซ้ำ ตอนล็อกอินระบบจะขอให้ใช้อีเมลแทน)
 *
 * ปีในรหัสใช้ปีของ "วันเริ่มงาน" ไม่ใช่วันที่กดสร้าง เพื่อให้คนที่บันทึกย้อนหลัง
 * ได้รหัสตรงกับปีที่เข้าทำงานจริง และลำดับเริ่มนับใหม่ทุกปีของแต่ละบริษัท
 */

export const EMPLOYEE_CODE_PATTERN = /^[A-Za-z0-9]+$/;
export const EMPLOYEE_CODE_MAX_LENGTH = 20;
export const EMPLOYEE_CODE_RULE_MESSAGE =
  'รหัสพนักงานต้องเป็นตัวอักษรภาษาอังกฤษหรือตัวเลขเท่านั้น (ไม่มีเว้นวรรคหรืออักขระพิเศษ)';

export function isValidEmployeeCode(value: string) {
  return (
    value.length > 0 &&
    value.length <= EMPLOYEE_CODE_MAX_LENGTH &&
    EMPLOYEE_CODE_PATTERN.test(value)
  );
}

/** ตัดช่องว่างหัวท้ายแล้วตรวจกติกา — คืนค่าที่สะอาดแล้ว หรือโยน 400 */
export function assertValidEmployeeCode(value: string) {
  const code = value.trim();

  if (!code) {
    throw new BadRequestException('กรุณากรอกรหัสพนักงาน');
  }

  if (code.length > EMPLOYEE_CODE_MAX_LENGTH) {
    throw new BadRequestException(
      `รหัสพนักงานต้องยาวไม่เกิน ${EMPLOYEE_CODE_MAX_LENGTH} ตัวอักษร`,
    );
  }

  if (!EMPLOYEE_CODE_PATTERN.test(code)) {
    throw new BadRequestException(EMPLOYEE_CODE_RULE_MESSAGE);
  }

  return code;
}

const SEQUENCE_DIGITS = 4;

/** ปี พ.ศ. สองหลักท้าย — 2569 -> "69" */
function buddhistYearSuffix(date: Date) {
  return String((date.getFullYear() + 543) % 100).padStart(2, "0");
}

/** ส่วนนำของรหัสที่ออกอัตโนมัติ = ปี พ.ศ. สองหลัก (ไม่มีรหัสบริษัทหรือตัวคั่นอีกแล้ว) */
export function buildEmployeeCodePrefix(startDate: Date) {
  return buddhistYearSuffix(startDate);
}

/**
 * ออกรหัสถัดไปของบริษัทนั้น ๆ
 *
 * นับเฉพาะรหัสที่ตรงรูปแบบ {ปี}{ลำดับ 4 หลัก} ของปีเดียวกันในบริษัทเดียวกัน
 * รหัสรูปแบบอื่น (เช่น 3 หลักที่นำเข้ามา) ไม่ถูกนับ จะได้ไม่พาลำดับกระโดด
 */
export async function generateEmployeeCode(
  tx: Prisma.TransactionClient,
  params: { companyId: string; startDate: Date },
): Promise<string> {
  const prefix = buildEmployeeCodePrefix(params.startDate);
  const pattern = new RegExp(`^${prefix}(\\d{${SEQUENCE_DIGITS}})$`);

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

  if (next >= 10 ** SEQUENCE_DIGITS) {
    throw new ConflictException(
      "ไม่สามารถสร้างรหัสพนักงานอัตโนมัติได้ เนื่องจากลำดับรหัสของปีนี้เต็มแล้ว",
    );
  }

  return `${prefix}${String(next).padStart(SEQUENCE_DIGITS, "0")}`;
}
