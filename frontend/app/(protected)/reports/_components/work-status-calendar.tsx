"use client";

import {
  DAY_CODE_LEGEND,
  LAST_STICKY_KEY,
  dayCodeLabel,
  dayCodeStyle,
  groupReportColumns,
  isDayColumn,
  isWideTextColumn,
  reportCellText,
  reportColumnLabel,
  stickyColumn,
} from "./report-column-labels";
import type { ReportTableRow } from "./report-table";

/**
 * ตารางปฏิทินของรายงานสถานะการมาทำงาน
 * -----------------------------------------------------------------------------
 * รายงานนี้ตัวเดียวที่ปล่อยคอลัมน์ออกมา 43 ช่อง — ตัวตน 6 + ปฏิทินรายวัน 31 + สรุป 6
 * ซึ่งวาดด้วยตารางแบนธรรมดาไม่ได้ ต้องมีของเฉพาะทางสามอย่าง
 *
 *   แบ่งโซน   คาดหัว "พนักงาน / ปฏิทินรายวัน / สรุปจำนวนวัน" ให้รู้ว่ากำลังดูอะไร
 *   ตรึงซ้าย  รหัสกับชื่อค้างไว้ ไม่งั้นเลื่อนไปดูวันที่ 20 แล้วไม่รู้ว่าเป็นของใคร
 *   ป้ายสี    ปฏิทิน 31 ช่องที่เป็นตัวอักษรล้วนต้องอ่านทีละช่อง ใส่สีแล้วความผิดปกติ
 *             เด้งขึ้นมาเองตั้งแต่มองแวบแรก
 *
 * แยกออกจาก report-table เพราะของพวกนี้ไม่มีรายงานอื่นได้ใช้เลย ถ้าปนอยู่ในตาราง
 * กลางจะทำให้คนอ่านเข้าใจผิดว่าเป็นพฤติกรรมของทุกรายงาน
 */

export function WorkStatusCalendarTable({
  rows,
  columnKeys,
}: {
  rows: ReportTableRow[];
  /** คอลัมน์ที่ผ่านตัวกรองของรายงานมาแล้ว — ปฏิทินไม่ตัดสินใจเองว่าจะโชว์อะไร */
  columnKeys: string[];
}) {
  const groups = groupReportColumns(columnKeys);
  const orderedKeys = groups.flatMap((group) => group.keys);

  /** คืนคลาสของคอลัมน์ที่ตรึงไว้ซ้าย หรือสตริงว่างถ้าคอลัมน์นั้นเลื่อนได้ตามปกติ */
  const stickyClass = (key: string, background: string, zIndex: string) => {
    const column = stickyColumn(key);
    if (!column) return "";

    return `sticky ${column.left} ${column.width} ${zIndex} ${background} ${
      key === LAST_STICKY_KEY ? "border-r border-slate-300" : ""
    }`;
  };

  /** คอลัมน์แรกของแต่ละโซนขีดเส้นซ้าย เพื่อให้เห็นรอยต่อระหว่างโซนตลอดทั้งแถว */
  const zoneStartKeys = new Set(groups.slice(1).map((group) => group.keys[0]));
  const zoneStartClass = (key: string) =>
    zoneStartKeys.has(key) ? "border-l border-slate-300" : "";

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px] 3xl:text-[13px]">
          <thead>
            <tr>
              {groups.map((group, groupIndex) => (
                <th
                  key={group.zone}
                  scope="colgroup"
                  colSpan={group.keys.length}
                  className={`border-b border-slate-200 bg-white px-3 pb-1 pt-2.5 text-left text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 ${
                    groupIndex > 0 ? "border-l border-slate-300" : ""
                  } ${group.zone === "identity" ? "sticky left-0 z-30 bg-white" : ""}`}
                >
                  {group.label}
                </th>
              ))}
            </tr>
            <tr>
              {orderedKeys.map((key) => (
                <th
                  key={key}
                  scope="col"
                  /* ช่องรายวันแคบและเป็นตัวเลข จัดกลางแล้วอ่านเป็นปฏิทินง่ายกว่า */
                  className={`${
                    isDayColumn(key)
                      ? "w-9 border-b border-slate-300 bg-slate-50 px-1 py-2 text-center text-[11px] font-semibold tabular-nums text-slate-600"
                      : "whitespace-nowrap border-b border-slate-300 bg-slate-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600"
                  } ${zoneStartClass(key)} ${stickyClass(key, "bg-slate-50", "z-20")}`}
                >
                  {reportColumnLabel(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={index}
                className="border-b border-slate-100 last:border-b-0 hover:bg-sky-50/40"
              >
                {orderedKeys.map((key) => {
                  const text = reportCellText(row[key]);
                  const edge = zoneStartClass(key);

                  if (isDayColumn(key)) {
                    return (
                      <td
                        key={key}
                        // เอาเมาส์ชี้แล้วบอกความหมายเต็ม ไม่ต้องเลื่อนไปดูคำอธิบายท้ายตาราง
                        title={dayCodeLabel(text) ?? undefined}
                        className={`px-1 py-1.5 text-center ${edge}`}
                      >
                        {text ? (
                          <span
                            className={`inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold ${dayCodeStyle(text)}`}
                          >
                            {text}
                          </span>
                        ) : null}
                      </td>
                    );
                  }

                  return (
                    <td
                      key={key}
                      /* ข้อความยาวที่ถูกตัด ต้องเอาเมาส์ชี้อ่านฉบับเต็มได้ */
                      title={
                        isWideTextColumn(key) ? text || undefined : undefined
                      }
                      className={`whitespace-nowrap px-3 py-1.5 text-slate-700 tabular-nums ${edge} ${
                        isWideTextColumn(key) ? "max-w-[170px] truncate" : ""
                      } ${stickyClass(key, "bg-white", "z-10")}`}
                    >
                      {text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <WorkStatusLegend />
    </>
  );
}

/** คำอธิบายรหัสท้ายตาราง — ใช้ป้ายสีชุดเดียวกับในตาราง จะได้เทียบสีได้โดยไม่ต้องจำรหัส */
function WorkStatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 bg-slate-50/60 px-5 py-2.5 sm:px-6 3xl:px-7">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        ความหมายของตัวอักษร
      </span>
      {DAY_CODE_LEGEND.map((item) => (
        <span
          key={item.code}
          className="inline-flex items-center gap-1.5 text-[12px] text-slate-600 3xl:text-[13px]"
        >
          <span
            className={`inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold ${dayCodeStyle(item.code)}`}
          >
            {item.code}
          </span>
          {item.label}
        </span>
      ))}
      <span className="text-[12px] text-slate-400 3xl:text-[13px]">
        หัวคอลัมน์ตัวเลขคือวันที่ของเดือน
      </span>
    </div>
  );
}
