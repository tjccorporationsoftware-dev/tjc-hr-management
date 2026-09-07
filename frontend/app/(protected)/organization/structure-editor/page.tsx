"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleCheckBig,
  Inbox,
  MapPin,
  MousePointerClick,
  Plus,
  Save,
  TriangleAlert,
  Undo2,
  UserRoundCog,
  UsersRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  Avatar,
  Button,
  ButtonLink,
  CONTROL_BASE,
  Field,
  FOCUS_RING,
  Modal,
  PageChip,
  PageHeading,
  PageSurface,
  SearchInput,
  Select,
  StatTile,
  Toolbar,
} from "@/components/kit";
import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import { apiFetch } from "@/lib/api";
import type {
  BranchItem,
  CompanyItem,
  DepartmentItem,
} from "@/types/organization";

import {
  avatarUrlOf,
  cn,
  fetchAllEmployees,
  nameOf,
  normalize,
  positionOf,
  showApiError,
  type StructureEmployee,
} from "../_components/structure-shared";

/**
 * จัดผังองค์กร — กองพักบนสุด · กระดานสาขาไล่ลงมา
 * ----------------------------------------------
 * แถวบนสุดคือกองคนที่ยังไม่ระบุแผนก เต็มความกว้าง (แยกหัวข้อย่อยตามสาขา
 * ให้ดูออกว่าใครอยู่ไหน) ใต้ลงมาคือกระดานของแต่ละสาขา หนึ่งกระดาน = หนึ่งสาขา
 * ข้างในมีกล่องของทุกแผนก
 *
 * กระดานพับไว้ตั้งแต่เปิดหน้า เพราะบริษัทที่มีหลายสาขาจะยาวเกินจอทันที
 * หัวกระดานสรุปตัวเลขให้ครบตั้งแต่ยังไม่กาง กางเฉพาะสาขาที่กำลังจะจัด
 * (ลากการ์ดไปจ่อหัวกระดานที่พับอยู่ มันจะกางให้เองระหว่างลาก)
 *
 * ย้ายคนได้สามทาง — ต้องมีหลายทาง เพราะลากวางใช้ไม่ได้บนแท็บเล็ต/จอสัมผัส
 *   1) ลากการ์ดไปวางในกล่องปลายทาง
 *   2) แตะการ์ด (กี่คนก็ได้) แล้วแตะกล่องปลายทางทีเดียว
 *   3) กดปุ่ม + ที่หัวกล่องแผนก แล้วติ๊กเลือกคนจากรายชื่อทั้งหมด
 *
 * กล่องคือ "แผนก + สาขา" อยู่แล้ว รายชื่อหัวหน้าที่เลือกได้จึงเป็นคนในกล่อง
 * เดียวกันเท่านั้น และตั้งหัวหน้าให้ทั้งกล่องทีเดียวได้จากท้ายกล่อง
 *
 * แก้ทั้งหมดค้างไว้ในหน้าจอ ยังไม่แตะ backend จนกว่าจะกดบันทึก
 * แล้วค่อยยิง PATCH /employees/:id เฉพาะคนที่เปลี่ยนจริง
 */

/** พ้นสภาพแล้ว — ตั้งเป็นหัวหน้าใครไม่ได้ */
const FORMER_STATUSES = new Set(["RESIGNED", "TERMINATED", "INACTIVE"]);

/** id ของกลุ่ม "ยังไม่ระบุสาขา" — ใช้แทน null ใน key ของ React เท่านั้น */
const NO_BRANCH = "__no_branch__";

function count(value: number) {
  return value.toLocaleString("th-TH");
}

function hasChanged(original: StructureEmployee, draft: StructureEmployee) {
  return (
    (original.departmentId ?? null) !== (draft.departmentId ?? null) ||
    (original.divisionId ?? null) !== (draft.divisionId ?? null) ||
    (original.supervisorId ?? null) !== (draft.supervisorId ?? null) ||
    (original.sortOrder ?? 0) !== (draft.sortOrder ?? 0) ||
    (original.branchId ?? null) !== (draft.branchId ?? null) ||
    (original.companyId ?? null) !== (draft.companyId ?? null)
  );
}

/**
 * แผนกบริหารต้องเป็นกล่องแรกของทุกสาขาเสมอ ไม่ว่าจะมีคนกี่คน
 * เพราะเป็นหัวขององค์กร คนอ่านผังมองหาตรงนี้ก่อนเป็นอันดับแรก
 *
 * ดูจากรหัสแผนกเป็นหลัก (MGT) และเผื่อชื่อไว้ให้บริษัทที่ตั้งรหัสเองไม่ตรง
 */
function isExecutiveDepartment(department: DepartmentItem) {
  return (
    department.code?.trim().toUpperCase() === "MGT" ||
    department.nameTh?.trim() === "บริหาร"
  );
}

/**
 * ลำดับการ์ดในกล่อง — ลำดับที่จัดมือไว้มาก่อน ถ้ายังไม่เคยจัดค่อยใช้ระดับตำแหน่ง
 *
 * sortOrder 0 = ยังไม่เคยกดเลื่อน กล่องนั้นจึงยังเรียงอัตโนมัติตามระดับตำแหน่ง
 * (level 1 = สูงสุด) เท่ากันแล้วเรียงตามชื่อ
 */
function compareBySeniority(a: StructureEmployee, b: StructureEmployee) {
  const manual = (employee: StructureEmployee) => employee.sortOrder || 0;
  const aManual = manual(a);
  const bManual = manual(b);

  if (aManual !== bManual) {
    if (aManual === 0) return 1;
    if (bManual === 0) return -1;
    return aManual - bManual;
  }

  const rank = (employee: StructureEmployee) => {
    const level = employee.positionMaster?.level;
    return typeof level === "number" && level > 0 ? level : 99;
  };

  const byLevel = rank(a) - rank(b);
  if (byLevel !== 0) return byLevel;
  return nameOf(a).localeCompare(nameOf(b), "th");
}

function StructureEditorWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const companyId = searchParams.get("companyId") ?? "";
  const scopeBranchId = searchParams.get("branchId") ?? "";
  const scopeDepartmentId = searchParams.get("departmentId") ?? "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);

  /** ของเดิมจากเซิร์ฟเวอร์ ใช้เทียบหาสิ่งที่เปลี่ยน */
  const [baseline, setBaseline] = useState<StructureEmployee[]>([]);
  const [draft, setDraft] = useState<StructureEmployee[]>([]);

  const [branchFocus, setBranchFocus] = useState(scopeBranchId);
  const [hideEmptyBoxes, setHideEmptyBoxes] = useState(false);
  const [q, setQ] = useState("");

  /** กระดานที่กางอยู่ — เริ่มต้นพับหมดทุกสาขา */
  const [openBoards, setOpenBoards] = useState<Set<string>>(new Set());

  /** คนที่ "ถืออยู่ในมือ" — แตะการ์ดเพื่อหยิบ แตะกล่องเพื่อวาง */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [dragIds, setDragIds] = useState<string[]>([]);

  /* กล่องยืนยันของระบบ ใช้ชุดเดียวกับหน้าอื่น ไม่ใช่ window.confirm ของเบราว์เซอร์ */
  const [dialog, setDialog] = useState<ActionDialogState | null>(null);

  /** กล่องเลือกคนเข้าแผนก — เปิดจากปุ่ม + ที่หัวกล่องแผนก */
  const [picker, setPicker] = useState<{
    department: DepartmentItem;
    branchId: string;
    branchName: string;
  } | null>(null);
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set());
  const [pickerQuery, setPickerQuery] = useState("");

  /* ---------------------------------------------------------------- */
  /* data                                                              */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);

        const [companyRes, branchRes, departmentRes] = await Promise.all([
          apiFetch<CompanyItem[]>(
            "/organization/companies?page=1&pageSize=100",
          ),
          apiFetch<BranchItem[]>("/organization/branches?page=1&pageSize=100"),
          apiFetch<DepartmentItem[]>(
            "/organization/departments?page=1&pageSize=100",
          ),
        ]);

        const employees = await fetchAllEmployees();
        if (!alive) return;

        // ยึดขอบเขตเดียวกับตัวกรองของแท็บผังองค์กรที่กดเข้ามา
        const scoped = employees.filter((employee) => {
          if (companyId && employee.companyId !== companyId) return false;
          if (scopeBranchId && employee.branchId !== scopeBranchId) return false;
          if (scopeDepartmentId && employee.departmentId !== scopeDepartmentId) {
            return false;
          }
          return true;
        });

        setCompanies(companyRes ?? []);
        setBranches(branchRes ?? []);
        setDepartments(departmentRes ?? []);
        setBaseline(scoped);
        setDraft(scoped.map((employee) => ({ ...employee })));
      } catch (error) {
        if (alive) showApiError(error, "โหลดข้อมูลผังองค์กรไม่สำเร็จ");
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, [companyId, scopeBranchId, scopeDepartmentId]);

  /* ---------------------------------------------------------------- */
  /* derived                                                           */
  /* ---------------------------------------------------------------- */

  const company = useMemo(
    () => companies.find((item) => item.id === companyId) ?? null,
    [companies, companyId],
  );

  const branchOptions = useMemo(
    () =>
      branches.filter((branch) => !companyId || branch.companyId === companyId),
    [branches, companyId],
  );

  const branchById = useMemo(
    () => new Map(branchOptions.map((branch) => [branch.id, branch])),
    [branchOptions],
  );

  /** แผนกที่ใช้ได้ในกระดานนี้ เรียงตามชื่อเพื่อให้ตำแหน่งกล่องคงที่ */
  const departmentOptions = useMemo(
    () =>
      departments
        .filter((department) => {
          if (companyId && department.companyId !== companyId) return false;
          // แผนกระดับบริษัท (branchId = null) ใช้ได้กับทุกสาขา
          if (
            scopeBranchId &&
            department.branchId &&
            department.branchId !== scopeBranchId
          ) {
            return false;
          }
          return true;
        })
        .sort((a, b) => a.nameTh.localeCompare(b.nameTh, "th")),
    [companyId, departments, scopeBranchId],
  );

  const departmentById = useMemo(
    () => new Map(departmentOptions.map((item) => [item.id, item])),
    [departmentOptions],
  );

  const baselineById = useMemo(
    () => new Map(baseline.map((employee) => [employee.id, employee])),
    [baseline],
  );

  const changed = useMemo(
    () =>
      draft.filter((employee) => {
        const original = baselineById.get(employee.id);
        return original ? hasChanged(original, employee) : false;
      }),
    [baselineById, draft],
  );

  const changedIds = useMemo(
    () => new Set(changed.map((employee) => employee.id)),
    [changed],
  );

  const stats = useMemo(() => {
    const inDepartment = draft.filter((employee) => employee.departmentId);
    return {
      total: draft.length,
      inDepartment: inDepartment.length,
      noDepartment: draft.length - inDepartment.length,
      noSupervisor: inDepartment.filter((employee) => !employee.supervisorId)
        .length,
    };
  }, [draft]);

  const keyword = normalize(q);

  const matches = useMemo(() => {
    if (!keyword) return null;

    return new Set(
      draft
        .filter((employee) =>
          normalize(
            [nameOf(employee), employee.employeeCode, positionOf(employee)]
              .filter(Boolean)
              .join(" "),
          ).includes(keyword),
        )
        .map((employee) => employee.id),
    );
  }, [draft, keyword]);

  /** กองพักฝั่งซ้าย — คนที่ยังไม่ระบุแผนก แยกหัวข้อย่อยตามสาขา */
  const pool = useMemo(() => {
    const waiting = draft.filter((employee) => !employee.departmentId);

    const groups = branchOptions
      .map((branch) => ({
        key: branch.id,
        title: branch.nameTh,
        people: waiting
          .filter((employee) => employee.branchId === branch.id)
          .sort(compareBySeniority),
      }))
      .filter((group) => group.people.length > 0);

    const withoutBranch = waiting
      .filter((employee) => !employee.branchId)
      .sort(compareBySeniority);

    if (withoutBranch.length > 0) {
      groups.push({
        key: NO_BRANCH,
        title: "ยังไม่ระบุสาขา",
        people: withoutBranch,
      });
    }

    return { total: waiting.length, groups };
  }, [branchOptions, draft]);

  /**
   * กระดานฝั่งขวา — หนึ่งกระดานต่อหนึ่งสาขา ข้างในเป็นกล่องของแต่ละแผนก
   * สาขาที่ไม่มีทั้งคนและแผนกของตัวเองจะไม่ถูกวาด กระดานจะได้ไม่รกด้วยสาขาว่าง
   */
  const boards = useMemo(
    () =>
      branchOptions
        .filter((branch) => !branchFocus || branch.id === branchFocus)
        .map((branch) => {
          const people = draft.filter(
            (employee) => employee.branchId === branch.id,
          );

          const boxes = departmentOptions
            // แผนกที่ผูกกับสาขาอื่นไม่ควรโผล่ในกระดานนี้
            .filter(
              (department) =>
                !department.branchId || department.branchId === branch.id,
            )
            .map((department) => ({
              department,
              members: people
                .filter((employee) => employee.departmentId === department.id)
                .sort(compareBySeniority),
            }))
            /* บริหารมาก่อนเสมอ ที่เหลือเรียงจากแผนกที่คนเยอะไปหาน้อย */
            .sort((a, b) => {
              const pinned =
                Number(isExecutiveDepartment(b.department)) -
                Number(isExecutiveDepartment(a.department));
              if (pinned !== 0) return pinned;

              if (a.members.length !== b.members.length) {
                return b.members.length - a.members.length;
              }

              return a.department.nameTh.localeCompare(
                b.department.nameTh,
                "th",
              );
            });

          return {
            key: branch.id,
            branchId: branch.id,
            title: branch.nameTh,
            code: branch.code,
            people,
            boxes,
            inDepartment: people.filter((employee) => employee.departmentId)
              .length,
            waiting: people.filter((employee) => !employee.departmentId).length,
            noSupervisor: people.filter(
              (employee) => employee.departmentId && !employee.supervisorId,
            ).length,
          };
        }),
    [branchFocus, branchOptions, departmentOptions, draft],
  );

  /**
   * รายชื่อในกล่อง "+ เพิ่มคนเข้าแผนก"
   *
   * เอาเฉพาะ "คนในสาขาของกระดานนั้น ที่ยังไม่ระบุแผนก" เท่านั้น
   * ปุ่ม + มีไว้เก็บคนที่ตกค้างเข้าแผนกให้ครบ ไม่ใช่ไว้ดึงคนข้ามแผนก/ข้ามสาขา
   * (ย้ายคนที่มีแผนกอยู่แล้วให้ใช้ลากวางหรือแตะการ์ด — เห็นต้นทางปลายทางชัดกว่า)
   */
  const pickerCandidates = useMemo(() => {
    if (!picker) return [];

    const keyword = normalize(pickerQuery);

    return draft
      .filter(
        (employee) =>
          !employee.departmentId &&
          (employee.branchId ?? null) === picker.branchId,
      )
      .filter((employee) => {
        if (!keyword) return true;
        return normalize(
          [nameOf(employee), employee.employeeCode, positionOf(employee)]
            .filter(Boolean)
            .join(" "),
        ).includes(keyword);
      })
      .sort(compareBySeniority);
  }, [draft, picker, pickerQuery]);

  /* ---------------------------------------------------------------- */
  /* guards                                                            */
  /* ---------------------------------------------------------------- */

  /* ปิดแท็บทั้งที่ยังไม่บันทึก = งานหายทั้งกระดาน จึงต้องถามก่อน */
  useEffect(() => {
    if (changed.length === 0) return;

    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [changed.length]);

  function leave() {
    if (changed.length === 0) {
      router.push("/organization?tab=structure");
      return;
    }

    setDialog({
      title: "ออกโดยไม่บันทึก",
      description:
        "สิ่งที่จัดไว้ในหน้านี้ยังไม่ได้บันทึกลงระบบ ออกไปแล้วจะหายทั้งหมด",
      details: [
        {
          label: "รายการที่ยังไม่บันทึก",
          value: `${count(changed.length)} รายการ`,
        },
      ],
      confirmLabel: "ออกโดยไม่บันทึก",
      cancelLabel: "อยู่หน้านี้ต่อ",
      tone: "orange",
      onConfirm: () => {
        router.push("/organization?tab=structure");
      },
    });
  }

  /* ---------------------------------------------------------------- */
  /* actions                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * ย้ายคนเข้ากล่อง — กล่องบอกทั้งแผนกและสาขา จึงตั้งให้ทั้งสองค่าพร้อมกัน
   * `targetBranchId = undefined` แปลว่าคงสาขาเดิมไว้ (ใช้ตอนโยนกลับกองพักซ้าย)
   *
   * ลูกทีมของคนที่ถูกย้ายต้องถูกล้างหัวหน้าด้วย ไม่งั้นสายบังคับบัญชาจะค้าง
   * ชี้ไปหาคนที่ไม่ได้อยู่หน่วยเดียวกันแล้ว
   */
  function moveTo(
    employeeIds: string[],
    targetDepartmentId: string | null,
    targetBranchId?: string | null,
  ) {
    if (employeeIds.length === 0) return;

    const ids = new Set(employeeIds);
    const department = targetDepartmentId
      ? departmentById.get(targetDepartmentId)
      : null;

    setDraft((current) =>
      current.map((employee) => {
        if (!ids.has(employee.id)) {
          return employee.supervisorId && ids.has(employee.supervisorId)
            ? { ...employee, supervisorId: null }
            : employee;
        }

        const nextBranchId =
          targetBranchId === undefined
            ? (employee.branchId ?? null)
            : targetBranchId;

        if (!department) {
          return {
            ...employee,
            branchId: nextBranchId,
            departmentId: null,
            divisionId: null,
            supervisorId: null,
          };
        }

        return {
          ...employee,
          companyId: department.companyId ?? employee.companyId,
          branchId: department.branchId ?? nextBranchId,
          departmentId: department.id,
          divisionId: null,
          supervisorId: null,
        };
      }),
    );

    setPicked(new Set());
  }

  /**
   * เลื่อนคนขึ้น/ลงหนึ่งขั้นในกล่องเดียวกัน
   *
   * เขียนเลขลำดับใหม่ให้ทุกคนในกล่องเป็น 10, 20, 30 … ไม่ใช่สลับแค่คู่ที่ขยับ
   * เพราะกล่องที่ยังไม่เคยจัดมือจะมี sortOrder = 0 กันหมด สลับคู่เดียวแล้ว
   * ลำดับที่เหลือจะยังไม่นิ่ง ต้องตรึงทั้งกล่องไว้ทีเดียวจบ
   */
  function moveWithinBox(
    members: StructureEmployee[],
    employeeId: string,
    direction: -1 | 1,
  ) {
    const index = members.findIndex((item) => item.id === employeeId);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= members.length) return;

    const ordered = [...members];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];

    const rankById = new Map(
      ordered.map((item, position) => [item.id, (position + 1) * 10]),
    );

    setDraft((current) =>
      current.map((employee) => {
        const nextRank = rankById.get(employee.id);
        return nextRank === undefined
          ? employee
          : { ...employee, sortOrder: nextRank };
      }),
    );
  }

  function setSupervisor(employeeIds: string[], supervisorId: string | null) {
    const ids = new Set(employeeIds);

    setDraft((current) =>
      current.map((employee) =>
        ids.has(employee.id)
          ? { ...employee, supervisorId: supervisorId || null }
          : employee,
      ),
    );
  }

  function togglePicked(employeeId: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  }

  /** ลากการ์ดที่หยิบไว้ = ลากทั้งกอง ลากการ์ดที่ไม่ได้หยิบ = ลากคนเดียว */
  function startDrag(employeeId: string) {
    setDragIds(picked.has(employeeId) ? [...picked] : [employeeId]);
  }

  function dropInto(
    targetDepartmentId: string | null,
    targetBranchId?: string | null,
  ) {
    const ids = dragIds.length > 0 ? dragIds : [...picked];
    moveTo(ids, targetDepartmentId, targetBranchId);
    setDragIds([]);
  }

  function openPicker(department: DepartmentItem, branchId: string, branchName: string) {
    setPicker({ department, branchId, branchName });
    setPickerSelected(new Set());
    setPickerQuery("");
  }

  function togglePickerRow(employeeId: string) {
    setPickerSelected((current) => {
      const next = new Set(current);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  }

  function confirmPicker() {
    if (!picker || pickerSelected.size === 0) return;

    moveTo([...pickerSelected], picker.department.id, picker.branchId);
    toast.success(
      `เพิ่ม ${count(pickerSelected.size)} คนเข้า ${picker.department.nameTh} แล้ว`,
    );
    setPicker(null);
  }

  function toggleBoard(key: string) {
    setOpenBoards((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function openBoard(key: string) {
    setOpenBoards((current) =>
      current.has(key) ? current : new Set(current).add(key),
    );
  }

  function resetDraft() {
    if (changed.length === 0) return;

    setDialog({
      title: "คืนค่าเดิมทั้งหมด",
      description:
        "ผังจะกลับไปเป็นแบบก่อนเริ่มแก้ในหน้านี้ ของที่บันทึกลงระบบไปแล้วไม่ถูกแตะต้อง",
      details: [
        {
          label: "รายการที่จะถูกล้าง",
          value: `${count(changed.length)} รายการ`,
        },
      ],
      confirmLabel: "คืนค่าเดิม",
      tone: "orange",
      onConfirm: () => {
        setDraft(baseline.map((employee) => ({ ...employee })));
        setPicked(new Set());
        toast.info("คืนค่าเดิมแล้ว");
      },
    });
  }

  async function save() {
    if (changed.length === 0) {
      toast.info("ยังไม่มีการเปลี่ยนแปลง");
      return;
    }

    try {
      setSaving(true);
      setSavedCount(0);

      for (const employee of changed) {
        await apiFetch(`/employees/${employee.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            companyId: employee.companyId ?? null,
            branchId: employee.branchId ?? null,
            departmentId: employee.departmentId ?? null,
            divisionId: employee.divisionId ?? null,
            supervisorId: employee.supervisorId ?? null,
            sortOrder: employee.sortOrder ?? 0,
          }),
        });

        setSavedCount((current) => current + 1);
      }

      toast.success(`บันทึกผังองค์กรแล้ว ${count(changed.length)} รายการ`);

      /*
       * อยู่หน้าเดิมต่อ — จัดผังทั้งองค์กรต้องบันทึกหลายรอบ ถ้าเด้งออกทุกครั้ง
       * ต้องกดเข้ามาใหม่แล้วกางกระดานสาขาเดิมซ้ำทุกที
       *
       * ตั้งค่าอ้างอิงใหม่ให้เท่ากับสิ่งที่เพิ่งบันทึก แถบ "ยังไม่บันทึก" จะหายไปเอง
       * และของที่แก้ต่อจากนี้จะนับเป็นชุดใหม่
       */
      setBaseline(draft.map((employee) => ({ ...employee })));
      setPicked(new Set());
    } catch (error) {
      showApiError(error, "บันทึกผังองค์กรไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /* render                                                            */
  /* ---------------------------------------------------------------- */

  const holding = picked.size > 0 || dragIds.length > 0;
  const companyText = company
    ? `${company.code} · ${company.nameTh}`
    : "ทุกบริษัทในสิทธิ์";

  /** การ์ดในกองบนสุด — วางเป็นตาราง ไม่ใช่รายการยาว เพราะกินเต็มความกว้าง */
  function renderPoolCards(people: StructureEmployee[]) {
    const shown = matches
      ? people.filter((employee) => matches.has(employee.id))
      : people;

    if (shown.length === 0) {
      return (
        <p className="col-span-full py-1 text-[12px] text-slate-400">
          ไม่มีใครในกลุ่มนี้ตรงคำค้น
        </p>
      );
    }

    return shown.map((employee) => (
      <div
        key={employee.id}
        className="rounded-lg border border-brand-100 bg-white px-2 py-1.5"
      >
        <PersonCard
          employee={employee}
          branchCode={
            employee.branchId
              ? (branchById.get(employee.branchId)?.code ?? null)
              : null
          }
          changed={changedIds.has(employee.id)}
          picked={picked.has(employee.id)}
          onToggle={() => togglePicked(employee.id)}
          onDragStart={() => startDrag(employee.id)}
          onDragEnd={() => setDragIds([])}
        />
      </div>
    ));
  }

  /**
   * รายชื่อคนที่ตั้งเป็นหัวหน้าได้ — แบ่งเป็น 3 กลุ่มในดรอปดาวน์เดียว
   *
   * เดิมจำกัดไว้แค่คนในกล่องเดียวกัน (แผนก+สาขาเดียวกัน) ซึ่งใช้จริงไม่ได้
   * เพราะผู้บริหารอยู่สำนักงานใหญ่แต่คุมคนทั้งเครือ และแต่ละสาขาในที่นี้
   * เป็นคนละนิติบุคคล การรายงานข้ามสาขาจึงเป็นเรื่องปกติ
   *
   * คนที่พ้นสภาพแล้วไม่ขึ้นในรายการ — ตั้งคนลาออกเป็นหัวหน้าไม่ได้อยู่แล้ว
   * และช่วยตัดรายชื่อลงครึ่งหนึ่งไม่ให้ดรอปดาวน์ยาวเกินจำเป็น
   */
  function supervisorGroups(
    branchId: string | null | undefined,
    departmentId: string | null | undefined,
    excludeIds: Set<string>,
  ) {
    const sameBox: StructureEmployee[] = [];
    const sameBranch: StructureEmployee[] = [];
    const crossBranch: StructureEmployee[] = [];

    for (const candidate of draft) {
      if (excludeIds.has(candidate.id)) continue;
      if (FORMER_STATUSES.has(candidate.status ?? "")) continue;

      const inSameBranch = (candidate.branchId ?? null) === (branchId ?? null);
      const inSameDepartment =
        (candidate.departmentId ?? null) === (departmentId ?? null);

      if (inSameBranch && inSameDepartment) sameBox.push(candidate);
      else if (inSameBranch) sameBranch.push(candidate);
      else crossBranch.push(candidate);
    }

    return [
      { key: "box", label: "แผนกเดียวกัน", items: sameBox },
      { key: "branch", label: "สาขาเดียวกัน · แผนกอื่น", items: sameBranch },
      { key: "cross", label: "ข้ามสาขา", items: crossBranch },
    ]
      .map((group) => ({ ...group, items: group.items.sort(compareBySeniority) }))
      .filter((group) => group.items.length > 0);
  }

  /** ป้ายในดรอปดาวน์ — ข้ามสาขาต้องบอกสังกัดให้ครบ ไม่งั้นชื่อซ้ำกันแยกไม่ออก */
  function supervisorLabel(candidate: StructureEmployee, withScope: boolean) {
    if (!withScope) return nameOf(candidate);

    const department = candidate.departmentId
      ? departmentById.get(candidate.departmentId)?.nameTh
      : null;
    const branch = candidate.branchId
      ? branchById.get(candidate.branchId)?.code
      : null;

    const scope = [department ?? "ยังไม่ระบุแผนก", branch]
      .filter(Boolean)
      .join(" · ");

    return `${nameOf(candidate)} — ${scope}`;
  }

  /** รายชื่อการ์ดในกล่องหนึ่ง ๆ — `boxMembers` = คนในกล่องเดียวกัน (ใช้เลือกหัวหน้า) */
  function renderCards(
    people: StructureEmployee[],
    emptyText: string,
    boxMembers: StructureEmployee[] | null,
  ) {
    const shown = matches
      ? people.filter((employee) => matches.has(employee.id))
      : people;

    if (people.length === 0) {
      return (
        <p className="px-3 py-6 text-center text-[12px] text-slate-400">
          {emptyText}
        </p>
      );
    }

    if (shown.length === 0) {
      return (
        <p className="px-3 py-6 text-center text-[12px] text-slate-400">
          ไม่มีใครในกล่องนี้ตรงคำค้น
        </p>
      );
    }

    return shown.map((employee) => {
      const groups = boxMembers
        ? supervisorGroups(
            employee.branchId,
            employee.departmentId,
            new Set([employee.id]),
          )
        : [];

      const orderIndex = boxMembers
        ? boxMembers.findIndex((item) => item.id === employee.id)
        : -1;
      const canReorder = Boolean(boxMembers && boxMembers.length > 1);

      return (
        <div key={employee.id} className="px-3 py-2.5">
          <div className="flex items-start gap-1">
            <div className="min-w-0 flex-1">
              <PersonCard
                employee={employee}
                branchCode={
                  employee.branchId
                    ? (branchById.get(employee.branchId)?.code ?? null)
                    : null
                }
                changed={changedIds.has(employee.id)}
                picked={picked.has(employee.id)}
                onToggle={() => togglePicked(employee.id)}
                onDragStart={() => startDrag(employee.id)}
                onDragEnd={() => setDragIds([])}
              />
            </div>

            {/* เลื่อนลำดับในกล่อง — ต้องกันคลิกทะลุไปโดนการ์ดและกล่อง */}
            {canReorder && boxMembers ? (
              <div className="flex shrink-0 flex-col">
                <ReorderButton
                  label={`เลื่อน ${nameOf(employee)} ขึ้น`}
                  disabled={orderIndex <= 0}
                  onClick={() => moveWithinBox(boxMembers, employee.id, -1)}
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </ReorderButton>
                <ReorderButton
                  label={`เลื่อน ${nameOf(employee)} ลง`}
                  disabled={orderIndex === boxMembers.length - 1}
                  onClick={() => moveWithinBox(boxMembers, employee.id, 1)}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </ReorderButton>
              </div>
            ) : null}
          </div>

          {boxMembers ? (
            groups.length === 0 ? (
              <p className="mt-1.5 text-[11px] text-slate-300">
                ยังไม่มีใครในระบบให้ตั้งเป็นหัวหน้า
              </p>
            ) : (
              <div className="mt-2">
                <SupervisorPicker
                  value={employee.supervisorId ?? ""}
                  placeholder="— ยังไม่ระบุหัวหน้า —"
                  ariaLabel={`หัวหน้าของ ${nameOf(employee)}`}
                  onChange={(id) => setSupervisor([employee.id], id || null)}
                  groups={groups.map((group) => ({
                    key: group.key,
                    label: group.label,
                    items: group.items.map((item) => ({
                      id: item.id,
                      label: supervisorLabel(item, group.key !== "box"),
                    })),
                  }))}
                />
              </div>
            )
          ) : null}
        </div>
      );
    });
  }

  return (
    <PageSurface>
      <PageHeading
        heroMotif="organization"
        eyebrow="Organization"
        title="จัดผัง"
        titleAccent="องค์กร"
        description="แถวบนคือคนที่ยังไม่ระบุแผนก ใต้ลงมาคือกระดานของแต่ละสาขา กดหัวกระดานเพื่อกางออก แล้วลากการ์ด แตะการ์ดตามด้วยกล่องปลายทาง หรือกดปุ่ม + ที่หัวกล่องแผนกเพื่อเลือกคนเข้าแผนก"
        chips={
          <>
            <PageChip tone="brand" icon={<Building2 className="h-3 w-3" />}>
              {companyText}
            </PageChip>
            {scopeBranchId ? (
              <PageChip icon={<MapPin className="h-3 w-3" />}>
                เฉพาะสาขา{" "}
                {branchById.get(scopeBranchId)?.nameTh ?? scopeBranchId}
              </PageChip>
            ) : null}
            {scopeDepartmentId ? <PageChip>กรองเฉพาะ 1 แผนก</PageChip> : null}
          </>
        }
        actions={
          <>
            <div className="flex justify-end">
              <ButtonLink
                href="/organization?tab=structure"
                icon={<ArrowLeft className="h-4 w-4" />}
              >
                กลับไปหน้าผังองค์กร
              </ButtonLink>
            </div>

            <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-4 sm:divide-y-0">
              <StatTile
                icon={<UsersRound className="h-4 w-4" />}
                label="พนักงานที่กำลังจัด"
                value={count(stats.total)}
                helper="ตามตัวกรองที่กดเข้ามา"
              />
              <StatTile
                icon={<CircleCheckBig className="h-4 w-4" />}
                label="เข้าแผนกแล้ว"
                value={count(stats.inDepartment)}
                helper={`ยังไม่ระบุแผนก ${count(stats.noDepartment)} คน`}
              />
              <StatTile
                icon={<UserRoundCog className="h-4 w-4" />}
                label="ยังไม่ระบุหัวหน้า"
                value={count(stats.noSupervisor)}
                helper="เฉพาะคนที่อยู่ในแผนกแล้ว"
              />
              <StatTile
                icon={<Undo2 className="h-4 w-4" />}
                label="รอบันทึก"
                value={count(changed.length)}
                helper="รายการที่แก้ไว้ในหน้านี้"
              />
            </div>
          </>
        }
      />

      <Toolbar className="items-end gap-3">
        <Field label="ค้นหาพนักงาน" className="w-full sm:w-60">
          <SearchInput
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="ชื่อ รหัส หรือตำแหน่ง"
            aria-label="ค้นหาพนักงานในกระดาน"
          />
        </Field>

        {branchOptions.length > 1 ? (
          <Field label="สาขาที่กำลังจัด" className="w-full sm:w-52">
            <Select
              value={branchFocus}
              onChange={(event) => setBranchFocus(event.target.value)}
            >
              <option value="">ทุกสาขา ({count(draft.length)} คน)</option>
              {branchOptions.map((branch) => {
                const inBranch = draft.filter(
                  (employee) => employee.branchId === branch.id,
                ).length;

                return (
                  <option key={branch.id} value={branch.id}>
                    {branch.nameTh} ({count(inBranch)} คน)
                  </option>
                );
              })}
            </Select>
          </Field>
        ) : null}

        <label className="flex h-9 shrink-0 cursor-pointer items-center gap-2 text-[13px] text-slate-600 3xl:h-10">
          <input
            type="checkbox"
            checked={hideEmptyBoxes}
            onChange={(event) => setHideEmptyBoxes(event.target.checked)}
            className={cn(
              "h-4 w-4 cursor-pointer rounded border-slate-300 accent-brand-600",
              FOCUS_RING,
            )}
          />
          ซ่อนแผนกที่ยังไม่มีคน
        </label>

        <div className="flex items-center gap-1.5 self-end">
          <Button
            size="sm"
            onClick={() =>
              setOpenBoards(new Set(boards.map((board) => board.key)))
            }
          >
            กางทุกสาขา
          </Button>
          <Button size="sm" onClick={() => setOpenBoards(new Set())}>
            พับทั้งหมด
          </Button>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            icon={<Undo2 className="h-3.5 w-3.5" />}
            onClick={resetDraft}
            disabled={changed.length === 0 || saving}
          >
            คืนค่าเดิม
          </Button>
          <Button onClick={leave} disabled={saving}>
            ยกเลิก
          </Button>
          <Button
            variant="primary"
            onClick={() => void save()}
            loading={saving}
            disabled={changed.length === 0}
            icon={<Save className="h-3.5 w-3.5" />}
          >
            {saving
              ? `กำลังบันทึก ${count(savedCount)}/${count(changed.length)}`
              : "บันทึกผัง"}
          </Button>
        </div>
      </Toolbar>

      {/* แถบ "ถืออยู่ในมือ" — บอกว่าหยิบใครไว้บ้างและต้องทำอะไรต่อ */}
      {picked.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-brand-200 bg-brand-50 px-5 py-2.5 sm:px-6 3xl:px-7">
          <MousePointerClick className="h-4 w-4 shrink-0 text-brand-600" />
          <p className="min-w-0 flex-1 text-[13px] text-brand-900">
            หยิบไว้ <b>{count(picked.size)} คน</b> —
            แตะกล่องแผนกปลายทางเพื่อย้าย หรือแตะกองด้านบนเพื่อเอาออกจากแผนก
          </p>
          <Button
            icon={<X className="h-3.5 w-3.5" />}
            onClick={() => setPicked(new Set())}
          >
            ล้างการเลือก
          </Button>
        </div>
      ) : null}

      {loading ? (
        <p className="px-5 py-16 text-center text-sm text-slate-500 sm:px-6">
          กำลังโหลดพนักงานและแผนก…
        </p>
      ) : (
        <div className="space-y-4 px-5 py-5 sm:px-6 3xl:px-7">
          {/* ---------- กองคนที่ยังไม่ระบุแผนก — เต็มความกว้าง อยู่บนสุด ---------- */}
          <DropSurface
            active={holding}
            onDrop={() => dropInto(null)}
            className="rounded-xl border border-dashed border-brand-300 bg-brand-50/40"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-200 bg-brand-50 px-4 py-2.5">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">
                  <Inbox className="h-3.5 w-3.5" />
                  ยังไม่ระบุแผนก
                </p>
                <p className="mt-0.5 text-[11.5px] leading-5 text-brand-900/60">
                  {holding
                    ? "วางที่นี่เพื่อเอาออกจากแผนก (สาขาเดิมคงไว้)"
                    : "ลากการ์ดลงไปวางในกล่องแผนกด้านล่าง หรือกดปุ่ม + ที่หัวกล่องแผนกเพื่อเลือกคนเข้าแผนก"}
                </p>
              </div>
              <span className="shrink-0 rounded bg-brand-600 px-2 py-0.5 text-[11px] font-bold tabular-nums text-white">
                {count(pool.total)} คน
              </span>
            </div>

            {pool.total === 0 ? (
              <p className="px-3 py-8 text-center text-[12px] text-slate-400">
                จัดเข้าแผนกครบทุกคนแล้ว
              </p>
            ) : (
              <div className="space-y-3 p-3">
                {pool.groups.map((group) => (
                  <div key={group.key}>
                    {/* หัวข้อย่อยรายสาขา — กองเดียวแต่ดูออกว่าใครอยู่สาขาไหน */}
                    <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-brand-500">
                      {group.title} · {count(group.people.length)}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      {renderPoolCards(group.people)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DropSurface>

          {/* ---------- กระดานรายสาขา ---------- */}
          <div className="min-w-0 space-y-3">
            {boards.length === 0 ? (
              <p className="rounded-xl border border-slate-200 py-16 text-center text-sm text-slate-500">
                ยังไม่มีสาขาตามตัวกรองปัจจุบัน
              </p>
            ) : (
              boards.map((board) => {
                const open = openBoards.has(board.key);
                const boxes = hideEmptyBoxes
                  ? board.boxes.filter((box) => box.members.length > 0)
                  : board.boxes;

                return (
                  <section
                    key={board.key}
                    className="overflow-hidden rounded-xl border border-brand-200"
                  >
                    {/* หัวกระดาน — สรุปครบตั้งแต่ยังพับ ลากมาจ่อแล้วกางให้เอง */}
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => toggleBoard(board.key)}
                      onDragOver={() => openBoard(board.key)}
                      className={cn(
                        "flex w-full items-center gap-2.5 bg-brand-50 px-4 py-3 text-left transition hover:bg-brand-100/70",
                        FOCUS_RING,
                        open && "border-b border-brand-200",
                      )}
                    >
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 shrink-0 text-brand-500 transition-transform",
                          open && "rotate-90",
                        )}
                      />
                      <MapPin className="h-4 w-4 shrink-0 text-brand-500" />

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-bold text-brand-900 3xl:text-[14.5px]">
                          {board.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[11.5px] text-brand-900/60">
                          {count(board.boxes.length)} แผนกในสาขานี้
                        </span>
                      </span>

                      <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                        <span className="rounded bg-white px-1.5 py-0.5 text-[10.5px] font-bold text-brand-700">
                          {count(board.people.length)} คน
                        </span>
                        {board.waiting > 0 ? (
                          <span className="rounded bg-white px-1.5 py-0.5 text-[10.5px] font-bold text-slate-500">
                            รอจัด {count(board.waiting)}
                          </span>
                        ) : null}
                        {board.noSupervisor > 0 ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-800">
                            ยังไม่มีหัวหน้า {count(board.noSupervisor)}
                          </span>
                        ) : null}
                      </span>
                    </button>

                    {open ? (
                      <div className="grid items-start gap-3 bg-brand-50/30 p-3 sm:grid-cols-2 2xl:grid-cols-3">
                        {boxes.length === 0 ? (
                          <p className="col-span-full py-6 text-center text-[13px] text-slate-400">
                            ยังไม่มีแผนกที่ใช้กับสาขานี้ได้ — สร้างแผนกก่อนที่แท็บ
                            &quot;แผนก&quot;
                          </p>
                        ) : (
                          boxes.map(({ department, members }) => (
                            <DropSurface
                              key={`${board.key}:${department.id}`}
                              active={holding}
                              onDrop={() =>
                                dropInto(department.id, board.branchId)
                              }
                              className="h-fit rounded-lg border border-brand-100 bg-white"
                            >
                              <div className="flex items-start justify-between gap-2 border-b border-brand-100 bg-brand-50/70 px-3 py-2.5">
                                <div className="min-w-0">
                                  <p className="truncate text-[13px] font-semibold text-slate-800 3xl:text-[14px]">
                                    {department.nameTh}
                                  </p>
                                  <p className="mt-0.5 truncate text-[11px] text-brand-900/50 3xl:text-[12px]">
                                    {holding
                                      ? "วางที่นี่"
                                      : department.branchId
                                        ? "แผนกเฉพาะสาขานี้"
                                        : "แผนกระดับบริษัท"}
                                  </p>
                                </div>

                                <span className="flex shrink-0 items-center gap-1.5">
                                  <span
                                    className={cn(
                                      "rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
                                      members.length > 0
                                        ? "bg-brand-100 text-brand-700"
                                        : "bg-slate-100 text-slate-400",
                                    )}
                                  >
                                    {members.length}
                                  </span>

                                  {/* เลือกคนเข้าแผนกโดยไม่ต้องลาก — ต้องกันคลิกทะลุไปโดนกล่อง */}
                                  <button
                                    type="button"
                                    disabled={board.waiting === 0}
                                    title={
                                      board.waiting === 0
                                        ? "คนในสาขานี้ถูกจัดเข้าแผนกครบแล้ว"
                                        : `เพิ่มคนเข้า ${department.nameTh} (เลือกได้ ${count(board.waiting)} คน)`
                                    }
                                    aria-label={`เพิ่มคนเข้า ${department.nameTh}`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openPicker(
                                        department,
                                        board.branchId,
                                        board.title,
                                      );
                                    }}
                                    className={cn(
                                      "flex h-6 w-6 items-center justify-center rounded-md border border-brand-200 bg-white text-brand-600 transition hover:bg-brand-600 hover:text-white disabled:pointer-events-none disabled:border-slate-200 disabled:text-slate-300",
                                      FOCUS_RING,
                                    )}
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                </span>
                              </div>

                              <div className="divide-y divide-slate-100">
                                {renderCards(
                                  members,
                                  holding
                                    ? "วางคนแรกของแผนกนี้ที่นี่"
                                    : "ยังไม่มีใครในแผนกนี้",
                                  members,
                                )}
                              </div>

                              {members.length > 0 ? (
                                <div className="border-t border-brand-100 bg-brand-50/70 px-3 py-2.5">
                                  <SupervisorPicker
                                    value=""
                                    placeholder="ตั้งหัวหน้าให้ทุกคนในกล่องนี้…"
                                    ariaLabel={`ตั้งหัวหน้าให้ทุกคนใน ${department.nameTh}`}
                                    onChange={(supervisorId) => {
                                      if (!supervisorId) return;

                                      setSupervisor(
                                        members
                                          .filter(
                                            (item) => item.id !== supervisorId,
                                          )
                                          .map((item) => item.id),
                                        supervisorId,
                                      );
                                      toast.success(
                                        `ตั้งหัวหน้าให้ทั้ง ${department.nameTh} แล้ว`,
                                      );
                                    }}
                                    groups={supervisorGroups(
                                      board.branchId,
                                      department.id,
                                      new Set(),
                                    ).map((group) => ({
                                      key: group.key,
                                      label: group.label,
                                      items: group.items.map((item) => ({
                                        id: item.id,
                                        label: supervisorLabel(
                                          item,
                                          group.key !== "box",
                                        ),
                                      })),
                                    }))}
                                  />
                                </div>
                              ) : null}
                            </DropSurface>
                          ))
                        )}
                      </div>
                    ) : null}
                  </section>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* เว้นที่ท้ายหน้าไว้ให้แถบลอย ไม่งั้นมันจะบังกล่องสุดท้าย */}
      {changed.length > 0 ? <div className="h-16" /> : null}

      {/* แถบบันทึกลอย — กระดานยาวกว่าหนึ่งจอ ปุ่มบันทึกด้านบนจึงเลื่อนหายไป */}
      {changed.length > 0 ? (
        <div className="fixed bottom-5 left-1/2 z-30 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-white px-4 py-3 shadow-lg">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <TriangleAlert className="h-4 w-4" />
            </span>
            <p className="min-w-0 flex-1 text-[13px] font-medium text-slate-700">
              แก้ไว้ {count(changed.length)} รายการ ยังไม่ได้บันทึก
            </p>
            <Button onClick={resetDraft} disabled={saving}>
              คืนค่าเดิม
            </Button>
            <Button
              variant="primary"
              onClick={() => void save()}
              loading={saving}
              icon={<Save className="h-3.5 w-3.5" />}
            >
              {saving
                ? `${count(savedCount)}/${count(changed.length)}`
                : "บันทึกผัง"}
            </Button>
          </div>
        </div>
      ) : null}

      <ActionDialog state={dialog} onClose={() => setDialog(null)} />

      {/* กล่องเลือกคนเข้าแผนก — เปิดจากปุ่ม + ที่หัวกล่องแผนก */}
      <Modal
        open={picker !== null}
        size="md"
        title={
          picker ? `เพิ่มคนเข้า ${picker.department.nameTh}` : "เพิ่มคนเข้าแผนก"
        }
        description={
          picker
            ? `${picker.branchName} — แสดงเฉพาะคนในสาขานี้ที่ยังไม่ระบุแผนก ติ๊กเลือกได้หลายคน`
            : undefined
        }
        onClose={() => setPicker(null)}
        footer={
          <>
            <span className="mr-auto self-center text-[12.5px] text-slate-500">
              เลือกไว้ {count(pickerSelected.size)} คน
            </span>
            <Button onClick={() => setPicker(null)}>ยกเลิก</Button>
            <Button
              variant="primary"
              onClick={confirmPicker}
              disabled={pickerSelected.size === 0}
              icon={<Plus className="h-3.5 w-3.5" />}
            >
              เพิ่ม {count(pickerSelected.size)} คน
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <SearchInput
            value={pickerQuery}
            onChange={(event) => setPickerQuery(event.target.value)}
            placeholder="ค้นหาชื่อ รหัส หรือตำแหน่ง"
            aria-label="ค้นหาคนที่จะเพิ่มเข้าแผนก"
          />

          {pickerCandidates.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-slate-400">
              {pickerQuery
                ? "ไม่พบคนที่ตรงกับคำค้นนี้"
                : "คนในสาขานี้ถูกจัดเข้าแผนกครบแล้ว"}
            </p>
          ) : (
            <div className="max-h-[24rem] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {pickerCandidates.map((employee) => {
                const branch = employee.branchId
                  ? branchById.get(employee.branchId)
                  : null;

                return (
                  <label
                    key={employee.id}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2 transition hover:bg-brand-50"
                  >
                    <input
                      type="checkbox"
                      checked={pickerSelected.has(employee.id)}
                      onChange={() => togglePickerRow(employee.id)}
                      className={cn(
                        "h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-brand-600",
                        FOCUS_RING,
                      )}
                    />

                    <Avatar
                      name={nameOf(employee)}
                      src={avatarUrlOf(employee)}
                      size="sm"
                    />

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-slate-900">
                        {nameOf(employee)}
                      </span>
                      <span className="block truncate text-[11px] text-slate-400">
                        {[employee.employeeCode, positionOf(employee)]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </span>
                      {/*
                       * สาขาต้องเห็นเป็นชื่อเต็ม ไม่ใช่รหัสย่อ — ในระบบนี้แต่ละสาขา
                       * คือคนละนิติบุคคล และมีพนักงานชื่อซ้ำกันข้ามสาขาจริง
                       */}
                      <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] font-medium text-brand-700">
                        <MapPin className="h-3 w-3 shrink-0 text-brand-400" />
                        <span className="truncate">
                          {branch?.nameTh ?? "ยังไม่ระบุสาขา"}
                        </span>
                      </span>
                    </span>

                    <span className="shrink-0 rounded bg-brand-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-brand-700">
                      ยังไม่ระบุแผนก
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </Modal>
    </PageSurface>
  );
}

/* ------------------------------------------------------------------ */
/* pieces                                                              */
/* ------------------------------------------------------------------ */

/**
 * พื้นที่รับการวาง — รับได้ทั้งการลากมาปล่อยและการแตะตอนหยิบการ์ดไว้
 * ตอนมีคนค้างอยู่ในมือ ทุกพื้นที่จะขึ้นขอบฟ้าให้เห็นว่าวางตรงไหนได้บ้าง
 */
function DropSurface({
  active,
  onDrop,
  className,
  children,
}: {
  active: boolean;
  onDrop: () => void;
  className?: string;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={(event: DragEvent) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event: DragEvent) => {
        event.preventDefault();
        setOver(false);
        onDrop();
      }}
      onClick={() => {
        if (active) onDrop();
      }}
      className={cn(
        "flex flex-col overflow-hidden transition",
        active && "cursor-pointer border-brand-400",
        over && "border-brand-500 ring-2 ring-brand-200",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * ช่องเลือกหัวหน้าแบบพิมพ์ค้นหาได้
 *
 * รายชื่อยาวเป็นร้อย เพราะตั้งหัวหน้าข้ามแผนกข้ามสาขาได้แล้ว ดรอปดาวน์ปกติ
 * ต้องเลื่อนหาเองทีละบรรทัด ตัวนี้พิมพ์ชื่อ/ตำแหน่ง/แผนก/สาขา แล้วกรองให้เลย
 */
function SupervisorPicker({
  value,
  groups,
  placeholder,
  onChange,
  ariaLabel,
}: {
  value: string;
  groups: Array<{
    key: string;
    label: string;
    items: Array<{ id: string; label: string }>;
  }>;
  placeholder: string;
  onChange: (id: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [anchor, setAnchor] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  /*
   * แผงต้องวาดนอก DOM ของกล่องแผนก (portal)
   *
   * กล่องแผนกกับพื้นที่กระดานตั้ง overflow ไว้ ถ้าวาดแผงไว้ข้างในมันจะถูกตัด
   * เหลือแค่แถวแรก — พิมพ์ได้แต่มองไม่เห็นผลลัพธ์
   */
  useEffect(() => {
    if (!open) return;

    function place() {
      const trigger = boxRef.current?.getBoundingClientRect();
      if (!trigger) return;

      const panelHeight = 320;
      const spaceBelow = window.innerHeight - trigger.bottom;
      const openUpward = spaceBelow < panelHeight && trigger.top > spaceBelow;

      setAnchor({
        left: trigger.left,
        top: openUpward ? trigger.top - panelHeight - 4 : trigger.bottom + 4,
        width: trigger.width,
      });
    }

    function onDown(event: MouseEvent) {
      const target = event.target as Node;
      if (boxRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    place();

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    // ใช้ capture เพื่อจับการเลื่อนของกล่องกระดานด้วย ไม่ใช่แค่หน้าเว็บ
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  const keyword = normalize(query);
  const filtered = groups
    .map((group) => ({
      ...group,
      items: keyword
        ? group.items.filter((item) => normalize(item.label).includes(keyword))
        : group.items,
    }))
    .filter((group) => group.items.length > 0);

  const selected = groups
    .flatMap((group) => group.items)
    .find((item) => item.id === value);

  return (
    <div
      ref={boxRef}
      className="relative"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => {
          setQuery("");
          setOpen((current) => !current);
        }}
        className={cn(
          CONTROL_BASE,
          "flex items-center justify-between gap-2 text-left",
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            selected ? "text-slate-800" : "text-slate-400",
          )}
        >
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>

      {open && anchor
        ? createPortal(
            <div
              ref={panelRef}
              style={{
                position: "fixed",
                left: anchor.left,
                top: anchor.top,
                width: anchor.width,
              }}
              onClick={(event) => event.stopPropagation()}
              className="z-[80] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 p-1.5">
            <SearchInput
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="พิมพ์ชื่อ ตำแหน่ง แผนก หรือสาขา"
              aria-label="ค้นหาหัวหน้า"
            />
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-[12.5px] text-slate-500 hover:bg-slate-50"
            >
              — ยังไม่ระบุหัวหน้า —
            </button>

            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-[12px] text-slate-400">
                ไม่พบคนที่ตรงกับคำค้น
              </p>
            ) : (
              filtered.map((group) => (
                <div key={group.key}>
                  <p className="px-3 pb-0.5 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    {group.label}
                  </p>
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onChange(item.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "block w-full truncate px-3 py-1.5 text-left text-[12.5px] hover:bg-brand-50",
                        item.id === value
                          ? "bg-brand-50 font-semibold text-brand-700"
                          : "text-slate-700",
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ))
            )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/** ปุ่มลูกศรเลื่อนลำดับในกล่อง — เล็กและจางไว้ ไม่ให้แย่งสายตาจากชื่อคน */
function ReorderButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded text-brand-500 transition hover:bg-brand-100 hover:text-brand-700 disabled:pointer-events-none disabled:text-slate-200",
        FOCUS_RING,
      )}
    >
      {children}
    </button>
  );
}

/** การ์ดพนักงาน — ลากได้ และแตะเพื่อหยิบใส่มือ (เลือกได้หลายคน) */
function PersonCard({
  employee,
  branchCode,
  changed,
  picked,
  onToggle,
  onDragStart,
  onDragEnd,
}: {
  employee: StructureEmployee;
  branchCode?: string | null;
  changed: boolean;
  picked: boolean;
  onToggle: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const name = nameOf(employee);

  return (
    <div
      draggable
      role="button"
      tabIndex={0}
      aria-pressed={picked}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        "flex cursor-grab items-center gap-2.5 rounded-lg px-1.5 py-1 transition active:cursor-grabbing",
        picked ? "bg-brand-100 ring-2 ring-brand-400" : "hover:bg-brand-50",
      )}
    >
      <Avatar name={name} src={avatarUrlOf(employee)} size="sm" />

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-900 3xl:text-[14px]">
            {name}
          </span>
          {changed ? (
            <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 3xl:text-[11px]">
              แก้ไว้
            </span>
          ) : null}
          {branchCode ? (
            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 3xl:text-[11px]">
              {branchCode}
            </span>
          ) : null}
        </span>
        <span className="block truncate text-[11px] text-slate-400 3xl:text-[12px]">
          {positionOf(employee) ?? employee.employeeCode ?? "—"}
        </span>
      </span>
    </div>
  );
}

export default function OrganizationStructureEditorPage() {
  // useSearchParams ต้องอยู่ใต้ Suspense ตอน prerender
  return (
    <Suspense fallback={null}>
      <StructureEditorWorkspace />
    </Suspense>
  );
}
