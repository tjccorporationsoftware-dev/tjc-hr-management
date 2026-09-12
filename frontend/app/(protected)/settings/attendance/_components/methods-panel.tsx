"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Fingerprint,
  Globe,
  Link2,
  Loader2,
  Navigation,
  Pencil,
  RefreshCcw,
  Save,
  Smartphone,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  apiFetch,
  createAttendanceDeviceEnrollment,
  getAttendanceDeviceEnrollments,
  getAttendanceDevices,
  getAttendanceLocations,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { scrollPagerToTop } from "@/lib/scroll-to-top";
import {
  Button,
  IconButton,
  Modal as KitModal,
  SearchInput,
} from "@/components/kit";
import { getErrorMessage, useApiMutation, useApiQuery } from "@/lib/use-api";
import { AttendanceGroupHeading } from "@/components/common/attendance-group-heading";
import {
  attendanceBranchGroupKey,
  attendanceBranchSortText,
  attendanceDepartmentGroupKey,
  attendanceDepartmentSortText,
  buildAttendanceDepartmentGroupRank,
} from "@/lib/attendance-session-group";
import type {
  AttendanceMethod,
  EmployeeListItem,
  EmployeeListResponse,
} from "@/types/employee";
import type {
  AttendanceDeviceEnrollment,
  AttendanceLocation,
} from "@/types/attendance";

/* ------------------------------------------------------------------ */
/* design tokens (ชุดเดียวกับหน้าอื่นในระบบ)                            */
/* ------------------------------------------------------------------ */

const PRIMARY_BUTTON =
  "inline-flex h-9 3xl:h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-600 px-3.5 text-[13px] 3xl:text-[13.5px] font-semibold text-white transition hover:bg-brand-700 disabled:pointer-events-none disabled:opacity-50";

const GHOST_BUTTON =
  "inline-flex h-9 3xl:h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] 3xl:text-[13.5px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-50";

/* ------------------------------------------------------------------ */
/* options                                                             */
/* ------------------------------------------------------------------ */

const METHOD_OPTIONS: {
  value: AttendanceMethod;
  label: string;
  icon: LucideIcon;
}[] = [
  { value: "WEB", label: "เว็บ", icon: Globe },
  { value: "MOBILE", label: "แอปมือถือ", icon: Smartphone },
  { value: "DEVICE", label: "เครื่องสแกน", icon: Fingerprint },
];

const METHOD_MAP = new Map(
  METHOD_OPTIONS.map((option) => [option.value, option]),
);

type EmployeeDraft = {
  allowedAttendanceMethods: AttendanceMethod[];
  attendanceGeofenceRequired: boolean;
  /** "" = ใช้จุดของสาขาอัตโนมัติ */
  attendanceLocationId: string;
};

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function employeeName(employee: EmployeeListItem) {
  return (
    employee.displayName?.trim() ||
    [employee.firstName, employee.lastName].filter(Boolean).join(" ") ||
    employee.employeeCode
  );
}

/* ------------------------------------------------------------------ */
/* page                                                                */
/* ------------------------------------------------------------------ */

/** ตัวเลขสรุปที่หน้าหลักเอาไปวางข้างหัวเรื่อง */
export type MethodsSummary = {
  total: number;
  office: number;
  field: number;
  gap: number;
};

/** จำนวนแถวต่อหน้า เท่ากับหน้าทะเบียนพนักงาน */
const PAGE_SIZE = 20;

