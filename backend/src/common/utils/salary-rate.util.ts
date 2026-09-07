/**
 * อัตราค่าจ้างต่อวัน / ต่อชั่วโมง ตามฐานค่าจ้างของพนักงาน
 *
 * ระบบเดิมสมมติว่า baseSalary เป็นเงินเดือนรายเดือนเสมอ แล้วหารด้วย
 * salaryDivisorDays (30) ทุกที่ พอเจอพนักงานรายวันที่เก็บ baseSalary = 500
 * (ค่าแรงต่อวัน) อัตราต่อชั่วโมงเลยกลายเป็น 500/30/8 = 2.08 บาท
 * ทำให้ OT วันละหลายชั่วโมงได้เงินหลักสิบแทนหลักพัน
 *
 * ไฟล์นี้เป็นจุดเดียวที่แปลง baseSalary -> อัตรา ทั้งฝั่ง attendance และ payroll
 * ต้องใช้ร่วมกันเพื่อไม่ให้หน้าจอลงเวลากับสลิปเงินเดือนโชว์คนละตัวเลข
 */

export type SalaryBasis = 'MONTHLY' | 'DAILY' | 'HOURLY';

export type SalaryRateSettings = {
  /** จำนวนวันที่ใช้หารเงินเดือนรายเดือน ปกติ 30 */
  salaryDivisorDays: number;
  /** ชั่วโมงทำงานมาตรฐานต่อวัน ปกติ 8 */
  workingHoursPerDay: number;
};

export type SalaryRates = {
  basis: SalaryBasis;
  /** อัตราต่อวันแบบไม่ปัดเศษ ใช้คำนวณต่อ */
  exactDailyRate: number;
  /** อัตราต่อชั่วโมงแบบไม่ปัดเศษ ใช้คำนวณต่อ */
  exactHourlyRate: number;
};

const DEFAULT_DIVISOR_DAYS = 30;
const DEFAULT_HOURS_PER_DAY = 8;

/**
 * ค่าที่ไม่รู้จักให้ถือเป็น MONTHLY เสมอ
 * ข้อมูลเก่าที่ยังไม่มีฟิลด์นี้จะได้คำนวณเหมือนเดิมทุกประการ
 */
export function normalizeSalaryBasis(value: unknown): SalaryBasis {
  const basis = String(value ?? 'MONTHLY').toUpperCase();

  return basis === 'DAILY' || basis === 'HOURLY' ? basis : 'MONTHLY';
}

export function resolveSalaryRates(
  baseSalaryValue: unknown,
  settings?: Partial<SalaryRateSettings> | null,
  basisValue?: unknown,
): SalaryRates {
  const basis = normalizeSalaryBasis(basisValue);
  const baseSalary = Number(baseSalaryValue ?? 0);

  const divisorDays = toPositive(settings?.salaryDivisorDays, DEFAULT_DIVISOR_DAYS);
  const hoursPerDay = toPositive(settings?.workingHoursPerDay, DEFAULT_HOURS_PER_DAY);

  if (!Number.isFinite(baseSalary) || baseSalary <= 0) {
    return { basis, exactDailyRate: 0, exactHourlyRate: 0 };
  }

  if (basis === 'DAILY') {
    return {
      basis,
      exactDailyRate: baseSalary,
      exactHourlyRate: baseSalary / hoursPerDay,
    };
  }

  if (basis === 'HOURLY') {
    return {
      basis,
      exactDailyRate: baseSalary * hoursPerDay,
      exactHourlyRate: baseSalary,
    };
  }

  const exactDailyRate = baseSalary / divisorDays;

  return {
    basis,
    exactDailyRate,
    exactHourlyRate: exactDailyRate / hoursPerDay,
  };
}

/**
 * อ่านฐานค่าจ้างจากบันทึกค่าจ้าง — ไม่มีค่า/ค่าแปลก = MONTHLY
 * ถอยไปทางเดิมไว้ก่อน เพื่อให้ข้อมูลเก่าคำนวณเหมือนเดิมทุกประการ
 */
export function salaryBasisOf(compensation: {
  salaryBasis?: unknown;
}): SalaryBasis {
  return normalizeSalaryBasis(compensation?.salaryBasis);
}

