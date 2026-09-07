import { Injectable } from '@nestjs/common';

import {
  AttendanceChannel,
  AttendanceLogType,
  DataImportType,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AttendanceSummaryQueueService } from '../../attendance/attendance-summary-queue.service';
import { parseImportDate, splitCodeAndName } from '../utils/data-import-value.util';
import { readCell } from '../utils/data-import-mapping.util';
import type {
  DataImportCommitParams,
  DataImportDataset,
  DataImportFieldDef,
  DataImportPreparedRow,
  DataImportPrepareParams,
} from './data-import-dataset.types';

/**
 * รอบลงเวลาที่ระบบใช้อยู่ — ไม่ได้เพิ่มของใหม่ ใช้ชุดเดิมของตัวคำนวณ
 *
 * ระวังสับสน: ระบบมีชื่อรอบอยู่สองชุดคนละที่
 *   - `AttendanceSessionRule.sessionCode` (กติกา) = MORNING_IN / AFTERNOON_IN / CHECK_OUT
 *   - `AttendanceLog.session` (รอยสแกน)   = MORNING / AFTERNOON / EVENING / CUSTOM
 * ตรงนี้คือชุดหลัง เพราะเรากำลังเขียน AttendanceLog
 *
 * ตัวคำนวณจับคู่ด้วยค่าตรงตัว (`findSessionLog` เทียบ session === 'MORNING')
 * ถ้าใส่ชื่อของกติกาลงไป มันจะหาการเข้างานไม่เจอ แล้วตีเป็นลืมสแกนทั้งเดือน
 * โดยไม่มี error ให้เห็น — และ fallback ที่เดาจากเวลาก็ไม่ช่วย เพราะมันรับเฉพาะ
 * log ที่ไม่มี session เท่านั้น
 */
type AttendanceSession = 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM';

/** เวลาหนึ่งช่องในไฟล์ พร้อมบอกว่ามาจากคอลัมน์ IN หรือ OUT */
type RawPunch = {
  time: string;
  isIn: boolean;
};

type ImportedPunch = {
  session: AttendanceSession;
  /** "HH:mm" ตามที่อยู่ในไฟล์ */
  time: string;
};

type AttendanceImportPayload = {
  employeeId: string;
  employeeCode: string;
  workDate: string;
  punches: ImportedPunch[];
};

/** ช่องเวลาแตะบัตรในไฟล์รายงาน สลับ IN/OUT ไปเรื่อย ๆ */
const PUNCH_FIELD_COUNT = 6;

/**
 * ช่วงเวลาที่ยอมรับว่าเป็น "รอยเข้างานบ่าย" — เทียบเป็นสตริง "HH:mm" ได้เลย
 * กว้างพอคลุมทั้งกะ 08:00-17:00 (รอบบ่ายเปิด 12:00 ปิด 16:59) และกะ 07:30-16:30
 * (เปิด 11:30) รอยที่หลุดช่วงนี้ไม่ใช่การกลับจากพักเที่ยง
 */
const AFTERNOON_WINDOW_START = '11:30';
const AFTERNOON_WINDOW_END = '16:59';

/**
 * แหล่งที่มาของ log ที่มาจากการนำเข้าไฟล์
 *
 * ต้องแยกจาก log ที่มาจากเครื่องสแกน/เว็บ/แอป เพราะการนำเข้าไฟล์เดิมซ้ำต้องลบ
 * ของรอบก่อนทิ้งก่อนเขียนใหม่ ถ้าไม่แยกไว้จะไปลบเวลาที่พนักงานแตะจริงทิ้งด้วย
 */
const IMPORT_SOURCE = 'IMPORT';

function buildPunchFields(): DataImportFieldDef[] {
  return Array.from({ length: PUNCH_FIELD_COUNT }, (_, index) => {
    const order = index + 1;

    /*
     * หัวคอลัมน์ในไฟล์สลับ IN/OUT ซ้ำกันทั้งแถว จับคู่อัตโนมัติจึงอาศัยว่า
     * buildAutoMapping กินคอลัมน์ทีละช่องตามลำดับฟิลด์ (คอลัมน์ที่ใช้แล้วไม่ถูกใช้ซ้ำ)
     * ประกาศสลับ IN/OUT ให้ตรงกับไฟล์ คอลัมน์จึงถูกจับเรียงกันไปเอง
     */
    const alias = order % 2 === 1 ? 'IN' : 'OUT';

    return {
      key: `punch${order}`,
      label: `เวลาแตะบัตรครั้งที่ ${order}`,
      aliases: [alias],
      type: 'TEXT' as const,
      hint:
        order === 1
          ? 'ครั้งแรกของวัน = เข้างานเช้า'
          : 'เว้นว่างได้ถ้าวันนั้นแตะไม่ครบ',
    };
  });
}

