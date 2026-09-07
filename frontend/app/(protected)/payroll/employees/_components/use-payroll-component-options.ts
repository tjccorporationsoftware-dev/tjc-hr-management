"use client";

import { useEffect, useMemo, useState } from "react";

import { getPayrollExtensionComponents } from "@/lib/payroll-extensions-api";
import type { PayrollComponent } from "@/types/payroll-extensions";

/**
 * รายการเงินเดือนที่ระบบเตรียมไว้ให้ ใช้เป็นตัวเลือกตอนเพิ่มรายการ
 * ==========================================================
 * ก่อนหน้านี้ทั้งฟอร์ม "รายการประจำ" และ "เฉพาะงวด" ให้พิมพ์ชื่อกับรหัสเอง
 * ผลคือชื่อเดียวกันสะกดคนละแบบในแต่ละคน รหัสก็ตั้งมั่ว และธงคิดภาษี/ฐานประกันสังคม
 * ต้องมานั่งนึกเองทุกครั้งว่ารายการนี้เข้าฐานหรือไม่เข้า
 *
 * ตัวนี้ดึงรายการที่ตั้งไว้ในระบบมาให้เลือก พอเลือกแล้วเติมชื่อ รหัส และธงให้ครบ
 * ยังพิมพ์เองได้เหมือนเดิมถ้าบริษัทมีรายการที่ไม่มีในชุดตั้งต้น
 */
export type PayrollComponentOption = {
  id: string;
  code: string;
  label: string;
  type: "EARNING" | "DEDUCTION";
  isTaxable: boolean;
  isSocialSecurityBase: boolean;
};

/**
 * รายการที่ระบบคำนวณให้เองอยู่แล้ว ห้ามให้เลือกมาใส่มือ
 * ไม่งั้นจะได้สองบรรทัดในสลิป — ตัวที่ระบบคิด กับตัวที่ HR ใส่ซ้ำ
 */
const SYSTEM_MANAGED_CODES = new Set([
  "BASE_SALARY",
  "OVERTIME_PAY",
  "OT_HOLIDAY",
  "OT_SPECIAL_HOLIDAY",
  "SOCIAL_SECURITY",
  "SOCIAL_SECURITY_EMPLOYER",
  "TAX",
  "LATE_DEDUCTION",
  "MISSING_LOG_DEDUCTION",
  "EARLY_LEAVE_DEDUCTION",
  "ABSENCE_DEDUCTION",
  "UNPAID_LEAVE_DEDUCTION",
  "ATTENDANCE_UNPAID_LEAVE_DEDUCTION",
  "PAID_LEAVE_DAYS",
  "UNPAID_LEAVE_INFO",
  "TIME_ADJUST_INFO",
  "ATTENDANCE_UNPAID_LEAVE_RECONCILE",
]);

export function usePayrollComponentOptions(companyId?: string) {
  const [components, setComponents] = useState<PayrollComponent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!companyId) return;
      setLoading(true);
      try {
        const result = await getPayrollExtensionComponents({
          companyId,
          pageSize: 100,
          status: "ACTIVE",
        });
        if (!cancelled) setComponents(result.items ?? []);
      } catch {
        /*
         * เลือกไม่ได้ไม่ใช่เรื่องคอขวด — ยังพิมพ์ชื่อกับรหัสเองได้เหมือนเดิม
         * จึงไม่ต้องเด้ง toast ไปรบกวนตอนกำลังกรอกฟอร์ม
         */
        if (!cancelled) setComponents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const options = useMemo<PayrollComponentOption[]>(
    () =>
      components
        .filter(
          (component) =>
            (component.type === "EARNING" || component.type === "DEDUCTION") &&
            !SYSTEM_MANAGED_CODES.has(component.code),
        )
        .map((component) => ({
          id: component.id,
          code: component.code,
          label: component.nameTh || component.name || component.code,
          type: component.type as "EARNING" | "DEDUCTION",
          isTaxable: component.isTaxable !== false,
          isSocialSecurityBase: component.isSocialSecurityBase === true,
        })),
    [components],
  );

  /**
   * หาตัวเลือกจากชื่อที่พิมพ์ — ใช้ตอนผู้ใช้พิมพ์เองแล้วตรงกับรายการที่มีอยู่
   * เทียบแบบตัดช่องว่างและไม่สนตัวพิมพ์ใหญ่เล็ก เพราะคนพิมพ์ตามที่เห็นในลิสต์
   * แต่อาจติดเว้นวรรคเกินมา
   */
  const findByLabel = useMemo(() => {
    const byLabel = new Map(
      options.map((option) => [option.label.replace(/\s+/g, "").toLowerCase(), option]),
    );
    return (label: string) =>
      byLabel.get(label.replace(/\s+/g, "").toLowerCase()) ?? null;
  }, [options]);

  return { options, loading, findByLabel };
}
