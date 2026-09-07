import { redirect } from "next/navigation";

/** ยุบไปเป็นแท็บในหน้า "ห้องผู้บริหาร" แล้ว */
export default function RedirectPage() {
  redirect("/executive?tab=manpower");
}
