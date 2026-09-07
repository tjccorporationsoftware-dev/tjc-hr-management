import { redirect } from "next/navigation";

/** ยุบไปเป็นแท็บในหน้า "การลงเวลา" แล้ว */
export default function AttendanceMethodsRedirectPage() {
  redirect("/settings/attendance?tab=methods");
}
