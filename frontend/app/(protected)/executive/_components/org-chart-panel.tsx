"use client";

import { OrgStructureView } from "../../organization/_components/org-structure-view";

/**
 * แท็บผังองค์กรของห้องผู้บริหาร
 * ----------------------------
 * ใช้ component เดียวกับหน้า /organization ของ HR เพื่อให้หน้าตาและวิธีอ่านผัง
 * เป็นชุดเดียวกันทั้งระบบ ต่างกันแค่เปิดโหมด readOnly
 *
 * โหมดนั้นเปลี่ยนแหล่งข้อมูลไปที่ `/organization/org-chart` ซึ่งใช้ ORG_READ ตัวเดียว
 * ของเดิมประกอบผังจาก `/employees` ที่ต้องมี EMPLOYEE_READ — ผู้บริหารจึงเจอ 403
 * และผังขึ้นว่างเปล่า ส่วนการจะแจก EMPLOYEE_READ ให้ก็เท่ากับเปิดทะเบียนพนักงาน
 * ทั้งองค์กรให้ ซึ่งเกินกว่าที่ต้องใช้แค่ดูรูปผัง
 *
 * ตัวกรองบริษัท/สาขาไม่ต้องมี เพราะผู้บริหารถูกล็อกด้วย tenant scope ของตัวเองอยู่แล้ว
 */
export function OrgChartPanel() {
  return <OrgStructureView readOnly />;
}
