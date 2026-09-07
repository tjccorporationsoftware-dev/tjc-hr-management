import { redirect } from "next/navigation";

/** ประวัติลงเวลาถูกยุบไปเป็นแท็บในหน้า "ลงเวลา" แล้ว */
export default function EssMyAttendanceRedirectPage() {
  redirect("/ess/check-in?tab=history");
}
