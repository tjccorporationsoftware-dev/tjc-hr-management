import { redirect } from "next/navigation";

/** รวมเข้าเป็นแท็บ "ภาพรวมวันนี้" ในหน้า "ทีมของฉัน" แล้ว */
export default function RedirectPage() {
  redirect("/manager/team");
}
