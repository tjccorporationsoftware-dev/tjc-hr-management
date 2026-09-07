import { redirect } from "next/navigation";

/** ปฏิทินวันหยุดถูกยุบไปเป็นแท็บในหน้า "นโยบายการทำงาน" แล้ว */
export default function HolidayCalendarRedirectPage() {
  redirect("/settings/work-policies?tab=holiday");
}