/**
 * นำเข้าเวลาเข้า-ออกงานจากไฟล์รายงานของระบบเดิม
 * -----------------------------------------------------------------------------
 * เขียนเฉพาะ "เวลาที่แตะบัตร" ลง AttendanceLog เท่านั้น ไม่ได้เขียนสาย/ขาด/OT
 * ที่ระบบเดิมคำนวณมาให้ เพราะสองระบบคิดไม่เหมือนกัน (ระบบเดิมคิดประกันสังคม
 * จากฐานเต็ม และอัตรา OT ต่ำกว่าที่กฎหมายกำหนด) ถ้ายกตัวเลขเดิมมาใส่จะได้
 * ข้อมูลสองมาตรฐานปนกันโดยไม่มีใครรู้
 *
 * หลังเขียน log แล้วสั่งให้ตัวคำนวณเดิมสรุปเวลารายวันใหม่ ผลจึงออกมาด้วยกติกา
 * ชุดเดียวกับที่ใช้กับเครื่องสแกนทุกวัน — ไม่ได้แก้ระบบลงเวลาแต่อย่างใด
 *
 * โครงไฟล์ที่รองรับ (รายงานตารางเวลาการทำงาน):
 *   แถวคั่น  "670028 : สุภาพร สองเมือง ..."  ← บอกว่าแถวถัดไปเป็นของใคร
 *   แถวข้อมูล (ว่าง) | วันที่ | สถานะ | กะ | IN | OUT | IN | OUT | ...
 */
@Injectable()
export class AttendanceImportDataset implements DataImportDataset {
  readonly type = DataImportType.ATTENDANCE;
  readonly label = 'เวลาเข้า-ออกงาน';
  readonly description =
    'นำเข้าเวลาแตะบัตรรายวันจากรายงานระบบเดิม แล้วให้ระบบคำนวณสาย/ขาด/OT ใหม่ตามกติกาของระบบนี้';

  readonly fields: DataImportFieldDef[] = [
    {
      key: 'employee',
      label: 'พนักงาน (รหัส : ชื่อ)',
      required: true,
      aliases: ['ชื่อ-นามสกุล', 'ชื่อ - นามสกุล', 'พนักงาน', 'รหัสพนักงาน'],
      type: 'TEXT',
      hint: 'คอลัมน์ที่มีแถวคั่นแบบ "670028 : สุภาพร สองเมือง"',
    },
    {
      key: 'workDate',
      label: 'วันที่',
      required: true,
      aliases: ['วันที่', 'วันที่ทำงาน'],
      type: 'DATE',
    },
    {
      key: 'dayStatus',
      label: 'สถานะของวัน',
      aliases: ['สถานะ'],
      type: 'TEXT',
      hint: 'เช่น วันทำงาน / วันหยุดพนักงาน — ใช้แสดงในพรีวิวเท่านั้น',
    },
    ...buildPunchFields(),
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceSummaryQueue: AttendanceSummaryQueueService,
  ) {}

