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

/**
 * ช่องเวลาแตะบัตรในไฟล์รายงาน สลับ IN/OUT ไปเรื่อย ๆ
 *
 * ไฟล์มี 12 ช่อง (คู่ IN/OUT 6 คู่) เดิมประกาศไว้ 6 ช่อง รอยที่ 7 เป็นต้นไปจึงหายเงียบ
 * รวมถึง "รอยสุดท้าย" ที่ใช้เป็นเวลาออกงาน — วันที่แตะเกิน 6 ครั้งจะได้เวลาออกงานผิด
 */
const PUNCH_FIELD_COUNT = 12;

/**
 * ขอบเขตของแต่ละรอบ คิดจาก "กะการทำงาน" ในไฟล์ ไม่ใช่ค่าคงที่ชุดเดียวทั้งบริษัท
 * -----------------------------------------------------------------------------
 * เดิมยึดว่ารอยแรกของวัน = เข้างานเช้าเสมอ ซึ่งผิดกับวันที่ลาครึ่งเช้า
 * คนกลับมาเข้างานบ่าย 12:51 จะถูกบันทึกเป็น "เข้าเช้า 12:51" แล้วขึ้นว่า
 * ไม่ได้สแกนเข้าบ่าย ทั้งที่รอยนั้นคือรอยเข้าบ่ายตรง ๆ
 *
 * ค่าที่ได้ต้องตรงกับ attendance_session_rules ของกะนั้นในระบบ
 *   กะ 08:00-17:00 → เช้าเปิด 06:00 · บ่ายเปิด 12:00 · บ่ายปิด 16:59
 *   กะ 07:30-16:30 → เช้าเปิด 05:30 · บ่ายเปิด 11:30 · บ่ายปิด 16:29
 * จึงคิดจากเวลาเข้า-ออกของกะ: เช้าเปิด = เข้างาน − 2 ชม. · บ่ายเปิด = เข้างาน + 4 ชม.
 * · บ่ายปิด = เลิกงาน − 1 นาที
 */
const DEFAULT_SHIFT = '08:00 - 17:00';

/**
 * ก่อนหน้านี้กี่นาทีที่ยังนับว่า "มาก่อนเวลา" ไม่ใช่รอยตกค้างของกะเมื่อวาน
 * ต้องเท่ากับ DEFAULT_PUNCH_LOOKBACK_MINUTES ที่ตัวคำนวณใช้ (shift-window.util)
 * ถ้าปล่อยรอยที่เลยขอบนี้ให้เป็นรอยเข้าเช้า ตัวคำนวณจะอ่านว่าเป็นของวันถัดไป
 * แล้วคิดสายเกือบ 1,000 นาที (คนเลิกงานหลังเที่ยงคืนแล้วแตะบัตรตอน 00:10)
 */
const PUNCH_LOOKBACK_MINUTES = 240;

type ShiftBounds = {
  /** ก่อนเวลานี้ไม่ถือเป็นรอยเข้างานเช้าของวันนี้ */
  earliestMorning: string;
  /** ตั้งแต่เวลานี้ถือว่าเป็นรอบบ่ายแล้ว ไม่ใช่รอบเช้า */
  afternoonStart: string;
  /** หลังเวลานี้ไม่ใช่การกลับจากพักเที่ยงแล้ว */
  afternoonEnd: string;
};

/**
 * แหล่งที่มาของ log ที่มาจากการนำเข้าไฟล์
 *
 * ต้องแยกจาก log ที่มาจากเครื่องสแกน/เว็บ/แอป เพราะการนำเข้าไฟล์เดิมซ้ำต้องลบ
 * ของรอบก่อนทิ้งก่อนเขียนใหม่ ถ้าไม่แยกไว้จะไปลบเวลาที่พนักงานแตะจริงทิ้งด้วย
 */
const IMPORT_SOURCE = 'IMPORT';

/** "HH:mm" -> จำนวนนาที (คืน null ถ้าอ่านไม่ออก) */
function parseClock(time: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? '').trim());
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;

  return hour * 60 + minute;
}

