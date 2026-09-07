/**
 * หัวคั่นกลุ่มสังกัดในตารางเวลาทำงาน — ชื่อสังกัดกับจำนวนคนเท่านั้น
 *
 * ไม่ใส่ยอดสรุปของกลุ่ม เพราะตัวเลขที่ต้องดูจริงอยู่บนแผงสรุปหัวหน้าอยู่แล้ว
 * ซ้ำอีกทุกหัวกลุ่มมีแต่จะแย่งสายตาไปจากแถวข้อมูล
 */
export type AttendanceGroupLevel = "date" | "branch" | "department";

function joinClassName(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

export function AttendanceGroupHeading({
  level,
  title,
  code,
  employeeCount,
}: {
  level: AttendanceGroupLevel;
  title: string;
  code?: string | null;
  employeeCount?: number;
}) {
  /*
   * ทั้งสองชั้นใช้โครงเดียวกัน — แท่งนำหน้า + ชื่อ + รหัส + จำนวนคน
   * ต่างกันที่เฉดสีในตระกูลฟ้าเดียวกันและขนาดตัวอักษร
   *   ชั้นนอก (วันที่/สาขา) เข้มกว่า อยู่บนแถบฟ้า
   *   ชั้นใน  (แผนก)        อ่อนกว่าหนึ่งขั้น อยู่บนพื้นขาวและเยื้องเข้ามา
   * ชื่อกับตัวเลขใช้คนละเฉด ตัวเลขจางกว่า จะได้ไม่แย่งสายตาไปจากชื่อ
   */
  const isDepartment = level === "department";

  return (
    <div
      className={joinClassName(
        "flex items-center justify-between gap-4 font-bold",
        isDepartment
          ? "text-[12.5px] text-brand-700 3xl:text-[13px]"
          : "text-[13px] text-brand-900 3xl:text-[14px] 4xl:text-[14.5px]",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        {/* แท่งสีบอกชั้น: เข้มสุด = สาขา, กลาง = วันที่, อ่อนสุด = แผนก */}
        <span
          className={joinClassName(
            "shrink-0 rounded-full",
            isDepartment ? "h-3.5 w-1 bg-brand-300" : "h-4 w-1.5",
            level === "date"
              ? "bg-brand-400"
              : level === "branch"
                ? "bg-brand-600"
                : "",
          )}
        />
        <span className="truncate">{title}</span>
        {code ? (
          <span
            className={joinClassName(
              "shrink-0 font-normal",
              isDepartment ? "text-brand-300" : "text-brand-500",
            )}
          >
            {code}
          </span>
        ) : null}
      </span>

      {employeeCount ? (
        <span
          className={joinClassName(
            "shrink-0 font-normal tabular-nums",
            isDepartment ? "text-brand-400" : "text-brand-500",
          )}
        >
          {employeeCount.toLocaleString("th-TH")} คน
        </span>
      ) : null}
    </div>
  );
}

/** คลาสของช่องหัวกลุ่ม ใช้กับตารางที่เขียน <tr>/<th> เอง ให้หน้าตาตรงกับ DataTable */
export function attendanceGroupHeadingCellClass(level: AttendanceGroupLevel) {
  return joinClassName(
    "text-left font-normal",
    level === "date" || level === "branch"
      ? "border-y border-brand-200 bg-brand-100/80 px-5 py-2.5"
      : "border-y border-brand-100 bg-white py-2 pl-10 pr-5",
  );
}