  async prepare({
    rows,
    headerRowIndex,
    mapping,
    companyId,
  }: DataImportPrepareParams): Promise<DataImportPreparedRow[]> {
    const employees = await this.loadEmployeesByCode(companyId);
    const prepared: DataImportPreparedRow[] = [];

    /*
     * ไฟล์เป็นแบบแบ่งเป็นบล็อกต่อคน ไม่ได้มีรหัสพนักงานอยู่ทุกแถว
     * จึงต้องจำ "คนล่าสุดที่เจอ" แล้วใช้กับแถววันที่ที่ตามมา
     */
    let currentCode: string | null = null;
    let currentName = '';

    for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
      const row = rows[index] ?? [];
      const rowNo = index + 1;

      const employeeCell = readCell(row, mapping, 'employee');
      const rawDate = readCell(row, mapping, 'workDate');
      const workDate = rawDate ? parseImportDate(rawDate) : null;

      /*
       * แถวคั่นชื่อคน: ช่องพนักงานเป็น "รหัส : ชื่อ" และช่องวันที่อ่านเป็นวันที่ไม่ได้
       *
       * เดิมเช็คว่า "ช่องวันที่ต้องว่าง" ซึ่งใช้ไม่ได้กับไฟล์จริง เพราะแถวคั่นเป็น
       * เซลล์ที่ผสานทั้งแถว ตัวอ่านจึงกระจายข้อความเดิมลงทุกคอลัมน์ ช่องวันที่เลย
       * ไม่เคยว่าง ผลคือไม่มีแถวไหนถูกนับเป็นแถวคั่น ทั้งไฟล์ขึ้นว่า
       * "ไม่รู้ว่าแถวนี้เป็นของพนักงานคนไหน"
       */
      if (employeeCell && !workDate) {
        const { code, name } = splitCodeAndName(employeeCell);

        if (code) {
          currentCode = code;
          currentName = name;
          continue;
        }
      }

      if (!rawDate) continue;
      const punches = this.readPunches(row, mapping);
      const dayStatus = readCell(row, mapping, 'dayStatus');

      /*
       * แถวสรุปท้ายบล็อกของแต่ละคน เช่น "รวมเป็นชั่วโมง" — ไม่ใช่วันทำงาน
       *
       * อ่านเป็นวันที่ไม่ได้และไม่มีเวลาแตะบัตรสักช่อง จึงไม่มีอะไรให้เขียน
       * ถ้าปล่อยให้เป็น error ไฟล์ทุกเดือนจะติดค้าง 1 แถวต่อคนโดยไม่มีอะไรผิดจริง
       * ส่วนแถวที่วันที่อ่านไม่ออกแต่ "มี" เวลาแตะบัตร ยังต้องเป็น error เหมือนเดิม
       * เพราะนั่นคือข้อมูลที่กำลังจะหายไปเงียบ ๆ
       */
      if (!workDate && punches.length === 0) {
        prepared.push({
          rowNo,
          key: `${currentCode ?? 'unknown'}-${rawDate}`,
          title: `${currentName || currentCode || 'ไม่ทราบชื่อ'} · ${rawDate}`,
          action: 'SKIP',
          values: { สถานะ: rawDate, เวลา: 'แถวสรุป ไม่ใช่วันทำงาน' },
          errors: [],
          warnings: [],
          payload: null,
        });

        continue;
      }

      const errors: string[] = [];
      const warnings: string[] = [];

      if (!currentCode) {
        errors.push('ไม่รู้ว่าแถวนี้เป็นของพนักงานคนไหน (ไม่เจอแถวคั่นชื่อก่อนหน้า)');
      }

      if (!workDate) {
        errors.push(`อ่านวันที่ "${rawDate}" ไม่ออก`);
      }

      const employee = currentCode ? employees.get(currentCode) : undefined;

      if (currentCode && !employee) {
        errors.push(`ไม่พบพนักงานรหัส ${currentCode} ในบริษัทนี้`);
      }

      const sessions = this.assignSessions(punches);

      if (punches.length > 3) {
        warnings.push(
          `วันนี้แตะบัตร ${punches.length} ครั้ง — ใช้ครั้งแรกเป็นเข้าเช้า ครั้งสุดท้ายเป็นออกงาน ที่เหลือถือเป็นเข้าบ่าย`,
        );
      }

      const title = `${currentName || currentCode || 'ไม่ทราบชื่อ'} · ${rawDate}`;

      /*
       * วันที่ไม่มีเวลาแตะบัตรเลย (วันหยุด หรือผู้บริหารที่ไม่ต้องลงเวลา)
       * ต้องข้ามไปเฉย ๆ ห้ามเขียนอะไรลงไป ไม่งั้นจะกลายเป็นขาดงานเทียม
       */
      if (!errors.length && sessions.length === 0) {
        prepared.push({
          rowNo,
          key: `${currentCode}-${rawDate}`,
          title,
          action: 'SKIP',
          values: { สถานะ: dayStatus || '-', เวลา: 'ไม่มีการแตะบัตร' },
          errors: [],
          warnings: [],
          payload: null,
        });

        continue;
      }

      prepared.push({
        rowNo,
        key: `${currentCode ?? 'unknown'}-${rawDate}`,
        title,
        action: errors.length ? 'ERROR' : 'CREATE',
        values: {
          สถานะ: dayStatus || '-',
          เข้างานเช้า: this.timeOf(sessions, 'MORNING'),
          เข้างานบ่าย: this.timeOf(sessions, 'AFTERNOON'),
          ออกงาน: this.timeOf(sessions, 'EVENING'),
        },
        errors,
        warnings,
        payload:
          errors.length || !employee || !workDate
            ? null
            : ({
                employeeId: employee.id,
                employeeCode: employee.employeeCode,
                workDate: workDate.toISOString(),
                punches: sessions,
              } satisfies AttendanceImportPayload),
      });
    }

