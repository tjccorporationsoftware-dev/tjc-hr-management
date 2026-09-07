import { BadRequestException } from '@nestjs/common';

import type { PrismaService } from '../../database/prisma.service';

/**
 * รับได้ทั้ง prisma ปกติและ client ในทรานแซกชัน
 * บางที่ต้องตรวจ "หลังลบลูกไปแล้ว" ซึ่งทำได้เฉพาะในทรานแซกชันเดียวกัน
 */
type DbClient = Pick<PrismaService, '$queryRaw' | '$queryRawUnsafe'>;

/*
 * ลบจริง — ไม่มีถังขยะ
 * -----------------------------------------------------------------------------
 * ข้อมูลตั้งค่า/ทะเบียน (ตำแหน่ง สาขา แผนก เครื่องสแกน นโยบาย ฯลฯ) กดลบแล้วต้อง
 * หายจากฐานข้อมูลจริง ไม่ใช่ประทับ deletedAt ทิ้งไว้
 *
 * ทำไมต้องมีตัวกลางแทนการไล่เขียนเช็คทีละตาราง
 * -------------------------------------------
 * ระบบมีความสัมพันธ์แบบห้ามลบ (Restrict/NoAction) อยู่หลายสิบเส้น ถ้าไล่เขียนเอง
 * ทุกจุดจะลืมบางเส้นแน่นอน และพอเพิ่มตารางใหม่ในอนาคตก็ต้องกลับมาไล่เพิ่มอีก
 * ตัวนี้ถามจากแคตตาล็อกของ Postgres ตรง ๆ ว่า "ตอนนี้มีตารางไหนชี้มาที่แถวนี้บ้าง"
 * จึงครบตามสคีมาจริงเสมอโดยไม่ต้องมีใครจำ
 *
 * มีแค่ Cascade เท่านั้นที่ไม่นับเป็นตัวขวาง เพราะเป็นลูกของแถวนี้เอง
 * (เช่น ขั้นอนุมัติใต้สายอนุมัติ) ลบพร้อมกันคือพฤติกรรมที่ถูกต้องอยู่แล้ว
 *
 * SetNull ต้องนับเป็นตัวขวางด้วย
 * ------------------------------
 * เคยคิดว่าปล่อยให้ฐานข้อมูลล้างค่าให้ได้ แต่ผลจริงคือลบแผนกหนึ่งแล้วพนักงาน
 * 7 คนกลายเป็น "ไม่มีแผนก" กับประวัติการทำงานอีก 25 แถวขาดต้นทาง/ปลายทาง
 * โดยไม่มีอะไรเตือนสักบรรทัด — ข้อมูลไม่ได้หายเป็นแถว แต่ความหมายหายไปเงียบ ๆ
 * ซึ่งแย่กว่าลบไม่ได้ ถ้าจะลบจริงต้องย้ายคนออกก่อน แล้วค่อยลบ
 */

type ForeignKeyRow = {
  childTable: string;
  childColumn: string;
  onDelete: string;
};

/** ชื่อไทยของตารางที่มักเป็นตัวขวาง ใช้บอกผู้ใช้ว่าติดอะไรอยู่ */
const TABLE_LABELS: Record<string, string> = {
  employees: 'พนักงาน',
  branches: 'สาขา',
  departments: 'แผนก',
  divisions: 'ฝ่าย/ส่วนงาน',
  positions: 'ตำแหน่ง',
  employee_types: 'ประเภทพนักงาน',
  attendance_logs: 'รายการลงเวลา',
  attendance_devices: 'เครื่องสแกน',
  attendance_locations: 'จุดลงเวลา',
  attendance_policies: 'กะการทำงาน',
  attendance_daily_summaries: 'สรุปเวลาทำงานรายวัน',
  attendance_device_enrollments: 'การผูกพนักงานกับเครื่องสแกน',
  leave_requests: 'ใบลา',
  leave_types: 'ประเภทการลา',
  leave_policies: 'นโยบายวันลา',
  leave_balances: 'ยอดวันลา',
  overtime_requests: 'คำขอ OT',
  overtime_policies: 'นโยบาย OT',
  payroll_periods: 'งวดเงินเดือน',
  payroll_runs: 'รอบคำนวณเงินเดือน',
  payroll_items: 'รายการเงินเดือน',
  payroll_components: 'รายการรายได้/รายหัก',
  employee_compensations: 'ฐานเงินเดือนพนักงาน',
  approval_matrices: 'สายอนุมัติ',
  holiday_calendars: 'ปฏิทินวันหยุด',
  companies: 'บริษัท',
  Company: 'บริษัท',
  Branch: 'สาขา',
  Department: 'แผนก',
  Division: 'ฝ่าย/ส่วนงาน',
  Position: 'ตำแหน่ง',
  EmployeeType: 'ประเภทพนักงาน',
  Employee: 'พนักงาน',
  User: 'ผู้ใช้งาน',
};

