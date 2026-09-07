import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { ExecutiveCost } from '@/features/executive/executive-cost';
import { MyPayslipsScreen } from '@/features/payroll/my-payslips-screen';

/**
 * ช่องแท็บที่สี่ — คนละคำถามกันตามบทบาท
 *
 * พนักงาน/หัวหน้าเห็น "สลิปเงินเดือนของฉัน" ส่วนผู้บริหารเห็น "ค่าจ้างรายวัน"
 * ของทั้งบริษัท เพราะสิ่งที่ผู้บริหารเปิดแอปมาดูคือวันนี้ต้องจ่ายเท่าไร ไม่ใช่
 * ยอดของตัวเอง (สลิปของตัวเองยังเปิดได้จากแท็บเพิ่มเติม)
 */
export default function WalletScreen() {
  const bootstrap = useBootstrap();
  const isExecutive = bootstrap.data?.featureFlags.executive ?? false;

  return isExecutive ? <ExecutiveCost /> : <MyPayslipsScreen />;
}