export function AttendanceMethodsPanel({
  onSummaryChange,
}: {
  onSummaryChange?: (summary: MethodsSummary) => void;
}) {
  const queryClient = useQueryClient();

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<EmployeeListItem | null>(null);
  const [draft, setDraft] = useState<EmployeeDraft>({
    allowedAttendanceMethods: [],
    attendanceGeofenceRequired: true,
    attendanceLocationId: "",
  });

  // สามชุดนี้เดิมโหลดด้วย Promise.allSettled โดยรายชื่อพนักงานเป็นตัวบังคับ
  // ส่วนเครื่องสแกนกับสถานที่ถ้าพลาดก็ปล่อยว่าง แยกเป็นสาม query ได้พฤติกรรม
  // เดียวกันโดยไม่ต้องจัดการ settled result เอง
  /*
   * ต้องดึงให้ครบทุกหน้า ไม่ใช่หน้าเดียว
   *
   * API จำกัดหน้าละ 100 คน (เพดานของ pageSize) เดิมยิงหน้าเดียวแล้วจบ
   * บริษัทที่มีพนักงานเกินร้อยจึงหายไปเงียบ ๆ ตั้งแต่คนที่ 101 และเลข
   * "ทั้งหมด N คน" บนหัวตารางก็นับได้แค่คนที่โหลดมา ไม่ใช่คนที่มีจริง
   *
   * ไม่ส่ง status ไปด้วย เพราะค่าเริ่มต้นของ API คือ "คนที่ยังทำงานอยู่"
   * ซึ่งรวมพนักงานทดลองงานและพักงานด้วย — สองกลุ่มนี้ก็ต้องลงเวลาเหมือนกัน
   * ของเดิมกรอง status=ACTIVE จึงตกหล่นไปทั้งกลุ่ม
   */
  const employeesQuery = useApiQuery(
    queryKeys.employees.list({ scope: "attendance-methods", all: true }),
    async () => {
      const pageSize = 100;
      const first = await apiFetch<EmployeeListResponse>(
        `/employees?page=1&pageSize=${pageSize}`,
      );

      const totalPages = first.meta?.totalPages ?? 1;
      if (totalPages <= 1) return first;

      const rest = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, index) =>
          apiFetch<EmployeeListResponse>(
            `/employees?page=${index + 2}&pageSize=${pageSize}`,
          ),
        ),
      );

      return {
        ...first,
        items: [...first.items, ...rest.flatMap((page) => page.items)],
      };
    },
  );

  const devicesQuery = useApiQuery(queryKeys.attendance.devices(), () =>
    getAttendanceDevices(),
  );

  const locationsQuery = useApiQuery(queryKeys.attendance.locations(), () =>
    getAttendanceLocations(),
  );

  const employees = employeesQuery.data?.items ?? [];
  const devices = useMemo(() => devicesQuery.data ?? [], [devicesQuery.data]);
  const locations = useMemo(() => locationsQuery.data ?? [], [locationsQuery.data]);

  const loading = employeesQuery.isPending;
  const refreshing = employeesQuery.isFetching && !employeesQuery.isPending;
  const error = employeesQuery.isError
    ? getErrorMessage(employeesQuery.error, "ไม่สามารถโหลดรายชื่อพนักงานได้")
    : null;

  const loadData = useCallback(
    async (notify = false) => {
      /*
       * ถูกเรียกจาก onClick ด้วย void — ถ้าโยน error ออกไปจะกลายเป็น
       * unhandled rejection ที่ไม่มีอะไรแสดงให้ผู้ใช้เห็น
       * เขาจะเห็นแค่ว่ากดรีเฟรชแล้วข้อมูลไม่เปลี่ยน โดยไม่รู้ว่าล้มเหลว
       */
      try {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.employees.all }),
          queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all }),
        ]);
        if (notify) toast.success("รีเฟรชข้อมูลเรียบร้อยแล้ว");
      } catch (error) {
        toast.error(getErrorMessage(error, "รีเฟรชข้อมูลไม่สำเร็จ"));
      }
    },
    [queryClient],
  );

  const keyword = q.trim().toLowerCase();

  const filtered = useMemo(() => {
    const matched = keyword
      ? employees.filter((employee) =>
          [
            employee.employeeCode,
            employee.firstName,
            employee.lastName,
            employee.displayName,
            employee.branch?.nameTh,
            employee.department?.nameTh,
            employee.employeeType?.nameTh,
          ]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(keyword)),
        )
      : employees;

    /* เรียงเป็นสาขา → แผนก → อาวุโส เหมือนรายชื่อพนักงานหน้าอื่นทั้งระบบ */
    const departmentRank = buildAttendanceDepartmentGroupRank(
      matched,
      (row) => row,
    );

    return [...matched].sort((left, right) => {
      const branchDiff = attendanceBranchSortText(left).localeCompare(
        attendanceBranchSortText(right),
        "th",
      );
      if (branchDiff !== 0) return branchDiff;

      const departmentRankDiff =
        (departmentRank.get(attendanceDepartmentGroupKey(left)) ?? 99) -
        (departmentRank.get(attendanceDepartmentGroupKey(right)) ?? 99);
      if (departmentRankDiff !== 0) return departmentRankDiff;

      const departmentDiff = attendanceDepartmentSortText(left).localeCompare(
        attendanceDepartmentSortText(right),
        "th",
      );
      if (departmentDiff !== 0) return departmentDiff;

      return (left.employeeCode ?? "").localeCompare(right.employeeCode ?? "");
    });
  }, [employees, keyword]);

  /*
   * แบ่งหน้าฝั่งหน้าจอ ไม่ใช่ฝั่งเซิร์ฟเวอร์
   *
   * รายชื่อถูกโหลดมาครบทุกคนอยู่แล้ว (ต้องครบเพื่อให้ตัวเลขสรุปหัวเรื่องกับ
   * ช่องค้นหาครอบทั้งบริษัท ไม่ใช่แค่หน้าที่เปิดอยู่) การตัดหน้าตรงนี้จึงเป็น
   * เรื่องของการแสดงผลล้วน ๆ และเปลี่ยนหน้าได้ทันทีโดยไม่ต้องรอเซิร์ฟเวอร์
   */
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  /* กันหน้าค้างเกินขอบหลังกรองจนรายการสั้นลง โดยไม่ต้องตั้ง state ใน render */
  const currentPage = Math.min(page, totalPages);

  const paged = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage],
  );

  /*
   * จำนวนคนต่อกลุ่ม ใช้โชว์บนหัวกลุ่ม — นับเฉพาะคนในหน้านี้
   * กลุ่มที่ยาวเกินหนึ่งหน้าจะถูกตัดข้ามหน้า ถ้านับทั้งบริษัทแล้วโชว์บนหัวกลุ่ม
   * ตัวเลขจะไม่ตรงกับแถวที่เห็นอยู่ตรงหน้า
   */
  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const employee of paged) {
      for (const key of [
        attendanceBranchGroupKey(employee),
        attendanceDepartmentGroupKey(employee),
      ]) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    return counts;
  }, [paged]);

  // "เครื่องสแกน" ใช้ได้เฉพาะเมื่อมีอุปกรณ์ลงเวลาที่เปิดใช้งานอยู่จริง — เว็บ/แอปเป็นซอฟต์แวร์มีเสมอ
  const deviceMethodAvailable = useMemo(
    () => devices.some((device) => device.status === "ACTIVE"),
    [devices],
  );

  const availableMethods = useMemo<AttendanceMethod[]>(
    () =>
      METHOD_OPTIONS.filter(
        (option) => option.value !== "DEVICE" || deviceMethodAvailable,
      ).map((option) => option.value),
    [deviceMethodAvailable],
  );

  const availableMethodOptions = useMemo(
    () =>
      METHOD_OPTIONS.filter((option) =>
        availableMethods.includes(option.value),
      ),
    [availableMethods],
  );

  // จุด GPS ที่พร้อมใช้ (ปักหมุด + เปิดใช้งาน) — mirror ตรรกะ backend: ตรงสาขา หรือระดับบริษัท (ทุกสาขา)
  const activeGeofencePoints = useMemo(
    () =>
      locations.filter(
        (location) =>
          location.status === "ACTIVE" &&
          location.latitude !== null &&
          location.longitude !== null,
      ),
    [locations],
  );

  /*
   * จุดที่ระบบจะใช้ตรวจระยะจริงของคนนี้ — กติกาเดียวกับ backend
   * (resolveBranchGeofenceLocation): จุดที่ผูกรายคน → จุดแรกของสาขา → จุดระดับบริษัท
   * ต้องคำนวณเองที่หน้าจอเพื่อโชว์ชื่อจุดในแถว ไม่ใช่แค่บอกว่า "มี/ไม่มี"
   */
  const resolveGeofencePoint = useCallback(
    (employee: EmployeeListItem): AttendanceLocation | null => {
      const pinned = employee.attendanceLocationId
        ? activeGeofencePoints.find(
            (location) =>
              location.id === employee.attendanceLocationId &&
              location.companyId === employee.companyId,
          )
        : undefined;
      if (pinned) return pinned;

      const own = activeGeofencePoints.filter(
        (location) => location.companyId === employee.companyId,
      );
      return (
        own.find(
          (location) =>
            employee.branchId !== null &&
            location.branchId === employee.branchId,
        ) ??
        own.find((location) => location.branchId === null) ??
        null
      );
    },
    [activeGeofencePoints],
  );

  const branchHasGeofencePoint = useCallback(
    (employee: EmployeeListItem) => resolveGeofencePoint(employee) !== null,
    [resolveGeofencePoint],
  );

  /*
   * รายชื่อคนที่ลงทะเบียนในเครื่องสแกน — API มีแค่ "ต่อเครื่อง" ไม่มี "ต่อคน"
   * แต่เครื่องมีไม่กี่ตัว ดึงมาทั้งหมดแล้วจัดกลุ่มตามพนักงานที่หน้าจอถูกกว่า
   * เพิ่ม endpoint ใหม่ที่ backend
   */
  const enrollmentsQuery = useApiQuery(
    [...queryKeys.attendance.devices(), "enrollments-all", devices.map((d) => d.id).join(",")],
    async () => {
      const lists = await Promise.all(
        devices.map((device) =>
          getAttendanceDeviceEnrollments(device.id).catch(
            () => [] as AttendanceDeviceEnrollment[],
          ),
        ),
      );
      return lists.flat();
    },
    { enabled: devices.length > 0 },
  );

  const enrollmentsByEmployee = useMemo(() => {
    const map = new Map<string, AttendanceDeviceEnrollment[]>();
    for (const enrollment of enrollmentsQuery.data ?? []) {
      if (enrollment.status !== "ACTIVE") continue;
      map.set(enrollment.employeeId, [
        ...(map.get(enrollment.employeeId) ?? []),
        enrollment,
      ]);
    }
    return map;
  }, [enrollmentsQuery.data]);

  const deviceById = useMemo(
    () => new Map(devices.map((device) => [device.id, device])),
    [devices],
  );

  /* ตัวเลือกจุด GPS ในป๊อปอัพ — ของสาขาตัวเองขึ้นก่อน แล้วค่อยทุกสาขา แล้วค่อยสาขาอื่น */
  const geofencePointOptions = useMemo(() => {
    if (!editing) return [];
    const own = activeGeofencePoints.filter(
      (location) => location.companyId === editing.companyId,
    );
    const groups = [
      {
        key: "own",
        label: `สาขาของพนักงาน · ${editing.branch?.nameTh ?? "ไม่ระบุสาขา"}`,
        points: own.filter(
          (location) =>
            editing.branchId !== null && location.branchId === editing.branchId,
        ),
      },
      {
        key: "all",
        label: "ใช้ได้ทุกสาขา",
        points: own.filter((location) => location.branchId === null),
      },
      {
        key: "other",
        label: "สาขาอื่น",
        points: own.filter(
          (location) =>
            location.branchId !== null && location.branchId !== editing.branchId,
        ),
      },
    ];
    return groups.filter((group) => group.points.length > 0);
  }, [activeGeofencePoints, editing]);

  /* ฟอร์มผูกเครื่องในป๊อปอัพ — เลือกเครื่อง + รหัสที่ลงทะเบียนไว้ในเครื่อง */
  const [enrollDeviceId, setEnrollDeviceId] = useState("");
  const [enrollDeviceUserId, setEnrollDeviceUserId] = useState("");

  const enrollMutation = useApiMutation(
    (input: { employee: EmployeeListItem; deviceId: string; deviceUserId: string }) =>
      createAttendanceDeviceEnrollment(input.deviceId, {
        employeeId: input.employee.id,
        deviceUserId: input.deviceUserId.trim(),
      }),
    {
      invalidates: [queryKeys.attendance.all],
      onSuccess: (_data, input) => {
        toast.success(
          `ผูก ${employeeName(input.employee)} กับ ${deviceById.get(input.deviceId)?.name ?? "เครื่องสแกน"} แล้ว`,
        );
        setEnrollDeviceUserId("");
      },
      onError: (err) => {
        toast.error(getErrorMessage(err, "ผูกเครื่องสแกนไม่สำเร็จ"));
      },
      showErrorToast: false,
    },
  );

  const stats = useMemo(() => {
    const office = employees.filter(
      (employee) => employee.attendanceGeofenceRequired,
    ).length;
    // office (บังคับพื้นที่) แต่สาขายังไม่มีจุด GPS → geofence ทำงานไม่ได้จริง
    const gap = employees.filter(
      (employee) =>
        employee.attendanceGeofenceRequired &&
        !branchHasGeofencePoint(employee),
    ).length;

    return {
      total: employees.length,
      office,
      field: employees.length - office,
      gap,
    };
  }, [branchHasGeofencePoint, employees]);

  function openEdit(employee: EmployeeListItem) {
    setEditing(employee);
    setDraft({
      allowedAttendanceMethods: [...(employee.allowedAttendanceMethods ?? [])],
      attendanceGeofenceRequired: employee.attendanceGeofenceRequired,
      attendanceLocationId: employee.attendanceLocationId ?? "",
    });
    setEnrollDeviceId(devices.find((device) => device.status === "ACTIVE")?.id ?? "");
    setEnrollDeviceUserId("");
  }

  function closeEdit() {
    if (saving) return;
    setEditing(null);
  }

  function toggleMethod(method: AttendanceMethod) {
    setDraft((current) => {
      const has = current.allowedAttendanceMethods.includes(method);
      return {
        ...current,
        allowedAttendanceMethods: has
          ? current.allowedAttendanceMethods.filter((item) => item !== method)
          : [...current.allowedAttendanceMethods, method],
      };
    });
  }

  function applyPreset(preset: "OFFICE" | "FIELD") {
    if (preset === "OFFICE") {
      // ประจำออฟฟิศ = ทุกวิธีที่ระบบมีจริง (เครื่องสแกนเฉพาะเมื่อมีอุปกรณ์)
      setDraft((current) => ({
        ...current,
        allowedAttendanceMethods: [...availableMethods],
        attendanceGeofenceRequired: true,
      }));
    } else {
      setDraft((current) => ({
        ...current,
        allowedAttendanceMethods: ["WEB", "MOBILE"],
        attendanceGeofenceRequired: false,
      }));
    }
  }

  const saveMutation = useApiMutation(
    (input: {
      employee: EmployeeListItem;
      allowedAttendanceMethods: string[];
      attendanceGeofenceRequired: boolean;
      attendanceLocationId: string | null;
    }) =>
      apiFetch<EmployeeListItem>(`/employees/${input.employee.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          allowedAttendanceMethods: input.allowedAttendanceMethods,
          attendanceGeofenceRequired: input.attendanceGeofenceRequired,
          attendanceLocationId: input.attendanceLocationId,
        }),
      }),
    {
      // invalidate แทนการแก้ state ในตารางเอง ทำให้ค่าที่เห็นมาจากเซิร์ฟเวอร์จริง
      invalidates: [queryKeys.employees.all],
      onSuccess: (_data, input) => {
        toast.success(
          `บันทึกการตั้งค่าลงเวลาของ ${employeeName(input.employee)} เรียบร้อยแล้ว`,
        );
        setEditing(null);
      },
      onError: (err) => {
        toast.error(getErrorMessage(err, "ไม่สามารถบันทึกการตั้งค่าได้"));
      },
      showErrorToast: false,
    },
  );

  const saving = saveMutation.isPending;

  function save() {
    if (!editing) return;
    // เก็บเฉพาะวิธีที่ระบบมีจริง (กันไม่ให้ค้าง "เครื่องสแกน" ทั้งที่ยังไม่มีอุปกรณ์)
    const methodsToSave = draft.allowedAttendanceMethods.filter((method) =>
      availableMethods.includes(method),
    );
    if (methodsToSave.length === 0) {
      toast.error("ต้องเลือกอย่างน้อย 1 วิธีลงเวลา");
      return;
    }

    saveMutation.mutate({
      employee: editing,
      allowedAttendanceMethods: methodsToSave,
      attendanceGeofenceRequired: draft.attendanceGeofenceRequired,
      attendanceLocationId: draft.attendanceLocationId || null,
    });
  }

  /* ---------------------------------------------------------------- */
  /* render                                                            */
  /* ---------------------------------------------------------------- */

  // ส่งตัวเลขสรุปให้หัวเรื่องของหน้าเมื่อข้อมูลเปลี่ยน
  useEffect(() => {
    onSummaryChange?.(stats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.total, stats.office, stats.field, stats.gap]);

  const hasNotice = !deviceMethodAvailable || stats.gap > 0;

  return (
    <>
      {/* ตัวกรองอยู่แถวเดียวกับช่องค้นหา เหมือนหน้าผู้ใช้และสิทธิ์ */}
      <div className="flex flex-col gap-3 border-b border-slate-300 bg-slate-50/70 px-5 py-3 sm:px-6 xl:flex-row xl:items-center xl:justify-between 3xl:px-7">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] text-slate-500">
            ตั้งได้รายคน · ค่าที่บันทึกมีผลกับหน้าลงเวลาของพนักงานทันที
          </p>

          {q ? (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setPage(1);
              }}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700 underline-offset-2 hover:underline"
            >
              <X className="h-3.5 w-3.5" />
              ล้างคำค้น
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-3 xl:shrink-0">
          <p className="hidden whitespace-nowrap text-[12px] text-slate-500 sm:block">
            {q
              ? `เจอ ${filtered.length.toLocaleString("th-TH")} จาก ${stats.total.toLocaleString("th-TH")} คน`
              : `ทั้งหมด ${stats.total.toLocaleString("th-TH")} คน`}
          </p>

          <div className="[&_input]:bg-white">
            <SearchInput
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                setPage(1);
              }}
              placeholder="ค้นหาชื่อ รหัส สาขา ประเภทพนักงาน"
              className="w-full sm:w-60"
              aria-label="ค้นหาพนักงาน"
            />
          </div>

          <IconButton
            title="โหลดข้อมูลใหม่"
            icon={
              refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )
            }
            onClick={() => void loadData(true)}
          />
        </div>
      </div>

      {/* notices */}
      {hasNotice ? (
        <div className="space-y-2 border-b border-slate-200 bg-white px-5 py-3 sm:px-6 3xl:px-7">
          {!deviceMethodAvailable ? (
            <NoticeBar tone="amber" icon={Fingerprint}>
              ยังไม่มีเครื่องสแกนที่เปิดใช้งานในระบบ ตารางจึงแสดงเฉพาะ เว็บ/แอป
              — เพิ่มอุปกรณ์ที่หน้า{" "}
              <Link
                href="/settings/attendance?tab=locations"
                className="font-bold underline underline-offset-2"
              >
                เครื่องสแกนและจุดลงเวลา
              </Link>{" "}
              แล้ววิธี &ldquo;เครื่องสแกน&rdquo; จะปรากฏให้เลือกอัตโนมัติ
            </NoticeBar>
          ) : null}

          {stats.gap > 0 ? (
            <NoticeBar tone="rose" icon={AlertTriangle}>
              มี {stats.gap.toLocaleString("th-TH")} คนที่ตั้งให้
              &ldquo;ต้องอยู่ในพื้นที่&rdquo; แต่สาขายังไม่มีจุด GPS — geofence
              จึงยังตรวจระยะไม่ได้ (พนักงานลงเวลาได้โดยไม่ถูกบล็อก)
              ไปปักหมุดจุดของสาขาที่หน้า{" "}
              <Link
                href="/settings/attendance?tab=locations"
                className="font-bold underline underline-offset-2"
              >
                เครื่องสแกนและจุดลงเวลา
              </Link>{" "}
              ให้ตรงกับสาขาของพนักงาน
            </NoticeBar>
          ) : null}
        </div>
      ) : null}

      {/* table */}
      {loading ? (
        <PanelMessage>
          <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
          กำลังโหลดข้อมูล…
        </PanelMessage>
      ) : error ? (
        <PanelMessage>
          <AlertTriangle className="h-5 w-5 text-rose-500" />
          {error}
          <button
            type="button"
            onClick={() => void loadData()}
            className={cn(PRIMARY_BUTTON, "mt-2")}
          >
            ลองใหม่
          </button>
        </PanelMessage>
      ) : filtered.length === 0 ? (
        <PanelMessage>
          {employees.length === 0
            ? "ยังไม่มีพนักงานที่สถานะทำงานอยู่"
            : "ไม่พบพนักงานที่ตรงกับคำค้น"}
        </PanelMessage>
      ) : (
        <div className="divide-y divide-slate-200">
          {/*
            รายการทีละคน ไม่ใช่ตาราง — ตารางเดิมกว้าง 900px ต้องเลื่อนแนวนอน
            ทั้งที่คอลัมน์ "สาขา/ประเภท" ยุบเป็นบรรทัดรองใต้ชื่อได้
          */}
          {paged.map((employee, index) => {
            /* หัวกลุ่มขึ้นเมื่อสาขา/แผนกเปลี่ยน ชุดเดียวกับหน้าตรวจเวลาทำงาน */
            const previous = paged[index - 1];
            const branchKey = attendanceBranchGroupKey(employee);
            const departmentKey = attendanceDepartmentGroupKey(employee);
            const newBranch =
              index === 0 || attendanceBranchGroupKey(previous) !== branchKey;
            const newDepartment =
              newBranch ||
              attendanceDepartmentGroupKey(previous) !== departmentKey;

            const allowed = employee.allowedAttendanceMethods ?? [];
            // แสดงเฉพาะวิธีที่ระบบมีจริง (ซ่อนเครื่องสแกนถ้ายังไม่มีอุปกรณ์)
            const shown = (
              allowed.length === 0 ? availableMethods : allowed
            ).filter((method) => availableMethods.includes(method));
            const geofenced = employee.attendanceGeofenceRequired;
            const point = resolveGeofencePoint(employee);
            const hasPoint = point !== null;
            const pinned =
              Boolean(employee.attendanceLocationId) &&
              point?.id === employee.attendanceLocationId;
            const enrolled = enrollmentsByEmployee.get(employee.id) ?? [];

            return (
              <Fragment key={employee.id}>
                {newBranch ? (
                  /*
                   * แถบชื่อสาขาค้างใต้แถบบนสุด แล้วถูกสาขาถัดไปดันขึ้นไปเอง
                   * ตอนค้างต้องทึบแสง ไม่งั้นรายชื่อที่เลื่อนลอดใต้จะทะลุขึ้นมา
                   * (#e6f0fe = สีเดียวกับ bg-brand-100/70 ที่ทับพื้นขาว)
                   */
                  <div className="border-y border-brand-200 bg-brand-100/70 px-5 py-2 sm:px-6 3xl:px-7 xl:sticky xl:top-20 xl:z-10 xl:bg-[#e6f0fe]">
                    <AttendanceGroupHeading
                      level="branch"
                      title={employee.branch?.nameTh ?? "ไม่ระบุสาขา"}
                      code={employee.branch?.code}
                      employeeCount={groupCounts.get(branchKey)}
                    />
                  </div>
                ) : null}

                {newDepartment ? (
                  <div className="border-b border-brand-100 bg-white py-2 pl-10 pr-5 sm:pr-6 3xl:pr-7">
                    <AttendanceGroupHeading
                      level="department"
                      title={employee.department?.nameTh ?? "ไม่ระบุแผนก"}
                      code={employee.department?.code}
                      employeeCount={groupCounts.get(departmentKey)}
                    />
                  </div>
                ) : null}

                <article className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5 transition-colors even:bg-brand-50/40 hover:bg-brand-50/70 sm:px-6 3xl:px-7">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                    <UserRound className="h-4 w-4" />
                  </span>

                  <div className="min-w-[12rem] flex-1">
                    <p className="break-words text-[13.5px] font-bold text-slate-900 3xl:text-[14.5px]">
                      {employeeName(employee)}
                    </p>
                    <p className="break-words text-[11.5px] text-slate-500 3xl:text-[12px]">
                      {[
                        employee.employeeCode,
                        employee.branch?.nameTh ?? "ทุกสาขา",
                        employee.employeeType?.nameTh ?? "ไม่ระบุประเภท",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>

                  {/* วิธีที่อนุญาต */}
                  <div className="w-56 shrink-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
                      วิธีที่อนุญาต
                    </p>
                    {shown.length === 0 ? (
                      <p className="text-[12.5px] text-slate-300">
                        ยังไม่ได้กำหนด
                      </p>
                    ) : (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {shown.map((method) => {
                          const info = METHOD_MAP.get(method);
                          const Icon = info?.icon ?? Globe;

                          return (
                            <span
                              key={method}
                              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-600"
                            >
                              <Icon className="h-3 w-3" />
                              {info?.label ?? method}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* พื้นที่ลงเวลา — สาขาที่ยังไม่มีจุด GPS ต้องเห็นตั้งแต่ในรายการ */}
                  <div className="w-52 shrink-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
                      พื้นที่ลงเวลา
                    </p>
                    {/*
                    สองแบบนี้ต้องแยกออกจากกันตั้งแต่กวาดตา จึงใช้ป้ายพื้นสีคนละสี
                    ไม่ใช่ตัวหนังสือสีต่างกันนิดเดียว
                  */}
                    <span
                      className={cn(
                        "mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold",
                        geofenced
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-violet-50 text-violet-700",
                      )}
                    >
                      {geofenced ? (
                        <Navigation className="h-3 w-3" />
                      ) : (
                        <Globe className="h-3 w-3" />
                      )}
                      {geofenced ? "ต้องอยู่ในพื้นที่" : "ลงเวลาได้ทุกที่"}
                    </span>
                    {geofenced && !hasPoint ? (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-rose-600">
                        <AlertTriangle className="h-3 w-3" />
                        สาขานี้ยังไม่มีจุด GPS
                      </p>
                    ) : (
                      <p
                        className="mt-0.5 truncate text-[11px] text-slate-400"
                        title={point?.nameTh}
                      >
                        {geofenced && point
                          ? `${pinned ? "ผูกไว้: " : ""}${point.nameTh} · ${point.radiusMeters} ม.`
                          : "ไม่ตรวจระยะ แต่ยังเก็บพิกัด"}
                      </p>
                    )}
                  </div>

                  {/* เครื่องสแกนที่ลงทะเบียนไว้ — คนที่อนุญาตเครื่องสแกนแต่ยังไม่ผูกต้องเห็นตรงนี้ */}
                  <div className="w-44 shrink-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
                      เครื่องสแกน
                    </p>
                    {enrolled.length > 0 ? (
                      <p
                        className="mt-0.5 truncate text-[11.5px] font-semibold text-slate-700"
                        title={enrolled
                          .map((e) => `${deviceById.get(e.deviceId)?.name ?? e.deviceId} (#${e.deviceUserId})`)
                          .join(", ")}
                      >
                        {enrolled
                          .map((e) => deviceById.get(e.deviceId)?.name ?? "เครื่อง")
                          .join(", ")}
                      </p>
                    ) : shown.includes("DEVICE") ? (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                        <AlertTriangle className="h-3 w-3" />
                        ยังไม่ผูกเครื่อง
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[11px] text-slate-300">ไม่ใช้เครื่องสแกน</p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <IconAction
                      label="ตั้งค่าวิธีลงเวลา"
                      onClick={() => openEdit(employee)}
                    >
                      <Pencil className="h-4 w-4" />
                    </IconAction>
                  </div>
                </article>
              </Fragment>
            );
          })}
        </div>
      )}

      {/* ---------------- แบ่งหน้า ---------------- */}
      {!loading && !error && filtered.length > 0 ? (
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 sm:px-6 3xl:px-7">
          <span className="text-[13px] text-slate-400">
            หน้า {currentPage.toLocaleString("th-TH")} จาก{" "}
            {totalPages.toLocaleString("th-TH")}
          </span>

          <div className="flex items-center gap-1">
            <Button
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => {
                setPage(Math.max(currentPage - 1, 1));
                scrollPagerToTop();
              }}
            >
              ก่อนหน้า
            </Button>
            <Button
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => {
                setPage(Math.min(currentPage + 1, totalPages));
                scrollPagerToTop();
              }}
            >
              ถัดไป
            </Button>
          </div>
        </div>
      ) : null}

      {/* ---------------- edit modal ---------------- */}
      {editing ? (
        <Modal
          title={`ตั้งค่าวิธีลงเวลา · ${employeeName(editing)}`}
          subtitle={`${editing.employeeCode} · ${editing.branch?.nameTh ?? "ไม่ระบุสาขา"}`}
          onClose={closeEdit}
        >
          <div className="max-h-[62vh] space-y-5 overflow-y-auto">
            <FormSection
              title="ชุดค่าสำเร็จรูป"
              hint="กดเพื่อเติมค่าให้ครบทีเดียว แล้วปรับรายข้อด้านล่างได้"
            >
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applyPreset("OFFICE")}
                  disabled={saving}
                  className={GHOST_BUTTON}
                >
                  <Navigation className="h-4 w-4" />
                  ประจำออฟฟิศ
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("FIELD")}
                  disabled={saving}
                  className={GHOST_BUTTON}
                >
                  <Globe className="h-4 w-4" />
                  ออกนอกสถานที่
                </button>
              </div>
            </FormSection>

            <FormSection
              title="วิธีลงเวลาที่อนุญาต"
              hint="เลือกอย่างน้อย 1 วิธี พนักงานจะเห็นเฉพาะปุ่มที่อนุญาตไว้"
            >
              <div className="grid gap-3 sm:grid-cols-3">
                {availableMethodOptions.map((option) => {
                  const active = draft.allowedAttendanceMethods.includes(
                    option.value,
                  );
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleMethod(option.value)}
                      disabled={saving}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg border px-3.5 py-3 text-sm font-semibold transition disabled:opacity-60 max-[1536px]:rounded-lg max-[1536px]:px-3 max-[1536px]:py-2.5 max-[1536px]:text-xs",
                        active
                          ? "border-brand-600 bg-brand-50 text-brand-700 shadow-none"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-brand-50/60",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                          active
                            ? "bg-brand-600 text-white"
                            : "bg-slate-100 text-slate-500",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {!deviceMethodAvailable ? (
                <p className="mt-2.5 text-[11px] text-slate-500">
                  ยังไม่มีเครื่องสแกนในระบบ — วิธี &ldquo;เครื่องสแกน&rdquo;
                  จะเลือกได้เมื่อเพิ่มอุปกรณ์ที่หน้า{" "}
                  <Link
                    href="/settings/attendance?tab=locations"
                    className="font-bold text-brand-700 underline underline-offset-2"
                  >
                    เครื่องสแกนและจุดลงเวลา
                  </Link>
                </p>
              ) : null}
            </FormSection>

            <FormSection title="พื้นที่ลงเวลา">
              <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-brand-50/40 px-4 py-3.5 max-[1536px]:rounded-lg max-[1536px]:px-3.5 max-[1536px]:py-3">
                <input
                  type="checkbox"
                  checked={draft.attendanceGeofenceRequired}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      attendanceGeofenceRequired: event.target.checked,
                    }))
                  }
                  disabled={saving}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-cyan-200"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800 max-[1536px]:text-xs">
                    ต้องอยู่ในพื้นที่บริษัท (geofence)
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-5 text-slate-500">
                    เปิด = พนักงานประจำออฟฟิศ ต้องอยู่ในรัศมีจุดลงเวลาของสาขา ·
                    ปิด = ออกนอกสถานที่ กดที่ไหนก็ได้ (ยังเก็บพิกัด)
                  </span>
                </span>
              </label>

              {draft.attendanceGeofenceRequired ? (
                <div className="mt-3">
                  <label className="block text-[12px] font-semibold text-slate-700">
                    จุดลงเวลา GPS ที่ใช้ตรวจระยะ
                  </label>
                  <select
                    value={draft.attendanceLocationId}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        attendanceLocationId: event.target.value,
                      }))
                    }
                    disabled={saving}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-300 focus:ring-4 focus:ring-brand-100"
                  >
                    <option value="">
                      {(() => {
                        const auto = resolveGeofencePoint({ ...editing, attendanceLocationId: null });
                        return auto
                          ? `ตามสาขา (อัตโนมัติ) — ${auto.nameTh} · ${auto.radiusMeters} ม.`
                          : "ตามสาขา (อัตโนมัติ) — สาขานี้ยังไม่มีจุด";
                      })()}
                    </option>
                    {geofencePointOptions.map((group) => (
                      <optgroup key={group.key} label={group.label}>
                        {group.points.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.nameTh} · รัศมี {location.radiusMeters} ม.
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">
                    สาขาที่ไม่มีเครื่องสแกนใช้ GPS แทนได้ — ปักหมุดจุดของสาขานั้นที่แท็บ
                    &ldquo;จุดลงเวลา GPS&rdquo; แล้วเลือกตรงนี้ หรือปล่อยเป็นอัตโนมัติถ้าเป็นจุดของสาขาตัวเอง
                  </p>
                </div>
              ) : null}

              {draft.attendanceGeofenceRequired &&
              !draft.attendanceLocationId &&
              !branchHasGeofencePoint(editing) ? (
                <div className="mt-2.5">
                  <NoticeBar tone="rose" icon={AlertTriangle}>
                    สาขาของพนักงานคนนี้ยังไม่มีจุด GPS ที่เปิดใช้งาน — เลือกจุดจากรายการด้านบน
                    หรือปักหมุดจุดของสาขาก่อน ไม่งั้นระบบจะยังตรวจระยะไม่ได้
                  </NoticeBar>
                </div>
              ) : null}
            </FormSection>

            {draft.allowedAttendanceMethods.includes("DEVICE") ? (
              <FormSection
                title="เครื่องสแกนที่ผูกไว้"
                hint="รหัสในเครื่อง = หมายเลขผู้ใช้ที่ลงทะเบียนนิ้วไว้ในเครื่องสแกน ต้องตรงกันระบบถึงจับคู่รอยสแกนกับคนได้"
              >
                {(enrollmentsByEmployee.get(editing.id) ?? []).length > 0 ? (
                  <ul className="mb-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {(enrollmentsByEmployee.get(editing.id) ?? []).map((enrollment) => (
                      <li key={enrollment.id} className="flex items-center gap-2.5 px-3 py-2 text-[13px]">
                        <Fingerprint className="h-4 w-4 shrink-0 text-brand-600" />
                        <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">
                          {deviceById.get(enrollment.deviceId)?.name ?? enrollment.deviceId}
                        </span>
                        <span className="shrink-0 text-[12px] text-slate-500">
                          รหัสในเครื่อง #{enrollment.deviceUserId}
                          {enrollment.fingerCount ? ` · ${enrollment.fingerCount} นิ้ว` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mb-3">
                    <NoticeBar tone="amber" icon={AlertTriangle}>
                      ยังไม่ได้ผูกกับเครื่องสแกนตัวไหน — รอยสแกนของคนนี้จะไม่ถูกจับคู่จนกว่าจะผูก
                    </NoticeBar>
                  </div>
                )}

                <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                  <select
                    value={enrollDeviceId}
                    onChange={(event) => setEnrollDeviceId(event.target.value)}
                    disabled={enrollMutation.isPending}
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-300 focus:ring-4 focus:ring-brand-100"
                  >
                    {devices
                      .filter((device) => device.status === "ACTIVE")
                      .map((device) => (
                        <option key={device.id} value={device.id}>
                          {device.name}
                        </option>
                      ))}
                  </select>
                  <input
                    value={enrollDeviceUserId}
                    onChange={(event) => setEnrollDeviceUserId(event.target.value.replace(/\s/g, ""))}
                    placeholder="รหัสในเครื่อง"
                    disabled={enrollMutation.isPending}
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-300 focus:ring-4 focus:ring-brand-100"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!enrollDeviceId || !enrollDeviceUserId.trim()) {
                        toast.error("เลือกเครื่องและใส่รหัสในเครื่องก่อน");
                        return;
                      }
                      enrollMutation.mutate({
                        employee: editing,
                        deviceId: enrollDeviceId,
                        deviceUserId: enrollDeviceUserId,
                      });
                    }}
                    disabled={enrollMutation.isPending || !enrollDeviceId}
                    className={GHOST_BUTTON}
                  >
                    {enrollMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Link2 className="h-4 w-4" />
                    )}
                    ผูกเครื่อง
                  </button>
                </div>
              </FormSection>
            ) : null}
          </div>

          <ModalFooter>
            <button
              type="button"
              onClick={closeEdit}
              disabled={saving}
              className={GHOST_BUTTON}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => save()}
              disabled={saving}
              className={PRIMARY_BUTTON}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "กำลังบันทึก" : "บันทึกการตั้งค่า"}
            </button>
          </ModalFooter>
        </Modal>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* small ui                                                            */
/* ------------------------------------------------------------------ */

function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  // ใช้กล่องกลางของระบบ ป๊อปอัพทุกหน้าจึงหน้าตาเหมือนกัน
  return (
    <KitModal open title={title} description={subtitle} onClose={onClose}>
      {children}
    </KitModal>
  );
}

function ModalFooter({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
      {children}
    </div>
  );
}

function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          {title}
        </h3>
        {hint ? (
          <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function NoticeBar({
  tone,
  icon: Icon,
  children,
}: {
  tone: "amber" | "rose";
  icon: LucideIcon;
  children: ReactNode;
}) {
  const toneClass = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
  }[tone];

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-4 py-3 text-xs font-medium leading-5 max-[1536px]:rounded-lg max-[1536px]:px-3.5 max-[1536px]:py-2.5 max-[1536px]:text-[11px]",
        toneClass,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function IconAction({
  label,
  tone,
  onClick,
  children,
}: {
  label: string;
  tone?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white transition",
        tone ?? "text-slate-600 hover:bg-slate-50",
      )}
    >
      {children}
    </button>
  );
}

function PanelMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 px-6 py-10 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}