function labelOf(table: string) {
  return TABLE_LABELS[table] ?? table;
}

/**
 * ตารางที่ชี้มาที่ตารางนี้แบบ "ห้ามลบถ้ายังมีลูกอยู่"
 * อ่านจากแคตตาล็อกของ Postgres จึงตรงกับสคีมาจริงเสมอ
 */
/**
 * กันพิมพ์ชื่อตารางผิด
 *
 * ชื่อตารางจริงไม่ได้เดาจากชื่อโมเดลได้ทั้งหมด — โมเดลที่ไม่ได้ประกาศ @@map
 * จะใช้ชื่อเดิมแบบ PascalCase (Position, EmployeeType) ส่วนที่ประกาศไว้จะเป็น
 * snake_case ถ้าส่งชื่อผิดแล้วปล่อยผ่าน ตัวตรวจจะไม่เจอความสัมพันธ์สักเส้น
 * แล้ว "ลบได้หมด" เงียบ ๆ ซึ่งอันตรายกว่าพังตรง ๆ
 */
async function assertTableExists(prisma: DbClient, table: string) {
  const rows = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT COUNT(*)::int AS n
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${table}
  `;

  if (Number(rows[0]?.n ?? 0) === 0) {
    throw new Error(
      `[hard-delete] ไม่พบตาราง "${table}" ในฐานข้อมูล — ตรวจชื่อตารางที่ส่งเข้ามา`,
    );
  }
}

async function findBlockingForeignKeys(
  prisma: DbClient,
  table: string,
): Promise<ForeignKeyRow[]> {
  return prisma.$queryRaw<ForeignKeyRow[]>`
    SELECT
      child."relname" AS "childTable",
      att."attname" AS "childColumn",
      /* char ของ Postgres ต้อง cast เป็น text ไม่งั้น Prisma อ่านคอลัมน์นี้ไม่ออก */
      con."confdeltype"::text AS "onDelete"
    FROM pg_constraint con
    JOIN pg_class parent ON parent.oid = con.confrelid
    JOIN pg_class child ON child.oid = con.conrelid
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid
     AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f'
      AND parent.relname = ${table}
      /*
       * c = cascade คือลูกของแถวนี้เอง ลบตามได้
       * ที่เหลือ (a/r = ห้ามลบ, n = ล้างเป็น NULL, d = คืนค่าตั้งต้น) นับเป็นตัวขวางหมด
       */
      AND con.confdeltype <> 'c'
      AND array_length(con.conkey, 1) = 1
  `;
}

/**
 * ตรวจว่ามีข้อมูลอื่นอ้างถึงแถวนี้อยู่ไหม ถ้ามีให้หยุดพร้อมบอกว่าติดอะไร
 *
 * @param table ชื่อตารางจริงในฐานข้อมูล (ตามที่ @@map ไว้)
 * @param subject คำเรียกสิ่งที่กำลังลบ ใช้ประกอบข้อความ เช่น "แผนกนี้"
 */
export async function assertNotReferenced(
  prisma: DbClient,
  table: string,
  id: string,
  subject: string,
) {
  await assertTableExists(prisma, table);

  const foreignKeys = await findBlockingForeignKeys(prisma, table);
  const blockers: string[] = [];

  for (const fk of foreignKeys) {
    const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint | number }>>(
      `SELECT COUNT(*)::int AS n FROM "${fk.childTable}" WHERE "${fk.childColumn}" = $1`,
      id,
    );

    const count = Number(rows[0]?.n ?? 0);
    if (count > 0) {
      blockers.push(
        `${labelOf(fk.childTable)} ${count.toLocaleString('th-TH')} รายการ`,
      );
    }
  }

  if (blockers.length === 0) return;

  throw new BadRequestException(
    `ลบ${subject}ไม่ได้ เพราะยังมี${blockers.join(' · ')} ผูกอยู่ — ย้ายหรือลบข้อมูลเหล่านั้นก่อน`,
  );
}
