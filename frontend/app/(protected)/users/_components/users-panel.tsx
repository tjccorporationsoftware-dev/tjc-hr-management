"use client";

import {
  FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  AtSign,
  KeyRound,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import {
  Avatar,
  Button,
  DataTable,
  Field,
  IconButton,
  RowMenu,
  Modal as KitModal,
  PasswordInput,
  SearchInput,
  Select,
  TextInput,
  type Column,
} from "@/components/kit";
import { AttendanceGroupHeading } from "@/components/common/attendance-group-heading";
import { DateTimeDisplay } from "@/components/common/date-display";
import { ApiClientError, apiFetch, apiFetchWithMeta } from "@/lib/api";
import {
  attendanceBranchGroupKey,
  attendanceDepartmentGroupKey,
} from "@/lib/attendance-session-group";
import type { OrganizationOption } from "@/types/employee";
import type { EmployeeListItem } from "@/types/employee";
import {
  EmployeePicker,
  type PickerEmployee,
} from "@/components/common/employee-picker";
import type {
  PaginationMeta,
  RoleListItem,
  UserListItem,
  UserListSummary,
  UserStatus,
} from "@/types/user";
import type { RoleListSummary } from "@/types/access-control";

import { scrollPagerToTop } from "@/lib/scroll-to-top";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/* form types                                                          */
/* ------------------------------------------------------------------ */

type CreateUserForm = {
  employeeId: string;
  email: string;
  displayName: string;
  password: string;
  roleCodes: string[];
};

type UpdateEmailForm = {
  email: string;
  confirmEmail: string;
  syncEmployeeEmail: boolean;
};

type ResetPasswordForm = {
  newPassword: string;
  confirmPassword: string;
  confirmTarget: string;
};

const defaultCreateForm: CreateUserForm = {
  employeeId: "",
  email: "",
  displayName: "",
  password: "Employee@123456",
  roleCodes: ["EMPLOYEE"],
};

const defaultUpdateEmailForm: UpdateEmailForm = {
  email: "",
  confirmEmail: "",
  syncEmployeeEmail: true,
};

const defaultResetPasswordForm: ResetPasswordForm = {
  newPassword: "",
  confirmPassword: "",
  confirmTarget: "",
};

/**
 * สีของชิปบทบาท
 * ไล่ตามระดับอำนาจ: ผู้ดูแลระบบเข้มสุด ผู้จัดการ/ผู้บริหารกลาง พนักงานทั่วไปเป็นเทา
 * เพื่อให้กวาดตาเจอบัญชีที่มีสิทธิ์สูงได้ทันทีโดยไม่ต้องอ่านทีละตัว
 */
const ROLE_TONE: Record<string, string> = {
  SUPER_ADMIN: "bg-violet-100 text-violet-700",
  SYSTEM_ADMIN: "bg-violet-100 text-violet-700",
  HR_ADMIN: "bg-brand-100 text-brand-700",
  PAYROLL_ACCOUNTING: "bg-cyan-100 text-cyan-700",
  EXECUTIVE: "bg-indigo-100 text-indigo-700",
  MANAGER: "bg-amber-100 text-amber-800",
};

const ROLE_TONE_DEFAULT = "bg-slate-100 text-slate-600";

const statusOptions: Array<{ label: string; value: "" | UserStatus }> = [
  { label: "ทุกสถานะ", value: "" },
  { label: "เปิดใช้งาน", value: "ACTIVE" },
  { label: "ปิดใช้งาน", value: "INACTIVE" },
  { label: "ถูกระงับ", value: "SUSPENDED" },
];

/* ------------------------------------------------------------------ */
/* page                                                                */
/* ------------------------------------------------------------------ */

/** ตัวเลขสรุปที่หน้าหลักเอาไปวางข้างหัวเรื่อง */
export type UsersSummary = {
  total: number;
  active: number;
  suspended: number;
  linked: number;
  activeRoles: number;
  totalRoles: number;
};

export function UsersPanel({
  onSummaryChange,
}: {
  onSummaryChange?: (summary: UsersSummary) => void;
}) {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [roles, setRoles] = useState<RoleListItem[]>([]);
  /** พนักงานที่เลือกในฟอร์มเปิดบัญชี — เก็บทั้งก้อนไว้โชว์รหัส/เติมอีเมล */
  const [createEmployee, setCreateEmployee] = useState<PickerEmployee | null>(
    null,
  );
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [userSummary, setUserSummary] = useState<UserListSummary | null>(null);
  const [, setRoleSummary] = useState<RoleListSummary | null>(null);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | UserStatus>("");
  const [branchId, setBranchId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [branches, setBranches] = useState<OrganizationOption[]>([]);
  const [departments, setDepartments] = useState<OrganizationOption[]>([]);
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] =
    useState<CreateUserForm>(defaultCreateForm);

  const [roleModalUser, setRoleModalUser] = useState<UserListItem | null>(null);
  const [selectedRoleCodes, setSelectedRoleCodes] = useState<string[]>([]);

  const [linkModalUser, setLinkModalUser] = useState<UserListItem | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");

  const [emailModalUser, setEmailModalUser] = useState<UserListItem | null>(
    null,
  );
  const [emailForm, setEmailForm] = useState<UpdateEmailForm>(
    defaultUpdateEmailForm,
  );

  const [passwordModalUser, setPasswordModalUser] =
    useState<UserListItem | null>(null);
  const [passwordForm, setPasswordForm] = useState<ResetPasswordForm>(
    defaultResetPasswordForm,
  );

  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(
    null,
  );

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    if (branchId) params.set("branchId", branchId);
    if (departmentId) params.set("departmentId", departmentId);
    params.set("page", String(page));
    params.set("pageSize", "20");
    return params.toString();
  }, [branchId, departmentId, page, q, status]);

  const activeFilterCount = [q.trim(), status, branchId, departmentId].filter(
    Boolean,
  ).length;

  function clearFilters() {
    setQ("");
    setStatus("");
    setBranchId("");
    setDepartmentId("");
    setPage(1);
  }

  const activeRoles = useMemo(
    () => roles.filter((role) => role.isActive),
    [roles],
  );
  const totalUsers = userSummary?.total ?? meta?.total ?? 0;

  /**
   * ส่งตัวเลขสรุปขึ้นไปให้หัวเรื่อง (เรียกตอนโหลดเสร็จ ไม่ใช่ใน effect)
   * เก็บค่าล่าสุดไว้ใน ref เพราะผู้ใช้กับโรลโหลดคนละรอบ
   * ถ้าอ่านจาก state ตรง ๆ ฝั่งที่เสร็จทีหลังจะพา state เก่าของอีกฝั่งไปทับ
   */
  const summaryRef = useRef<{
    users: UserListSummary | null;
    roles: RoleListSummary | null;
  }>({ users: null, roles: null });

  function publishSummary(
    users: UserListSummary | null | undefined,
    roles: RoleListSummary | null | undefined,
  ) {
    if (users !== undefined) summaryRef.current.users = users;
    if (roles !== undefined) summaryRef.current.roles = roles;

    const current = summaryRef.current;
    onSummaryChange?.({
      total: current.users?.total ?? 0,
      active: current.users?.active ?? 0,
      suspended: current.users?.suspended ?? 0,
      linked: current.users?.linked ?? 0,
      activeRoles: current.roles?.active ?? 0,
      totalRoles: current.roles?.total ?? 0,
    });
  }

  async function loadUsers(mode: "initial" | "refresh" = "refresh") {
    try {
      if (mode === "initial") setLoading(true);
      setError("");
      const result = await apiFetchWithMeta<
        UserListItem[],
        PaginationMeta,
        UserListSummary
      >(`/users?${queryString}`);
      setUsers(result.data);
      setMeta(result.meta ?? null);
      setUserSummary(result.summary ?? null);
      publishSummary(result.summary ?? null, undefined);
    } catch (loadError) {
      const message = getErrorMessage(loadError, "โหลดรายการผู้ใช้ไม่สำเร็จ");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function loadRoles() {
    try {
      const result = await apiFetchWithMeta<
        RoleListItem[],
        PaginationMeta,
        RoleListSummary
      >("/roles?pageSize=100");
      setRoles(result.data);
      setRoleSummary(result.summary ?? null);
      publishSummary(undefined, result.summary ?? null);
    } catch (loadError) {
      toast.error(getErrorMessage(loadError, "โหลด Role ไม่สำเร็จ"));
    }
  }

  async function loadOrgOptions() {
    try {
      const [branchResult, departmentResult] = await Promise.all([
        apiFetchWithMeta<OrganizationOption[]>(
          "/organization/branches?pageSize=200&status=ACTIVE",
        ),
        apiFetchWithMeta<OrganizationOption[]>(
          "/organization/departments?pageSize=300&status=ACTIVE",
        ),
      ]);
      setBranches(branchResult.data);
      setDepartments(departmentResult.data);
    } catch {
      // ตัวกรองเป็นของเสริม โหลดไม่ได้ก็ให้ใช้หน้าต่อได้ตามปกติ
    }
  }

  async function refreshAll() {
    await Promise.all([loadUsers(), loadRoles()]);
  }

  useEffect(() => {
    loadUsers("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  useEffect(() => {
    loadRoles();
    loadOrgOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPage(1);
  }, [q, status, branchId, departmentId]);

  /*
   * ไม่เรียงซ้ำที่หน้าเว็บ — ใช้ลำดับที่ backend ส่งมาตรง ๆ
   *
   * backend เรียงตามสาขา → แผนก (บริหารมาก่อน) → ระดับตำแหน่ง → รหัสพนักงาน
   * ซึ่งเป็นลำดับเดียวกับที่หน้านี้ใช้จัดกลุ่ม ถ้าเรียงใหม่ที่นี่ ลำดับที่แสดง
   * จะไม่ตรงกับลำดับที่ใช้แบ่งหน้า แล้วหัวข้อกลุ่มจะแตกเป็นท่อน ๆ ข้ามหน้า
   * บัญชีที่ยังไม่ผูกพนักงานไม่มีสังกัด จึงไปอยู่ท้ายสุดเอง
   */

  /** จำนวนบัญชีต่อหัวกลุ่ม — ต่อท้ายชื่อสาขาและชื่อแผนก */
  const groupUserCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const user of users) {
      for (const key of [
        attendanceBranchGroupKey(user.employee),
        attendanceDepartmentGroupKey(user.employee),
      ]) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    return counts;
  }, [users]);

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    /*
     * ไม่บังคับผูกพนักงานอีกต่อไป
     * -------------------------
     * บริษัทที่เพิ่งเปิดยังไม่มีพนักงานสักคน ถ้าบังคับผูกก่อนจะสร้างบัญชี
     * ผู้ดูแลบริษัทไม่ได้เลย แล้วก็ไม่มีใครเข้ามาสร้างพนักงานคนแรก — วนอยู่แบบนั้น
     * (backend รองรับการสร้างแบบไม่ผูกพนักงานมาตั้งแต่แรก ขอแค่ระบุขอบเขตมาด้วย)
     */
    const linkEmployee = Boolean(createForm.employeeId);

    if (!linkEmployee && !createForm.email.trim()) {
      toast.error("บัญชีที่ไม่ผูกพนักงานต้องระบุอีเมลเข้าสู่ระบบ");
      return;
    }

    if (!createForm.password || createForm.password.length < 8) {
      toast.error("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }
    if (createForm.roleCodes.length === 0) {
      toast.error("ต้องเลือก Role อย่างน้อย 1 รายการ");
      return;
    }

    try {
      setSubmitting(true);
      await apiFetch<UserListItem>("/users", {
        method: "POST",
        body: JSON.stringify({
          employeeId: createForm.employeeId || undefined,
          email: createForm.email.trim() || undefined,
          password: createForm.password,
          roleCodes: createForm.roleCodes,
          ...(linkEmployee
            ? {}
            : { displayName: createForm.displayName.trim() || undefined }),
        }),
      });
      toast.success(
        linkEmployee
          ? "เพิ่มผู้ใช้และผูกพนักงานสำเร็จ"
          : "สร้างบัญชีผู้ดูแลบริษัทสำเร็จ",
      );
      setCreateOpen(false);
      setCreateForm(defaultCreateForm);
      setCreateEmployee(null);
      await loadUsers();
    } catch (saveError) {
      toast.error(getErrorMessage(saveError, "เพิ่มผู้ใช้ไม่สำเร็จ"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveRoles() {
    if (!roleModalUser) return;
    if (selectedRoleCodes.length === 0) {
      toast.error("ต้องเลือก Role อย่างน้อย 1 รายการ");
      return;
    }
    try {
      setSubmitting(true);
      await apiFetch<UserListItem>(`/users/${roleModalUser.id}/roles`, {
        method: "PATCH",
        body: JSON.stringify({ roleCodes: selectedRoleCodes }),
      });
      toast.success("อัปเดต Role สำเร็จ");
      setRoleModalUser(null);
      setSelectedRoleCodes([]);
      await loadUsers();
    } catch (saveError) {
      toast.error(getErrorMessage(saveError, "อัปเดต Role ไม่สำเร็จ"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveEmployeeLink() {
    if (!linkModalUser) return;
    if (!selectedEmployeeId) {
      toast.error("กรุณาเลือกพนักงาน");
      return;
    }
    try {
      setSubmitting(true);
      await apiFetch<UserListItem>(`/users/${linkModalUser.id}/link-employee`, {
        method: "PATCH",
        body: JSON.stringify({ employeeId: selectedEmployeeId }),
      });
      toast.success("ผูกผู้ใช้กับพนักงานสำเร็จ");
      setLinkModalUser(null);
      setSelectedEmployeeId("");
      await loadUsers();
    } catch (saveError) {
      toast.error(getErrorMessage(saveError, "ผูกพนักงานไม่สำเร็จ"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveEmail() {
    if (!emailModalUser) return;
    const email = emailForm.email.trim().toLowerCase();
    const confirmEmail = emailForm.confirmEmail.trim().toLowerCase();

    if (!isValidEmail(email)) {
      toast.error("รูปแบบอีเมลไม่ถูกต้อง");
      return;
    }
    if (email !== confirmEmail) {
      toast.error("อีเมลและอีเมลยืนยันไม่ตรงกัน");
      return;
    }
    if (email === emailModalUser.email.toLowerCase()) {
      toast.error("อีเมลใหม่ต้องไม่ซ้ำกับอีเมลเดิม");
      return;
    }

    try {
      setSubmitting(true);
      await apiFetch<UserListItem>(`/users/${emailModalUser.id}/email`, {
        method: "PATCH",
        body: JSON.stringify({
          email,
          syncEmployeeEmail: emailForm.syncEmployeeEmail,
        }),
      });
      toast.success("อัปเดตอีเมลและยกเลิก session เดิมของผู้ใช้นี้แล้ว");
      setEmailModalUser(null);
      setEmailForm(defaultUpdateEmailForm);
      await loadUsers();
    } catch (saveError) {
      toast.error(getErrorMessage(saveError, "อัปเดตอีเมลไม่สำเร็จ"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword() {
    if (!passwordModalUser) return;
    const expectedConfirmText = getSensitiveConfirmText(passwordModalUser);
    const passwordValidationError = getPasswordValidationError(
      passwordForm.newPassword,
      passwordModalUser,
    );

    if (passwordValidationError) {
      toast.error(passwordValidationError);
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("รหัสผ่านและรหัสผ่านยืนยันไม่ตรงกัน");
      return;
    }
    if (passwordForm.confirmTarget.trim() !== expectedConfirmText) {
      toast.error("ข้อความยืนยันผู้ใช้ไม่ถูกต้อง");
      return;
    }

    try {
      setSubmitting(true);
      await apiFetch<UserListItem>(`/users/${passwordModalUser.id}/password`, {
        method: "PATCH",
        body: JSON.stringify({ newPassword: passwordForm.newPassword }),
      });
      toast.success("รีเซ็ตรหัสผ่านและยกเลิก session เดิมของผู้ใช้นี้แล้ว");
      setPasswordModalUser(null);
      setPasswordForm(defaultResetPasswordForm);
      await loadUsers();
    } catch (saveError) {
      toast.error(getErrorMessage(saveError, "รีเซ็ตรหัสผ่านไม่สำเร็จ"));
    } finally {
      setSubmitting(false);
    }
  }

  function confirmUnlinkEmployee(user: UserListItem) {
    setActionDialog({
      title: "ยกเลิกการผูกพนักงาน",
      description: `ต้องการยกเลิกการผูกพนักงานของ ${getUserDisplayName(user)} หรือไม่`,
      confirmLabel: "ยกเลิกการผูก",
      tone: "orange",
      onConfirm: async () => {
        await apiFetch<UserListItem>(`/users/${user.id}/unlink-employee`, {
          method: "PATCH",
          body: JSON.stringify({}),
        });
        toast.success("ยกเลิกการผูกพนักงานสำเร็จ");
        await loadUsers();
      },
    });
  }

  function confirmDeactivateUser(user: UserListItem) {
    setActionDialog({
      title: "ปิดใช้งานผู้ใช้",
      description: `ต้องการปิดใช้งานผู้ใช้ ${getUserDisplayName(user)} หรือไม่`,
      confirmLabel: "ปิดใช้งาน",
      tone: "red",
      onConfirm: async () => {
        await apiFetch<UserListItem>(`/users/${user.id}`, { method: "DELETE" });
        toast.success("ปิดใช้งานผู้ใช้สำเร็จ");
        await loadUsers();
      },
    });
  }

  function openCreateModal() {
    setCreateForm(defaultCreateForm);
    setCreateEmployee(null);
    setCreateOpen(true);
  }
  function openRoleModal(user: UserListItem) {
    setRoleModalUser(user);
    setSelectedRoleCodes(user.roles.map((role) => role.code));
  }
  function openLinkModal(user: UserListItem) {
    setLinkModalUser(user);
    setSelectedEmployeeId(user.employee?.id ?? "");
  }
  function openEmailModal(user: UserListItem) {
    setEmailModalUser(user);
    setEmailForm({
      email: user.email,
      confirmEmail: "",
      syncEmployeeEmail: Boolean(user.employee),
    });
  }
  function openPasswordModal(user: UserListItem) {
    setPasswordModalUser(user);
    setPasswordForm(defaultResetPasswordForm);
  }

  function handleCreateEmployeeChange(
    employeeId: string,
    employee: PickerEmployee | null,
  ) {
    setCreateEmployee(employee);
    setCreateForm((current) => ({
      ...current,
      employeeId,
      email: employee?.email || current.email,
    }));
  }
  function toggleCreateRole(roleCode: string) {
    setCreateForm((current) => ({
      ...current,
      roleCodes: toggleValue(current.roleCodes, roleCode),
    }));
  }
  function toggleAssignRole(roleCode: string) {
    setSelectedRoleCodes((current) => toggleValue(current, roleCode));
  }

  /* ---------------------------------------------------------------- */

  const columns: Array<Column<UserListItem>> = [
    {
      key: "user",
      header: "ผู้ใช้งาน",
      width: "w-[24%]",
      cell: (user) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={getUserDisplayName(user)} size="lg" />
          <div className="min-w-0">
            <p className="break-words text-[13.5px] font-bold text-slate-900 3xl:text-[14.5px] 4xl:text-[15px]">
              {getUserDisplayName(user)}
            </p>
            <p className="truncate text-[12px] text-brand-600 3xl:text-[13px]">
              {user.email || "ยังไม่มีอีเมล"}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "employee",
      header: "พนักงาน / แผนก",
      hideBelow: "lg",
      cell: (user) =>
        user.employee ? (
          /*
           * โครงสองบรรทัดชุดเดียวกับคอลัมน์ "สังกัด" ในหน้าทะเบียนพนักงาน
           * บรรทัดบน = ใครและอยู่บริษัทไหน · บรรทัดล่าง = อยู่ตรงไหนขององค์กร
           *
           * ต้องมีชื่อสาขาด้วย เพราะบริษัทเดียวมีหลายสาขาและพนักงานชื่อซ้ำกันได้
           * ถ้าเห็นแค่บริษัทกับแผนกจะแยกไม่ออกว่าเป็นคนของสาขาไหน
           */
          <div className="min-w-0">
            <p className="truncate">
              <span className="font-bold text-brand-700">
                {user.employee.employeeCode}
              </span>
              <span className="text-slate-400"> · </span>
              <span className="font-semibold text-slate-700">
                {user.employee.company?.nameTh ?? "-"}
              </span>
            </p>
            <p className="truncate text-[11px] text-slate-400 3xl:text-[12px]">
              {[
                user.employee.branch?.nameTh,
                user.employee.department?.nameTh ??
                  user.employee.division?.nameTh,
                user.employee.position,
              ]
                .filter(Boolean)
                .join(" · ") || "-"}
            </p>
          </div>
        ) : (
          <span className="text-amber-600">ยังไม่ผูกพนักงาน</span>
        ),
    },
    {
      key: "roles",
      header: "บทบาทและขอบเขต",
      width: "w-[20rem]",
      cell: (user) => (
        <div className="min-w-0">
          {/*
           * ผู้ใช้บางคนมี 4-5 บทบาท ป้ายทั้งชุดจะตกบรรทัดจนแถวสูงกว่าแถวอื่นสองเท่า
           * โชว์สองอันแรกแล้วยุบที่เหลือเป็น +N ทุกแถวจึงสูงเท่ากัน
           * (ชื่อเต็มของบทบาทที่ยุบไว้อยู่ใน title ให้ชี้ดูได้ และกดจัดการบทบาทเห็นครบอยู่แล้ว)
           */}
          <div className="flex items-center gap-1 overflow-hidden">
            {user.roles.length === 0 ? (
              <span className="text-slate-300">ยังไม่มีบทบาท</span>
            ) : (
              <>
                {user.roles.slice(0, 2).map((role) => (
                  <span
                    key={role.id}
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold 3xl:text-[12px]",
                      ROLE_TONE[role.code] ?? ROLE_TONE_DEFAULT,
                    )}
                  >
                    {role.code}
                  </span>
                ))}
                {user.roles.length > 2 ? (
                  <span
                    title={user.roles
                      .slice(2)
                      .map((role) => role.code)
                      .join(" · ")}
                    className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 3xl:text-[12px]"
                  >
                    +{user.roles.length - 2}
                  </span>
                ) : null}
              </>
            )}
          </div>
          {/* ขอบเขตเป็นบรรทัดรองตัวเล็ก ไม่ใช้ป้ายกลม ไม่งั้นคอลัมน์แคบแล้วตกบรรทัดจนรก */}
          <p className="mt-0.5 truncate text-[11px] text-slate-400 3xl:text-[12px]">
            {scopeLabel(user.scope)}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "สถานะ",
      width: "w-[10rem]",
      cell: (user) => (
        <div className="min-w-0">
          <UserStatusBadge status={user.status} />
          <p className="mt-1 truncate text-[11px] text-slate-400 3xl:text-[12px]">
            เข้าใช้ล่าสุด <DateTimeDisplay value={user.lastLoginAt} />
          </p>
        </div>
      ),
    },
    {
      key: "actions",
      header: "จัดการ",
      align: "right",
      width: "w-[6rem]",
      cell: (user) => (
        <RowMenu
          items={[
            {
              label: "จัดการบทบาท",
              icon: <Pencil className="h-4 w-4" />,
              onSelect: () => openRoleModal(user),
            },
            {
              label: "แก้ไขอีเมล",
              icon: <AtSign className="h-4 w-4" />,
              onSelect: () => openEmailModal(user),
            },
            {
              label: "รีเซ็ตรหัสผ่าน",
              icon: <KeyRound className="h-4 w-4" />,
              onSelect: () => openPasswordModal(user),
            },
            {
              label: user.employee ? "เปลี่ยนพนักงานที่ผูก" : "ผูกพนักงาน",
              icon: <Link2 className="h-4 w-4" />,
              onSelect: () => openLinkModal(user),
            },
            ...(user.employee
              ? [
                  {
                    label: "ยกเลิกการผูกพนักงาน",
                    icon: <Unlink className="h-4 w-4" />,
                    onSelect: () => confirmUnlinkEmployee(user),
                  },
                ]
              : []),
            {
              label: "ปิดใช้งานผู้ใช้",
              icon: <Trash2 className="h-4 w-4" />,
              tone: "danger" as const,
              separated: true,
              onSelect: () => confirmDeactivateUser(user),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      {/* ตัวกรองอยู่แถวเดียวกับช่องค้นหา เหมือนหน้าค่าจ้างพนักงาน */}
      <div className="flex flex-col gap-3 border-b border-slate-300 bg-slate-50/70 px-5 py-3 sm:px-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as "" | UserStatus)
            }
            className="w-full bg-white sm:w-40"
            aria-label="สถานะ"
          >
            {statusOptions.map((option) => (
              <option key={option.value || "ALL"} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <Select
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
            className="w-full bg-white sm:w-44"
            aria-label="สาขา"
          >
            <option value="">ทุกสาขา</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.nameTh || branch.nameEn || branch.code}
              </option>
            ))}
          </Select>

          <Select
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
            className="w-full bg-white sm:w-48"
            aria-label="แผนก"
          >
            <option value="">ทุกแผนก</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.nameTh || department.nameEn || department.code}
              </option>
            ))}
          </Select>

          {activeFilterCount > 0 ? (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700 underline-offset-2 hover:underline"
            >
              <X className="h-3.5 w-3.5" />
              ล้างตัวกรอง {activeFilterCount}
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-3 xl:shrink-0">
          <p className="hidden whitespace-nowrap text-[12px] text-slate-500 sm:block 3xl:text-[13px]">
            {activeFilterCount > 0
              ? `เจอ ${users.length.toLocaleString("th-TH")} จาก ${totalUsers.toLocaleString("th-TH")} บัญชี`
              : `ทั้งหมด ${totalUsers.toLocaleString("th-TH")} บัญชี`}
          </p>

          <div className="[&_input]:bg-white">
            <SearchInput
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="ค้นหาชื่อ อีเมล รหัสพนักงาน"
              className="w-full sm:w-60"
              aria-label="ค้นหาผู้ใช้งาน"
            />
          </div>

          <IconButton
            title="โหลดข้อมูลใหม่"
            icon={
              loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )
            }
            onClick={refreshAll}
          />

          {/* ปุ่มหลักอยู่ท้ายแถบ ไม่ปนอยู่กลางกลุ่มตัวกรอง */}
          <Button
            icon={<Plus className="h-3.5 w-3.5" />}
            variant="primary"
            onClick={openCreateModal}
          >
            เพิ่มผู้ใช้
          </Button>
        </div>
      </div>

      {/* หัวคอลัมน์โทนเดียวกับหน้าค่าจ้างพนักงาน — แถวเยอะให้กดหน้าถัดไปเอา ไม่ทำเป็นพื้นที่เลื่อนซ้อน */}
      <div className="[&_thead]:bg-white [&_thead_th]:border-slate-300 [&_thead_th]:font-semibold [&_thead_th]:text-slate-600">
        <DataTable
          columns={columns}
          rows={users}
          rowKey={(user) => user.id}
          loading={loading}
          error={error || null}
          onRetry={() => loadUsers("initial")}
          groupBy={(user) => {
            const branchKey = attendanceBranchGroupKey(user.employee);
            const departmentKey = attendanceDepartmentGroupKey(user.employee);

            return [
              {
                key: branchKey,
                label: (
                  <AttendanceGroupHeading
                    level="branch"
                    title={
                      user.employee?.branch?.nameTh ||
                      user.employee?.company?.nameTh ||
                      "ยังไม่ผูกพนักงาน"
                    }
                    code={user.employee?.branch?.code}
                    employeeCount={groupUserCounts.get(branchKey)}
                  />
                ),
              },
              {
                key: departmentKey,
                label: (
                  <AttendanceGroupHeading
                    level="department"
                    title={user.employee?.department?.nameTh || "ไม่ระบุแผนก"}
                    code={user.employee?.department?.code}
                    employeeCount={groupUserCounts.get(departmentKey)}
                  />
                ),
              },
            ];
          }}
          emptyTitle="ไม่พบผู้ใช้งานตามเงื่อนไข"
          emptyDescription="ลองล้างตัวกรองหรือเปลี่ยนคำค้น"
          minWidth="min-w-[68rem]"
        />
      </div>

      {!loading && !error && users.length > 0 ? (
        <div className="flex items-center justify-between gap-3 px-5 py-3">
          <span className="text-[13px] text-slate-400">
            หน้า {meta?.page ?? page} จาก {meta?.totalPages ?? 1}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              disabled={page <= 1}
              onClick={() => {
                setPage(Math.max(page - 1, 1));
                scrollPagerToTop();
              }}
            >
              ก่อนหน้า
            </Button>
            <Button
              size="sm"
              disabled={meta ? page >= meta.totalPages : true}
              onClick={() => {
                setPage(page + 1);
                scrollPagerToTop();
              }}
            >
              ถัดไป
            </Button>
          </div>
        </div>
      ) : null}

      {/* ---------------- create modal ---------------- */}
      {createOpen ? (
        <Modal
          title="เพิ่มผู้ใช้งาน"
          subtitle="พนักงานเข้าระบบด้วยรหัสพนักงาน ส่วนบัญชีผู้ดูแลที่ไม่ผูกพนักงานเข้าด้วยอีเมล"
          onClose={() => setCreateOpen(false)}
        >
          <form onSubmit={handleCreateUser}>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {/*
                  ค้นหาที่เซิร์ฟเวอร์ กรองเฉพาะคนที่ยังไม่มีบัญชี (hasUser=false)
                  status="" = ทุกสถานะที่ยังทำงานอยู่ ไม่ใช่แค่ ACTIVE
                  เพราะพนักงานทดลองงานก็ต้องมีบัญชีเข้าแอปตั้งแต่วันแรก
                */}
                <Field
                  label="ผูกกับพนักงาน"
                  hint="เว้นว่าง = สร้างบัญชีผู้ดูแลบริษัทที่ไม่ผูกพนักงาน"
                >
                  <EmployeePicker
                    value={createForm.employeeId}
                    onChange={handleCreateEmployeeChange}
                    status=""
                    extraParams={{ hasUser: "false" }}
                    placeholder="พิมพ์รหัสหรือชื่อพนักงาน"
                    emptyText="ไม่พบพนักงานที่ยังไม่มีบัญชีตรงกับที่ค้นหา"
                  />
                </Field>

                {/*
                  บัญชีที่ไม่ผูกพนักงาน = ผู้ดูแลของบริษัทนี้เอง
                  ระบบใช้บริษัทของผู้สร้างเป็นขอบเขตให้อัตโนมัติ
                  ส่วนการเปิดบัญชีให้ "บริษัทอื่น" เป็นงานของ Platform Console
                */}
                {createForm.employeeId ? null : (
                  <FormInput
                    label="ชื่อที่แสดง"
                    value={createForm.displayName}
                    onChange={(value) =>
                      setCreateForm((current) => ({
                        ...current,
                        displayName: value,
                      }))
                    }
                    placeholder="เช่น ผู้ดูแลระบบของบริษัท"
                  />
                )}

                {/*
                  ผูกพนักงาน = เข้าระบบด้วยรหัสพนักงาน โชว์รหัสให้เห็นว่าจะใช้อะไรล็อกอิน
                  อีเมลกลายเป็นของแถม ไม่กรอกระบบตั้งอีเมลภายในให้เอง
                */}
                {createEmployee ? (
                  <Field
                    label="รหัสพนักงาน (ใช้เข้าสู่ระบบ)"
                    hint="พนักงานใช้รหัสนี้คู่กับรหัสผ่านเริ่มต้นเพื่อเข้าเว็บและแอป"
                  >
                    <TextInput
                      value={createEmployee.employeeCode ?? ""}
                      readOnly
                      className="bg-slate-50 font-mono"
                    />
                  </Field>
                ) : null}

                <FormInput
                  label={
                    createEmployee
                      ? "อีเมล (ไม่บังคับ)"
                      : "อีเมลเข้าสู่ระบบ"
                  }
                  value={createForm.email}
                  onChange={(value) =>
                    setCreateForm((current) => ({ ...current, email: value }))
                  }
                  placeholder="email@company.com"
                  hint={
                    createEmployee
                      ? "ถ้าเว้นว่าง ระบบตั้งอีเมลภายในให้อัตโนมัติ"
                      : undefined
                  }
                />

                <FormInput
                  label="รหัสผ่านเริ่มต้น"
                  type="password"
                  value={createForm.password}
                  onChange={(value) =>
                    setCreateForm((current) => ({
                      ...current,
                      password: value,
                    }))
                  }
                />
              </div>

              <RoleCheckboxes
                roles={activeRoles}
                selectedCodes={createForm.roleCodes}
                onToggle={toggleCreateRole}
              />
            </div>
            <ModalFooter
              submitting={submitting}
              submitText="สร้างผู้ใช้"
              onCancel={() => setCreateOpen(false)}
            />
          </form>
        </Modal>
      ) : null}

      {/* ---------------- role modal ---------------- */}
      {roleModalUser ? (
        <Modal
          title="จัดการ Role"
          subtitle={getUserDisplayName(roleModalUser)}
          onClose={() => setRoleModalUser(null)}
        >
          <div className="space-y-5">
            <RoleCheckboxes
              roles={activeRoles}
              selectedCodes={selectedRoleCodes}
              onToggle={toggleAssignRole}
            />
          </div>
          <ModalFooter
            submitting={submitting}
            submitText="บันทึก Role"
            onCancel={() => setRoleModalUser(null)}
            onSubmit={handleSaveRoles}
          />
        </Modal>
      ) : null}

      {/* ---------------- link modal ---------------- */}
      {linkModalUser ? (
        <Modal
          title="ผูกพนักงาน"
          subtitle={getUserDisplayName(linkModalUser)}
          onClose={() => setLinkModalUser(null)}
        >
          <div className="space-y-5">
            <Field label="เลือกพนักงาน">
              <EmployeePicker
                value={selectedEmployeeId}
                onChange={(id) => setSelectedEmployeeId(id)}
                status=""
                extraParams={{ hasUser: "false" }}
                placeholder="พิมพ์รหัสหรือชื่อพนักงาน"
                emptyText="ไม่พบพนักงานที่ยังไม่มีบัญชีตรงกับที่ค้นหา"
              />
            </Field>
          </div>
          <ModalFooter
            submitting={submitting}
            submitText="บันทึกการผูก"
            onCancel={() => setLinkModalUser(null)}
            onSubmit={handleSaveEmployeeLink}
          />
        </Modal>
      ) : null}

      {/* ---------------- email modal ---------------- */}
      {emailModalUser ? (
        <Modal
          title="แก้ไขอีเมล"
          subtitle={getUserDisplayName(emailModalUser)}
          onClose={() => {
            setEmailModalUser(null);
            setEmailForm(defaultUpdateEmailForm);
          }}
        >
          <div className="space-y-5">
            <SecurityWarning>
              การเปลี่ยนอีเมลจะเปลี่ยนอีเมลสำหรับเข้าสู่ระบบ และระบบจะยกเลิก
              session เดิมของผู้ใช้นี้ทันทีเพื่อความปลอดภัย
            </SecurityWarning>
            <FormInput
              label="อีเมลใหม่"
              value={emailForm.email}
              onChange={(value) =>
                setEmailForm((current) => ({ ...current, email: value }))
              }
              placeholder="employee@company.com"
            />
            <FormInput
              label="ยืนยันอีเมลใหม่อีกครั้ง"
              value={emailForm.confirmEmail}
              onChange={(value) =>
                setEmailForm((current) => ({
                  ...current,
                  confirmEmail: value,
                }))
              }
              placeholder="พิมพ์อีเมลใหม่ซ้ำอีกครั้ง"
            />
            {emailModalUser.employee ? (
              <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-brand-50/60 p-4 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={emailForm.syncEmployeeEmail}
                  onChange={(event) =>
                    setEmailForm((current) => ({
                      ...current,
                      syncEmployeeEmail: event.target.checked,
                    }))
                  }
                  className="mt-1 accent-sky-500"
                />
                <span>
                  <span className="font-semibold text-slate-800">
                    อัปเดตอีเมลในข้อมูลพนักงานที่ผูกอยู่ด้วย
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    แนะนำให้เปิดไว้ เพื่อให้อีเมลบัญชีและอีเมลพนักงานตรงกัน
                  </span>
                </span>
              </label>
            ) : null}
          </div>
          <ModalFooter
            submitting={submitting}
            submitText="บันทึกอีเมล"
            onCancel={() => {
              setEmailModalUser(null);
              setEmailForm(defaultUpdateEmailForm);
            }}
            onSubmit={handleSaveEmail}
          />
        </Modal>
      ) : null}

      {/* ---------------- password modal ---------------- */}
      {passwordModalUser ? (
        <Modal
          title="รีเซ็ตรหัสผ่าน"
          subtitle={getUserDisplayName(passwordModalUser)}
          onClose={() => {
            setPasswordModalUser(null);
            setPasswordForm(defaultResetPasswordForm);
          }}
        >
          <div className="space-y-5">
            <SecurityWarning>
              ระบบจะไม่บันทึกหรือแสดงรหัสผ่านเดิม และจะยกเลิก session
              เดิมของผู้ใช้นี้ทั้งหมดหลังรีเซ็ตสำเร็จ
            </SecurityWarning>
            <PasswordRules
              password={passwordForm.newPassword}
              user={passwordModalUser}
            />
            <FormInput
              label="รหัสผ่านใหม่"
              type="password"
              value={passwordForm.newPassword}
              onChange={(value) =>
                setPasswordForm((current) => ({
                  ...current,
                  newPassword: value,
                }))
              }
              placeholder="อย่างน้อย 10 ตัวอักษร"
            />
            <FormInput
              label="ยืนยันรหัสผ่านใหม่"
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(value) =>
                setPasswordForm((current) => ({
                  ...current,
                  confirmPassword: value,
                }))
              }
              placeholder="พิมพ์รหัสผ่านใหม่ซ้ำอีกครั้ง"
            />
            <FormInput
              label={`ยืนยันเป้าหมายโดยพิมพ์: ${getSensitiveConfirmText(passwordModalUser)}`}
              value={passwordForm.confirmTarget}
              onChange={(value) =>
                setPasswordForm((current) => ({
                  ...current,
                  confirmTarget: value,
                }))
              }
              placeholder="พิมพ์ข้อความยืนยันให้ตรงกัน"
            />
          </div>
          <ModalFooter
            submitting={submitting}
            submitText="รีเซ็ตรหัสผ่าน"
            onCancel={() => {
              setPasswordModalUser(null);
              setPasswordForm(defaultResetPasswordForm);
            }}
            onSubmit={handleResetPassword}
          />
        </Modal>
      ) : null}

      <ActionDialog
        state={actionDialog}
        onClose={() => setActionDialog(null)}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* small ui                                                            */
/* ------------------------------------------------------------------ */

function UserStatusBadge({ status }: { status: UserStatus }) {
  const tone =
    status === "ACTIVE"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "SUSPENDED"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-slate-200 bg-slate-50 text-slate-500";
  const dot =
    status === "ACTIVE"
      ? "bg-emerald-500"
      : status === "SUSPENDED"
        ? "bg-amber-500"
        : "bg-slate-400";
  const label =
    status === "ACTIVE"
      ? "เปิดใช้งาน"
      : status === "SUSPENDED"
        ? "ถูกระงับ"
        : "ปิดใช้งาน";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold 3xl:text-[12.5px]",
        tone,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}

/**
 * ขอบเขตของผู้ใช้แบบย่อ
 * ไม่ต้องซ้ำชื่อบริษัทเพราะคอลัมน์พนักงานบอกไว้แล้ว เหลือแค่ระดับกับสาขา
 */
function scopeLabel(scope?: UserListItem["scope"]) {
  if (!scope) return "ยังไม่กำหนดขอบเขต";
  if (scope.level === "GLOBAL") return "ทุกบริษัท";
  if (scope.level === "COMPANY") return "ทั้งบริษัท";
  return scope.branch?.nameTh
    ? `เฉพาะสาขา · ${scope.branch.nameTh}`
    : "เฉพาะสาขา";
}

function SecurityWarning({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function PasswordRules({
  password,
  user,
}: {
  password: string;
  user: UserListItem;
}) {
  const rules = getPasswordRules(password, user);
  return (
    <div className="rounded-lg border border-slate-200 bg-brand-50/50 p-4">
      <div className="text-sm font-bold text-slate-800">
        เงื่อนไขรหัสผ่านปลอดภัย
      </div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        {rules.map((rule) => (
          <div
            key={rule.label}
            className={cn(
              "rounded-xl border px-3 py-2",
              rule.valid
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-500",
            )}
          >
            {rule.valid ? "✓" : "•"} {rule.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function RoleCheckboxes({
  roles,
  selectedCodes,
  onToggle,
}: {
  roles: RoleListItem[];
  selectedCodes: string[];
  onToggle: (roleCode: string) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <p className="text-[12px] font-medium text-slate-600 3xl:text-[12.5px]">
          บทบาท
        </p>
        {selectedCodes.length ? (
          <p className="text-[11.5px] tabular-nums text-slate-400">
            เลือกไว้ {selectedCodes.length}
          </p>
        ) : null}
      </div>

      {/*
        รายการติ๊กบรรทัดเดียวต่อบทบาท เรียงสองคอลัมน์
        รหัสกับชื่อเต็มอยู่บรรทัดเดียวกัน เจ็ดบทบาทจึงสูงแค่สี่แถว
      */}
      <div className="grid gap-x-8 border-y border-brand-100 sm:grid-cols-2">
        {roles.map((role) => {
          const active = selectedCodes.includes(role.code);

          return (
            <label
              key={role.id}
              className="flex cursor-pointer items-center gap-2.5 border-b border-brand-50 py-2 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0"
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => onToggle(role.code)}
                className="h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-600"
              />
              <span className="flex min-w-0 flex-1 items-baseline gap-2">
                <span
                  className={cn(
                    "shrink-0 text-[12.5px] font-semibold 3xl:text-[13px]",
                    active ? "text-brand-700" : "text-slate-700",
                  )}
                >
                  {role.code}
                </span>
                <span className="truncate text-[11.5px] text-slate-400">
                  {role.name}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function Modal({
  title,
  subtitle,
  size = "default",
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  size?: "default" | "wide";
  children: ReactNode;
  onClose: () => void;
}) {
  // ใช้กล่องกลางของระบบ ปุ่มยืนยันอยู่ในฟอร์มด้านในเหมือนเดิม
  return (
    <KitModal
      open
      title={title}
      description={subtitle}
      size={size === "wide" ? "lg" : "md"}
      onClose={onClose}
    >
      {children}
    </KitModal>
  );
}

function ModalFooter({
  submitting,
  submitText,
  onCancel,
  onSubmit,
  disabled,
  tone,
}: {
  submitting: boolean;
  submitText: string;
  onCancel: () => void;
  onSubmit?: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <div className="flex justify-end gap-2 border-t border-brand-100 pt-4">
      <Button onClick={onCancel}>ยกเลิก</Button>
      <Button
        type={onSubmit ? "button" : "submit"}
        variant={tone === "danger" ? "danger" : "primary"}
        onClick={onSubmit}
        loading={submitting}
        disabled={disabled}
      >
        {submitText}
      </Button>
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
}) {
  /*
   * ช่องรหัสผ่านต้องเปิดดูได้ — ทุกช่องในหน้านี้คือการตั้งรหัสให้คนอื่น
   * (เปิดบัญชีใหม่ · รีเซ็ตรหัสให้พนักงาน) คนตั้งต้องอ่านออกเพื่อจดไปบอกเจ้าตัว
   * และต้องไม่ให้เบราว์เซอร์เติมรหัสของผู้ที่ล็อกอินอยู่มาใส่ให้เอง
   */
  if (type === "password") {
    return (
      <Field label={label} hint={hint}>
        <PasswordInput
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete="new-password"
        />
      </Field>
    );
  }

  return (
    <Field label={label} hint={hint}>
      <TextInput
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </Field>
  );
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function getUserDisplayName(user: UserListItem) {
  if (user.employee) return getEmployeeDisplayName(user.employee);
  return user.displayName || user.email;
}

function getEmployeeDisplayName(
  employee: EmployeeListItem | UserListItem["employee"] | null | undefined,
) {
  if (!employee) return "-";
  return (
    employee.displayName ||
    `${employee.title ?? ""}${employee.firstName} ${employee.lastName}`.trim()
  );
}

function toggleValue(list: string[], value: string) {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getSensitiveConfirmText(user: UserListItem) {
  return user.employee?.employeeCode || user.email;
}

function getPasswordRules(password: string, user: UserListItem) {
  const lowerPassword = password.toLowerCase();
  const forbiddenParts = [
    "password",
    "admin",
    "employee",
    "qwerty",
    "123456",
    user.email.split("@")[0],
    user.displayName,
    user.employee?.employeeCode,
    user.employee?.firstName,
    user.employee?.lastName,
  ]
    .map((part) => part?.trim().toLowerCase())
    .filter((part): part is string => Boolean(part && part.length >= 4));

  return [
    { label: "อย่างน้อย 10 ตัวอักษร", valid: password.length >= 10 },
    { label: "ตัวพิมพ์เล็ก", valid: /[a-z]/.test(password) },
    { label: "ตัวพิมพ์ใหญ่", valid: /[A-Z]/.test(password) },
    { label: "ตัวเลข", valid: /\d/.test(password) },
    {
      label: "ไม่ใช้คำเดาง่ายหรือข้อมูลส่วนตัว",
      valid: !forbiddenParts.some((part) => lowerPassword.includes(part)),
    },
    {
      label: "ไม่มีช่องว่าง",
      valid: password.length === 0 || !/\s/.test(password),
    },
  ];
}

function getPasswordValidationError(password: string, user: UserListItem) {
  if (password !== password.trim() || /\s/.test(password))
    return "รหัสผ่านต้องไม่มีช่องว่าง";
  const failedRule = getPasswordRules(password, user).find(
    (rule) => !rule.valid,
  );
  return failedRule ? `รหัสผ่านไม่ปลอดภัย: ${failedRule.label}` : "";
}

function getErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiClientError) return error.message;
  return fallbackMessage;
}
