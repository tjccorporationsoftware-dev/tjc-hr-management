import { BadRequestException } from '@nestjs/common';

import {
  resolveSeveranceDays,
  STATUTORY_SEVERANCE_TIERS,
  type SeverancePayTier,
} from './payroll-severance.util';

/**
 * ตรวจว่าบันไดที่บริษัทตั้ง ไม่แย่กว่าขั้นต่ำตามกฎหมาย
 * -----------------------------------------------------------------------------
 * พ.ร.บ.คุ้มครองแรงงาน ม.118 เป็น "ขั้นต่ำ" บริษัทจ่ายมากกว่าได้ น้อยกว่าไม่ได้
 *
 * ตรวจโดยไล่ทุกจุดที่บันไดตามกฎหมายเปลี่ยนขั้น แล้วเทียบว่าบันไดของบริษัท
 * ให้จำนวนวันไม่น้อยกว่ากันที่จุดนั้น — วิธีนี้จับได้แม้บริษัทตั้งขั้นคนละแบบ
 * เช่นตั้งขั้นละเอียดกว่าหรือหยาบกว่ากฎหมาย ซึ่งการเทียบทีละแถวจับไม่ได้
 */
export function assertTiersMeetStatutoryMinimum(tiers: SeverancePayTier[]) {
  // ไม่ตั้งเลย = ระบบใช้ขั้นต่ำตามกฎหมายให้อยู่แล้ว ถือว่าผ่าน
  if (!tiers || tiers.length === 0) return;

  const problems: string[] = [];

  for (const statutory of STATUTORY_SEVERANCE_TIERS) {
    const configured = resolveSeveranceDays(
      statutory.minServiceMonths,
      tiers,
    );

    if (configured < statutory.payDays) {
      problems.push(
        `อายุงาน ${describeMonths(statutory.minServiceMonths)} กฎหมายกำหนดอย่างน้อย ` +
          `${statutory.payDays} วัน แต่ที่ตั้งไว้ได้ ${configured} วัน`,
      );
    }
  }

  if (problems.length > 0) {
    throw new BadRequestException(
      'บันไดค่าชดเชยต่ำกว่าที่กฎหมายกำหนด (พ.ร.บ.คุ้มครองแรงงาน มาตรา 118) — ' +
        problems.join(' · '),
    );
  }
}

function describeMonths(months: number) {
  if (months < 12) return `${months} เดือน`;

  const years = months / 12;

  return Number.isInteger(years) ? `${years} ปี` : `${months} เดือน`;
}
