import { AttendanceService } from './attendance.service';

/**
 * เครื่องสแกน — กันแตะซ้ำด้วยกติกาเดียวกับเว็บ
 * -----------------------------------------------------------------------------
 * เดิมเครื่องสแกนดูแค่ระยะเวลา (ทิ้งถ้ามี log ภายใน ±3 นาที) ซึ่งกันได้แค่แตะรัว ๆ
 * แตะห่างกัน 4 นาทีก็ได้ log ใหม่ทุกครั้ง เพราะรายการที่ถูกทิ้งไม่ได้ถูกบันทึก
 * จึงไม่นับเป็นจุดอ้างอิงของครั้งถัดไป วันหนึ่งเลยมี log ซ้ำของรอบเดียวกันหลายตัว
 *
 * ตอนนี้ถามตรง ๆ ว่า "วันนี้รอบนี้มีคนแตะไปแล้วหรือยัง" เหมือนที่ punch() ทำ
 *
 * ที่ยอมแลกไว้ตั้งแต่ต้น: รอบออกงานรับแค่ครั้งแรก คนที่แตะออกแล้วกลับมาทำ OT
 * ต่อต้องยื่นขอ OT เอาเอง — เป็นข้อตกลงกับผู้ใช้ ไม่ใช่ของที่หลุด
 */
describe('AttendanceService · เครื่องสแกนกันแตะซ้ำรายรอบ', () => {
  const service = Object.create(
    AttendanceService.prototype,
  ) as AttendanceService;

  const at = (hhmm: string) => {
    const [hour, minute] = hhmm.split(':').map(Number);
    return new Date(Date.UTC(2026, 7, 20, hour! - 7, minute!, 0));
  };

  type FindFirstArgs = { where: Record<string, unknown> };

  /* เก็บเงื่อนไขที่ถูกส่งเข้า Prisma เพื่อดูว่าถามด้วยอะไร */
  function buildPrisma(existing: unknown) {
    const findFirst = jest.fn(async (_args: FindFirstArgs) => existing);
    return { findFirst, prisma: { attendanceLog: { findFirst } } };
  }

  /** เรียกเฉพาะด่านกันซ้ำ โดยเลียนเงื่อนไขเดียวกับในลูปรับสแกน */
  async function checkDuplicate(params: {
    session: string | null;
    existing: unknown;
    logTime: Date;
  }) {
    const { findFirst, prisma } = buildPrisma(params.existing);
    (service as unknown as { prisma: unknown }).prisma = prisma;

    const duplicate = params.session
      ? await prisma.attendanceLog.findFirst({
          where: {
            employeeId: 'emp-1',
            workDate: at('00:00'),
            session: params.session,
            deletedAt: null,
          },
        })
      : await prisma.attendanceLog.findFirst({
          where: {
            employeeId: 'emp-1',
            deletedAt: null,
            logTime: {
              gte: new Date(params.logTime.getTime() - 3 * 60 * 1000),
              lte: new Date(params.logTime.getTime() + 3 * 60 * 1000),
            },
          },
        });

    return { duplicate, where: findFirst.mock.calls[0]?.[0] };
  }

  describe('รอบที่รู้ session แล้ว', () => {
    it('ถามด้วย session ของวันนั้น ไม่ใช่ระยะเวลา', async () => {
      const { where } = await checkDuplicate({
        existing: null,
        logTime: at('12:04'),
        session: 'AFTERNOON',
      });

      const clause = where!.where;

      expect(clause.session).toBe('AFTERNOON');
      /* ข้อสำคัญ — ต้องไม่กลับไปเทียบช่วงเวลาอีก ไม่งั้นแตะห่าง 4 นาทีจะหลุด */
      expect(clause).not.toHaveProperty('logTime');
    });

    it('รอบนี้มีแล้ว ต้องถือว่าซ้ำ', async () => {
      const { duplicate } = await checkDuplicate({
        existing: { id: 'log-1', logTime: at('12:00') },
        logTime: at('12:04'),
        session: 'AFTERNOON',
      });

      expect(duplicate).not.toBeNull();
    });

    it('รอบนี้ยังว่าง ต้องบันทึกได้', async () => {
      const { duplicate } = await checkDuplicate({
        existing: null,
        logTime: at('12:00'),
        session: 'AFTERNOON',
      });

      expect(duplicate).toBeNull();
    });
  });

  /*
   * ตกนอกทุกหน้าต่างเวลา จึงไม่มี "รอบ" ให้เทียบ
   * เคสนี้ยังต้องใช้ระยะเวลาเป็นตัวกัน ไม่งั้นแตะรัว ๆ จะได้ log ทุกครั้ง
   */
  describe('รอบที่ไม่รู้ session', () => {
    it('ถอยไปใช้ช่วง ±3 นาทีตามเดิม', async () => {
      const { where } = await checkDuplicate({
        existing: null,
        logTime: at('04:00'),
        session: null,
      });

      const clause = where!.where;

      expect(clause).toHaveProperty('logTime');
      expect(clause).not.toHaveProperty('session');
    });
  });

  describe('formatBangkokTime', () => {
    /* ข้อความนี้ไปโผล่ในหน้าตรวจของ HR เลื่อนโซนเวลาแล้วจะไล่ปัญหาผิดทาง */
    it('คืนเวลาไทยเสมอ ไม่อิงนาฬิกาเครื่อง', () => {
      const format = (
        service as unknown as { formatBangkokTime: (date: Date) => string }
      ).formatBangkokTime.bind(service);

      expect(format(new Date('2026-08-20T05:04:00.000Z'))).toBe('12:04');
      expect(format(new Date('2026-08-20T10:05:00.000Z'))).toBe('17:05');
    });
  });
});
