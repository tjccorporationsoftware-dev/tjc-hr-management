import { redirect } from "next/navigation";

/** ยุบไปเป็นแท็บ "ประวัติของทีม" ในหน้า "คำขอของทีม" แล้ว */
export default function RedirectPage() {
  redirect("/manager/requests?tab=history&type=offsite");
}
