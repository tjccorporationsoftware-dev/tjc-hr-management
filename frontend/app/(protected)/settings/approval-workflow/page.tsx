import { redirect } from "next/navigation";

/** สายอนุมัติถูกยุบไปเป็นแท็บในหน้า "นโยบายการทำงาน" แล้ว */
export default function ApprovalWorkflowRedirectPage() {
  redirect("/settings/work-policies?tab=approval");
}