/** จำนวนนาที -> "HH:mm" วนรอบวันให้เสมอ (−90 นาที = 22:30 ของเมื่อวาน) */
function formatClock(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(wrapped / 60);

  return `${String(hour).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/** อ่าน "08:00 - 17:00" เป็นขอบเขตของแต่ละรอบ */
function resolveShiftBounds(shift: string | null | undefined): ShiftBounds {
  const match = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(
    String(shift ?? '').trim(),
  );

  const start = parseClock(match?.[1]) ?? parseClock(DEFAULT_SHIFT.slice(0, 5));
  const end = parseClock(match?.[2]) ?? parseClock(DEFAULT_SHIFT.slice(-5));

  if (start === null || end === null) {
    return { earliestMorning: '02:00', afternoonStart: '12:00', afternoonEnd: '16:59' };
  }

  const morningOpen = start - 120;

  return {
    earliestMorning: formatClock(morningOpen - PUNCH_LOOKBACK_MINUTES),
    afternoonStart: formatClock(start + 240),
    afternoonEnd: formatClock(end - 1),
  };
}

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
          ? 'ระบบจะเทียบเวลากับกะเองว่าเป็นรอบเช้า/บ่าย/ออกงาน'
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
    {
      key: 'shift',
      label: 'กะการทำงาน',
      aliases: ['กะการทำงาน', 'กะทำงาน', 'กะ'],
      type: 'TEXT',
      hint: 'เช่น 08:00 - 17:00 — ใช้ตัดสินว่ารอยแตะบัตรแต่ละรอยเป็นรอบไหน',
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

      const shift = readCell(row, mapping, 'shift');
      const sessions = this.assignSessions(punches, shift);

      if (punches.length > 3) {
        warnings.push(
          `วันนี้แตะบัตร ${punches.length} ครั้ง — เทียบกับกะ ${shift || DEFAULT_SHIFT} แล้วเลือกรอยเข้าเช้า/เข้าบ่าย/ออกงาน ที่เหลือเก็บไว้เฉย ๆ`,
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
  private assignSessions(
    punches: RawPunch[],
    shift?: string | null,
  ): ImportedPunch[] {
    if (punches.length === 0) return [];

    const bounds = resolveShiftBounds(shift);
    const sessions: ImportedPunch[] = punches.map((punch) => ({
      session: 'CUSTOM' as AttendanceSession,
      time: punch.time,
    }));

    /*
     * รอยแรกเป็น "เข้างานเช้า" ได้ต่อเมื่ออยู่ในช่วงที่กะยอมรับเท่านั้น
     *
     * เร็วเกินขอบล่าง = รอยตกค้างของกะเมื่อวาน (แตะออกงานตอน 00:10)
     * ถึงเวลาเปิดรอบบ่ายแล้ว = คนที่ลาครึ่งเช้าแล้วกลับมาเข้าบ่าย ไม่ใช่มาสาย 5 ชั่วโมง
     * ทั้งสองกรณีถ้าปักเป็นเข้าเช้า ตัวคำนวณจะคิดสายเป็นร้อยเป็นพันนาที
     */
    const first = punches[0];
    const hasMorning =
      first.time >= bounds.earliestMorning && first.time < bounds.afternoonStart;

    if (hasMorning) sessions[0].session = 'MORNING';

    /* รอยสุดท้ายคือออกงานเสมอ ตราบใดที่ไม่ใช่รอยเดียวกับรอยเข้างานเช้า */
    const lastIndex = punches.length - 1;
    const hasCheckout = lastIndex > 0;

    if (hasCheckout) sessions[lastIndex].session = 'EVENING';

    /*
     * เข้างานบ่าย = ช่อง IN ตัวท้ายสุดที่อยู่ในช่วงเช็คอินบ่าย (กลับจากพักเที่ยง)
     * ไม่มีช่อง IN ในช่วงนั้นก็เอารอยท้ายสุดในช่วงแทน
     *
     * เดิมหยิบ "ช่องท้ายสุดของรอยกลาง" เฉย ๆ ซึ่งพังกับวันที่แตะ 4 ครั้งแบบ
     * 07:57 12:09 17:25 17:37 (ออกพักเที่ยงแล้วไม่ได้แตะกลับ ตอนเย็นแตะสองที)
     * มันไปเลือก 17:25 เป็นเข้าบ่าย แล้วกลายเป็นสายบ่าย 245 นาทีทั้งที่ไม่ได้สาย
     */
    const inAfternoonWindow = (punch: RawPunch) =>
      punch.time >= bounds.afternoonStart && punch.time <= bounds.afternoonEnd;

    const firstCandidate = hasMorning ? 1 : 0;
    const lastCandidate = hasCheckout ? lastIndex - 1 : lastIndex;

    let afternoonIndex = -1;
    for (let index = lastCandidate; index >= firstCandidate; index -= 1) {
      if (!inAfternoonWindow(punches[index])) continue;
      if (afternoonIndex === -1) afternoonIndex = index;
      if (punches[index].isIn) {
        afternoonIndex = index;
        break;
      }
    }

    if (afternoonIndex >= 0) sessions[afternoonIndex].session = 'AFTERNOON';

    return sessions;
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