/**
 * ค่าจ้างที่ต้องจ่ายจริงในงวด ตามฐานของค่าจ้าง
 *
 * รายเดือน   จ่ายเต็มตามฐาน (ที่คิดสัดส่วนวันเป็นพนักงานมาแล้ว)
 * รายวัน     ฐานคืออัตราต่อวัน ต้องคูณจำนวนวันที่มาทำงานจริง
 * รายชั่วโมง  ฐานคืออัตราต่อชั่วโมง ต้องคูณชั่วโมงที่ทำจริง
 *
 * รายวัน/รายชั่วโมงไม่ต้องคิดสัดส่วนวันเข้า-ออกกลางงวดซ้ำ เพราะจำนวนวัน
 * ที่มาทำงานจริงสะท้อนเรื่องนั้นอยู่แล้วโดยธรรมชาติ
 */
export function resolveBasePayForPeriod(params: {
  basis: SalaryBasis;
  baseSalary: number;
  workedDays: number;
  workingHoursPerDay: number;
}): number {
  const rate = Number(params.baseSalary) || 0;
  const days = Math.max(Number(params.workedDays) || 0, 0);

  if (params.basis === 'DAILY') {
    return Math.round(rate * days * 100) / 100;
  }

  if (params.basis === 'HOURLY') {
    /*
     * ข้อจำกัดที่ต้องรู้: ตอนนี้คิดเป็น "ชั่วโมงมาตรฐาน x วันที่มาทำงาน"
     *
     * ระบบยังไม่ได้เก็บจำนวนชั่วโมงที่ทำจริงรายวันไว้เป็นฟิลด์ ถ้าบริษัทมี
     * พาร์ทไทม์ที่ทำงานวันละไม่เท่ากันจริง ๆ ต้องต่อยอดให้ดึงจากเวลาสแกน
     * เข้า-ออกหักพักกลางวันก่อน ถึงจะจ่ายตามชั่วโมงจริงได้
     */
    const hoursPerDay = Number(params.workingHoursPerDay) || 8;
    return Math.round(rate * days * hoursPerDay * 100) / 100;
  }

  return rate;
}

/**
 * ค่าจ้างเทียบเท่ารายเดือน — ใช้กับงานที่ต้องการ "เงินเดือน" เป็นตัวเลขเดียว
 *
 * ที่ต้องมีเพราะหลายเรื่องพูดเป็นเดือน ไม่ได้พูดเป็นวัน เช่น
 *   - ค่าชดเชยเลิกจ้าง (ม.118 คิดเป็นค่าจ้าง 30/90/180/240/300/400 วัน)
 *   - หนังสือรับรองเงินเดือนที่ยื่นธนาคาร
 *   - หน้าประมาณการภาษีและหน้าตรวจก่อนคำนวณเงินเดือน
 *
 * ถ้าเอา baseSalary ของพนักงานรายวันไปใช้ตรง ๆ หนังสือรับรองจะเขียนว่า
 * เงินเดือน 500 บาท และค่าชดเชยจะเหลือ 1/30 ของที่ควรได้
 */
export function resolveMonthlyEquivalentWage(
  baseSalaryValue: unknown,
  settings?: Partial<SalaryRateSettings> | null,
  basisValue?: unknown,
): number {
  const divisorDays = toPositive(settings?.salaryDivisorDays, DEFAULT_DIVISOR_DAYS);
  const rates = resolveSalaryRates(baseSalaryValue, settings, basisValue);

  if (rates.basis === 'MONTHLY') {
    const baseSalary = Number(baseSalaryValue ?? 0);
    return Number.isFinite(baseSalary) && baseSalary > 0 ? baseSalary : 0;
  }

  return Math.round(rates.exactDailyRate * divisorDays * 100) / 100;
}

/**
 * พนักงานรายวัน/รายชั่วโมงได้ค่าจ้างตามวันที่มาทำงานจริงอยู่แล้ว
 * วันที่ขาดงานหรือลาไม่รับค่าจ้างเต็มวันจึงไม่มีเงินให้หักซ้ำอีก
 *
 * ถ้าไม่กันไว้ พนักงานรายวันขาดงาน 1 วัน จะโดนทั้ง "ไม่ได้ค่าแรงวันนั้น"
 * และ "หักค่าขาดงานอีกหนึ่งวัน" รวมเป็นเสียสองเท่า
 */
export function deductsWholeDayAbsence(basisValue: unknown): boolean {
  return normalizeSalaryBasis(basisValue) === 'MONTHLY';
}

function toPositive(value: unknown, fallback: number): number {
  const parsed = Number(value ?? fallback);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
