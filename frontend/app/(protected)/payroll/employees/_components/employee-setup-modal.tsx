"use client";

import { useState } from "react";

import { Modal, Tabs } from "@/components/kit";
import type { PayrollTaxAllowanceType } from "@/types/payroll";
import type { PayrollEmployee } from "@/types/payroll-extensions";

import { AdjustmentTab } from "./adjustment-tab";
import { LoanTab } from "./loan-tab";
import { SalaryTab } from "./salary-tab";
import { TaxTab } from "./tax-tab";

/**
 * ตั้งข้อมูลเงินเดือนของพนักงานหนึ่งคน
 * ------------------------------------
 * รวมสามเรื่องที่เคยอยู่คนละแผงไว้ในป๊อปอัพเดียว: รายได้ประจำ ค่าลดหย่อนภาษี
 * และหนี้ผ่อนชำระ — หน้าหลักจึงเหลือแค่ตารางรายชื่อที่กวาดตาหาคนได้เร็ว
 */

type TabKey = "income" | "adjustment" | "allowance" | "debt";

function employeeName(employee: PayrollEmployee) {
  return (
    employee.displayName ||
    `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() ||
    employee.employeeCode ||
    "-"
  );
}

export function EmployeeSetupModal({
  employee,
  companyId,
  taxYearId,
  allowanceTypes,
  onClose,
  onSaved,
}: {
  employee: PayrollEmployee | null;
  companyId: string;
  taxYearId: string;
  allowanceTypes: PayrollTaxAllowanceType[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<TabKey>("income");

  if (!employee) return null;

  const targetCompanyId = employee.companyId || companyId;

  return (
    <Modal
      open
      size="lg"
      title={employeeName(employee)}
      description={`${employee.employeeCode ?? "-"}${
        employee.department?.nameTh ? ` · ${employee.department.nameTh}` : ""
      }${employee.position ? ` · ${employee.position}` : ""}`}
      onClose={onClose}
    >
      {/* กางเต็มความกว้างของกล่อง เพื่อให้แถบแท็บและเส้นแบ่งชนขอบเหมือนหน้าอื่น */}
      <div className="-m-5">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { key: "income", label: "รายได้ประจำ" },
            { key: "adjustment", label: "เฉพาะงวด" },
            { key: "allowance", label: "ลดหย่อนภาษี" },
            { key: "debt", label: "หนี้ผ่อนชำระ" },
          ]}
        />

        {tab === "income" ? (
          <SalaryTab
            key={`income-${employee.id}`}
            companyId={targetCompanyId}
            employeeId={employee.id}
            onSaved={onSaved}
          />
        ) : null}

        {tab === "adjustment" ? (
          <AdjustmentTab
            key={`adjustment-${employee.id}`}
            companyId={targetCompanyId}
            employeeId={employee.id}
          />
        ) : null}

        {tab === "allowance" ? (
          <TaxTab
            key={`allowance-${employee.id}`}
            companyId={targetCompanyId}
            employeeId={employee.id}
            taxYearId={taxYearId}
            allowanceTypes={allowanceTypes}
            onSaved={onSaved}
          />
        ) : null}

        {tab === "debt" ? (
          <LoanTab
            key={`debt-${employee.id}`}
            companyId={targetCompanyId}
            employeeId={employee.id}
          />
        ) : null}
      </div>
    </Modal>
  );
}
