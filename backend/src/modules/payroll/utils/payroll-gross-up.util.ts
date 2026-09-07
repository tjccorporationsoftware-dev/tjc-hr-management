/**
 * Gross-up — กรณีบริษัทออกภาษีให้พนักงาน
 * -----------------------------------------------------------------------------
 * ปัญหาคือภาษีที่บริษัทออกให้ ถือเป็นเงินได้ของพนักงานด้วย (มาตรา 40)
 * จึงต้องเสียภาษีจากภาษีอีกชั้น วนไปเรื่อยๆ แก้ด้วยสูตรตรงๆ ไม่ได้
 * เมื่ออัตราภาษีเป็นขั้นบันได
 *
 *   ต้องการ: จ่ายให้พนักงานได้เงินสุทธิ = targetNet
 *   หา:      ยอด gross ที่ทำให้ gross - ภาษี(gross) = targetNet
 *
 * วิธี: ทำซ้ำแบบ fixed-point ก่อน (ลู่เข้าเร็วมากเมื่ออัตราภาษีคงที่ในช่วงนั้น)
 * ถ้าไม่ลู่เข้าภายในจำนวนรอบที่กำหนด ค่อยตกไปใช้ bisection ซึ่งลู่เข้าเสมอ
 *
 * ไฟล์นี้เป็นคณิตศาสตร์ล้วน ไม่แตะ Prisma
 */

import { toMoney } from './payroll-money.util';

export type GrossUpInput = {
  /** ยอดสุทธิที่ต้องการให้พนักงานได้รับจริง */
  targetNet: number;
  /** ฟังก์ชันคิดภาษีจากยอด gross — ผู้เรียกกำหนดเองว่าใช้ตรรกะไหน */
  taxOf: (gross: number) => number;
  /** ยอมรับผลต่างได้เท่าไร หน่วยบาท ปกติ 1 สตางค์ */
  tolerance?: number;
  maxIterations?: number;
};

export type GrossUpResult = {
  /** ยอดที่ต้องตั้งจ่าย */
  grossAmount: number;
  /** ภาษีที่บริษัทออกให้ */
  taxAmount: number;
  /** ยอดสุทธิที่พนักงานได้จริง ควรเท่ากับ targetNet ในระดับ tolerance */
  netAmount: number;
  /** ต้นทุนส่วนเพิ่มของบริษัทเทียบกับการจ่าย targetNet ตรงๆ */
  employerExtraCost: number;
  iterations: number;
  /** ลู่เข้าได้ภายในจำนวนรอบหรือไม่ */
  converged: boolean;
};

const DEFAULT_TOLERANCE = 0.01;
const DEFAULT_MAX_ITERATIONS = 60;

/**
 * ปัด 2 ตำแหน่งแบบกัน floating-point error — ใช้ตัวกลางจาก payroll-money.util
 * ของเดิมเป็น Math.round ตรง ๆ ซึ่งคืน 1.00 ให้ค่าที่เก็บเป็น 1.005
 * (double เก็บเป็น 1.00499999999999989) และตัวนี้ใช้กับค่าชดเชย/ภาษีเงินก้อน
 * ที่เป็นเงินหลักแสน
 */
function roundMoney(value: number) {
  return toMoney(value);
}

function safeTax(taxOf: (gross: number) => number, gross: number) {
  const tax = Number(taxOf(gross));
  if (!Number.isFinite(tax) || tax < 0) return 0;
  // ภาษีเกินยอดที่จ่ายไม่ได้ ไม่งั้นสมการหาคำตอบไม่เจอ
  return Math.min(tax, gross);
}

export function calculateGrossUp(input: GrossUpInput): GrossUpResult {
  const targetNet = Math.max(Number(input.targetNet) || 0, 0);
  const tolerance = Math.max(
    Number(input.tolerance) || DEFAULT_TOLERANCE,
    0.001,
  );
  const maxIterations = Math.max(
    Math.floor(Number(input.maxIterations) || DEFAULT_MAX_ITERATIONS),
    1,
  );

  if (targetNet <= 0) {
    return {
      grossAmount: 0,
      taxAmount: 0,
      netAmount: 0,
      employerExtraCost: 0,
      iterations: 0,
      converged: true,
    };
  }

  let gross = targetNet;
  let iterations = 0;

  // รอบที่ 1: fixed-point — เอาภาษีของรอบก่อนมาบวกกลับเข้าไป
  for (let i = 0; i < maxIterations; i += 1) {
    iterations += 1;
    const tax = safeTax(input.taxOf, gross);
    const net = gross - tax;
    const gap = targetNet - net;

    if (Math.abs(gap) <= tolerance) {
      return buildResult(gross, tax, targetNet, iterations, true);
    }

    gross += gap;
    if (gross < targetNet) gross = targetNet;
  }

  // รอบที่ 2: bisection — ช้ากว่าแต่ลู่เข้าแน่นอน
  let low = targetNet;
  let high = Math.max(gross, targetNet * 2 + 1);

  // ขยายขอบบนจนกว่าจะครอบคำตอบไว้ได้
  for (let i = 0; i < maxIterations; i += 1) {
    if (high - safeTax(input.taxOf, high) >= targetNet) break;
    high *= 2;
  }

  for (let i = 0; i < maxIterations; i += 1) {
    iterations += 1;
    const mid = (low + high) / 2;
    const net = mid - safeTax(input.taxOf, mid);

    if (Math.abs(net - targetNet) <= tolerance) {
      return buildResult(
        mid,
        safeTax(input.taxOf, mid),
        targetNet,
        iterations,
        true,
      );
    }

    if (net < targetNet) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const finalGross = (low + high) / 2;
  return buildResult(
    finalGross,
    safeTax(input.taxOf, finalGross),
    targetNet,
    iterations,
    false,
  );
}

function buildResult(
  gross: number,
  tax: number,
  targetNet: number,
  iterations: number,
  converged: boolean,
): GrossUpResult {
  const grossAmount = roundMoney(gross);
  const taxAmount = roundMoney(tax);

  return {
    grossAmount,
    taxAmount,
    netAmount: roundMoney(grossAmount - taxAmount),
    employerExtraCost: roundMoney(grossAmount - targetNet),
    iterations,
    converged,
  };
}

/**
 * ทางลัดกรณีอัตราภาษีคงที่ เช่น หัก ณ ที่จ่าย 5% ของค่าจ้างทำของ
 * ใช้สูตรตรง gross = net / (1 - rate) ไม่ต้องวนซ้ำ
 */
export function grossUpAtFlatRate(targetNet: number, rate: number) {
  const net = Math.max(Number(targetNet) || 0, 0);
  const taxRate = Number(rate) || 0;

  if (net <= 0) return { grossAmount: 0, taxAmount: 0, netAmount: 0 };
  // อัตรา 100% ขึ้นไปหาคำตอบไม่ได้ จ่ายเท่าไรก็ถูกหักหมด
  if (taxRate <= 0 || taxRate >= 1) {
    return { grossAmount: net, taxAmount: 0, netAmount: net };
  }

  const grossAmount = roundMoney(net / (1 - taxRate));
  const taxAmount = roundMoney(grossAmount * taxRate);

  return {
    grossAmount,
    taxAmount,
    netAmount: roundMoney(grossAmount - taxAmount),
  };
}
