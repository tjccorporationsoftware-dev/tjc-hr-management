"use client";

import type { ReactNode } from "react";
import { Download } from "lucide-react";

import { Avatar, Button, Modal, joinClassName } from "@/components/kit";
import { money, toNumber } from "@/lib/payroll-format";
import { groupPayrollLines, type GroupedPayrollLine } from "@/lib/payroll-lines";
import type {
  PayrollItem,
  PayrollRunEasyEmployeeSummary,
} from "@/types/payroll";

/**
 * รายละเอียดเงินเดือนรายคน
 * ------------------------
 * อ่านจากบนลงล่างได้เรื่องเดียว: คนนี้ได้เท่าไหร่ → มาจากอะไร → หักอะไรไปบ้าง
 *
 * เงินสุทธิอยู่บนสุดคู่กับชื่อ เพราะเป็นตัวเลขที่คนเปิดหน้านี้มองหาก่อนเพื่อน
 * เดิมอยู่ท้ายกล่อง ต้องเลื่อนผ่านทุกอย่างกว่าจะเจอ และยอดรวมสองฝั่งถูกเขียนซ้ำ
 * ทั้งบนแถบปิดท้ายและในรายการของแต่ละฝั่ง
 */

function numberText(value: string | number | null | undefined) {
  return toNumber(value).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

/** หัวข้อย่อยในกล่อง — ป้ายฟ้าคั่นด้วยเส้นบาง ไม่ใช้แถบเทาครอบ */
function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-2 flex items-end justify-between gap-3 border-b border-brand-100 pb-1.5">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
          {title}
        </p>
        {hint ? (
          <p className="shrink-0 text-[11.5px] tabular-nums text-slate-400">
            {hint}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/**
 * ตัวเลขหนึ่งช่อง — ป้ายเล็กอยู่เหนือค่า ทั้งคู่ติดกัน อ่านรวดเดียวได้ทั้งแถว
 * ตัวที่ทำให้เสียเงิน (ลา ขาด สาย) เป็นสีเตือนเมื่อมีค่า จะได้รู้ทันทีว่ายอดถูกหักเพราะอะไร
 */
function Fact({
  label,
  value,
  helper,
  alert,
}: {
  label: string;
  value: string;
  helper?: string;
  alert?: boolean;
}) {
  return (
    <div className="min-w-0 px-3 first:pl-0 last:pr-0">
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
        {label}
      </p>
      <p
        className={joinClassName(
          "truncate text-[13.5px] font-bold tabular-nums 3xl:text-[14px]",
          alert ? "text-amber-600" : "text-slate-900",
        )}
      >
        {value}
      </p>
      {helper ? (
        <p className="truncate text-[10.5px] leading-4 text-slate-400">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

/** หนึ่งแถว = หนึ่งรายการ (ยุบบรรทัดรหัสเดียวกันมาแล้ว) */
function LineRow({
  row,
  tone,
}: {
  row: GroupedPayrollLine;
  tone: "earning" | "deduction";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <p className="min-w-0 truncate text-[13px] text-slate-700 3xl:text-[13.5px]">
        {row.label}
      </p>
      <p
        className={joinClassName(
          "shrink-0 text-[13px] font-bold tabular-nums 3xl:text-[13.5px]",
          tone === "deduction" ? "text-rose-600" : "text-slate-900",
        )}
      >
        {money(row.amount)}
      </p>
    </div>
  );
}

export function ItemDetailModal({
  item,
  row,
  employeeName,
  downloading,
  onClose,
  onDownloadPayslip,
}: {
  item: PayrollItem | null;
  row?: PayrollRunEasyEmployeeSummary;
  employeeName: string;
  downloading: boolean;
  onClose: () => void;
  onDownloadPayslip: (item: PayrollItem) => void;
}) {
  if (!item) return null;

  const lines = item.lines ?? [];
  /*
   * ยุบรหัสเดียวกันให้เหลือแถวเดียว ใช้เกณฑ์เดียวกับ "สรุปยอดของงวด" ของทั้งบริษัท
   * ที่ยุบตามรหัสมาตั้งแต่แรก สองแผงจึงนับรายการตรงกัน
   * ยอดรวมไม่เปลี่ยน — ยังใช้ยอดจาก backend ตามเดิม
   */
  const earnings = groupPayrollLines(
    lines.filter((line) => line.type === "EARNING"),
  );
  const deductions = groupPayrollLines(
    lines.filter((line) => line.type === "DEDUCTION"),
  );
  const totalEarnings = toNumber(item.totalEarnings);
  const totalDeductions = toNumber(item.totalDeductions);
  const netPay = toNumber(item.totalNetPay);

  const attendanceFacts = [
    {
      label: "วันทำงาน",
      value: `${numberText(item.workingDays)} วัน`,
      alert: false,
    },
    {
      label: "ล่วงเวลา",
      value: `${numberText(item.overtimeHours)} ชม.`,
      alert: false,
    },
    {
      label: "มาสาย",
      value: `${numberText(item.lateMinutes)} นาที`,
      alert: toNumber(item.lateMinutes) > 0,
    },
    {
      label: "ลาไม่รับค่าจ้าง",
      value: `${numberText(item.unpaidLeaveDays)} วัน`,
      alert: toNumber(item.unpaidLeaveDays) > 0,
    },
    {
      label: "ขาดงาน",
      value: `${numberText(item.absentDays)} วัน`,
      alert: toNumber(item.absentDays) > 0,
    },
  ];

  /*
   * ฐานประกันสังคมมีสองตัวเลข และต่างกันได้มาก
   *   - ฐานจริง  = ค่าจ้างที่เข้าข่ายในงวดนี้
   *   - ฐานคำนวณ = ฐานจริงที่ถูกบีบเข้าช่วงขั้นต่ำ-เพดานแล้ว ตัวนี้เท่านั้นที่เอาไปคูณ %
   * ถ้าโชว์แค่ฐานจริง คนอ่านจะเอาไปคูณ 5% เองแล้วได้ตัวเลขไม่ตรงกับที่หักจริง
   * ฐานคำนวณเก็บอยู่ในช่อง quantity ของบรรทัดประกันสังคม (ที่เดียวกับที่ สปส.1-10 ใช้)
   */
  const socialSecurityLine = lines.find(
    (line) => line.code === "SOCIAL_SECURITY",
  );
  const socialSecurityBase = toNumber(row?.socialSecurityBaseEarnings);
  const socialSecurityCappedBase = toNumber(socialSecurityLine?.quantity);
  const socialSecurityCapped =
    socialSecurityCappedBase > 0 &&
    Math.abs(socialSecurityCappedBase - socialSecurityBase) >= 0.01;

  /* ฐานคำนวณ — ตัวเลขอ้างอิงที่ใช้ตรวจย้อนว่าภาษีกับประกันสังคมคิดจากอะไร */
  const baseFacts = [
    {
      label: "เงินเดือนฐาน",
      value: money(item.baseSalary),
      helper: undefined as string | undefined,
    },
    ...(row
      ? [
          {
            label: "เงินได้ที่ต้องเสียภาษี",
            value: money(row.taxableEarnings),
            helper: undefined as string | undefined,
          },
          {
            label: "ฐานประกันสังคม",
            value: money(socialSecurityBase),
            helper: socialSecurityCapped
              ? `ชนเพดาน คิดจริงจาก ${money(socialSecurityCappedBase)}`
              : undefined,
          },
          {
            label: "สมทบส่วนนายจ้าง",
            value: money(row.employerContributions),
            helper: "ไม่หักจากพนักงาน",
          },
        ]
      : []),
  ];

  const bankName = row?.bankName ?? item.compensation?.bankName ?? null;
  const bankAccountNo =
    row?.bankAccountNoMasked ?? item.compensation?.bankAccountNo ?? null;
  const payoutText =
    bankName || bankAccountNo
      ? `โอนเข้า ${[bankName, bankAccountNo].filter(Boolean).join(" ")}`
      : (row?.paymentMethodLabel ?? null);

  return (
    <Modal
      open
      size="lg"
      title="รายละเอียดเงินเดือน"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>ปิด</Button>
          <Button
            variant="primary"
            icon={<Download className="h-3.5 w-3.5" />}
            loading={downloading}
            onClick={() => onDownloadPayslip(item)}
          >
            ดาวน์โหลดสลิป
          </Button>
        </>
      }
    >
      {/* แถบตัวตนกินเต็มความกว้างของกล่อง จึงต้องถอยขอบในของ Modal ออก */}
      <div className="-mx-5 -mt-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-brand-100 bg-brand-50/50 px-5 py-3">
          <Avatar name={employeeName} size="md" />

          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-bold text-slate-900 3xl:text-[15px]">
              {employeeName}
            </p>
            <p className="truncate text-[11.5px] text-slate-500 3xl:text-[12px]">
              {[
                item.employee.employeeCode,
                item.departmentName,
                item.branchName,
                payoutText,
              ]
                .filter(Boolean)
                .join(" · ") || "-"}
            </p>
          </div>

          {/* เงินสุทธิเป็นตัวเลขหลักของกล่องนี้ จึงอยู่บนสุดคู่กับชื่อ */}
          <div className="shrink-0 text-right">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
              เงินสุทธิที่ได้รับ
            </p>
            <p
              className={joinClassName(
                "text-[24px] font-bold leading-tight tabular-nums tracking-tight 3xl:text-[26px]",
                netPay < 0 ? "text-rose-700" : "text-slate-900",
              )}
            >
              {money(netPay)}
            </p>
            <p className="text-[11.5px] tabular-nums text-slate-500">
              รับ {money(totalEarnings)}
              <span className="mx-1 text-slate-400">−</span>
              หัก <span className="text-rose-600">{money(totalDeductions)}</span>
            </p>
          </div>
        </div>

        <div className="space-y-5 px-5 py-4">
          <Section title="การมาทำงานในงวดนี้">
            <div className="flex flex-wrap items-stretch divide-x divide-brand-100">
              {attendanceFacts.map((fact) => (
                <div key={fact.label} className="min-w-[7rem] flex-auto">
                  <Fact
                    label={fact.label}
                    value={fact.value}
                    alert={fact.alert}
                  />
                </div>
              ))}
            </div>
          </Section>

          <Section title="ฐานที่ใช้คำนวณ">
            <div className="flex flex-wrap items-stretch divide-x divide-brand-100">
              {baseFacts.map((fact) => (
                <div key={fact.label} className="min-w-[9rem] flex-auto">
                  <Fact
                    label={fact.label}
                    value={fact.value}
                    helper={fact.helper}
                  />
                </div>
              ))}
            </div>
          </Section>

          {/* รายการสองฝั่งวางคู่กัน อ่านเทียบกันได้ในสายตาเดียว */}
          <div className="grid gap-5 sm:grid-cols-2">
            <Section title="รายรับ" hint={`${earnings.length} รายการ`}>
              {earnings.length ? (
                <div className="divide-y divide-brand-50">
                  {earnings.map((line) => (
                    <LineRow key={line.key} row={line} tone="earning" />
                  ))}
                </div>
              ) : (
                <p className="py-2 text-[13px] text-slate-400">
                  ไม่มีรายการรายได้
                </p>
              )}
            </Section>

            <Section title="รายการหัก" hint={`${deductions.length} รายการ`}>
              {deductions.length ? (
                <div className="divide-y divide-brand-50">
                  {deductions.map((line) => (
                    <LineRow key={line.key} row={line} tone="deduction" />
                  ))}
                </div>
              ) : (
                <p className="py-2 text-[13px] text-slate-400">
                  ไม่มีรายการหัก
                </p>
              )}
            </Section>
          </div>

          {item.note ? (
            <Section title="หมายเหตุ">
              <p className="whitespace-pre-line text-[13px] leading-6 text-slate-600 3xl:text-[13.5px]">
                {item.note}
              </p>
            </Section>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
