"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  Building2,
  ClipboardList,
  Pencil,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  Avatar,
  Button,
  ButtonLink,
  CellStack,
  DataTable,
  PageChip,
  PageHeading,
  PageSurface,
  SearchInput,
  Select,
  StatTile,
  joinClassName,
  type Column,
} from "@/components/kit";
import { LoadingState } from "@/components/common/feedback-state";
import {
  getEmployeeCompensations,
  getOrganizationCompanies,
  getPayrollTaxAllowanceTypes,
  getPayrollTaxYears,
  getPublicFileUrl,
} from "@/lib/api";
import {
  getPayrollCompensationItems,
  getPayrollExtensionEmployees,
} from "@/lib/payroll-extensions-api";
import {
  count,
  dateText,
  dedupeTaxYears,
  errorText,
  money,
  taxYearLabel,
} from "@/lib/payroll-format";
import { AttendanceGroupHeading } from "@/components/common/attendance-group-heading";
import {
  attendanceBranchGroupKey,
  attendanceBranchSortText,
  attendanceDepartmentGroupKey,
  attendanceDepartmentSortText,
  buildAttendanceDepartmentGroupRank,
  getAttendanceSessionGroupRank,
} from "@/lib/attendance-session-group";
import { compareEmployeeSeniority } from "@/lib/employee-seniority";
import type { CompanyItem } from "@/types/organization";
import type {
  EmployeeCompensation,
  PayrollTaxAllowanceType,
  PayrollTaxYear,
  SalaryBasis,
} from "@/types/payroll";
import type {
  EmployeeCompensationItem,
  PayrollEmployee,
} from "@/types/payroll-extensions";

import { EmployeeSetupModal } from "./_components/employee-setup-modal";

import { scrollPagerToTop } from "@/lib/scroll-to-top";

/**
 * ค่าจ้างพนักงาน — ข้อมูลตั้งต้นที่ใช้คำนวณเงินเดือน
 * --------------------------------------------------
 * หน้าหลักเป็นตารางอย่างเดียว กวาดตาหาคนที่ยังไม่ตั้งค่าได้เร็ว
 * ส่วนฟอร์มทั้งหมด (รายได้ประจำ / ลดหย่อนภาษี / หนี้ผ่อนชำระ) อยู่ในป๊อปอัพ
 * เพราะเป็นงานที่ทำทีละคน ไม่ต้องแบ่งจอค้างไว้ตลอดเวลา
 *
 * ป๊อปอัพตั้งเงินเดือนได้เฉพาะครั้งแรก — คนที่มีค่าจ้างแล้วต้องแก้ผ่าน
 * "รอบปรับค่าจ้าง" (/payroll/employees/rounds) ที่เก็บชื่อรอบ วันที่มีผล ตัวเลขก่อน/หลัง
 */

/** จำนวนคนต่อหน้า — พอดีหนึ่งหน้าจอโดยไม่ต้องเลื่อนยาว */
const PAGE_SIZE = 30;

/** วันนี้ (เวลาไทย) ไว้เทียบว่าฐานเงินเดือนชุดล่าสุดมีผลแล้วหรือยัง */
const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

