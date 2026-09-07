import { redirect } from "next/navigation";

/** สลิปเงินเดือนถูกยุบไปเป็นแท็บในหน้า "ข้อมูลของฉัน" แล้ว */
export default function EssSalarySlipRedirectPage() {
  redirect("/ess/my-profile?tab=payslip");
}
