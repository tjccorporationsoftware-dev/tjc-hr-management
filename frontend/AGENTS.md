<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ดีไซน์ของหน้าเว็บ — ใช้ชุดเดียวทั้งระบบ

**หน้าต้นแบบคือ `/payroll` และ `/payroll/[periodId]`** ถ้าจะทำหน้าใหม่หรือแก้หน้าเก่า
ให้เปิดสองไฟล์นี้ดูก่อนเสมอ แล้วประกอบด้วยชุด `@/components/kit` เท่านั้น

## กฎที่ห้ามหลุด

1. **หนึ่งหน้ามีผืนขาวผืนเดียว** — ครอบด้วย `<PageSurface>` แล้วแบ่งส่วนภายในด้วยเส้น
   ห้ามวางการ์ดเล็กลอยเว้นช่องว่าง และห้ามมีการ์ดซ้อนการ์ด
2. **หัวเรื่องใช้ `<PageHeading>`** (แถบสีนำ + ชื่อ + คำอธิบาย + `chips` + `actions`)
   ห้ามเขียน header เอง — `actions` คือที่ของ select, แผง `StatTile` และปุ่มหลัก
3. **น้ำหนักเส้น** — โซนใหญ่ `border-slate-300` · ภายในโซน `slate-200` · ระหว่างแถว `slate-100`
4. **สี** — accent เดียวคือ `brand` (ปุ่มหลัก, ยอดสุทธิ), `rose` = รายการหัก,
   `emerald` = เสร็จแล้ว, `amber` = ต้องระวัง
   **หนึ่งบรรทัดให้สีได้ตัวเดียว** ที่เหลือเป็นเทา/ดำ ไม่งั้นลายตา
5. **ตัวเลขเงินใช้ `tabular-nums` เสมอ** ค่าที่เป็นศูนย์ให้จาง (`text-slate-300`)
6. **ป้ายกำกับ** `text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400`
7. **ป๊อปอัพทุกตัว** ใช้ `Modal` หรือ `ActionDialog` เท่านั้น ห้ามเขียน overlay เอง
8. **จอกว้างต้องขยายตาม** — ขนาดฐานคิดจากโน้ตบุ๊ก (~1440–1760px) แล้วไล่ขึ้นสองขั้น:
   `3xl` (1800px) และ `4xl` (2200px)
   เช่น `text-[13px] 3xl:text-[15px] 4xl:text-[16px]`, `px-5 3xl:px-7 4xl:px-8`
   ชุด kit ทำไว้ให้แล้ว ถ้าเขียนเซลล์/ข้อความเองในหน้า ให้ใส่ `3xl:`/`4xl:` เองด้วย

## ของที่ต้องใช้จาก kit

| งาน | ใช้ตัวนี้ |
|---|---|
| โครงหน้า / หัวเรื่อง | `PageSurface` `PageHeading` `PageChip` |
| ตัวเลขสรุปข้างหัวเรื่อง | `StatTile` (วางในกล่อง `grid divide-x rounded-lg border`) |
| ตาราง | `DataTable` — มี `groupBy` หลายชั้น, `stickyHeader`, `quietScrollbars`, `onRowClick` |
| ฟอร์ม | `Field` `TextInput` `Select` `Textarea` `SearchInput` `Checkbox` `Toggle` `MoneyInput` |
| วันที่ | `ThaiDateInput` จาก `@/components/common/thai-date-input` (แสดง วัน/เดือน/ปี ไทย) |
| ปุ่ม | `Button` `ButtonLink` `IconButton` |
| ป๊อปอัพ | `Modal` + `ModalActions` / `ActionDialog` |
| อื่น ๆ | `Tabs` `Money` `StatusBadge` `Notice` `Avatar` |

## ห้ามใช้ (ของเก่า กำลังทยอยลบ)

`components/hr/hr-ui.tsx` · `components/manager/manager-ui.tsx` · `components/ess/ess-ui.tsx` ·
`components/ui/page-shell.tsx` · `PageShell` / `PageHeader` ที่มาร์ค `@deprecated` ไว้ใน kit

## ตรวจก่อนบอกว่าเสร็จ

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint "app/(protected)/<หน้าที่แก้>"
```
แล้วเปิดหน้าจริงเทียบกับ `/payroll` ที่ความกว้างจอเดียวกัน
