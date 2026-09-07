/**
 * ผิว "ออโรรา" — ฉากแสงฟ้ากับแผ่นกระจกขาว **คือผิวของทั้งแอป**
 *
 * เดิมอยู่ใต้ features/home เพราะมีหน้าหลักใช้อยู่จอเดียว ตอนนี้เป็นต้นแบบของ
 * ทุกจอแล้ว โดยยึดห้าจอหลักเป็นตัวอ้างอิง: หน้าหลัก ลงเวลา อนุมัติ คำขอ เงินเดือน
 * (กติกาเต็มอยู่ใน AGENTS.md ที่รากโปรเจกต์)
 *
 * จอที่ใช้ผิวนี้เป็นฟ้าอ่อนตลอดทั้งโหมดสว่างและมืด สีทุกตัวจึงต้องหยิบจาก
 * AURORA ตรง ๆ ห้ามใช้ tone ของธีม (เช่น `<Text tone="muted">`) เพราะโหมดมืด
 * จะได้ตัวหนังสือสีอ่อนบนกระจกขาว
 */
export {
  AuroraBackground,
  Glass,
  glowText,
  listCardEdge,
  type GlassProps,
} from './surface';
export {
  CountUp,
  PressableScale,
  PulseDot,
  Reveal,
  Shimmer,
  useDrift,
  useGrow,
} from './motion';
export {
  ApprovalMotif,
  AttendanceHistoryMotif,
  DailyCostMotif,
  ExecutiveHomeMotif,
  HeroSheet,
  InsightsMotif,
  LeaveOvertimeMotif,
  MoreMotif,
  NotificationMotif,
  OrgChartMotif,
  PasswordMotif,
  PayrollMotif,
  PayslipMotif,
  PeopleMotif,
  PinMotif,
  ProfileMotif,
  ReportMotif,
  RequestDetailMotif,
  RequestFormMotif,
  RequestsMotif,
  SecurityMotif,
  SettingsMotif,
  TaxMotif,
  WorkClockMotif,
} from './hero-motifs';
export { PageHero, type PageHeroProps } from './page-hero';
export { PeriodBar, type PeriodBarProps } from './period-bar';
export { AURORA } from './palette';
export { PageSection, SectionAction, SectionLabel } from './section';
