"use client";

import { useState, type ReactNode } from "react";
import { Info, Plus, RotateCcw, Save, Trash2 } from "lucide-react";

import { Button, IconButton, TextInput } from "@/components/kit";
import { getSeveranceTiers, replaceSeveranceTiers } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useApiMutation, useApiQuery } from "@/lib/use-api";
import type {
  SeveranceTierInput,
  SeveranceTiersResponse,
} from "@/types/payroll";

/**
 * บันไดค่าชดเชยเลิกจ้าง
 * ---------------------
 * พ.ร.บ.คุ้มครองแรงงาน ม.118 เป็น "ขั้นต่ำ" บริษัทจ่ายมากกว่าได้ น้อยกว่าไม่ได้
 *
 * ระบบใช้ขั้นต่ำตามกฎหมายให้อัตโนมัติเมื่อยังไม่ได้ตั้งเอง
 * หน้านี้จึงมีไว้สำหรับบริษัทที่จ่ายดีกว่าที่กฎหมายกำหนดเท่านั้น
 * เซิร์ฟเวอร์ตรวจซ้ำอีกชั้นและปฏิเสธบันไดที่ต่ำกว่ากฎหมาย
 */

type TierRow = {
  /** เก็บเป็นข้อความระหว่างแก้ เพื่อให้ลบทั้งช่องแล้วพิมพ์ใหม่ได้ */
  minServiceMonths: string;
  payDays: string;
  note: string;
};

function toRows(
  tiers: Array<{
    minServiceMonths: number;
    payDays: number;
    note?: string | null;
  }>,
): TierRow[] {
  return tiers.map((tier) => ({
    minServiceMonths: String(tier.minServiceMonths),
    payDays: String(tier.payDays),
    note: tier.note ?? "",
  }));
}

/** อธิบายอายุงานเป็นภาษาคน — HR คิดเป็นปี ไม่ใช่เดือน */
function monthsLabel(value: string) {
  const months = Number(value);

  if (!Number.isFinite(months) || months <= 0) return "—";
  if (months < 12) return `${months} เดือน`;

  const years = months / 12;

  return Number.isInteger(years)
    ? `${years} ปี`
    : `${Math.floor(years)} ปี ${months % 12} เดือน`;
}

const HEAD_CLASS =
  "text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400 3xl:text-[10.5px]";

