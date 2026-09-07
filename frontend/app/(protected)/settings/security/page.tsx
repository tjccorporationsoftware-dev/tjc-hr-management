import { redirect } from "next/navigation";

/** ยุบไปเป็นแท็บในหน้า "ตั้งค่าระบบ" แล้ว */
export default function RedirectPage() {
  redirect("/settings/system?tab=security");
}
