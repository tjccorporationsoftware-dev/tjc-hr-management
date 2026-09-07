"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";

import { joinClassName } from "@/components/ui/class-name";

/**
 * ตาราง
 * -----
 * แถวเตี้ยและเส้นคั่นบาง เพื่อให้เห็นข้อมูลได้มากแถวในหน้าจอเดียว
 * สถานะว่าง/โหลด/ผิดพลาด วาดเองในตารางเลย ไม่ยืมการ์ดจากที่อื่นมาซ้อน
 */

export type Column<T> = {
  key: string;
  header: ReactNode;
  align?: "left" | "right" | "center";
  width?: string;
  hideBelow?: "lg" | "xl";
  cell: (row: T) => ReactNode;
};

const alignClass = {
  left: "text-left",
  right: "text-right tabular-nums",
  center: "text-center",
};

const hideClass = {
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

/**
 * คลาสของโหมด "ตรึงตามการเลื่อนหน้าเว็บ" แยกตามจุดตั้งต้นของจอ
 * ต่ำกว่าจุดนี้ตารางยังเป็นกล่องเลื่อนแนวนอนอยู่ (overflow ทำให้ sticky ตาย)
 * ตารางกว้าง ๆ จึงต้องเลื่อนจุดตั้งต้นขึ้นไป ไม่งั้นเนื้อตารางจะล้นออกนอกการ์ด
 */
const pageStickyClass = {
  xl: {
    wrapper: "xl:overflow-visible",
    head: "xl:sticky xl:z-20 xl:shadow-[inset_0_-1px_0_#cbd5e1]",
    group:
      "xl:sticky xl:z-10 xl:bg-[#e2eefe] xl:shadow-[inset_0_1px_0_#bfdbfe,inset_0_-1px_0_#bfdbfe]",
  },
  "2xl": {
    wrapper: "2xl:overflow-visible",
    head: "2xl:sticky 2xl:z-20 2xl:shadow-[inset_0_-1px_0_#cbd5e1]",
    group:
      "2xl:sticky 2xl:z-10 2xl:bg-[#e2eefe] 2xl:shadow-[inset_0_1px_0_#bfdbfe,inset_0_-1px_0_#bfdbfe]",
  },
};

/**
 * ตำแหน่งค้างของ "หัวกลุ่ม" ให้พอดีใต้หัวตารางที่ค้างอยู่
 * ----------------------------------------------------
 * ต้องวัดความสูงจริงของ <thead> เอา เพราะแต่ละหน้าปรับ padding/ขนาดอักษรของหัวตาราง
 * เองได้ จะกำหนดเป็นตัวเลขตายตัวไม่ได้
 *
 * คืน ref แบบ callback เพื่อให้จับได้ตอน <thead> ถูกสร้างทีหลัง (ตารางที่ยังโหลดอยู่
 * หรือยังไม่มีข้อมูลจะไม่มี <thead>)
 *
 * @param pageStickyTop ระยะจากขอบบนจอถึงจุดที่หัวตารางไปค้าง เช่น "5rem" (ความสูงแถบบนสุด)
 */
export function useStickyGroupTop(pageStickyTop?: string) {
  const [head, setHead] = useState<HTMLTableSectionElement | null>(null);
  const [headHeight, setHeadHeight] = useState(0);

  useEffect(() => {
    if (!pageStickyTop || !head) return;

    const update = () => setHeadHeight(head.getBoundingClientRect().height);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(head);
    return () => observer.disconnect();
  }, [pageStickyTop, head]);

  return {
    headRef: setHead,
    groupTop: pageStickyTop
      ? `calc(${pageStickyTop} + ${headHeight}px)`
      : undefined,
  };
}

function TableState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-5 py-16 text-center">
      <p className="text-[13px] font-semibold text-slate-600">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-[13px] leading-6 text-slate-400">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  error,
  emptyTitle = "ยังไม่มีข้อมูล",
  emptyDescription,
  emptyAction,
  onRetry,
  onRowClick,
  groupBy,
  stickyHeader = false,
  pageStickyTop,
  pageStickyFrom = "xl",
  maxHeight = "max-h-[calc(100vh-16rem)]",
  quietScrollbars = false,
  minWidth = "min-w-[56rem]",
  fixedLayout = false,
}: {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: ReactNode;
  emptyAction?: ReactNode;
  onRetry?: () => void;
  /** เปิดรายละเอียดของแถว — ปุ่มในเซลล์ต้อง stopPropagation เอง */
  onRowClick?: (row: T) => void;
  /**
   * คั่นแถวเป็นกลุ่มซ้อนกันได้ เช่น [สาขา, แผนก]
   * แถวต้องเรียงมาตามกลุ่มแล้ว ตัวตารางแค่ขึ้นหัวกลุ่มใหม่เมื่อ key ของชั้นนั้นเปลี่ยน
   * (ชั้นลึกกว่าจะขึ้นหัวใหม่ตามไปด้วยเสมอ เพราะถือว่าเป็นคนละกลุ่มแล้ว)
   */
  groupBy?: (row: T) => Array<{ key: string; label: ReactNode }>;
  /** ตรึงหัวตารางไว้ระหว่างเลื่อนดูข้อมูล — ตารางจะกลายเป็นพื้นที่เลื่อนของตัวเอง */
  stickyHeader?: boolean;
  /**
   * ตรึงหัวตาราง "และหัวกลุ่มชั้นนอก" ไว้ระหว่างเลื่อนหน้าเว็บ (คนละแบบกับ stickyHeader
   * ที่ทำให้ตารางเป็นพื้นที่เลื่อนของตัวเอง) ค่าที่ใส่คือระยะจากขอบบนจอถึงจุดที่จะให้
   * หัวตารางไปค้าง ปกติ = ความสูงแถบบนสุด "5rem"
   *
   * หัวกลุ่มชั้นนอกจะถูกดันขึ้นไปเองเมื่อกลุ่มถัดไปเลื่อนมาถึง ชื่อสาขาที่ค้างอยู่จึง
   * เปลี่ยนตามกลุ่มที่กำลังดูโดยไม่ต้องคำนวณเพิ่ม
   *
   * ใช้ได้เฉพาะจอ xl ขึ้นไป เพราะจอเล็กตารางต้องเลื่อนแนวนอน (overflow ทำให้ sticky ตาย)
   * และตัวหน้าที่เรียกต้องไม่มี overflow-hidden คร่อมตารางอยู่
   */
  pageStickyTop?: string;
  /** จอตั้งแต่ขนาดไหนขึ้นไปถึงจะตรึง — ตารางที่กว้างมากต้องใช้ "2xl" ไม่งั้นล้นการ์ด */
  pageStickyFrom?: "xl" | "2xl";
  /** ความสูงสูงสุดของพื้นที่เลื่อน ใช้คู่กับ stickyHeader */
  maxHeight?: string;
  /**
   * แถบเลื่อนแบบไม่รบกวน: ซ่อนแนวนอนทิ้ง (ยังเลื่อนด้วยแทร็กแพด/Shift+ล้อได้)
   * และทำแนวตั้งให้บางลง — ทำผ่าน ::-webkit-scrollbar เพราะ scrollbar-width
   * ของมาตรฐานสั่งแยกทีละแกนไม่ได้
   */
  quietScrollbars?: boolean;
  minWidth?: string;
  /**
   * บังคับความกว้างคอลัมน์ตามที่ประกาศไว้ (table-layout: fixed)
   *
   * แบบ auto ตามค่าเริ่มต้น เบราว์เซอร์จะขยายคอลัมน์ตามเนื้อหาที่ยาวที่สุด
   * (อีเมล ชื่อบริษัทเต็ม) ตารางจึงล้นออกนอกจอแม้ตั้ง width ไว้แล้ว
   * เปิดตัวนี้เมื่ออยากให้ตาราง "พอดีจอ" แล้วตัดข้อความเกินด้วย truncate แทน
   */
  fixedLayout?: boolean;
}) {
  const { headRef, groupTop } = useStickyGroupTop(pageStickyTop);
  const sticky = pageStickyTop ? pageStickyClass[pageStickyFrom] : null;

  if (loading) {
    return <TableState title="กำลังโหลด…" />;
  }

  if (error) {
    return (
      <TableState
        title="โหลดข้อมูลไม่สำเร็จ"
        description={error}
        action={
          onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg bg-brand-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-brand-700"
            >
              ลองใหม่
            </button>
          ) : null
        }
      />
    );
  }

  if (!rows.length) {
    return (
      <TableState
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return (
    <div
      className={joinClassName(
        "w-full overflow-x-auto",
        // ต้องให้ตัวนี้เป็นตัวเลื่อนเอง หัวตารางถึงจะ sticky ค้างไว้ได้
        stickyHeader && `overflow-y-auto ${maxHeight}`,
        // overflow ทำให้กล่องนี้กลายเป็นพื้นที่เลื่อนแทนหน้าเว็บ sticky จึงไม่ทำงาน
        sticky?.wrapper,
        quietScrollbars &&
          "[&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 hover:[&::-webkit-scrollbar-thumb]:bg-slate-400",
      )}
    >
      <table
        className={joinClassName(
          "w-full border-collapse",
          fixedLayout && "table-fixed",
          minWidth,
        )}
      >
        <thead ref={headRef}>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={pageStickyTop ? { top: pageStickyTop } : undefined}
                className={joinClassName(
                  "border-b border-slate-300 bg-slate-50 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600 3xl:px-6 3xl:py-2.5 3xl:text-[12px] 4xl:px-7 4xl:text-[12.5px]",
                  // ต้องตรึงที่ระดับ th ไม่ใช่ thead เพราะตารางใช้ border-collapse
                  // และเส้นขอบของ th ที่ตรึงไว้จะไม่ถูกวาด จึงใช้เงาด้านในแทน
                  stickyHeader &&
                    "sticky top-0 z-20 shadow-[inset_0_-1px_0_#cbd5e1]",
                  sticky?.head,
                  alignClass[column.align ?? "left"],
                  column.width,
                  column.hideBelow && hideClass[column.hideBelow],
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const groups = groupBy?.(row) ?? [];
            const previousGroups = index > 0 ? (groupBy?.(rows[index - 1]) ?? []) : [];

            // ชั้นแรกที่ต่างจากแถวก่อนหน้า — ตั้งแต่ชั้นนั้นลงไปต้องขึ้นหัวใหม่หมด
            const changedFrom = groups.findIndex(
              (group, level) => previousGroups[level]?.key !== group.key,
            );

            return (
              <Fragment key={rowKey(row)}>
                {changedFrom >= 0
                  ? groups.slice(changedFrom).map((group, offset) => {
                      const level = changedFrom + offset;

                      return (
                        <tr key={group.key}>
                          <th
                            scope="colgroup"
                            colSpan={columns.length}
                            style={
                              level === 0 && groupTop
                                ? { top: groupTop }
                                : undefined
                            }
                            className={joinClassName(
                              "text-left font-normal",
                              /*
                               * สองชั้นต้องอ่านออกว่าอันไหนใหญ่กว่า จึงใช้ "คนละวิธี"
                               * ไม่ใช่เทาสองเฉดที่ต่างกันนิดเดียว
                               *   ชั้นนอก = แถบสีฟ้าทึบเต็มความกว้าง มีเส้นบน-ล่าง
                               *   ชั้นใน  = พื้นขาวเหมือนแถวข้อมูล มีแค่เส้นคั่นกับระยะเยื้อง
                               *             (ป้ายชื่อข้างในใช้ฟ้าอ่อนกว่าหนึ่งขั้น)
                               * ตาจึงเห็นเป็น "แถบ → หัวข้อย่อย → แถวข้อมูล" ไม่ใช่เทาสามเฉดซ้อนกัน
                               */
                              level === 0
                                ? "border-y border-brand-200 bg-brand-100/80 px-5 py-2.5"
                                : "border-y border-brand-100 bg-white py-2 pl-10 pr-5",
                              /*
                               * หัวกลุ่มชั้นนอกค้างใต้หัวตาราง แล้วถูกกลุ่มถัดไปดันขึ้นไปเอง
                               * ต้องทึบแสงไม่งั้นแถวที่เลื่อนลอดใต้จะทะลุขึ้นมา
                               * (#e2eefe = สีเดียวกับ bg-brand-100/80 ที่ทับพื้นขาว สีจึงไม่เพี้ยน)
                               * และเส้นขอบของเซลล์ที่ตรึงไว้จะไม่ถูกวาด จึงใช้เงาด้านในแทน
                               */
                              level === 0 && sticky?.group,
                            )}
                          >
                            {group.label}
                          </th>
                        </tr>
                      );
                    })
                  : null}

                <tr
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={joinClassName(
                    "group border-b border-slate-100 align-middle transition-colors last:border-b-0 hover:bg-brand-50/50",
                    onRowClick && "cursor-pointer",
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={joinClassName(
                        "px-5 py-2.5 text-[13px] text-slate-600 3xl:px-6 3xl:py-3 3xl:text-[13.5px] 4xl:px-7 4xl:text-[14px]",
                        alignClass[column.align ?? "left"],
                        column.hideBelow && hideClass[column.hideBelow],
                      )}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** ชื่อ + บรรทัดรองในเซลล์เดียว ใช้บ่อยกับคอลัมน์พนักงาน/รายการ */
export function CellStack({
  primary,
  secondary,
  leading,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  /**
   * ของที่วางหน้าข้อความ เช่น <Avatar /> ในคอลัมน์รายชื่อคน
   * แยกเป็น prop แทนที่จะให้แต่ละหน้าห่อ flex เอง ไม่งั้นระยะห่างกับการตัดคำ
   * จะเพี้ยนกันไปทีละหน้า
   */
  leading?: ReactNode;
}) {
  const text = (
    <div className="min-w-0">
      <div className="truncate font-semibold text-slate-900 3xl:text-[14.5px] 4xl:text-[15px]">
        {primary}
      </div>
      {secondary ? (
        <div className="truncate text-[11px] text-slate-400 3xl:text-[12px] 4xl:text-[12.5px]">
          {secondary}
        </div>
      ) : null}
    </div>
  );

  if (!leading) return text;

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="shrink-0">{leading}</span>
      {text}
    </div>
  );
}
