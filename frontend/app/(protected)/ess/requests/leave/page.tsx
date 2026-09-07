import { redirect } from "next/navigation";

/** ยุบไปเป็นแท็บในหน้า "คำขอของฉัน" แล้ว */
export default function RedirectPage() {
  redirect("/ess/requests?tab=leave");
}
