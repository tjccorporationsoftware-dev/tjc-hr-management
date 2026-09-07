import { redirect } from "next/navigation";

/** หน้าโรลถูกยุบไปเป็นแท็บในหน้า "ผู้ใช้และสิทธิ์" แล้ว */
export default function RolesRedirectPage() {
  redirect("/users?tab=roles");
}
