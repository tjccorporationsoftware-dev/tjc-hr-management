/**
 * สีของแอป — ยกสเกลมาจากเว็บตรง ๆ เพื่อให้สองฝั่งเป็นระบบเดียวกัน
 *
 * เว็บกำหนด --color-brand-* จากสเกล blue ของ Tailwind (app/globals.css)
 * ถ้าฝั่งแอปคิดเฉดเอง ผู้ใช้จะรู้สึกว่าเป็นคนละผลิตภัณฑ์ทันทีที่สลับจอ
 *
 * กติกา: ห้าม import ไฟล์นี้ตรง ๆ จากหน้าจอ ให้ใช้ผ่าน useAppTheme() เสมอ
 * ไม่งั้นโหมดมืดจะพังเป็นจุด ๆ โดยไม่มีใครสังเกต
 */

/** สเกลแบรนด์ ตรงกับ --color-brand-* ของเว็บทุกค่า */
const brand = {
  50: '#eff6ff',
  100: '#dbeafe',
  200: '#bfdbfe',
  300: '#93c5fd',
  400: '#60a5fa',
  500: '#3b82f6',
  600: '#2563eb',
  700: '#1d4ed8',
  800: '#1e40af',
  900: '#1e3a8a',
} as const;

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  surfaceElevated: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  border: string;
  borderStrong: string;
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  primarySoftBorder: string;
  onPrimary: string;
  success: string;
  successSoft: string;
  successText: string;
  warning: string;
  warningSoft: string;
  warningText: string;
  danger: string;
  dangerSoft: string;
  dangerText: string;
  info: string;
  infoSoft: string;
  overlay: string;
  tabBar: string;
  shadow: string;
  /** พื้นของ skeleton ตอนกำลังโหลด */
  skeleton: string;
}

export const lightColors: ThemeColors = {
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceAlt: '#f1f5f9',
  surfaceElevated: '#ffffff',
  text: '#0f172a',
  textMuted: '#475569',
  textSubtle: '#94a3b8',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',
  primary: brand[600],
  primaryPressed: brand[700],
  primarySoft: brand[50],
  primarySoftBorder: brand[100],
  onPrimary: '#ffffff',
  success: '#059669',
  successSoft: '#ecfdf5',
  successText: '#047857',
  warning: '#d97706',
  warningSoft: '#fffbeb',
  warningText: '#b45309',
  danger: '#dc2626',
  dangerSoft: '#fef2f2',
  dangerText: '#b91c1c',
  info: brand[500],
  infoSoft: brand[50],
  overlay: 'rgba(15, 23, 42, 0.45)',
  tabBar: 'rgba(255, 255, 255, 0.97)',
  shadow: '#0f172a',
  skeleton: '#e2e8f0',
};

/**
 * โหมดมืด — ไม่ได้กลับสีขาวดำเฉย ๆ
 * พื้นหลังใช้โทนน้ำเงินเข้มให้เข้ากับแบรนด์ และดันสี primary ให้สว่างขึ้น
 * เพราะ brand-600 บนพื้นเข้มอ่านยากและไม่ผ่านเกณฑ์ contrast
 */
export const darkColors: ThemeColors = {
  background: '#0b1220',
  surface: '#131c2e',
  surfaceAlt: '#1a2439',
  surfaceElevated: '#1c273d',
  text: '#f1f5f9',
  textMuted: '#a4b1c6',
  textSubtle: '#738199',
  border: '#26324a',
  borderStrong: '#35435f',
  primary: brand[400],
  primaryPressed: brand[300],
  primarySoft: 'rgba(96, 165, 250, 0.14)',
  primarySoftBorder: 'rgba(96, 165, 250, 0.28)',
  onPrimary: '#0b1220',
  success: '#34d399',
  successSoft: 'rgba(52, 211, 153, 0.14)',
  successText: '#6ee7b7',
  warning: '#fbbf24',
  warningSoft: 'rgba(251, 191, 36, 0.14)',
  warningText: '#fcd34d',
  danger: '#f87171',
  dangerSoft: 'rgba(248, 113, 113, 0.14)',
  dangerText: '#fca5a5',
  info: brand[400],
  infoSoft: 'rgba(96, 165, 250, 0.14)',
  overlay: 'rgba(2, 6, 15, 0.65)',
  tabBar: 'rgba(19, 28, 46, 0.98)',
  shadow: '#000000',
  skeleton: '#26324a',
};

export const brandScale = brand;