    return prepared;
  }

  async commitRow({ row, actorId }: DataImportCommitParams): Promise<void> {
    const payload = row.payload as AttendanceImportPayload | null;

    if (!payload) return;

    const workDate = new Date(payload.workDate);

    await this.prisma.$transaction(async (tx) => {
      /*
       * ลบเฉพาะของที่เคยนำเข้าจากไฟล์ของวันเดียวกัน เพื่อให้นำเข้าซ้ำแล้วไม่ซ้อน
       * ไม่แตะเวลาที่พนักงานแตะจริงจากเครื่องสแกน/เว็บ/แอป
       */
      await tx.attendanceLog.deleteMany({
        where: {
          employeeId: payload.employeeId,
          workDate,
          source: IMPORT_SOURCE,
        },
      });

      await tx.attendanceLog.createMany({
        data: payload.punches.map((punch) => ({
          employeeId: payload.employeeId,
          workDate,
          logType:
            punch.session === 'EVENING'
              ? AttendanceLogType.CHECK_OUT
              : AttendanceLogType.CHECK_IN,
          logTime: this.buildLogTime(workDate, punch.time, payload.punches[0]?.time),
          channel: AttendanceChannel.WEB,
          source: IMPORT_SOURCE,
          session: punch.session,
          note: 'นำเข้าจากไฟล์รายงานระบบเดิม',
        })),
      });
    });

    /*
     * ให้ตัวคำนวณเดิมสรุปเวลาของวันนั้นใหม่ — ตัวเดียวกับที่เครื่องสแกนใช้
     * ถ้าไม่สั่ง log จะถูกเขียนไว้เฉย ๆ แล้วหน้าตรวจเวลายังว่างเหมือนเดิม
     */
    await this.attendanceSummaryQueue.enqueueDailySummaryRecalculation({
      employeeId: payload.employeeId,
      // คิวรับวันที่เป็นสตริง YYYY-MM-DD
      workDate: workDate.toISOString().slice(0, 10),
      requestedById: actorId ?? 'SYSTEM',
      sourceType: 'MANUAL_RECALCULATE',
      sourceAction: 'DATA_IMPORT_ATTENDANCE',
    });
  }

  /** อ่านเวลาแตะบัตรทุกช่องตามลำดับ ทิ้งช่องที่ว่างหรือไม่ใช่เวลา */
  private readPunches(
    row: string[],
    mapping: DataImportPrepareParams['mapping'],
  ): RawPunch[] {
    const punches: RawPunch[] = [];

    for (let order = 1; order <= PUNCH_FIELD_COUNT; order += 1) {
      const raw = readCell(row, mapping, `punch${order}`);
      const match = /^(\d{1,2}):(\d{2})$/.exec(raw);

      if (!match) continue;

      const hour = Number(match[1]);
      const minute = Number(match[2]);

      if (hour > 23 || minute > 59) continue;

      punches.push({
        time: `${String(hour).padStart(2, '0')}:${match[2]}`,
        // หัวคอลัมน์ในไฟล์สลับ IN/OUT ช่องคี่คือเข้า ช่องคู่คือออก
        isIn: order % 2 === 1,
      });
    }

    return punches;
  }

  /**
   * แปลงลำดับการแตะบัตรเป็นรอบลงเวลาของระบบ
   *
   * ครั้งแรก = เข้างานเช้า · ครั้งสุดท้าย = ออกงาน · ที่เหลือคือรอยกลาง
   *
   * รอยกลางที่ตกอยู่ในช่วงเช็คอินบ่ายคือกลับจากพักเที่ยง = เข้างานบ่าย
   * ที่เหลือเก็บเป็น CUSTOM ตามที่เครื่องสแกนเขียน — ตัวคำนวณไม่หยิบไปใช้
   * แต่ต้องเก็บไว้ ไม่งั้นหน้าตรวจเวลาจะแสดงรอยสแกนไม่ครบตามไฟล์
   *
   * เดิมหยิบ "ช่อง IN ตัวท้ายสุดของรอยกลาง" ซึ่งพังกับวันที่แตะ 4 ครั้งแบบ
   * 07:57 12:09 17:25 17:37 (ออกพักเที่ยงแล้วไม่ได้แตะกลับ ตอนเย็นแตะสองที)
   * มันไปเลือก 17:25 เป็นเข้าบ่าย แล้วกลายเป็นสายบ่าย 245 นาทีทั้งที่ไม่ได้สาย
   * ถ้ารอยกลางไม่มีตัวไหนอยู่ในช่วงบ่ายเลย ให้ถือว่าวันนั้นไม่ได้แตะเข้าบ่าย
   * (เข้ากติกา "ลงเวลาไม่ครบ" ตามจริง ดีกว่าแปะเวลาเย็นเป็นเข้าบ่ายแล้วคิดสาย)
   *
   * แตะครั้งเดียวถือว่ามีแค่เข้างานเช้า ไม่เดาว่าออกงานตอนไหน
   */
  private assignSessions(punches: RawPunch[]): ImportedPunch[] {
    if (punches.length === 0) return [];

    if (punches.length === 1) {
      return [{ session: 'MORNING', time: punches[0].time }];
    }

    const middles = punches.slice(1, -1);

    /*
     * เลือกจากรอยกลางที่อยู่ในช่วงเช็คอินบ่ายเท่านั้น กว้างพอคลุมทั้งสองกะ
     * (กะ 08:00-17:00 เปิดรอบบ่าย 12:00 · กะ 07:30-16:30 เปิด 11:30)
     * ในกลุ่มนั้นเอาช่อง IN ตัวท้ายสุด = กลับจากพักเที่ยง ไม่มี IN ก็เอาตัวท้ายสุด
     */
    const inAfternoonWindow = (punch: RawPunch) =>
      punch.time >= AFTERNOON_WINDOW_START && punch.time <= AFTERNOON_WINDOW_END;

    let afternoonIndex = -1;
    for (let index = middles.length - 1; index >= 0; index -= 1) {
      if (!inAfternoonWindow(middles[index])) continue;
      if (afternoonIndex === -1) afternoonIndex = index;
      if (middles[index].isIn) {
        afternoonIndex = index;
        break;
      }
    }

    return [
      { session: 'MORNING' as const, time: punches[0].time },
      ...middles.map((punch, index): ImportedPunch => ({
        session: index === afternoonIndex ? 'AFTERNOON' : 'CUSTOM',
        time: punch.time,
      })),
      { session: 'EVENING' as const, time: punches[punches.length - 1].time },
    ];
  }

  private timeOf(punches: ImportedPunch[], session: AttendanceSession) {
    return punches.find((punch) => punch.session === session)?.time ?? '-';
  }

  /**
   * ประกอบวันที่กับเวลาแตะบัตรเป็นช่วงเวลาเดียว
   *
   * เวลาในไฟล์เป็นเวลาไทยตามหน้าปัด (07:50 = เจ็ดโมงห้าสิบที่ไทย) แต่ `logTime`
   * เก็บเป็นช่วงเวลาจริงในระบบ UTC เหมือนที่เครื่องสแกนเขียน — 06:29 ของวันที่ 25
   * ถูกเก็บเป็น 2026-08-24 23:29 จึงต้องระบุ +07:00 ให้ชัด
   *
   * เดิมบวกชั่วโมงลงบนเที่ยงคืน UTC ตรง ๆ ผลคือทุกคนถูกบันทึกช้าไป 7 ชั่วโมง
   * ตัวคำนวณอ่านเป็นเวลาไทยอีกที เข้างาน 07:50 จึงกลายเป็นสาย 410 นาทีทั้งบริษัท
   *
   * `firstTime` คือเวลาแตะบัตรครั้งแรกของวันนั้น ใช้จับวันข้ามเที่ยงคืน: กะดึก
   * ที่ออกงานตีสามอยู่ในแถวของวันก่อนหน้า ถ้าไม่ขยับวันให้ เวลาออกงานจะไปอยู่
   * ก่อนเวลาเข้างาน 21 ชั่วโมง
   */
  private buildLogTime(workDate: Date, time: string, firstTime?: string) {
    const dateKey = workDate.toISOString().slice(0, 10);
    const at = new Date(`${dateKey}T${time}:00.000+07:00`);

    // "HH:mm" เติมศูนย์หน้าแล้ว เทียบเป็นสตริงได้ตรงกับเทียบเป็นเวลา
    if (firstTime && time < firstTime) {
      return new Date(at.getTime() + 86_400_000);
    }

    return at;
  }

  private async loadEmployeesByCode(companyId: string) {
    const employees = await this.prisma.employee.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, employeeCode: true },
    });

    return new Map(
      employees.map((employee) => [employee.employeeCode, employee]),
    );
  }
}
