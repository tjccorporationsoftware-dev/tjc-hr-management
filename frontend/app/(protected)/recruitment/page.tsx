import { redirect } from "next/navigation";

/**
 * ยุบไปเป็นแท็บในหน้า "รับพนักงานใหม่" แล้ว
 *
 * ชี้มาที่ "ประกาศรับสมัคร" เพราะแท็บผู้สมัครถูกยุบเข้าไปอยู่ในประกาศแต่ละใบ
 * ถ้ายังชี้ `tab=applications` ไว้จะไม่ตรงกับแท็บไหนเลย แล้วตกไปหน้าพนักงานใหม่แทน
 */
export default function RedirectPage() {
  redirect("/onboarding?tab=postings");
}
