import { redirect } from "next/navigation";

/** ยุบไปเป็นแท็บในหน้า "ศูนย์คำขอ" แล้ว */
export default function RedirectPage() {
  redirect("/approvals?tab=history");
}
