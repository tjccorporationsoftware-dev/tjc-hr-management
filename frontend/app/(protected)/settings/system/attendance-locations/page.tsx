import { redirect } from "next/navigation";

/** จุดลงเวลาอยู่ในแท็บของหน้า "การลงเวลา" แล้ว */
export default function AttendanceLocationsRedirectPage() {
  redirect("/settings/attendance?tab=locations");
}
