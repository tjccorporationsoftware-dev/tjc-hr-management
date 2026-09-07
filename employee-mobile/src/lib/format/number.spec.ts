import { formatNumber } from './number';

describe('formatNumber', () => {
  it('ตัดเศษที่ติดมาจากการบวกทศนิยม', () => {
    /* เคสจริงจากหน้าแรก: ผลรวมวันลาคงเหลือล้นออกนอกวงโดนัท */
    expect(formatNumber(9.37 + 2 + 18 + 24.89 + 20)).toBe('74.26');
    expect(formatNumber(0.1 + 0.2)).toBe('0.3');
  });

  it('จำนวนเต็มไม่มีทศนิยมห้อยท้าย', () => {
    expect(formatNumber(20)).toBe('20');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(100)).toBe('100');
    expect(formatNumber(-5)).toBe('-5');
  });

  it('เก็บทศนิยมเท่าที่มีจริง ไม่เกินสองตำแหน่ง', () => {
    expect(formatNumber(24.89)).toBe('24.89');
    expect(formatNumber(9.5)).toBe('9.5');
    expect(formatNumber(9.3)).toBe('9.3');
    expect(formatNumber(0.5)).toBe('0.5');
    expect(formatNumber(1.23456)).toBe('1.23');
    expect(formatNumber(1.999)).toBe('2');
  });

  it('ค่าติดลบยังอ่านได้ และไม่มี -0', () => {
    expect(formatNumber(-2.5)).toBe('-2.5');
    expect(formatNumber(-0.001)).toBe('0');
  });

  it('ค่าที่ไม่ใช่ตัวเลขไม่ทำให้จอพัง', () => {
    expect(formatNumber(Number.NaN)).toBe('0');
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('0');
  });
});
