/**
 * ชั้นกราฟของแอป
 *
 * กติกาที่ทุกกราฟต้องผ่าน (มาจากการตรวจด้วยเครื่องมือ ไม่ใช่รสนิยม):
 *   1. **ห้ามให้สีเป็นทางเดียวที่สื่อความหมาย** — ต้องมีตัวเลขหรือป้ายกำกับเสมอ
 *      (บางสล็อตในโหมดสว่าง contrast ต่ำกว่า 3:1 โดยธรรมชาติของเฉดนั้น)
 *   2. **ค่าต้องอ่านได้โดยไม่ต้องแตะ** — การแตะเป็นของเสริม ไม่ใช่ประตูเดียว
 *   3. **หนึ่งแกนเสมอ** ห้ามกราฟสองแกน y
 *   4. **ไล่เฉดสีเดียวสำหรับขนาด · สีต่างกันสำหรับตัวตน · สีสถานะสำหรับสถานะ**
 *      ห้ามข้ามหน้าที่กัน
 *   5. เส้นตารางและแกนเป็นเส้นทึบบาง จางกว่าพื้นหนึ่งขั้น
 */

export { ColumnChart, type ColumnChartProps, type ColumnPoint } from './column-chart';
export {
  MAX_SERIES,
  gridColor,
  sequentialColor,
  seriesColor,
  statusColor,
} from './palette';
export { ProgressRing, type ProgressRingProps } from './progress-ring';
export { Sparkline, type SparklineProps } from './sparkline';
export { StackedBar, type StackSegment, type StackedBarProps } from './stacked-bar';
export { StatTile, type StatTileProps } from './stat-tile';
