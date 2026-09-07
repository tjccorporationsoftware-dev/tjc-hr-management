import { redirect } from "next/navigation";

/** ยุบไปเป็นแท็บในหน้า "โครงสร้างองค์กร" แล้ว */
export default function RedirectPage() {
  redirect("/organization?tab=manpower");
}
