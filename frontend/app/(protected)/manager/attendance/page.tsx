import { redirect } from "next/navigation";

/** ยุบไปเป็นแท็บ "เวลาทำงานรายวัน" ในหน้า "ทีมของฉัน" แล้ว */
export default function RedirectPage() {
  redirect("/manager/team?tab=attendance");
}
