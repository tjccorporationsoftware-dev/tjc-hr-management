import { redirect } from "next/navigation";

/** คำขอทำงานนอกสถานที่อยู่ในแท็บ "แก้เวลา / นอกสถานที่" */
export default function EssOffsiteRequestRedirectPage() {
  redirect("/ess/requests?tab=time-adjust&requestType=offsite");
}
