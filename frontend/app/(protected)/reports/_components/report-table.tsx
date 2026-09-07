"use client";

import {
  isDayColumn,
  isVisibleReportColumn,
  reportCellText,
  reportColumnLabel,
} from "./report-column-labels";
import { WorkStatusCalendarTable } from "./work-status-calendar";

/**
 * ตารางข้อมูลของหน้ารายงาน
 * -----------------------------------------------------------------------------
 * แยกออกมาจาก report-view เพราะสองอย่างนี้ทำคนละหน้าที่กัน
 *   report-view  — เปลือกหน้า ตัวกรอง เรียก API แบ่งหน้า ดาวน์โหลด
 *   report-table — วาดตารางจากแถวที่ได้มา ไม่รู้จัก API หรือตัวกรองเลย
 *
 * ไฟล์นี้ดูแลเฉพาะ "ตารางแบน" ที่รายงานเกือบทุกตัวใช้ ส่วนรายงานสถานะการมาทำงาน
 * ที่มีปฏิทินรายวัน 31 ช่องต้องแบ่งโซนและตรึงคอลัมน์ ซึ่งเป็นคนละเรื่องกันมาก
 * จึงส่งต่อให้ work-status-calendar ทั้งก้อน ไม่เอามาปนกับตารางกลาง
 */

export type ReportTableRow = Record<string, unknown>;

export function ReportTable({
  rows,
  columns,
}: {
  rows: ReportTableRow[];
  /** ตัวกรองคอลัมน์ของรายงานนั้น ไม่ส่งมา = แสดงทุกคอลัมน์ */
  columns?: (key: string) => boolean;
}) {
  const columnKeys =
    rows.length > 0
      ? Object.keys(rows[0])
          .filter(isVisibleReportColumn)
          .filter((key) => columns?.(key) ?? true)
      : [];

  // มีช่องรายวัน = รายงานสถานะการมาทำงาน ให้ตัวที่ทำปฏิทินโดยเฉพาะรับไปวาด
  if (columnKeys.some(isDayColumn)) {
    return <WorkStatusCalendarTable rows={rows} columnKeys={columnKeys} />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px] 3xl:text-[13px]">
        <thead>
          <tr>
            {columnKeys.map((key) => (
              <th
                key={key}
                scope="col"
                className="whitespace-nowrap border-b border-slate-300 bg-slate-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600"
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
              {columnKeys.map((key) => (
                <td
                  key={key}
                  className="whitespace-nowrap px-3 py-1.5 text-slate-700 tabular-nums"
                >
                  {reportCellText(row[key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
