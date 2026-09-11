/*
 * แผนที่คอลัมน์ในไฟล์เงินเดือน -> รายการเสริมเฉพาะงวด (payroll_adjustments)
 * ใช้รหัสชุดเดียวกับที่งวด ส.ค. 2569 นำเข้าไว้แล้ว
 */
module.exports = {
  EARNING: {
    'เบี้ยขยัน': 'ATTENDANCE_INCENTIVE',
    'ค่าตำแหน่ง': 'POSITION_ALLOWANCE',
    'ค่าเดินทาง': 'TRANSPORT_ALLOWANCE',
    'ค่าโทรศัพท์': 'PHONE_ALLOWANCE',
    'คอมมิชชั่น': 'COMMISSION',
    'คืนภาษี': 'TAX_REFUND',
    'ค่ารถ': 'VEHICLE_ALLOWANCE',
    'ค่ารถ#2': 'VEHICLE_ALLOWANCE',
    'ค่าแรงตกหล่น': 'RETRO_PAY',
    'รายรับอื่นๆ': 'OTHER_EARNING',
    'เงินพิเศษผู้บริหาร': 'EXECUTIVE_ALLOWANCE',
    'เบี้ยเลี้ยง': 'PER_DIEM',
    'โบนัส': 'BONUS',
    'วันทำงานพิเศษ': 'OT_SPECIAL_HOLIDAY',
  },
  DEDUCTION: {
    'กรอ': 'ICL_LOAN',
    'กองทุนกู้ยืม กยศ.': 'STUDENT_LOAN',
    'ค่าเช่าห้อง': 'ROOM_RENT',
    'ค่าชุดพนักงาน': 'UNIFORM_DEDUCTION',
    'ค่าปรับ': 'PENALTY',
    'ยื่นภาษีหัก ณ ที่จ่าย': 'WITHHOLDING_TAX',
    'หัก ณ ที่จ่าย': 'WITHHOLDING_TAX',
    'รายจ่ายอื่นๆ': 'OTHER_DEDUCTION',
    'ค่าผ่อนสินค้าบริษัท': 'INSTALLMENT_DEDUCTION',
    'ชำระค่าเสียหาย': 'DAMAGE_DEDUCTION',
    'ยืมเงินชำระเป็นงวด': 'ADVANCE_REPAYMENT',
    'เงินประกันการทำงาน': 'WORK_GUARANTEE',
    'ภาษี': 'TAX',
    'ภาษีลาออก': 'SEVERANCE_TAX',
  },
  /* ระบบคำนวณเองจากเวลาทำงาน/ค่าจ้าง ไม่นำเข้า */
  COMPUTED: ['เงินเดือน','อัตราค่าจ้าง','มาทำงาน','วันทำงาน','มาเช้า','กลับช้า',
    'โอทีล่วงเวลา(x1.0)','โอทีล่วงเวลาวันหยุด(x1.5)','สาย','กลับก่อน','ลางาน','ขาดงาน',
    'ประกันสังคม','รวมรายรับ','รวมรายจ่าย','รวมยอด','เบิกล่วงหน้า','คงเหลือ'],
};
