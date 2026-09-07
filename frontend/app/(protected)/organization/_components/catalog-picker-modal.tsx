"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  Checkbox,
  Modal,
  Notice,
  SearchInput,
  Select,
  joinClassName,
} from "@/components/kit";
import { ApiClientError, apiFetch } from "@/lib/api";
import type {
  OrganizationCatalogBulkResult,
  OrganizationCatalogItem,
  OrganizationCatalogResponse,
} from "@/types/organization";

/**
 * เลือกตำแหน่ง / ประเภทพนักงานจากรายการมาตรฐานของระบบ
 * -----------------------------------------------------------------------------
 * รายการมาตรฐานเป็น master ระดับระบบที่ทุกบริษัทเห็นเหมือนกัน
 * บริษัทติ๊กเลือกแล้วกดเปิดใช้ ระบบจะคัดลอกเป็นตำแหน่ง/ประเภทของบริษัทนั้น
 * จากนั้นแก้ชื่อ ระดับ ลำดับต่อได้เองที่ตารางปกติโดยไม่กระทบบริษัทอื่น
 *
 * รายการที่เปิดใช้แล้วยังแสดงอยู่ (ติ๊กค้างและกดไม่ได้) เพื่อให้เห็นภาพรวมว่า
 * บริษัทนี้ใช้อะไรไปแล้วบ้าง — ปิดใช้ทำที่ตารางหลัก ไม่ปนกับการเลือกเพิ่ม
 */

export type CatalogKind =
  | "departments"
  | "divisions"
  | "positions"
  | "employee-types";

const kindLabel: Record<CatalogKind, string> = {
  departments: "แผนก",
  divisions: "ฝ่าย/กลุ่มงาน",
  positions: "ตำแหน่ง",
  "employee-types": "ประเภทพนักงาน",
};

/** ป้ายของช่องกรองหมวด — ต่างกันตามว่าหมวดคืออะไรในบริบทนั้น */
const categoryFilterLabel: Partial<Record<CatalogKind, string>> = {
  positions: "ทุกกลุ่มสายงาน",
  divisions: "ทุกแผนก",
};

