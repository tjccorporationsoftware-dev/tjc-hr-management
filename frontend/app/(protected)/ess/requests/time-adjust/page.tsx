import { redirect } from "next/navigation";

/** ยุบไปเป็นแท็บในหน้า "คำขอของฉัน" แล้ว */
export default function TimeAdjustRedirectPage() {
  redirect("/ess/requests?tab=time-adjust");
}
