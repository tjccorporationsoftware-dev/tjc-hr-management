/**
 * เครื่องมือกลางของสคริปต์สร้างข้อมูลจำลอง
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not defined');

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

/**
 * สุ่มแบบกำหนดเมล็ดได้ (mulberry32)
 *
 * ใช้แทน Math.random เพื่อให้รันสคริปต์ซ้ำแล้วได้ข้อมูลชุดเดิมทุกครั้ง
 * ไม่งั้นเวลาไล่ปัญหาจะเทียบตัวเลขระหว่างรอบไม่ได้เลย
 */
export function makeRandom(seed: number) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rand = makeRandom(25690811);

export function pick<T>(arr: readonly T[], index: number): T {
  return arr[index % arr.length];
}

export function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

/** สุ่มจำนวนเต็มในช่วง [min, max] */
export function randInt(min: number, max: number) {
  return min + Math.floor(rand() * (max - min + 1));
}

/** ความน่าจะเป็นแบบร้อยละ */
export function chance(percent: number) {
  return rand() * 100 < percent;
}

/**
 * วันที่แบบไม่มีเวลา (UTC เที่ยงคืน)
 *
 * คอลัมน์วันที่ในฐานข้อมูลเป็น `date` ถ้าใส่ timestamp ที่มี offset ของไทย
 * Postgres จะตัดเวลาทิ้งแล้วได้วันก่อนหน้าไปหนึ่งวัน — เคยพังมาแล้วตอนตรวจ readiness
 */
export function dateOnly(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** เวลาในวันนั้นตามเวลาไทย เก็บเป็น UTC */
export function atBangkokTime(day: Date, hour: number, minute: number): Date {
  return new Date(
    Date.UTC(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate(),
      hour - 7,
      minute,
    ),
  );
}

export function addDays(day: Date, days: number): Date {
  const next = new Date(day.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** ไล่วันแบบรวมปลายทาง */
export function eachDay(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  for (let d = new Date(from.getTime()); d <= to; d = addDays(d, 1)) {
    days.push(new Date(d.getTime()));
  }
  return days;
}

export function dateKey(day: Date): string {
  return day.toISOString().slice(0, 10);
}

/** เสาร์–อาทิตย์ */
export function isWeekend(day: Date): boolean {
  const dow = day.getUTCDay();
  return dow === 0 || dow === 6;
}

export function thaiYear(day: Date): number {
  return day.getUTCFullYear() + 543;
}

export function money(value: number): string {
  return value.toFixed(2);
}

let stepNo = 0;
export function step(label: string) {
  stepNo += 1;
  console.log(`\n[${String(stepNo).padStart(2, '0')}] ${label}`);
}

export function done(label: string, count?: number) {
  console.log(`     ✓ ${label}${count === undefined ? '' : ` (${count})`}`);
}
