import { redirect } from "next/navigation";

/** ยุบไปเป็นแท็บในหน้า "ระบบและบันทึก" แล้ว */
export default function RedirectPage() {
  redirect("/settings/monitoring?tab=audit");
}
