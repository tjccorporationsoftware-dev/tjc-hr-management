import { redirect } from "next/navigation";

/** ยุบไปเป็นแท็บในหน้า "ศูนย์บริการพนักงาน" แล้ว */
export default function RedirectPage() {
  redirect("/documents?tab=complaints");
}
