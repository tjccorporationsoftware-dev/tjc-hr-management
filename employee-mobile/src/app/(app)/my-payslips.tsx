import { MyPayslipsScreen } from '@/features/payroll/my-payslips-screen';

/**
 * ทางเข้าสลิปของตัวเองสำหรับผู้บริหาร — ช่องแท็บถูกใช้เป็นจอต้นทุนพนักงาน
 * จอนี้จึงเป็นตัวเดียวกับของพนักงาน แค่ถูก push ขึ้นมาจึงต้องมีปุ่มย้อนกลับ
 */
export default function MyPayslipsRoute() {
  return <MyPayslipsScreen showBack />;
}
