"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";

import { SearchInput } from "@/components/kit";
import { DOCUMENT_CATALOG, type CatalogGroup } from "./document-catalog";

/**
 * แท็บ "คลังเอกสาร"
 * -----------------------------------------------------------------------------
 * รวมไฟล์ที่ระบบออกได้ทั้งหมดไว้ที่เดียว เดิมกระจายอยู่ตามหน้าที่สร้างมัน
 * (ไฟล์ธนาคาร/สปส. อยู่ในหน้ารอบเงินเดือน · รายงานภาษีอยู่ในหน้าภาษี ฯลฯ)
 * คนที่ต้อง "หาไฟล์" จึงต้องรู้ก่อนว่าไฟล์นั้นอยู่หน้าไหน
 *
 * จัดเป็นกลุ่มตามงานจริง ไม่ใช่ตารางยาวแถวเดียว เพราะคนเปิดหน้านี้มาด้วย
 * ความตั้งใจเป็นกลุ่ม ("จะนำส่งราชการ" / "จะปิดรอบเงินเดือน") ไม่ได้ไล่อ่านทีละบรรทัด
 *
 * บริบทที่แต่ละไฟล์ต้องใช้ (รอบเงินเดือน/ปีภาษี/ช่วงวันที่) เลือกครั้งเดียวที่หัวหน้า
 * แล้วทุกไฟล์ในหน้าใช้ร่วมกัน — ไม่ต้องเลือกซ้ำทีละไฟล์
 */

const GROUP_ORDER: CatalogGroup[] = [
  "รอบเงินเดือน",
  "นำส่งราชการและธนาคาร",
  "ภาษีเงินได้",
  "รายงาน HR และ Payroll",
];

const GROUP_HINT: Record<CatalogGroup, string> = {
  รอบเงินเดือน: "เอกสารสรุปของรอบที่เลือก",
  นำส่งราชการและธนาคาร: "ไฟล์ที่ต้องส่งออกนอกองค์กร — ตรวจก่อนส่งทุกครั้ง",
  ภาษีเงินได้: "แบบยื่นและรายงานภาษีตามปี/เดือนที่เลือก",
  "รายงาน HR และ Payroll":
    "กดเปิดรายงานเพื่อเลือกตัวกรอง ดูข้อมูลจริง แล้วค่อยดาวน์โหลด",
};

export function CatalogPanel({ permissions }: { permissions: Set<string> }) {
  const [search, setSearch] = useState("");

  // เอกสารที่สิทธิ์ของผู้ใช้คนนี้โหลดไม่ได้ ไม่ต้องเอามาโชว์ให้กดแล้วเจอ 403
  const allowed = useMemo(
    () => DOCUMENT_CATALOG.filter((item) => permissions.has(item.permission)),
    [permissions],
  );

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return allowed;

    return allowed.filter((item) =>
      [item.name, item.description, item.format, item.group]
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }, [allowed, search]);

  const groups = useMemo(
    () =>
      GROUP_ORDER.map((group) => ({
        group,
        items: filtered.filter((item) => item.group === group),
      })).filter((entry) => entry.items.length > 0),
    [filtered],
  );

  return (
    <>
      {/* แถบเครื่องมือพื้นเทาอ่อน ชุดเดียวกับหน้าอื่นในระบบ */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-300 bg-slate-50/70 px-5 py-3 sm:px-6 3xl:px-7">
        <div className="min-w-0 flex-1 sm:max-w-md [&_input]:bg-white">
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ค้นหาเอกสาร เช่น ประกันสังคม ภ.ง.ด. ธนาคาร"
            aria-label="ค้นหาเอกสาร"
          />
        </div>

        <p className="text-[12.5px] text-slate-500 3xl:text-[13px]">
          {search
            ? `เจอ ${filtered.length} จาก ${allowed.length} เอกสาร`
            : `${allowed.length} เอกสารที่สิทธิ์ของคุณเปิดได้`}
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="py-16 text-center text-[13px] text-slate-400">
          ไม่พบเอกสารที่ตรงกับคำค้น
        </p>
      ) : (
        groups.map(({ group, items }) => (
          <section
            key={group}
            className="border-b border-slate-200 px-5 py-5 last:border-b-0 sm:px-6 3xl:px-7"
          >
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2 border-b border-brand-100 pb-1.5">
              <div className="min-w-0">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
                  {group}
                </p>
                <p className="mt-0.5 text-[11.5px] leading-5 text-slate-400">
                  {GROUP_HINT[group]}
                </p>
              </div>
              <p className="text-[11.5px] tabular-nums text-slate-400">
                {items.length} เอกสาร
              </p>
            </div>

            {/*
              ทั้งใบกดได้ ไม่ต้องมีปุ่ม "เปิด" เป็นกล่องท้ายแถว
              เอากรอบรอบรายการออกด้วย — หน้านี้เป็นผืนเดียว ไม่ใช่การ์ดซ้อนการ์ด
            */}
            <ul className="divide-y divide-brand-50">
              {items.map((item) => (
                <li key={item.key}>
                  <Link
                    href={`/reports/${item.slug}`}
                    className="group flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-2 py-2.5 transition-colors hover:bg-brand-50/70"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                      <FileText className="h-4 w-4" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-bold text-slate-900 3xl:text-[14px]">
                        {item.name}
                      </p>
                      <p className="truncate text-[11.5px] text-slate-500 3xl:text-[12px]">
                        {item.description}
                      </p>
                    </div>

                    <span className="inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">
                      {item.format}
                    </span>

                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-brand-600" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