export function SeveranceTierPanel({ companyId }: { companyId: string }) {
  /*
   * แถวที่กำลังแก้อยู่ เก็บแยกจากข้อมูลที่โหลดมา
   * null = ยังไม่ได้แตะอะไร ให้แสดงค่าจากเซิร์ฟเวอร์ตรง ๆ
   * ทำแบบนี้เพื่อไม่ต้อง setState ใน effect ซึ่งทำให้เกิด render ซ้อน
   */
  const [draft, setDraft] = useState<TierRow[] | null>(null);

  const query = useApiQuery<SeveranceTiersResponse>(
    queryKeys.payroll.severanceTiers(companyId),
    () => getSeveranceTiers(companyId),
    { enabled: Boolean(companyId) },
  );

  const save = useApiMutation<unknown, SeveranceTierInput[]>(
    (tiers) => replaceSeveranceTiers(companyId, tiers),
    {
      invalidates: [queryKeys.payroll.severanceTiers(companyId)],
      successMessage: "บันทึกบันไดค่าชดเชยแล้ว",
      onSuccess: () => setDraft(null),
    },
  );

  const statutoryRows = query.data?.statutoryTiers ?? [];

  /*
   * บริษัทที่ยังไม่ได้ตั้งเอง ให้เห็นบันไดตามกฎหมายเป็นค่าตั้งต้นเลย
   *
   * เดิมโชว์ตารางว่างพร้อมข้อความให้ไปกดปุ่ม "ใช้ขั้นต่ำตามกฎหมาย" เอง
   * ทั้งที่ระบบคิดค่าชดเชยตามบันไดนั้นให้อยู่แล้ว — คนใช้จึงเข้าใจว่ายังไม่มีอะไร
   * ตอนนี้เห็นตัวเลขจริงที่ระบบใช้ตั้งแต่เปิดหน้า แล้วแก้ทับได้ถ้าบริษัทจ่ายดีกว่า
   */
  const savedRows = query.data?.tiers ?? [];
  const rows =
    draft ?? toRows(savedRows.length > 0 ? savedRows : statutoryRows);

  function updateRow(index: number, patch: Partial<TierRow>) {
    setDraft(
      rows.map((row, position) =>
        position === index ? { ...row, ...patch } : row,
      ),
    );
  }

  function submit() {
    save.mutate(
      rows
        // แถวว่างเกิดจากกดเพิ่มแล้วไม่ได้กรอก ตัดทิ้งเงียบ ๆ ดีกว่าฟ้อง
        .filter((row) => row.minServiceMonths !== "" && row.payDays !== "")
        .map((row) => ({
          minServiceMonths: Number(row.minServiceMonths),
          payDays: Number(row.payDays),
          note: row.note.trim() || undefined,
        })),
    );
  }

  return (
    <>
      <PanelSection
        title="บันไดค่าชดเชยเลิกจ้าง"
        description="จ่ายมากกว่าที่กฎหมายกำหนดได้ จ่ายน้อยกว่าไม่ได้"
        actions={
          <>
            <Button
              size="sm"
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              onClick={() => setDraft(toRows(statutoryRows))}
              disabled={save.isPending || statutoryRows.length === 0}
            >
              ใช้ขั้นต่ำตามกฎหมาย
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<Save className="h-3.5 w-3.5" />}
              onClick={submit}
              loading={save.isPending}
              disabled={!companyId}
            >
              บันทึก
            </Button>
          </>
        }
      >
        {query.isLoading ? (
          <p className="py-10 text-center text-[13px] text-slate-400">
            กำลังโหลด…
          </p>
        ) : (
          <>
            {query.data?.usingStatutoryDefault && draft === null ? (
              <p className="mb-3 flex items-start gap-2 rounded-lg bg-brand-50/70 px-3.5 py-2.5 text-[12.5px] leading-5 text-slate-700 3xl:text-[13px]">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <span>
                  นี่คือขั้นต่ำตามมาตรา 118 ที่ระบบใช้คิดค่าชดเชยให้อยู่แล้ว —
                  แก้ตัวเลขแล้วกดบันทึกเฉพาะกรณีที่บริษัทจ่ายมากกว่าที่กฎหมายกำหนด
                </span>
              </p>
            ) : null}

            {/*
              ใช้กริดแทนตาราง — ช่องกรอกจึงกว้างตามคอลัมน์เท่ากันทุกแถว
              และไม่ต้องบังคับความกว้างขั้นต่ำ 38rem ที่ทำให้ต้องเลื่อนแนวนอน
            */}
            <div className="hidden gap-3 border-b border-brand-100 pb-1.5 sm:grid sm:grid-cols-[2rem_7rem_5.5rem_7rem_minmax(0,1fr)_2.5rem]">
              <span />
              <span className={HEAD_CLASS}>อายุงานตั้งแต่ (เดือน)</span>
              <span className={HEAD_CLASS}>เท่ากับ</span>
              <span className={HEAD_CLASS}>ได้ค่าจ้าง (วัน)</span>
              <span className={HEAD_CLASS}>หมายเหตุ</span>
              <span />
            </div>

            {rows.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-slate-400">
                ยังไม่มีขั้น — กด &quot;ใช้ขั้นต่ำตามกฎหมาย&quot;
                แล้วปรับตัวเลขให้ตรงกับที่บริษัทจ่ายจริง
              </p>
            ) : (
              <div className="divide-y divide-brand-50">
                {rows.map((row, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-2 py-2 sm:grid-cols-[2rem_7rem_5.5rem_7rem_minmax(0,1fr)_2.5rem] sm:gap-3"
                  >
                    <span className="hidden h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-[11.5px] font-bold tabular-nums text-brand-700 sm:flex">
                      {index + 1}
                    </span>

                    <TextInput
                      value={row.minServiceMonths}
                      inputMode="numeric"
                      aria-label="อายุงานตั้งแต่ (เดือน)"
                      onChange={(event) =>
                        updateRow(index, {
                          minServiceMonths: event.target.value,
                        })
                      }
                      className="tabular-nums"
                    />

                    <span className="text-[12.5px] text-slate-500 3xl:text-[13px]">
                      {monthsLabel(row.minServiceMonths)}
                    </span>

                    <TextInput
                      value={row.payDays}
                      inputMode="numeric"
                      aria-label="ได้ค่าจ้าง (วัน)"
                      onChange={(event) =>
                        updateRow(index, { payDays: event.target.value })
                      }
                      className="tabular-nums"
                    />

                    <TextInput
                      value={row.note}
                      aria-label="หมายเหตุ"
                      placeholder="เว้นว่างไว้ก็ได้"
                      onChange={(event) =>
                        updateRow(index, { note: event.target.value })
                      }
                    />

                    <div className="flex justify-end">
                      <IconButton
                        title="ลบขั้นนี้"
                        tone="danger"
                        size="sm"
                        icon={<Trash2 className="h-4 w-4" />}
                        onClick={() =>
                          setDraft(
                            rows.filter((_, position) => position !== index),
                          )
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              className="mt-3"
              onClick={() =>
                setDraft([
                  ...rows,
                  { minServiceMonths: "", payDays: "", note: "" },
                ])
              }
            >
              เพิ่มขั้น
            </Button>
          </>
        )}
      </PanelSection>

      <PanelSection
        title="ขั้นต่ำตามกฎหมาย"
        description="พ.ร.บ.คุ้มครองแรงงาน พ.ศ. 2541 มาตรา 118 — ตั้งต่ำกว่านี้ระบบจะไม่ให้บันทึก"
      >
        <div className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
          {statutoryRows.map((tier) => (
            <div
              key={tier.minServiceMonths}
              className="flex items-baseline justify-between gap-3 border-b border-brand-50 py-1.5 last:border-b-0"
            >
              <span className="text-[12.5px] text-slate-600 3xl:text-[13px]">
                ตั้งแต่ {monthsLabel(String(tier.minServiceMonths))}
              </span>
              <span className="text-[13px] font-bold tabular-nums text-slate-900 3xl:text-[13.5px]">
                {tier.payDays} วัน
              </span>
            </div>
          ))}
        </div>
      </PanelSection>
    </>
  );
}

/** หัวข้อย่อยในแผง — ป้ายฟ้าคั่นด้วยเส้นบาง ชุดเดียวกับแท็บอื่นในหน้าตั้งค่า */
function PanelSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-slate-200 px-5 py-4 last:border-b-0 sm:px-6 3xl:px-7">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-brand-100 pb-1.5">
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
            {title}
          </p>
          {description ? (
            <p className="mt-0.5 text-[11.5px] leading-5 text-slate-400">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}