export function CatalogPickerModal({
  kind,
  companyId,
  open,
  onClose,
  onApplied,
}: {
  kind: CatalogKind;
  companyId: string;
  open: boolean;
  onClose: () => void;
  /** เรียกเมื่อเปิดใช้สำเร็จอย่างน้อยหนึ่งรายการ เพื่อให้ตารางหลักโหลดใหม่ */
  onApplied: () => void;
}) {
  const [data, setData] = useState<OrganizationCatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const title = kindLabel[kind];

  async function load() {
    if (!companyId) return;

    try {
      setLoading(true);
      setError(null);

      const result = await apiFetch<OrganizationCatalogResponse>(
        `/organization/catalog/${kind}?companyId=${encodeURIComponent(companyId)}`,
      );

      setData(result);
    } catch (loadError) {
      setError(errorText(loadError, `โหลดรายการ${title}มาตรฐานไม่สำเร็จ`));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- ล้างที่เลือกไว้ทุกครั้งที่เปิดใหม่ ไม่ใช่ derive จาก state ในเรนเดอร์นี้
    setSelected(new Set());
    setQ("");
    setCategory("");
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, companyId, kind]);

  const visibleItems = useMemo(() => {
    if (!data) return [];

    const keyword = q.trim().toLowerCase();

    return data.items.filter((item) => {
      if (category && item.category !== category) return false;
      if (!keyword) return true;

      return [item.code, item.nameTh, item.nameEn]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });
  }, [category, data, q]);

  /*
   * จัดกลุ่มตามหมวดที่ backend ส่งมา — ตำแหน่งใช้สายงาน ฝ่ายใช้แผนกแม่
   * แผนกกับประเภทพนักงานไม่มีหมวด backend จึงส่ง categories ว่างมา แล้วรวมเป็นกลุ่มเดียว
   *
   * เรียงกลุ่มตามลำดับใน data.categories ไม่ใช่ลำดับที่เจอในรายการ
   * ไม่งั้นพอกรองคำค้นแล้วกลุ่มจะสลับที่ไปมาทุกครั้งที่พิมพ์
   */
  const groups = useMemo(() => {
    if (!data || data.categories.length === 0) {
      return [{ key: "", label: "", items: visibleItems }];
    }

    const byCategory = new Map<string, OrganizationCatalogItem[]>();

    for (const item of visibleItems) {
      const key = item.category ?? "";
      const list = byCategory.get(key);
      if (list) {
        list.push(item);
      } else {
        byCategory.set(key, [item]);
      }
    }

    return data.categories
      .map((entry) => ({
        key: entry.key,
        label: entry.label,
        items: byCategory.get(entry.key) ?? [],
      }))
      .filter((group) => group.items.length > 0);
  }, [data, visibleItems]);

  const selectableItems = visibleItems.filter((item) => !item.enabled);
  const allSelectableChecked =
    selectableItems.length > 0 &&
    selectableItems.every((item) => selected.has(item.id));

  function toggleItem(item: OrganizationCatalogItem) {
    if (item.enabled) return;

    setSelected((current) => {
      const next = new Set(current);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
      }
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((current) => {
      const next = new Set(current);

      if (allSelectableChecked) {
        selectableItems.forEach((item) => next.delete(item.id));
      } else {
        selectableItems.forEach((item) => next.add(item.id));
      }

      return next;
    });
  }

  async function handleApply() {
    if (selected.size === 0) {
      toast.error(`กรุณาเลือก${title}ที่ต้องการเปิดใช้`);
      return;
    }

    try {
      setSubmitting(true);

      const result = await apiFetch<OrganizationCatalogBulkResult>(
        `/organization/catalog/${kind}/enable-bulk`,
        {
          method: "POST",
          body: JSON.stringify({
            companyId,
            catalogIds: [...selected],
          }),
        },
      );

      if (result.enabled > 0) {
        toast.success(
          `เปิดใช้${title} ${result.enabled.toLocaleString("th-TH")} รายการแล้ว`,
        );
        onApplied();
      }

      /*
       * ไม่ปิดหน้าต่างเมื่อมีรายการพลาด เพื่อให้เห็นว่าตัวไหนไม่ผ่านและทำไม
       * (ที่พบบ่อยคือรหัสชนกับรายการที่บริษัทสร้างเองไว้ก่อน)
       */
      if (result.failed.length > 0) {
        toast.error(
          `เปิดใช้ไม่สำเร็จ ${result.failed.length.toLocaleString("th-TH")} รายการ — ${result.failed[0].message}`,
        );
        setSelected(new Set());
        await load();
        return;
      }

      onClose();
    } catch (applyError) {
      toast.error(errorText(applyError, `เปิดใช้${title}ไม่สำเร็จ`));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <Modal
      open
      title={`เลือก${title}จากรายการมาตรฐาน`}
      description={
        `รายการมาตรฐานเป็นชุดเดียวกันทุกบริษัท เลือกเฉพาะ${title}ที่บริษัทนี้ใช้จริง ` +
        `แล้วปรับชื่อหรือรายละเอียดต่อได้ที่ตาราง${title}` +
        (kind === "divisions"
          ? " — ถ้ายังไม่ได้เปิดแผนกแม่ ระบบจะเปิดให้อัตโนมัติ"
          : "")
      }
      size="lg"
      onClose={onClose}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] text-slate-500 3xl:text-[13px]">
            {data
              ? `เปิดใช้แล้ว ${count(data.summary.enabled)} จาก ${count(data.summary.total)} รายการ` +
                (data.summary.custom > 0
                  ? ` · สร้างเอง ${count(data.summary.custom)} รายการ`
                  : "")
              : ""}
          </p>

          <div className="flex items-center gap-2">
            <Button type="button" onClick={onClose} disabled={submitting}>
              ปิด
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={submitting}
              disabled={selected.size === 0}
              icon={<Sparkles className="h-3.5 w-3.5" />}
              onClick={() => void handleApply()}
            >
              เปิดใช้ที่เลือก
              {selected.size > 0 ? ` ${count(selected.size)}` : ""}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder={`ค้นหารหัสหรือชื่อ${title}`}
            className="w-full sm:w-64"
            aria-label={`ค้นหา${title}มาตรฐาน`}
          />

          {data && data.categories.length > 0 ? (
            <Select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="w-full sm:w-56"
              aria-label={categoryFilterLabel[kind] ?? "หมวด"}
            >
              <option value="">{categoryFilterLabel[kind] ?? "ทุกหมวด"}</option>
              {data.categories
                .filter((item) => item.total > 0)
                .map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
            </Select>
          ) : null}

          {selectableItems.length > 0 ? (
            <button
              type="button"
              onClick={toggleAllVisible}
              className="text-[12px] font-semibold text-brand-700 underline-offset-2 hover:underline"
            >
              {allSelectableChecked
                ? "ยกเลิกที่เลือกทั้งหมด"
                : `เลือกทั้งหมดที่แสดง ${count(selectableItems.length)}`}
            </button>
          ) : null}
        </div>

        {error ? (
          <Notice tone="critical">
            {error}{" "}
            <button
              type="button"
              onClick={() => void load()}
              className="font-semibold underline underline-offset-2"
            >
              ลองใหม่
            </button>
          </Notice>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            กำลังโหลดรายการมาตรฐาน
          </div>
        ) : null}

        {!loading && !error && visibleItems.length === 0 ? (
          <p className="py-12 text-center text-[13px] text-slate-400">
            ไม่พบ{title}มาตรฐานตามเงื่อนไขที่เลือก
          </p>
        ) : null}

        {!loading && !error && visibleItems.length > 0 ? (
          <div className="space-y-5">
            {groups.map((group) => (
              <section key={group.key || "all"}>
                {group.label ? (
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {group.label}
                  </p>
                ) : null}

                <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                  {group.items.map((item) => (
                    <CatalogRow
                      key={item.id}
                      item={item}
                      checked={item.enabled || selected.has(item.id)}
                      onToggle={() => toggleItem(item)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/**
 * หนึ่งแถว = ชื่อ + ป้ายกำกับ + สถานะ
 *
 * ใช้ grid คอลัมน์ตายตัวแทน flex ชิดขวา เพราะความยาวของสถานะไม่เท่ากันทุกแถว
 * ("เปิดใช้แล้ว · 12 คน" ยาวกว่ารหัสตำแหน่งมาก) ถ้าปล่อยให้ไหลตามเนื้อหา
 * ป้าย Level จะเยื้องกันทีละแถวจนอ่านเป็นคอลัมน์ไม่ได้
 */
function CatalogRow({
  item,
  checked,
  onToggle,
}: {
  item: OrganizationCatalogItem;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={joinClassName(
        "grid grid-cols-2 items-center gap-x-3 gap-y-2 px-4 py-3 3xl:px-5",
        // คอลัมน์ป้าย/สถานะกว้างขึ้นตามจอ ให้พอกับตัวอักษรที่ kit ขยายที่ 3xl/4xl
        "sm:grid-cols-[minmax(0,1fr)_5.5rem_11rem] sm:gap-y-0",
        "3xl:grid-cols-[minmax(0,1fr)_6rem_12rem] 4xl:grid-cols-[minmax(0,1fr)_6.5rem_13rem]",
        item.enabled ? "bg-slate-50/70" : "cursor-pointer hover:bg-brand-50/40",
      )}
      onClick={item.enabled ? undefined : onToggle}
    >
      {/*
        กันคลิกทะลุไปหา onClick ของแถว
        Checkbox ของ kit เป็น <label> อยู่แล้ว คลิกตรงนี้ input จะ toggle เอง
        ถ้าปล่อยให้ bubble ต่อ แถวจะ toggle ซ้ำอีกครั้งแล้วหักล้างกันจนไม่มีอะไรเกิดขึ้น

        จอแคบ: ชื่อกินเต็มบรรทัดแรก แล้วป้ายกับสถานะลงมาอยู่บรรทัดล่าง
      */}
      <div
        className="col-span-2 min-w-0 sm:col-span-1"
        onClick={(event) => event.stopPropagation()}
      >
        <Checkbox
          label={item.nameTh}
          hint={
            [item.nameEn, item.description].filter(Boolean).join(" · ") ||
            undefined
          }
          checked={checked}
          disabled={item.enabled}
          onChange={onToggle}
          className="min-w-0"
        />
      </div>

      {/* ป้ายกำกับ: ตำแหน่งใช้ระดับ ส่วนประเภทพนักงานใช้คำแนะนำ — มีได้อย่างละหนึ่ง */}
      <div className="flex justify-start sm:justify-center">
        {typeof item.level === "number" ? (
          <Badge tone="neutral">Level {item.level}</Badge>
        ) : item.isDefault ? (
          <Badge tone="brand">แนะนำ</Badge>
        ) : null}
      </div>

      <div className="flex justify-end">
        {item.enabled ? (
          <Badge tone="positive">
            <Check className="mr-1 h-3 w-3" />
            เปิดใช้แล้ว
            {item.employeeCount > 0 ? ` · ${count(item.employeeCount)} คน` : ""}
          </Badge>
        ) : (
          <span className="truncate font-mono text-[11px] text-slate-300 3xl:text-[12px]">
            {item.code}
          </span>
        )}
      </div>
    </div>
  );
}

function count(value: number) {
  return value.toLocaleString("th-TH");
}

function errorText(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiClientError) return error.message;
  return fallbackMessage;
}
