/**
 * ใช้ preset ของ jest-expo เพื่อให้ transform ตรงกับที่ Metro ใช้จริง
 * ไม่อย่างนั้นโมดูล ESM ใน node_modules ของ Expo/RN จะ parse ไม่ผ่าน
 */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/tests/setup.ts'],
  /*
   * รับทั้งเทสรวมใน tests/ และเทสที่วางข้างไฟล์ที่มันคุมใน src/
   *
   * เดิมรับแค่ tests/ ทำให้ไฟล์ .spec.ts ที่วางข้างโค้ดไม่เคยถูกรันเลย
   * ซึ่งอันตรายกว่าไม่มีเทส เพราะทุกคนเห็นว่า "มีเทสคุมอยู่" แล้ววางใจ
   */
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/tests/**/*.test.tsx',
    '<rootDir>/src/**/*.spec.ts',
    '<rootDir>/src/**/*.spec.tsx',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
};
