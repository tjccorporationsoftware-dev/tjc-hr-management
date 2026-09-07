import { useWindowDimensions } from 'react-native';

/**
 * มาตราส่วนตามขนาดจอ — ตารางเดียวที่ทั้งแอปอ้างอิง
 *
 * ## ทำไมต้องมีตาราง ไม่ใช่คูณจากความกว้างตรง ๆ
 *
 * สูตรเชิงเส้น (`width / 393`) ดูสวยบนกระดาษ แต่พอเจอจอจริงมันเพี้ยนสองทาง:
 * จอเล็กได้ตัวอักษรเล็กจนอ่านไม่ออก และแท็บเล็ตได้ตัวอักษรใหญ่เท่าป้ายโฆษณา
 * ตารางนี้จึงกำหนดค่าเป็นช่วง ๆ ที่ตรวจด้วยตาแล้วว่าใช้ได้จริงบนเครื่องนั้น
 *
 * ## จอแบ่งครึ่งของ iPad
 *
 * ทุกอย่างวัดจาก **ความกว้างของหน้าต่าง** ไม่ใช่รุ่นเครื่อง — iPad ที่ถูกแบ่ง
 * เหลือหนึ่งในสามของจอ (375) จึงตกลงมาอยู่ช่วงเดียวกับ iPhone SE เอง โดยไม่
 * ต้องมีเงื่อนไขพิเศษ
 *
 * ## ตัวเลขแต่ละช่องหมายถึงอะไร
 *
 * - `scale` ตัวคูณของระยะและขนาดที่ไม่ใช่ตัวอักษร (ไอคอน วงกลม ความสูงแท่ง)
 * - `gutter` ระยะขอบซ้าย-ขวาของเนื้อหา
 * - `body` ขนาดตัวอักษรพื้นฐาน
 * - `columns` จำนวนคอลัมน์ของตารางกระเบื้อง
 * - `maxWidth` ความกว้างสูงสุดของเนื้อหา — เกินจากนี้จัดกลางแล้วเว้นข้างไว้
 *   เพราะบรรทัดที่ยาวเกิน ~70 ตัวอักษรอ่านยากขึ้นจริง ๆ ไม่ใช่แค่ดูโล่ง
 */
export type ScreenKind = 'phone' | 'tablet';

export interface ResponsiveMetrics {
  kind: ScreenKind;
  scale: number;
  gutter: number;
  body: number;
  columns: number;
  maxWidth: number;
}

interface Bucket extends ResponsiveMetrics {
  /** ใช้ช่องนี้เมื่อความกว้างหน้าต่าง ≤ ค่านี้ */
  upTo: number;
}

/*
 * เรียงจากแคบไปกว้าง ตัวแรกที่ความกว้างไม่เกินคือช่องที่ใช้
 *
 * ค่าอ้างอิงของแต่ละช่อง: 360 = Android ส่วนใหญ่ · 375 = iPhone SE และ iPad
 * แบ่งจอ 1/3 · 393 = iPhone 15 / Pixel 8 · 430 = iPhone 15 Pro Max ·
 * 640 = iPad แนวตั้ง · 760 = iPad Pro แนวนอน
 */
const BUCKETS: Bucket[] = [
  {
    body: 13.4,
    columns: 2,
    gutter: 17,
    kind: 'phone',
    maxWidth: 360,
    scale: 0.92,
    upTo: 360,
  },
  {
    body: 13.7,
    columns: 2,
    gutter: 17,
    kind: 'phone',
    maxWidth: 375,
    scale: 0.96,
    upTo: 380,
  },
  {
    body: 14.1,
    columns: 2,
    gutter: 18,
    kind: 'phone',
    maxWidth: 393,
    scale: 1.01,
    upTo: 412,
  },
  {
    body: 14.7,
    columns: 2,
    gutter: 19,
    kind: 'phone',
    maxWidth: 430,
    scale: 1.08,
    upTo: 599,
  },
  {
    body: 16.5,
    columns: 3,
    gutter: 23,
    kind: 'tablet',
    maxWidth: 640,
    scale: 1.3,
    upTo: 900,
  },
  {
    body: 16.5,
    columns: 4,
    gutter: 23,
    kind: 'tablet',
    maxWidth: 760,
    scale: 1.3,
    upTo: Number.POSITIVE_INFINITY,
  },
];

/** ช่องของความกว้างหนึ่งค่า — แยกจาก hook ไว้ให้เทสเรียกได้ตรง ๆ */
export function metricsForWidth(width: number): ResponsiveMetrics {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 393;
  const bucket =
    BUCKETS.find((item) => safeWidth <= item.upTo) ?? BUCKETS[BUCKETS.length - 1]!;

  return {
    body: bucket.body,
    columns: bucket.columns,
    gutter: bucket.gutter,
    kind: bucket.kind,
    maxWidth: bucket.maxWidth,
    scale: bucket.scale,
  };
}

/**
 * มาตราส่วนของหน้าต่างปัจจุบัน
 *
 * `useWindowDimensions` อัปเดตให้เองเมื่อหมุนจอหรือลากแบ่งจอ จึงไม่ต้องฟัง
 * event เพิ่ม และไม่ต้องเก็บค่าลง state
 */
export function useResponsive(): ResponsiveMetrics {
  const { width } = useWindowDimensions();

  return metricsForWidth(width);
}

/**
 * ย่อ/ขยายค่าคงที่ตามขนาดจอ แล้วปัดเป็นครึ่งพิกเซล
 *
 * ปัดเพราะค่าอย่าง 46 × 0.92 = 42.32 ทำให้ขอบ 1px ของ RN เบลอบนบางเครื่อง
 * ครึ่งพิกเซลละเอียดพอสำหรับระยะและยังตกบนเส้นกริดของจอ 2x/3x ได้พอดี
 */
export function scaled(value: number, metrics: ResponsiveMetrics): number {
  return Math.round(value * metrics.scale * 2) / 2;
}