function employeeName(employee: PayrollEmployee) {
  return (
    employee.displayName ||
    `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() ||
    employee.employeeCode ||
    "-"
  );
}

/**
 * เงินเพิ่ม/รายการหักประจำของพนักงานหนึ่งคน
 * ทุกก้อนอยู่ที่ EmployeeCompensationItem ที่เดียว ไม่มีช่องตายตัวอีกแล้ว
 */
function recurringTotals(items: EmployeeCompensationItem[] = []) {
  let earning = 0;
  let deduction = 0;

  for (const item of items) {
    if (item.status && item.status !== "ACTIVE") continue;
    const amount = Number(item.amount ?? 0);
    if (item.type === "DEDUCTION") deduction += amount;
    else if (item.type === "EARNING") earning += amount;
  }

  return { earning, deduction };
}

export default function PayrollEmployeesPage() {
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [booting, setBooting] = useState(true);

  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [compensationByEmployee, setCompensationByEmployee] = useState<
    Record<string, EmployeeCompensation>
  >({});
  const [itemsByEmployee, setItemsByEmployee] = useState<
    Record<string, EmployeeCompensationItem[]>
  >({});
  const [listLoading, setListLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [branchId, setBranchId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [employeeTypeId, setEmployeeTypeId] = useState("");
  const [editingEmployeeId, setEditingEmployeeId] = useState("");
  /*
   * เก็บหน้าคู่กับเงื่อนไขที่ใช้อยู่ พอเปลี่ยนคำค้นหรือตัวกรอง หน้าก็กลับไปหน้าแรกเอง
   * โดยไม่ต้องมี effect คอยรีเซ็ต
   */
  const [pageState, setPageState] = useState({ key: "", page: 1 });

  const [taxYears, setTaxYears] = useState<PayrollTaxYear[]>([]);
  const [taxYearId, setTaxYearId] = useState("");
  const [allowanceTypes, setAllowanceTypes] = useState<
    PayrollTaxAllowanceType[]
  >([]);

  useEffect(() => {
    void (async () => {
      try {
        const result = await getOrganizationCompanies({
          page: 1,
          pageSize: 100,
          status: "ACTIVE",
        });
        setCompanies(result.items);
        setCompanyId((current) => current || result.items[0]?.id || "");
      } catch (error) {
        toast.error(errorText(error, "โหลดรายชื่อบริษัทไม่สำเร็จ"));
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const loadEmployees = useCallback(async (targetCompanyId: string) => {
    if (!targetCompanyId) return;
    setListLoading(true);
    try {
      const [employeeResult, compensationResult, itemResult, yearResult] =
        await Promise.all([
          getPayrollExtensionEmployees({
            companyId: targetCompanyId,
            pageSize: 500,
            status: "ACTIVE",
          }),
          getEmployeeCompensations({
            companyId: targetCompanyId,
            pageSize: 500,
            status: "ACTIVE",
          }),
          getPayrollCompensationItems({
            companyId: targetCompanyId,
            pageSize: 500,
            status: "ACTIVE",
          }),
          getPayrollTaxYears({
            companyId: targetCompanyId,
            page: 1,
            pageSize: 50,
          }),
        ]);

      setEmployees(employeeResult.items ?? []);

      // หนึ่งคนอาจมีหลายรอบค่าจ้าง ใช้ตัวแรกที่ backend ส่งมา (ล่าสุดที่ยังใช้งาน)
      const compensationMap: Record<string, EmployeeCompensation> = {};
      for (const item of compensationResult.data) {
        if (!compensationMap[item.employeeId]) {
          compensationMap[item.employeeId] = item;
        }
      }
      setCompensationByEmployee(compensationMap);

      const itemMap: Record<string, EmployeeCompensationItem[]> = {};
      for (const item of itemResult.items ?? []) {
        (itemMap[item.employeeId] ??= []).push(item);
      }
      setItemsByEmployee(itemMap);

      setTaxYears(yearResult.data);
      const canonical = dedupeTaxYears(yearResult.data);
      setTaxYearId(canonical[0]?.id ?? "");
    } catch (error) {
      toast.error(errorText(error, "โหลดรายชื่อพนักงานไม่สำเร็จ"));
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!companyId) return;
    const timer = window.setTimeout(() => void loadEmployees(companyId), 0);
    return () => window.clearTimeout(timer);
  }, [companyId, loadEmployees]);

  // ประเภทค่าลดหย่อนผูกกับปีภาษี จึงต้องโหลดใหม่ทุกครั้งที่เปลี่ยนปี
  useEffect(() => {
    let cancelled = false;

    const timer = window.setTimeout(() => {
      if (!taxYearId) {
        setAllowanceTypes([]);
        return;
      }

      void getPayrollTaxAllowanceTypes({ taxYearId })
        .then((result) => {
          if (!cancelled) setAllowanceTypes(result);
        })
        .catch(() => {
          if (!cancelled) setAllowanceTypes([]);
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [taxYearId]);

  const visibleYears = useMemo(() => dedupeTaxYears(taxYears), [taxYears]);

  /**
   * ตัวเลือกของตัวกรองสร้างจากรายชื่อที่โหลดมาแล้ว ไม่ต้องยิง API เพิ่ม
   * และไม่ขึ้นตัวเลือกที่ไม่มีใครอยู่จริงในบริษัทนี้
   */
  const filterOptions = useMemo(() => {
    const branches = new Map<string, string>();
    const departments = new Map<string, string>();
    const employeeTypes = new Map<string, string>();

    for (const employee of employees) {
      if (employee.branch?.id) {
        branches.set(
          employee.branch.id,
          employee.branch.nameTh || employee.branch.code || "ไม่ระบุ",
        );
      }
      if (employee.department?.id) {
        departments.set(
          employee.department.id,
          employee.department.nameTh || employee.department.code || "ไม่ระบุ",
        );
      }
      if (employee.employeeType?.id) {
        employeeTypes.set(
          employee.employeeType.id,
          employee.employeeType.nameTh ||
            employee.employeeType.nameEn ||
            employee.employeeType.code ||
            "ไม่ระบุ",
        );
      }
    }

    const sorted = (map: Map<string, string>) =>
      Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], "th"));

    return {
      branches: sorted(branches),
      departments: sorted(departments),
      employeeTypes: sorted(employeeTypes),
    };
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return employees.filter((employee) => {
      if (branchId && employee.branch?.id !== branchId) return false;
      if (departmentId && employee.department?.id !== departmentId)
        return false;
      if (employeeTypeId && employee.employeeType?.id !== employeeTypeId) {
        return false;
      }
      if (!keyword) return true;

      return `${employee.employeeCode ?? ""} ${employeeName(employee)} ${employee.department?.nameTh ?? ""} ${employee.branch?.nameTh ?? ""}`
        .toLowerCase()
        .includes(keyword);
    });
  }, [employees, search, branchId, departmentId, employeeTypeId]);

  const activeFilterCount = [branchId, departmentId, employeeTypeId].filter(
    Boolean,
  ).length;

  const departmentGroupRank = useMemo(
    () =>
      buildAttendanceDepartmentGroupRank(
        filteredEmployees,
        (employee) => employee,
      ),
    [filteredEmployees],
  );

  /*
   * ลำดับแถว: สาขา → แผนกตามกลุ่มการลงเวลา
   * (บริหาร → ลงครบ 3 รอบ → ยกเว้นเข้างานบ่าย → ยกเว้นรอบอื่น)
   * → ระดับตำแหน่ง (ผู้บริหารขึ้นก่อน) → รหัสพนักงาน
   * ชุดเดียวกับทะเบียนพนักงานและหน้าตรวจเวลา ตั้งค่าจ้างจะได้ไล่ตามลำดับเดิม
   */
  const sortedEmployees = useMemo(
    () =>
      [...filteredEmployees].sort((left, right) => {
        const branchDiff = attendanceBranchSortText(left).localeCompare(
          attendanceBranchSortText(right),
          "th",
        );
        if (branchDiff !== 0) return branchDiff;

        const departmentRankDiff =
          (departmentGroupRank.get(attendanceDepartmentGroupKey(left)) ?? 99) -
          (departmentGroupRank.get(attendanceDepartmentGroupKey(right)) ?? 99);
        if (departmentRankDiff !== 0) return departmentRankDiff;

        const departmentDiff = attendanceDepartmentSortText(left).localeCompare(
          attendanceDepartmentSortText(right),
          "th",
        );
        if (departmentDiff !== 0) return departmentDiff;

        const groupDiff =
          getAttendanceSessionGroupRank(left) -
          getAttendanceSessionGroupRank(right);
        if (groupDiff !== 0) return groupDiff;

        const seniorityDiff = compareEmployeeSeniority(left, right);
        if (seniorityDiff !== 0) return seniorityDiff;

        return (left.employeeCode || "").localeCompare(
          right.employeeCode || "",
        );
      }),
    [filteredEmployees, departmentGroupRank],
  );

  /** จำนวนพนักงานต่อหัวกลุ่ม — นับจากรายการที่ผ่านตัวกรองแล้ว ให้ตรงกับที่เห็นบนตาราง */
  const groupEmployeeCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const employee of filteredEmployees) {
      for (const key of [
        attendanceBranchGroupKey(employee),
        attendanceDepartmentGroupKey(employee),
      ]) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    return counts;
  }, [filteredEmployees]);

  const editingEmployee = useMemo(
    () =>
      employees.find((employee) => employee.id === editingEmployeeId) ?? null,
    [employees, editingEmployeeId],
  );

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === companyId) ?? null,
    [companies, companyId],
  );

  const withSalaryCount = useMemo(
    () =>
      employees.filter((employee) => compensationByEmployee[employee.id])
        .length,
    [employees, compensationByEmployee],
  );

  /*
   * ฐานค่าจ้างต่างกัน ตัวเลขคนละความหมาย
   * 500 ของพนักงานรายวันไม่ใช่เงินเดือน 500 ต้องบอกหน่วยกำกับเสมอ
   */
  const basisSuffix = (
    compensation: { salaryBasis?: SalaryBasis } | undefined,
  ) => {
    if (compensation?.salaryBasis === "DAILY") return " /วัน";
    if (compensation?.salaryBasis === "HOURLY") return " /ชม.";
    return "";
  };

  const isMonthlyBasis = (
    compensation: { salaryBasis?: SalaryBasis } | undefined,
  ) => (compensation?.salaryBasis ?? "MONTHLY") === "MONTHLY";

  /** ต้นทุนคงที่ต่อเดือน = เงินเดือน + เงินเพิ่มประจำ − รายการหักประจำ ของทุกคน */
  const monthlyTotal = useMemo(
    () =>
      employees.reduce((sum, employee) => {
        const compensation = compensationByEmployee[employee.id];
        if (!compensation) return sum;

        /*
         * พนักงานรายวัน/รายชั่วโมงไม่มีค่าจ้างคงที่ต่อเดือน ขึ้นกับวันที่มาทำงาน
         * เอาอัตราต่อวันมาบวกตรง ๆ จะได้ยอดที่ผิดจนไม่มีความหมาย จึงไม่นับรวม
         */
        if (!isMonthlyBasis(compensation)) return sum;

        const totals = recurringTotals(itemsByEmployee[employee.id]);
        return (
          sum +
          Number(compensation.baseSalary ?? 0) +
          totals.earning -
          totals.deduction
        );
      }, 0),
    [employees, compensationByEmployee, itemsByEmployee],
  );

  const missingSalaryCount = employees.length - withSalaryCount;

  /*
   * แบ่งหน้าแทนการเลื่อนในกล่อง — รายชื่อยาวเป็นร้อยคน ถ้าปล่อยยาวทั้งหน้า
   * แถบเลื่อนของหน้าจะสั้นจนใช้ไม่ได้ และหัวกลุ่มสาขาก็ห่างกันเกินไป
   */
  const pageKey = [
    search,
    branchId,
    departmentId,
    employeeTypeId,
    companyId,
  ].join("|");
  const totalPages = Math.max(1, Math.ceil(sortedEmployees.length / PAGE_SIZE));
  const currentPage = Math.min(
    pageState.key === pageKey ? pageState.page : 1,
    totalPages,
  );

  function goToPage(next: number) {
    setPageState({ key: pageKey, page: next });
  }
  const pagedEmployees = sortedEmployees.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const columns: Array<Column<PayrollEmployee>> = [
    {
      key: "employee",
      header: "พนักงาน",
      cell: (employee) => (
        <CellStack
          leading={
            <Avatar
              name={employeeName(employee)}
              src={getPublicFileUrl(employee.user?.avatarUrl ?? null)}
              size="md"
            />
          }
          primary={employeeName(employee)}
          secondary={`${employee.employeeCode ?? "-"}${
            employee.department?.nameTh
              ? ` · ${employee.department.nameTh}`
              : ""
          }`}
        />
      ),
    },
    {
      key: "salary",
      header: "เงินเดือน",
      align: "right",
      width: "w-36",
      cell: (employee) => {
        const compensation = compensationByEmployee[employee.id];

        return compensation ? (
          <span className="inline-flex flex-col items-end">
            <span className="font-semibold text-slate-900">
              {money(compensation.baseSalary)}
              {basisSuffix(compensation) ? (
                <span className="ml-0.5 text-[11px] font-medium text-slate-500">
                  {basisSuffix(compensation)}
                </span>
              ) : null}
            </span>
            {/* ชุดที่รอบปรับตั้งไว้ล่วงหน้า — ให้รู้ว่าตัวเลขนี้ยังไม่ใช่ของงวดปัจจุบัน */}
            {compensation.effectiveDate.slice(0, 10) > todayKey ? (
              <span className="text-[10.5px] font-medium text-amber-600">
                มีผล {dateText(compensation.effectiveDate)}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-[12px] 3xl:text-[13px] 4xl:text-[13.5px] font-semibold text-amber-600">
            ยังไม่ตั้ง
          </span>
        );
      },
    },
    {
      key: "allowance",
      header: "เงินเพิ่มประจำ",
      align: "right",
      width: "w-40",
      hideBelow: "lg",
      cell: (employee) => {
        const items = itemsByEmployee[employee.id] ?? [];
        const totals = recurringTotals(items);

        if (!totals.earning && !totals.deduction) {
          return <span className="text-slate-300">0.00</span>;
        }

        return (
          <span className="inline-flex flex-col items-end">
            <span className="text-slate-600">{money(totals.earning)}</span>
            {totals.deduction ? (
              <span className="text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] text-rose-600/90">
                หักประจำ {money(totals.deduction)}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: "monthly",
      header: "รวมต่อเดือน",
      align: "right",
      width: "w-36",
      cell: (employee) => {
        const compensation = compensationByEmployee[employee.id];
        if (!compensation) return <span className="text-slate-300">-</span>;

        const totals = recurringTotals(itemsByEmployee[employee.id]);

        /* รายวัน/รายชั่วโมงยังไม่รู้ยอดจนกว่าจะรู้จำนวนวันที่มาทำงานจริง */
        if (!isMonthlyBasis(compensation)) {
          return (
            <span className="text-[12px] 3xl:text-[13px] font-medium text-slate-500">
              ตามวันทำงานจริง
            </span>
          );
        }

        return (
          <span className="text-[14px] 3xl:text-[15px] 4xl:text-[16px] font-bold tabular-nums text-brand-700">
            {money(
              Number(compensation.baseSalary ?? 0) +
                totals.earning -
                totals.deduction,
            )}
          </span>
        );
      },
    },
    {
      key: "deduction",
      header: "หักภาษี / ปกส.",
      width: "w-36",
      hideBelow: "xl",
      cell: (employee) => {
        const compensation = compensationByEmployee[employee.id];
        if (!compensation) return <span className="text-slate-300">-</span>;

        const chip = (label: string, active: boolean) => (
          <span
            className={joinClassName(
              "inline-flex rounded px-1.5 py-0.5 text-[11px] 3xl:text-[12px] 4xl:text-[12.5px] font-semibold",
              active
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-400",
            )}
          >
            {label}
          </span>
        );

        return (
          <span className="flex items-center gap-1.5">
            {chip("ภาษี", compensation.taxEnabled)}
            {chip("ปกส.", compensation.socialSecurityEnabled)}
          </span>
        );
      },
    },
    {
      key: "bank",
      header: "บัญชีรับเงิน",
      width: "w-48",
      hideBelow: "xl",
      cell: (employee) => {
        const compensation = compensationByEmployee[employee.id];

        return compensation?.bankAccountNo ? (
          <CellStack
            primary={
              <span className="text-[13px] 3xl:text-[14px] 4xl:text-[14.5px] font-medium text-slate-700">
                {compensation.bankName || "ไม่ระบุธนาคาร"}
              </span>
            }
            secondary={compensation.bankAccountNo}
          />
        ) : (
          <span className="text-[12px] 3xl:text-[13px] 4xl:text-[13.5px] text-amber-600">
            ยังไม่มีเลขบัญชี
          </span>
        );
      },
    },
    {
      key: "action",
      header: "",
      align: "right",
      width: "w-28",
      cell: (employee) => (
        <Button
          size="sm"
          icon={<Pencil className="h-3.5 w-3.5" />}
          onClick={(event) => {
            event.stopPropagation();
            setEditingEmployeeId(employee.id);
          }}
        >
          {compensationByEmployee[employee.id] ? "ดู / บัญชี" : "ตั้งค่า"}
        </Button>
      ),
    },
  ];

  if (booting) {
    return (
      <PageSurface className="px-5 3xl:px-6 4xl:px-7 py-6 sm:px-6">
        <LoadingState title="กำลังโหลดข้อมูลพนักงาน" />
      </PageSurface>
    );
  }

  return (
    <PageSurface className="xl:overflow-visible">
      <PageHeading
        heroMotif="payroll"
        eyebrow="Payroll"
        title="ค่าจ้าง"
        titleAccent="พนักงาน"
        description="ข้อมูลตั้งต้นที่ใช้คำนวณทุกงวด — เงินเดือน เงินเพิ่มประจำ ค่าลดหย่อนภาษี และหนี้ผ่อนชำระ"
        chips={
          <>
            {selectedCompany ? (
              <PageChip tone="brand" icon={<Building2 className="h-3 w-3" />}>
                {selectedCompany.nameTh ||
                  selectedCompany.nameEn ||
                  selectedCompany.code}
              </PageChip>
            ) : null}
            <PageChip icon={<Users className="h-3 w-3" />}>
              พนักงานใช้งาน {employees.length} คน
            </PageChip>
          </>
        }
        actions={
          <>
            {/* ปุ่มหลักของหน้า — ทุกการเปลี่ยนเงินเดือนหลังตั้งค่าครั้งแรกเริ่มจากตรงนี้ */}
            <div className="flex justify-end">
              <ButtonLink
                href="/payroll/employees/rounds"
                variant="primary"
                icon={<ClipboardList className="h-4 w-4" />}
              >
                รอบปรับค่าจ้าง
              </ButtonLink>
            </div>
            <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-[repeat(3,minmax(10.5rem,max-content))] sm:divide-y-0">
              <StatTile
                icon={<BadgeCheck className="h-4 w-4" />}
                label="ตั้งค่าจ้างแล้ว"
                value={`${withSalaryCount} คน`}
                tone={missingSalaryCount > 0 ? "neutral" : "positive"}
                helper={`จากทั้งหมด ${employees.length} คน`}
              />
              <StatTile
                icon={<AlertTriangle className="h-4 w-4" />}
                label="ยังไม่ตั้ง"
                value={`${missingSalaryCount} คน`}
                tone={missingSalaryCount > 0 ? "warning" : "positive"}
                helper={
                  missingSalaryCount > 0
                    ? "คนกลุ่มนี้จะไม่มียอดในงวด"
                    : "ตั้งครบทุกคนแล้ว"
                }
              />
              <StatTile
                icon={<Banknote className="h-4 w-4" />}
                label="ค่าจ้างรวมต่อเดือน"
                value={money(monthlyTotal)}
                helper="เงินเดือน + รายการประจำ (เฉพาะพนักงานรายเดือน)"
              />
            </div>
          </>
        }
      />

      {/*
       * แถบเครื่องมือพื้นเทาอ่อน — ขอบเขตข้อมูล (บริษัท ปีภาษี) กับตัวกรองอยู่แถวเดียวกัน
       * เดิมสองอย่างแรกซ่อนอยู่ในหัวเรื่องใต้แผงตัวเลข ทำให้หัวหน้าสูงและหาไม่เจอ
       */}
      <div className="flex flex-col gap-3 border-b border-slate-300 bg-slate-50/70 px-5 py-3 sm:px-6 xl:flex-row xl:items-center xl:justify-between 3xl:px-7">
        <div className="flex flex-wrap items-center gap-2 [&_select]:bg-white">
          {companies.length > 1 ? (
            <div className="w-full sm:w-52">
              <Select
                value={companyId}
                onChange={(event) => setCompanyId(event.target.value)}
                aria-label="บริษัท"
              >
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.nameTh || company.nameEn || company.code}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <div className="w-full sm:w-40">
            <Select
              value={taxYearId}
              onChange={(event) => setTaxYearId(event.target.value)}
              aria-label="ปีภาษี"
            >
              {visibleYears.length === 0 ? (
                <option value="">ยังไม่มีปีภาษี</option>
              ) : null}
              {visibleYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {taxYearLabel(year)}
                </option>
              ))}
            </Select>
          </div>

          <span
            aria-hidden="true"
            className="hidden h-6 w-px bg-slate-300 sm:block"
          />

          <Select
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
            className="w-full sm:w-44"
            aria-label="สาขา"
          >
            <option value="">ทุกสาขา</option>
            {filterOptions.branches.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>

          <Select
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
            className="w-full sm:w-48"
            aria-label="แผนก"
          >
            <option value="">ทุกแผนก</option>
            {filterOptions.departments.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>

          <Select
            value={employeeTypeId}
            onChange={(event) => setEmployeeTypeId(event.target.value)}
            className="w-full sm:w-44"
            aria-label="ประเภทพนักงาน"
          >
            <option value="">ทุกประเภทพนักงาน</option>
            {filterOptions.employeeTypes.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>

          {activeFilterCount > 0 ? (
            <button
              type="button"
              onClick={() => {
                setBranchId("");
                setDepartmentId("");
                setEmployeeTypeId("");
              }}
              className="inline-flex items-center gap-1 text-[12px] 3xl:text-[13px] 4xl:text-[13.5px] font-semibold text-brand-700 underline-offset-2 hover:underline"
            >
              <X className="h-3.5 w-3.5" />
              ล้างตัวกรอง {activeFilterCount}
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-3 xl:shrink-0">
          <p className="hidden whitespace-nowrap text-[12px] 3xl:text-[13px] 4xl:text-[13.5px] text-slate-500 sm:block">
            {search || activeFilterCount > 0
              ? `เจอ ${count(filteredEmployees.length)} จาก ${count(employees.length)} คน`
              : `ทั้งหมด ${count(employees.length)} คน`}
          </p>

          <div className="[&_input]:bg-white">
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหาชื่อ รหัสพนักงาน"
              className="w-full sm:w-60"
            />
          </div>
        </div>
      </div>

      <div className="[&_thead]:bg-white [&_thead_th]:border-slate-300 [&_thead_th]:font-semibold [&_thead_th]:tracking-normal [&_thead_th]:text-slate-700 [&_thead_th]:py-3.5 [&_thead_th]:text-[12.5px] 3xl:[&_thead_th]:py-4 3xl:[&_thead_th]:text-[13px] 4xl:[&_thead_th]:py-[1.125rem] 4xl:[&_thead_th]:text-[13.5px]">
        <DataTable
          loading={listLoading}
          columns={columns}
          rows={pagedEmployees}
          rowKey={(employee) => employee.id}
          onRowClick={(employee) => setEditingEmployeeId(employee.id)}
          groupBy={(employee) => {
            const branchKey = attendanceBranchGroupKey(employee);
            const departmentKey = attendanceDepartmentGroupKey(employee);

            return [
              {
                key: branchKey,
                label: (
                  <AttendanceGroupHeading
                    level="branch"
                    title={
                      employee.branch?.nameTh ||
                      employee.company?.nameTh ||
                      "ไม่ระบุสาขา"
                    }
                    code={employee.branch?.code}
                    employeeCount={groupEmployeeCounts.get(branchKey)}
                  />
                ),
              },
              {
                key: departmentKey,
                label: (
                  <AttendanceGroupHeading
                    level="department"
                    title={employee.department?.nameTh || "ไม่ระบุแผนก"}
                    code={employee.department?.code}
                    employeeCount={groupEmployeeCounts.get(departmentKey)}
                  />
                ),
              },
            ];
          }}
          quietScrollbars
          minWidth="min-w-[58rem]"
          emptyTitle="ไม่พบพนักงาน"
          emptyDescription="ลองเปลี่ยนคำค้นหา หรือเลือกบริษัทอื่น"
          /* 5rem = ความสูงแถบบนสุด — หัวตารางกับแถบชื่อสาขาจะไปค้างต่อจากแถบนั้น */
          pageStickyTop="5rem"
        />
      </div>

      {!listLoading && sortedEmployees.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 sm:px-6 3xl:px-7">
          <span className="text-[12.5px] text-slate-500 3xl:text-[13px]">
            หน้า {count(currentPage)} จาก {count(totalPages)} · แสดง{" "}
            {count((currentPage - 1) * PAGE_SIZE + 1)}–
            {count(Math.min(currentPage * PAGE_SIZE, sortedEmployees.length))}{" "}
            จาก {count(sortedEmployees.length)} คน
          </span>

          <div className="flex items-center gap-1">
            <Button
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => {
                goToPage(currentPage - 1);
                scrollPagerToTop();
              }}
            >
              ก่อนหน้า
            </Button>
            <Button
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => {
                goToPage(currentPage + 1);
                scrollPagerToTop();
              }}
            >
              ถัดไป
            </Button>
          </div>
        </div>
      ) : null}

      <EmployeeSetupModal
        employee={editingEmployee}
        companyId={companyId}
        taxYearId={taxYearId}
        allowanceTypes={allowanceTypes}
        onClose={() => setEditingEmployeeId("")}
        onSaved={() => void loadEmployees(companyId)}
      />
    </PageSurface>
  );
}
