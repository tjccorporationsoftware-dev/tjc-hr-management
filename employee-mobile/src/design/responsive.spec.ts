import { metricsForWidth, scaled } from './responsive';

/*
 * ตารางในเทสคือตารางเดียวกับที่ตกลงกับเจ้าของงาน — ถ้าค่าใดค่าหนึ่งถูกแก้
 * โดยไม่ได้ตั้งใจ เทสนี้ต้องแดงก่อนที่จะได้ขึ้นเครื่องจริง
 */
describe('metricsForWidth', () => {
  const cases: [string, number, ReturnType<typeof metricsForWidth>][] = [
    [
      'Android 360dp',
      360,
      { body: 13.4, columns: 2, gutter: 17, kind: 'phone', maxWidth: 360, scale: 0.92 },
    ],
    [
      'iPhone SE (375) และ iPad แบ่งจอ 1/3',
      375,
      { body: 13.7, columns: 2, gutter: 17, kind: 'phone', maxWidth: 375, scale: 0.96 },
    ],
    [
      'iPhone 15 / Pixel 8 (393)',
      393,
      { body: 14.1, columns: 2, gutter: 18, kind: 'phone', maxWidth: 393, scale: 1.01 },
    ],
    [
      'iPhone 15 Pro Max (430)',
      430,
      { body: 14.7, columns: 2, gutter: 19, kind: 'phone', maxWidth: 430, scale: 1.08 },
    ],
    [
      'iPad mini / Pro แนวตั้ง (744)',
      744,
      { body: 16.5, columns: 3, gutter: 23, kind: 'tablet', maxWidth: 640, scale: 1.3 },
    ],
    [
      'iPad Pro แนวนอน (1024)',
      1024,
      { body: 16.5, columns: 4, gutter: 23, kind: 'tablet', maxWidth: 760, scale: 1.3 },
    ],
  ];

  it.each(cases)('%s', (_name, width, expected) => {
    expect(metricsForWidth(width)).toEqual(expected);
  });

  it('จอแคบกว่าที่เคยเจอก็ยังตกในช่องเล็กสุด ไม่ใช่ undefined', () => {
    expect(metricsForWidth(280).kind).toBe('phone');
    expect(metricsForWidth(280).gutter).toBe(17);
  });

  it('ความกว้างที่อ่านไม่ได้ ถอยไปใช้ขนาดมือถือมาตรฐาน', () => {
    expect(metricsForWidth(Number.NaN).maxWidth).toBe(393);
    expect(metricsForWidth(0).maxWidth).toBe(393);
  });

  it('iPad แนวตั้งที่ถูกลากแบ่งเหลือครึ่งจอ ถือเป็นมือถือ', () => {
    /* 744 หารครึ่งได้ ~372 ซึ่งต้องตกช่องเดียวกับ iPhone SE */
    expect(metricsForWidth(372).kind).toBe('phone');
    expect(metricsForWidth(372).columns).toBe(2);
  });
});

describe('scaled', () => {
  it('ย่อค่าตามจอเล็กและปัดเป็นครึ่งพิกเซล', () => {
    expect(scaled(46, metricsForWidth(360))).toBe(42.5);
  });

  it('ขยายบนแท็บเล็ต', () => {
    expect(scaled(46, metricsForWidth(1024))).toBe(60);
  });

  it('จอมาตรฐานแทบไม่ขยับ', () => {
    expect(scaled(100, metricsForWidth(393))).toBe(101);
  });
});
