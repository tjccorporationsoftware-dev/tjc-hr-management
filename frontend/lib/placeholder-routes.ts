export type PlaceholderStatus =
  | "Soon"
  | "ใหม่"
  | "เปิดเมนู"
  | "ปรับปรุง"
  | "ใช้ได้";

export type PlaceholderRouteConfig = {
  path: string;
  title: string;
  group: string;
  status: PlaceholderStatus;
  description: string;
  features: string[];
  permissionNote: string;
  backHref?: string;
  backLabel?: string;
};

export const placeholderRoutes: Record<string, PlaceholderRouteConfig> = {
  "/ess/my-attendance": {
    path: "/ess/my-attendance",
    title: "ประวัติลงเวลาของฉัน",
    group: "พนักงาน",
    status: "Soon",
    description:
      "หน้าประวัติลงเวลาส่วนตัวของพนักงาน ใช้สำหรับดูข้อมูลการเข้างาน ย้อนหลัง และเชื่อมไปยังคำขอแก้เวลา",
    features: [
      "แสดงประวัติลงเวลาของตัวเอง",
      "กรองข้อมูลตามช่วงวันที่",
      "แสดงสถานะ ปกติ / มาสาย / ขาด / แก้ไขแล้ว",
      "ลิงก์ไปสร้างคำขอแก้เวลา",
      "วันที่ในตารางและตัวกรองต้องเป็นรูปแบบ วัน/เดือน/ปี",
    ],
    permissionNote: "เฉพาะพนักงานที่เข้าสู่ระบบจึงจะเห็นข้อมูลลงเวลาของตัวเอง",
    backHref: "/ess",
    backLabel: "กลับไปหน้า ESS",
  },

  "/ess/requests": {
    path: "/ess/requests",
    title: "คำขอของฉัน",
    group: "พนักงาน",
    status: "Soon",
    description:
      "หน้ารวมคำขอของพนักงาน แยกเป็นแท็บใบลา OT ขอแก้เวลา ขอเอกสาร และรายการทั้งหมด",
    features: [
      "รวมคำขอทั้งหมดของพนักงานไว้ในหน้าเดียว",
      "แยกแท็บ ใบลา / OT / ขอแก้เวลา / ขอเอกสาร / ทั้งหมด",
      "แสดงสถานะคำขอ เช่น รออนุมัติ อนุมัติแล้ว ไม่อนุมัติ",
      "แสดงวันที่ยื่น วันที่เริ่มต้น วันที่สิ้นสุด และวันที่อัปเดตล่าสุด",
      "ทุกวันที่บน UI ต้องแสดงเป็น วัน/เดือน/ปี",
    ],
    permissionNote: "พนักงานเห็นเฉพาะคำขอของตัวเอง",
    backHref: "/ess",
    backLabel: "กลับไปหน้า ESS",
  },

  "/ess/requests/leave": {
    path: "/ess/requests/leave",
    title: "ยื่นใบลา",
    group: "พนักงาน",
    status: "Soon",
    description:
      "หน้าสำหรับพนักงานยื่นใบลา เลือกประเภทลา ระบุช่วงวันที่ แนบไฟล์ และดูประวัติใบลาของตนเอง",
    features: [
      "ฟอร์มยื่นใบลา",
      "เลือกประเภทลา",
      "เลือกวันที่เริ่มลาและวันที่สิ้นสุดลา",
      "แนบไฟล์ประกอบการลา",
      "แสดงยอดวันลาคงเหลือ",
      "แสดงประวัติใบลาของฉัน",
    ],
    permissionNote: "พนักงานสร้างและดูใบลาของตัวเองเท่านั้น",
    backHref: "/ess/requests",
    backLabel: "กลับไปหน้าคำขอของฉัน",
  },

  "/ess/requests/overtime": {
    path: "/ess/requests/overtime",
    title: "ขอทำงานล่วงเวลา",
    group: "พนักงาน",
    status: "Soon",
    description:
      "หน้าสำหรับพนักงานยื่นคำขอ OT ระบุวันที่ เวลาเริ่ม เวลาเลิก เหตุผล และดูประวัติ OT ของตนเอง",
    features: [
      "ฟอร์มขอ OT",
      "เลือกวันที่ทำ OT",
      "ระบุเวลาเริ่มและเวลาสิ้นสุด",
      "กรอกเหตุผลในการทำ OT",
      "แนบไฟล์ถ้าจำเป็น",
      "แสดงประวัติ OT ของฉัน",
    ],
    permissionNote: "พนักงานสร้างและดูคำขอ OT ของตัวเองเท่านั้น",
    backHref: "/ess/requests",
    backLabel: "กลับไปหน้าคำขอของฉัน",
  },

  "/ess/requests/time-adjust": {
    path: "/ess/requests/time-adjust",
    title: "ขอแก้ไขเวลา",
    group: "พนักงาน",
    status: "Soon",
    description:
      "หน้าสำหรับพนักงานยื่นคำขอแก้ไขเวลาเข้าออกงาน พร้อมระบุเหตุผลและแนบหลักฐาน",
    features: [
      "ฟอร์มขอแก้เวลา",
      "เลือกวันที่ต้องการแก้ไข",
      "เลือกประเภท แก้เวลาเข้า / แก้เวลาออก",
      "ระบุเวลาใหม่",
      "กรอกเหตุผล",
      "แนบหลักฐาน",
      "แสดงประวัติคำขอแก้เวลาของฉัน",
    ],
    permissionNote: "พนักงานสร้างและดูคำขอแก้เวลาของตัวเองเท่านั้น",
    backHref: "/ess/requests",
    backLabel: "กลับไปหน้าคำขอของฉัน",
  },

  "/ess/requests/documents": {
    path: "/ess/requests/documents",
    title: "ขอเอกสาร",
    group: "พนักงาน",
    status: "Soon",
    description:
      "หน้าสำหรับพนักงานขอเอกสารจาก HR เช่น หนังสือรับรองการทำงาน หรือเอกสารอื่นตามสิทธิ์",
    features: [
      "ฟอร์มขอเอกสาร",
      "เลือกประเภทเอกสาร",
      "ระบุเหตุผลในการขอเอกสาร",
      "แสดงประวัติคำขอเอกสาร",
      "ดาวน์โหลดเอกสารที่ HR ออกให้แล้ว",
    ],
    permissionNote: "พนักงานเห็นเฉพาะคำขอเอกสารของตัวเอง",
    backHref: "/ess/requests",
    backLabel: "กลับไปหน้าคำขอของฉัน",
  },

  "/manager/dashboard": {
    path: "/manager/dashboard",
    title: "ภาพรวมหัวหน้างาน",
    group: "หัวหน้างาน",
    status: "Soon",
    description:
      "หน้าภาพรวมสำหรับหัวหน้างาน ใช้ดูสถานะทีม รายการรออนุมัติ และข้อมูลการทำงานของลูกทีม",
    features: [
      "สรุปทีมของฉัน",
      "รายการรออนุมัติ",
      "ลูกทีมที่ขาด ลา หรือมาสายวันนี้",
      "OT รออนุมัติ",
      "ใบลาที่กำลังจะเกิดขึ้น",
    ],
    permissionNote: "เฉพาะหัวหน้างานหรือผู้มีสิทธิ์อนุมัติจึงจะเข้าถึงได้",
    backHref: "/dashboard",
    backLabel: "กลับไปหน้าภาพรวม",
  },

  "/manager/team": {
    path: "/manager/team",
    title: "ทีมของฉัน",
    group: "หัวหน้างาน",
    status: "Soon",
    description:
      "หน้ารายชื่อลูกทีมของหัวหน้างาน พร้อมสถานะการทำงานและข้อมูลติดต่อเบื้องต้น",
    features: [
      "รายชื่อลูกทีม",
      "สถานะทำงานวันนี้",
      "ตำแหน่งและแผนก",
      "เบอร์ติดต่อ",
      "ลิงก์ดูรายละเอียดพนักงาน",
    ],
    permissionNote: "หัวหน้างานเห็นเฉพาะพนักงานในทีมของตัวเอง",
    backHref: "/manager/dashboard",
    backLabel: "กลับไปภาพรวมหัวหน้างาน",
  },

  "/manager/attendance": {
    path: "/manager/attendance",
    title: "เวลาทำงานของทีม",
    group: "หัวหน้างาน",
    status: "Soon",
    description:
      "หน้าสำหรับหัวหน้างานตรวจสอบเวลาทำงานของลูกทีม กรองวันที่และสถานะได้",
    features: [
      "ดูเวลาทำงานของลูกทีม",
      "กรองตามวันที่",
      "กรองตามสถานะ",
      "ดูรายชื่อคนที่ยังไม่ Check-in",
      "วันที่ในตัวกรองและตารางต้องเป็น วัน/เดือน/ปี",
    ],
    permissionNote: "หัวหน้างานเห็นเฉพาะข้อมูลลงเวลาของลูกทีม",
    backHref: "/manager/dashboard",
    backLabel: "กลับไปภาพรวมหัวหน้างาน",
  },

  "/manager/leaves": {
    path: "/manager/leaves",
    title: "การลาของทีม",
    group: "หัวหน้างาน",
    status: "Soon",
    description:
      "หน้าปฏิทินและรายการใบลาของลูกทีม เพื่อให้หัวหน้างานวางแผนอัตรากำลังได้ง่ายขึ้น",
    features: [
      "ปฏิทินการลาของทีม",
      "รายการใบลาของลูกทีม",
      "ดูคนลาพร้อมกันในทีม",
      "แสดงวันที่เริ่มลาและวันที่สิ้นสุดลา",
    ],
    permissionNote: "หัวหน้างานเห็นเฉพาะข้อมูลการลาของลูกทีม",
    backHref: "/manager/dashboard",
    backLabel: "กลับไปภาพรวมหัวหน้างาน",
  },

  "/manager/overtime": {
    path: "/manager/overtime",
    title: "OT ของทีม",
    group: "หัวหน้างาน",
    status: "Soon",
    description:
      "หน้าสรุป OT ของทีม แสดงชั่วโมง OT และรายการที่รอหัวหน้างานพิจารณา",
    features: [
      "ดู OT ของทีม",
      "สรุปชั่วโมง OT",
      "รายการรออนุมัติ",
      "แสดงวันที่ OT วันที่ยื่น และวันที่อนุมัติ",
    ],
    permissionNote: "หัวหน้างานเห็นเฉพาะ OT ของลูกทีม",
    backHref: "/manager/dashboard",
    backLabel: "กลับไปภาพรวมหัวหน้างาน",
  },

  "/hr/dashboard": {
    path: "/hr/dashboard",
    title: "ภาพรวมงาน HR",
    group: "งาน HR",
    status: "Soon",
    description:
      "หน้าภาพรวมสำหรับ HR ใช้ดูจำนวนพนักงาน คำขอที่รอ HR Review และงานเอกสารที่ต้องดำเนินการ",
    features: [
      "จำนวนพนักงานทั้งหมด",
      "พนักงานเข้าใหม่และลาออก",
      "คำขอรอ HR Review",
      "ขาด ลา หรือมาสายวันนี้",
      "เอกสารรอดำเนินการ",
      "แจ้งเตือนทดลองงาน",
    ],
    permissionNote: "เฉพาะ HR หรือผู้มีสิทธิ์ดูข้อมูลองค์กรจึงจะเข้าถึงได้",
    backHref: "/dashboard",
    backLabel: "กลับไปหน้าภาพรวม",
  },

  "/hr/leaves": {
    path: "/hr/leaves",
    title: "จัดการการลา",
    group: "งาน HR",
    status: "Soon",
    description:
      "หน้าสำหรับ HR ดูใบลาทั้งองค์กร จัดการประเภทลา โควตาวันลา และส่งออกข้อมูลรายงานลา",
    features: [
      "ดูใบลาทั้งองค์กร",
      "จัดการประเภทลา",
      "จัดการโควตาวันลา",
      "ดูประวัติการลา",
      "Export รายงานลา",
    ],
    permissionNote: "เฉพาะ HR ที่มีสิทธิ์จัดการข้อมูลการลา",
    backHref: "/hr/dashboard",
    backLabel: "กลับไปภาพรวมงาน HR",
  },

  "/hr/overtime": {
    path: "/hr/overtime",
    title: "จัดการ OT",
    group: "งาน HR",
    status: "Soon",
    description:
      "หน้าสำหรับ HR ดู OT ทั้งองค์กร ตรวจรายการ OT จัดการนโยบาย และส่งออกรายงาน",
    features: [
      "ดู OT ทั้งองค์กร",
      "จัดการนโยบาย OT",
      "ตรวจรายการ OT",
      "Export รายงาน OT",
      "แสดงวันที่ OT วันที่ยื่น และวันที่ส่งเข้า HR Review",
    ],
    permissionNote: "เฉพาะ HR ที่มีสิทธิ์จัดการ OT",
    backHref: "/hr/dashboard",
    backLabel: "กลับไปภาพรวมงาน HR",
  },

  "/hr/time-adjust": {
    path: "/hr/time-adjust",
    title: "จัดการคำขอแก้เวลา",
    group: "งาน HR",
    status: "Soon",
    description:
      "หน้าสำหรับ HR ดูคำขอแก้เวลาทั้งหมด ตรวจหลักฐาน และส่งออกข้อมูลรายงาน",
    features: [
      "ดูคำขอแก้เวลาทั้งหมด",
      "ตรวจหลักฐาน",
      "ดูประวัติการแก้ไขเวลา",
      "Export รายงาน",
      "แสดงวันที่ต้องการแก้ วันที่ยื่น และวันที่อนุมัติ",
    ],
    permissionNote: "เฉพาะ HR ที่มีสิทธิ์ตรวจสอบคำขอแก้เวลา",
    backHref: "/hr/dashboard",
    backLabel: "กลับไปภาพรวมงาน HR",
  },

  "/executive/dashboard": {
    path: "/executive/dashboard",
    title: "ภาพรวมผู้บริหาร",
    group: "ผู้บริหาร",
    status: "Soon",
    description:
      "หน้าภาพรวมองค์กรสำหรับผู้บริหาร เน้นตัวเลขรวม แนวโน้ม และข้อมูลเชิงบริหาร",
    features: [
      "ภาพรวมองค์กร",
      "จำนวนพนักงาน",
      "ค่าใช้จ่ายเงินเดือนรวม",
      "OT รวม",
      "ขาด ลา หรือมาสาย",
      "อัตรากำลังแยกแผนก",
    ],
    permissionNote: "เฉพาะผู้บริหารหรือผู้มีสิทธิ์ดูข้อมูลสรุประดับองค์กร",
    backHref: "/dashboard",
    backLabel: "กลับไปหน้าภาพรวม",
  },

  "/executive/manpower": {
    path: "/executive/manpower",
    title: "วิเคราะห์กำลังคน",
    group: "ผู้บริหาร",
    status: "Soon",
    description:
      "หน้าวิเคราะห์กำลังคนสำหรับผู้บริหาร ใช้ดูแนวโน้มจำนวนพนักงาน คนเข้าออก และเปรียบเทียบแผนก",
    features: [
      "กราฟกำลังคน",
      "แนวโน้มจำนวนพนักงาน",
      "คนเข้าและคนออก",
      "เปรียบเทียบแผนก",
      "แสดงวันที่รายงานและช่วงวันที่วิเคราะห์",
    ],
    permissionNote: "เฉพาะผู้บริหารหรือ HR ที่มีสิทธิ์ดูรายงานกำลังคน",
    backHref: "/executive/dashboard",
    backLabel: "กลับไปภาพรวมผู้บริหาร",
  },

  "/executive/reports": {
    path: "/executive/reports",
    title: "รายงานผู้บริหาร",
    group: "ผู้บริหาร",
    status: "Soon",
    description:
      "หน้ารายงานสรุปสำหรับผู้บริหาร เน้นตัวเลขรวมและกราฟ โดยไม่แสดงรายละเอียดส่วนบุคคลเกินจำเป็น",
    features: [
      "รายงานสรุปสำหรับผู้บริหาร",
      "ไม่แสดงรายละเอียดส่วนบุคคลเกินจำเป็น",
      "เน้นตัวเลขรวมและกราฟ",
      "แสดงช่วงวันที่รายงานและวันที่สร้างรายงาน",
    ],
    permissionNote: "เฉพาะผู้บริหารหรือผู้มีสิทธิ์ดูรายงานภาพรวม",
    backHref: "/executive/dashboard",
    backLabel: "กลับไปภาพรวมผู้บริหาร",
  },

  "/executive/payroll-summary": {
    path: "/executive/payroll-summary",
    title: "สรุปเงินเดือนผู้บริหาร",
    group: "ผู้บริหาร",
    status: "Soon",
    description:
      "หน้าสรุปค่าใช้จ่ายเงินเดือนสำหรับผู้บริหารที่มีสิทธิ์ เน้นข้อมูลรวม ไม่แสดงรายคนหากไม่มีสิทธิ์",
    features: [
      "ค่าใช้จ่ายเงินเดือนรวม",
      "OT Cost",
      "Allowance และ Deduction รวม",
      "Trend รายเดือน",
      "ไม่แสดงเงินเดือนรายคนถ้าไม่มีสิทธิ์",
    ],
    permissionNote: "ข้อมูลเงินเดือนต้องจำกัดเฉพาะผู้บริหารที่มีสิทธิ์เงินเดือน",
    backHref: "/executive/dashboard",
    backLabel: "กลับไปภาพรวมผู้บริหาร",
  },


  "/settings/system": {
    path: "/settings/system",
    title: "ตั้งค่าระบบ",
    group: "ผู้ดูแลระบบ",
    status: "Soon",
    description:
      "หน้าตั้งค่าระบบหลัก เช่น ข้อมูลบริษัท Timezone รูปแบบวันที่ ความปลอดภัย การอัปโหลดไฟล์ และ Notification",
    features: [
      "ตั้งค่าบริษัท",
      "Timezone",
      "Date format",
      "Security policy",
      "File upload policy",
      "Notification setting",
      "แสดงวันที่บันทึกการตั้งค่าและวันที่แก้ไขล่าสุด",
    ],
    permissionNote: "เฉพาะ Admin ที่มีสิทธิ์ตั้งค่าระบบ",
    backHref: "/settings/security",
    backLabel: "กลับไปตั้งค่าระบบ",
  },
};

export function getPlaceholderRoute(pathname: string) {
  const normalizedPathname = normalizePlaceholderPath(pathname);

  return placeholderRoutes[normalizedPathname] ?? null;
}

export function normalizePlaceholderPath(pathname: string) {
  return pathname;
}

export function getAllPlaceholderRoutes() {
  return Object.values(placeholderRoutes);
}