"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  FileText,
  Hourglass,
  IdCard,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  Avatar,
  Button,
  ButtonLink,
  Field,
  FieldGrid,
  Modal,
  ModalActions,
  PageChip,
  PageHeading,
  PageSurface,
  Select,
  StatTile,
  Tabs,
  TextInput,
  Textarea,
  type TabItem,
} from "@/components/kit";
import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import { LoadingState } from "@/components/common/feedback-state";
import { ThaiDateInput } from "@/components/common/thai-date-input";
import { StatusBadge } from "@/components/ui/status-badge";
import { EMPLOYEE_STATUS } from "@/lib/status-labels";
import {
  ApiClientError,
  apiFetch,
  apiFetchBlob,
  apiFetchWithMeta,
  getAttendanceDailySummaries,
  getCompanyPayrollSetting,
  createEmployeeCompensation,
  getEmployeeCompensations,
  getLeaveRequests,
  getOvertimeRequests,
  getPublicFileUrl,
} from "@/lib/api";
import { getPayrollCompensationItems } from "@/lib/payroll-extensions-api";
import type { EmployeeCompensationItem } from "@/types/payroll-extensions";
import type {
  AttendanceDailySummary,
  AttendanceDailySummaryListSummary,
} from "@/types/attendance";
import type { LeaveRequest, LeaveRequestListSummary } from "@/types/leave";
import type {
  OvertimeRequest,
  OvertimeRequestListSummary,
} from "@/types/overtime";
import type { EmployeeCompensation } from "@/types/payroll";
import type { PayrollCutoffPolicy } from "@/lib/payroll-period-range";
import type {
  CreateEmployeeForm,
  CreateEmployeeResignationForm,
  EmployeeDetail,
  EmployeeDocumentItem,
  EmployeeDocumentStatus,
  EmployeeDocumentType,
  EmployeeListItem,
  EmployeeListResponse,
  EmployeeStatus,
  OrganizationOption,
  PaginationMeta,
  ResignationStatus,
  UploadEmployeeDocumentForm,
} from "@/types/employee";

import { ActivityTab } from "./_components/activity-tab";
import { DocumentsTab } from "./_components/documents-tab";
import { EditEmployeeModal } from "./_components/edit-employee-modal";
import {
  countText,
  dateText,
  employeeNameOf,
  pickCurrentCompensation,
  tenureText,
  textOf,
} from "./_components/employee-format";
import { OverviewTab } from "./_components/overview-tab";
import { PayrollTab } from "./_components/payroll-tab";
import { ProfileTab } from "./_components/profile-tab";
import {
  HistoryTab,
  ProbationTab,
  ResignationTab,
} from "./_components/record-tabs";

/**
 * รายละเอียดพนักงาน
 * -----------------
 * ผืนขาวผืนเดียวเหมือนหน้า /payroll/[periodId] — หัวเรื่องคือตัวพนักงาน
 * แล้วแบ่งเรื่องด้วยแท็บ ไม่ใช่การ์ดลอยซ้อนกัน
 *
 * ข้อมูลกิจกรรม (ลงเวลา/ลา/OT) และค่าตอบแทนโหลดแยกกัน เพราะแต่ละอันมีสิทธิ์ของตัวเอง
 * ถ้าอันไหนโดน 403 ให้แท็บนั้นบอกว่าไม่มีสิทธิ์ แทนที่จะทำทั้งหน้าพัง
 */

type DetailTab =
  | "overview"
  | "profile"
  | "probation"
  | "attendance"
  | "leave"
  | "overtime"
  | "payroll"
  | "documents"
  | "history"
  | "resignation";

const TILE_BOX =
  "grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-[repeat(4,minmax(9.5rem,max-content))] sm:divide-y-0";

/** โหลดกิจกรรมล่าสุดมาก้อนเดียว แล้วแบ่งหน้าฝั่งหน้าเว็บ */
const ACTIVITY_FETCH_SIZE = 50;

const DOCUMENT_TYPE_OPTIONS: Array<{
  value: EmployeeDocumentType;
  label: string;
}> = [
  { value: "EMPLOYMENT_CONTRACT", label: "สัญญาจ้าง" },
  { value: "ID_CARD", label: "สำเนาบัตรประชาชน" },
  { value: "HOUSE_REGISTRATION", label: "ทะเบียนบ้าน" },
  { value: "EDUCATION_CERTIFICATE", label: "วุฒิการศึกษา" },
  { value: "BANK_BOOK", label: "สมุดบัญชีธนาคาร" },
  { value: "MEDICAL_CERTIFICATE", label: "ใบรับรองแพทย์" },
  { value: "WORK_PERMIT", label: "ใบอนุญาตทำงาน" },
  { value: "OTHER", label: "เอกสารอื่น ๆ" },
];

const DOCUMENT_STATUS_OPTIONS: Array<{
  value: EmployeeDocumentStatus;
  label: string;
}> = [
  { value: "ACTIVE", label: "ใช้งาน" },
  { value: "EXPIRED", label: "หมดอายุ" },
  { value: "REPLACED", label: "ถูกแทนที่" },
];

const ALLOWED_DOCUMENT_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

const defaultDocumentForm: UploadEmployeeDocumentForm = {
  type: "EMPLOYMENT_CONTRACT",
  title: "",
  description: "",
  issuedDate: "",
  expiredDate: "",
  status: "ACTIVE",
};

const defaultResignationForm: CreateEmployeeResignationForm = {
  resignationDate: new Date().toISOString().slice(0, 10),
  effectiveDate: "",
  reason: "",
  note: "",
};

function errorText(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function notifyError(error: unknown, fallback: string) {
  toast.error(errorText(error, fallback));
}

export default function EmployeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const employeeId = String(params?.id ?? "");

  const [employee, setEmployee] = useState<EmployeeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(
    null,
  );

  const [tab, setTab] = useState<DetailTab>("overview");

  const [compensations, setCompensations] = useState<EmployeeCompensation[]>(
    [],
  );
  /* เบี้ยประจำอยู่ที่ "รายการประจำ" ไม่ได้อยู่ในใบเงินเดือน จึงต้องโหลดคู่กัน */
  const [compensationItems, setCompensationItems] = useState<
    EmployeeCompensationItem[]
  >([]);
  const [compensationLoading, setCompensationLoading] = useState(true);
  const [compensationDenied, setCompensationDenied] = useState(false);

  /* วันตัดรอบของบริษัท ใช้ยุบประวัติลงเวลาเป็นรายงวดเงินเดือน */
  const [payrollPolicy, setPayrollPolicy] =
    useState<PayrollCutoffPolicy | null>(null);

  const [attendanceItems, setAttendanceItems] = useState<
    AttendanceDailySummary[]
  >([]);
  const [attendanceSummary, setAttendanceSummary] =
    useState<AttendanceDailySummaryListSummary | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [attendanceDenied, setAttendanceDenied] = useState(false);

  const [leaveItems, setLeaveItems] = useState<LeaveRequest[]>([]);
  const [leaveSummary, setLeaveSummary] =
    useState<LeaveRequestListSummary | null>(null);
  const [leaveLoading, setLeaveLoading] = useState(true);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [leaveDenied, setLeaveDenied] = useState(false);

  const [overtimeItems, setOvertimeItems] = useState<OvertimeRequest[]>([]);
  const [overtimeSummary, setOvertimeSummary] =
    useState<OvertimeRequestListSummary | null>(null);
  const [overtimeLoading, setOvertimeLoading] = useState(true);
  const [overtimeError, setOvertimeError] = useState<string | null>(null);
  const [overtimeDenied, setOvertimeDenied] = useState(false);

  const [companies, setCompanies] = useState<OrganizationOption[]>([]);
  const [branches, setBranches] = useState<OrganizationOption[]>([]);
  const [departments, setDepartments] = useState<OrganizationOption[]>([]);
  const [divisions, setDivisions] = useState<OrganizationOption[]>([]);
  const [employeeTypes, setEmployeeTypes] = useState<OrganizationOption[]>([]);
  const [positions, setPositions] = useState<OrganizationOption[]>([]);
  const [supervisors, setSupervisors] = useState<EmployeeListItem[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<CreateEmployeeForm | null>(null);

  const [documentOpen, setDocumentOpen] = useState(false);
  const [documentForm, setDocumentForm] =
    useState<UploadEmployeeDocumentForm>(defaultDocumentForm);
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  const [resignationOpen, setResignationOpen] = useState(false);
  const [resignationForm, setResignationForm] =
    useState<CreateEmployeeResignationForm>(defaultResignationForm);

  const [photoOpen, setPhotoOpen] = useState(false);

  const employeeName = employee ? employeeNameOf(employee) : "-";
  const currentCompensation = useMemo(
    () => pickCurrentCompensation(compensations),
    [compensations],
  );

  const avatarUrl = getPublicFileUrl(employee?.user?.avatarUrl ?? null);

  async function loadEmployee() {
    try {
      setLoading(true);
      setNotFound(false);

      const result = await apiFetch<EmployeeDetail>(`/employees/${employeeId}`);
      setEmployee(result);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) {
        setNotFound(true);
      } else {
        notifyError(error, "โหลดข้อมูลพนักงานไม่สำเร็จ");
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadCompensations() {
    try {
      setCompensationLoading(true);
      setCompensationDenied(false);

      const result = await getEmployeeCompensations({
        employeeId,
        page: 1,
        pageSize: 20,
      });

      setCompensations(result.data ?? []);

      /*
       * รายการประจำมีสิทธิ์คนละชุดกับใบเงินเดือน ถ้าดึงไม่ได้ก็ยังต้องเห็นฐาน
       * เงินเดือน จึงกลืนความผิดพลาดตรงนี้ไว้แทนการทำให้ทั้งแท็บพัง
       */
      try {
        const items = await getPayrollCompensationItems({
          employeeId,
          page: 1,
          pageSize: 200,
        });
        setCompensationItems(items.items ?? []);
      } catch {
        setCompensationItems([]);
      }
    } catch (error) {
      setCompensations([]);
      setCompensationItems([]);

      if (error instanceof ApiClientError && error.status === 403) {
        setCompensationDenied(true);
        return;
      }

      notifyError(error, "โหลดข้อมูลค่าตอบแทนไม่สำเร็จ");
    } finally {
      setCompensationLoading(false);
    }
  }

  /*
   * วันตัดรอบของบริษัท — ใช้ยุบประวัติลงเวลาเป็นรายงวด
   * ดึงไม่ได้ก็ไม่เป็นไร ตารางจะใช้ค่ากลางของระบบ (26 → 25) แทน
   */
  const policyCompanyId = employee?.companyId;

  useEffect(() => {
    if (!policyCompanyId) return;

    let cancelled = false;

    void (async () => {
      try {
        const setting = await getCompanyPayrollSetting(policyCompanyId);
        if (!cancelled) setPayrollPolicy(setting);
      } catch {
        /* ใช้ค่ากลางของระบบแทน */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [policyCompanyId]);

  async function loadAttendance() {
    try {
      setAttendanceLoading(true);
      setAttendanceDenied(false);
      setAttendanceError(null);

      const result = await getAttendanceDailySummaries({
        employeeId,
        page: 1,
        pageSize: ACTIVITY_FETCH_SIZE,
      });

      setAttendanceItems(result.items ?? []);
      setAttendanceSummary(result.summary ?? null);
    } catch (error) {
      setAttendanceItems([]);
      setAttendanceSummary(null);

      if (error instanceof ApiClientError && error.status === 403) {
        setAttendanceDenied(true);
        return;
      }

      setAttendanceError(errorText(error, "โหลดข้อมูลการลงเวลาไม่สำเร็จ"));
    } finally {
      setAttendanceLoading(false);
    }
  }

  async function loadLeaves() {
    try {
      setLeaveLoading(true);
      setLeaveDenied(false);
      setLeaveError(null);

      const result = await getLeaveRequests({
        employeeId,
        page: 1,
        pageSize: ACTIVITY_FETCH_SIZE,
      });

      setLeaveItems(result.items ?? []);
      setLeaveSummary(result.summary ?? null);
    } catch (error) {
      setLeaveItems([]);
      setLeaveSummary(null);

      if (error instanceof ApiClientError && error.status === 403) {
        setLeaveDenied(true);
        return;
      }

      setLeaveError(errorText(error, "โหลดข้อมูลการลาไม่สำเร็จ"));
    } finally {
      setLeaveLoading(false);
    }
  }

  async function loadOvertime() {
    try {
      setOvertimeLoading(true);
      setOvertimeDenied(false);
      setOvertimeError(null);

      const result = await getOvertimeRequests({
        employeeId,
        page: 1,
        pageSize: ACTIVITY_FETCH_SIZE,
      });

      setOvertimeItems(result.items ?? []);
      setOvertimeSummary(result.summary ?? null);
    } catch (error) {
      setOvertimeItems([]);
      setOvertimeSummary(null);

      if (error instanceof ApiClientError && error.status === 403) {
        setOvertimeDenied(true);
        return;
      }

      setOvertimeError(errorText(error, "โหลดข้อมูล OT ไม่สำเร็จ"));
    } finally {
      setOvertimeLoading(false);
    }
  }

  async function loadMasterData() {
    try {
      const [
        companyResult,
        branchResult,
        departmentResult,
        divisionResult,
        typeResult,
        positionResult,
        supervisorResult,
      ] = await Promise.all([
        apiFetchWithMeta<OrganizationOption[], PaginationMeta>(
          "/organization/companies?pageSize=100",
        ),
        apiFetchWithMeta<OrganizationOption[], PaginationMeta>(
          "/organization/branches?pageSize=100",
        ),
        apiFetchWithMeta<OrganizationOption[], PaginationMeta>(
          "/organization/departments?pageSize=100",
        ),
        apiFetchWithMeta<OrganizationOption[], PaginationMeta>(
          "/organization/divisions?pageSize=100",
        ),
        apiFetchWithMeta<OrganizationOption[], PaginationMeta>(
          "/organization/employee-types?pageSize=100",
        ),
        apiFetchWithMeta<OrganizationOption[], PaginationMeta>(
          "/organization/positions?pageSize=100",
        ),
        apiFetch<EmployeeListResponse>(
          "/employees?page=1&pageSize=100&status=ACTIVE",
        ),
      ]);

      setCompanies(companyResult.data);
      setBranches(branchResult.data);
      setDepartments(departmentResult.data);
      setDivisions(divisionResult.data);
      setEmployeeTypes(typeResult.data);
      setPositions(positionResult.data);
      setSupervisors(supervisorResult.items ?? []);
    } catch (error) {
      notifyError(error, "โหลดข้อมูลตั้งต้นไม่สำเร็จ");
    }
  }

  /*
   * ยิงโหลดนอกจังหวะ render (เหมือนหน้า /payroll)
   * ถ้าเรียกตรง ๆ ในเอฟเฟกต์ setLoading จะทำให้เกิด render ซ้อนตั้งแต่รอบแรก
   */
  useEffect(() => {
    if (!employeeId) return;

    const timer = window.setTimeout(() => {
      void loadEmployee();
      void loadMasterData();
      void loadCompensations();
      void loadAttendance();
      void loadLeaves();
      void loadOvertime();
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  function openEditModal() {
    if (!employee) return;

    const profile = employee.profile;

    setEditForm({
      employeeCode: employee.employeeCode,
      title: employee.title ?? "",
      firstName: employee.firstName,
      lastName: employee.lastName,
      nickname: employee.nickname ?? "",
      displayName: employee.displayName ?? "",
      email: employee.email ?? "",
      phone: employee.phone ?? "",
      position: employee.position ?? employee.positionMaster?.nameTh ?? "",
      positionId: employee.positionId ?? "",
      supervisorId: employee.supervisorId ?? "",
      startDate: employee.startDate.slice(0, 10),
      probationEndDate: employee.probationEndDate?.slice(0, 10) ?? "",
      status: employee.status,

      companyId: employee.companyId,
      branchId: employee.branchId ?? "",
      departmentId: employee.departmentId ?? "",
      divisionId: employee.divisionId ?? "",
      employeeTypeId: employee.employeeTypeId ?? "",

      profile: {
        gender: profile?.gender ?? "NOT_SPECIFIED",
        birthDate: profile?.birthDate?.slice(0, 10) ?? "",
        nationalId: profile?.nationalId ?? "",
        passportNo: profile?.passportNo ?? "",
        maritalStatus: profile?.maritalStatus ?? "NOT_SPECIFIED",
        nationality: profile?.nationality ?? "ไทย",
        religion: profile?.religion ?? "",

        currentAddress: profile?.currentAddress ?? "",
        registeredAddress: profile?.registeredAddress ?? "",

        emergencyContactName: profile?.emergencyContactName ?? "",
        emergencyContactPhone: profile?.emergencyContactPhone ?? "",
        emergencyContactRelation: profile?.emergencyContactRelation ?? "",
        emergencyContactName2: profile?.emergencyContactName2 ?? "",
        emergencyContactPhone2: profile?.emergencyContactPhone2 ?? "",
        emergencyContactRelation2: profile?.emergencyContactRelation2 ?? "",

        educationLevel: profile?.educationLevel ?? "",
        educationInstitute: profile?.educationInstitute ?? "",
        educationMajor: profile?.educationMajor ?? "",

        bankName: profile?.bankName ?? "",
        bankAccountNo: profile?.bankAccountNo ?? "",
        bankAccountName: profile?.bankAccountName ?? "",

        firstNameEn: profile?.firstNameEn ?? "",
        lastNameEn: profile?.lastNameEn ?? "",

        personalEmail: profile?.personalEmail ?? "",
        workPhoneExt: profile?.workPhoneExt ?? "",
        lineId: profile?.lineId ?? "",
        bloodType: profile?.bloodType ?? "",

        taxId: profile?.taxId ?? "",
        socialSecurityNo: profile?.socialSecurityNo ?? "",
        socialSecurityHospital: profile?.socialSecurityHospital ?? "",
        providentFundNo: profile?.providentFundNo ?? "",
        payrollPaymentMethod: profile?.payrollPaymentMethod ?? "",

        contractNo: profile?.contractNo ?? "",
        contractStartDate: profile?.contractStartDate?.slice(0, 10) ?? "",
        contractEndDate: profile?.contractEndDate?.slice(0, 10) ?? "",
        workLocation: profile?.workLocation ?? "",

        workPermitNo: profile?.workPermitNo ?? "",
        workPermitExpiredDate:
          profile?.workPermitExpiredDate?.slice(0, 10) ?? "",
        visaNo: profile?.visaNo ?? "",
        visaExpiredDate: profile?.visaExpiredDate?.slice(0, 10) ?? "",

        emergencyContactAddress: profile?.emergencyContactAddress ?? "",
        emergencyContactAddress2: profile?.emergencyContactAddress2 ?? "",

        note: profile?.note ?? "",
      },
    });

    setEditOpen(true);
  }

  async function handleUpdateEmployee() {
    if (!employee || !editForm) return;

    if (!editForm.employeeCode.trim()) {
      toast.error("กรุณากรอกรหัสพนักงาน");
      return;
    }

    if (!editForm.firstName.trim() || !editForm.lastName.trim()) {
      toast.error("กรุณากรอกชื่อและนามสกุล");
      return;
    }

    if (!editForm.companyId) {
      toast.error("กรุณาเลือกบริษัท");
      return;
    }

    if (!editForm.startDate) {
      toast.error("กรุณาเลือกวันที่เริ่มงาน");
      return;
    }

    try {
      setSubmitting(true);

      await apiFetch<EmployeeDetail>(`/employees/${employee.id}`, {
        method: "PATCH",
        body: JSON.stringify(buildUpdatePayload(editForm)),
      });

      toast.success("แก้ไขข้อมูลพนักงานสำเร็จ");
      setEditOpen(false);
      setEditForm(null);
      await loadEmployee();
    } catch (error) {
      notifyError(error, "แก้ไขข้อมูลพนักงานไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  function confirmDeactivate() {
    if (!employee) return;

    setActionDialog({
      title: "ปิดใช้งานพนักงาน",
      description: `ต้องการปิดใช้งาน ${employeeName} หรือไม่ ข้อมูลจะยังอยู่ในระบบเพื่อตรวจสอบย้อนหลังได้`,
      confirmLabel: "ปิดใช้งาน",
      cancelLabel: "ยกเลิก",
      tone: "red",
      onConfirm: async () => {
        try {
          setSubmitting(true);

          await apiFetch(`/employees/${employee.id}`, { method: "DELETE" });

          toast.success("ปิดใช้งานพนักงานสำเร็จ");
          router.replace("/employees");
        } catch (error) {
          notifyError(error, "ปิดใช้งานพนักงานไม่สำเร็จ");
          throw error;
        } finally {
          setSubmitting(false);
        }
      },
    });
  }

  function closeDocumentModal() {
    setDocumentOpen(false);
    setDocumentForm(defaultDocumentForm);
    setDocumentFile(null);
  }

  async function handleUploadDocument() {
    if (!employee) return;

    if (!documentForm.title.trim()) {
      toast.error("กรุณากรอกชื่อเอกสาร");
      return;
    }

    if (!documentFile) {
      toast.error("กรุณาเลือกไฟล์เอกสาร");
      return;
    }

    try {
      setSubmitting(true);

      const formData = new FormData();

      formData.append("file", documentFile);
      formData.append("type", documentForm.type);
      formData.append("title", documentForm.title.trim());
      formData.append("status", documentForm.status);

      if (documentForm.description.trim()) {
        formData.append("description", documentForm.description.trim());
      }
      if (documentForm.issuedDate) {
        formData.append("issuedDate", documentForm.issuedDate);
      }
      if (documentForm.expiredDate) {
        formData.append("expiredDate", documentForm.expiredDate);
      }

      await apiFetch<EmployeeDocumentItem>(
        `/employees/${employee.id}/documents/upload`,
        { method: "POST", body: formData },
      );

      toast.success("อัปโหลดเอกสารสำเร็จ");
      closeDocumentModal();
      await loadEmployee();
      setTab("documents");
    } catch (error) {
      notifyError(error, "อัปโหลดเอกสารไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOpenDocument(document: EmployeeDocumentItem) {
    if (!employee) return;

    try {
      const blob = await apiFetchBlob(
        `/employees/${employee.id}/documents/${document.id}/download`,
      );

      const url = window.URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");

      window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      notifyError(error, "เปิดไฟล์เอกสารไม่สำเร็จ");
    }
  }

  async function handleDownloadDocument(document: EmployeeDocumentItem) {
    if (!employee) return;

    try {
      const blob = await apiFetchBlob(
        `/employees/${employee.id}/documents/${document.id}/download`,
      );

      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement("a");

      link.href = url;
      link.download = document.fileName || "employee-document";
      window.document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(url);
    } catch (error) {
      notifyError(error, "ดาวน์โหลดไฟล์เอกสารไม่สำเร็จ");
    }
  }

  function confirmDeleteDocument(document: EmployeeDocumentItem) {
    if (!employee) return;

    setActionDialog({
      title: "ลบเอกสาร",
      description: `ต้องการลบเอกสาร "${document.title}" หรือไม่`,
      confirmLabel: "ลบเอกสาร",
      cancelLabel: "ยกเลิก",
      tone: "red",
      onConfirm: async () => {
        try {
          setSubmitting(true);

          await apiFetch(`/employees/${employee.id}/documents/${document.id}`, {
            method: "DELETE",
          });

          toast.success("ลบเอกสารสำเร็จ");
          await loadEmployee();
          setTab("documents");
        } catch (error) {
          notifyError(error, "ลบเอกสารไม่สำเร็จ");
          throw error;
        } finally {
          setSubmitting(false);
        }
      },
    });
  }

  async function handleCreateResignation() {
    if (!employee) return;

    if (
      !resignationForm.resignationDate ||
      !resignationForm.effectiveDate ||
      !resignationForm.reason.trim()
    ) {
      toast.error("กรุณากรอกวันที่ยื่น วันที่มีผล และเหตุผล");
      return;
    }

    try {
      setSubmitting(true);

      await apiFetch(`/employees/${employee.id}/resignations`, {
        method: "POST",
        body: JSON.stringify({
          resignationDate: resignationForm.resignationDate,
          effectiveDate: resignationForm.effectiveDate,
          reason: resignationForm.reason.trim(),
          note: resignationForm.note.trim() || undefined,
        }),
      });

      toast.success("บันทึกการลาออกสำเร็จ");
      setResignationOpen(false);
      setResignationForm(defaultResignationForm);
      await loadEmployee();
      setTab("resignation");
    } catch (error) {
      notifyError(error, "บันทึกการลาออกไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  function confirmResignationStatus(
    resignationId: string,
    status: ResignationStatus,
  ) {
    if (!employee) return;

    const label =
      status === "APPROVED"
        ? "อนุมัติ"
        : status === "REJECTED"
          ? "ไม่อนุมัติ"
          : "ยกเลิก";

    setActionDialog({
      title: `${label}ใบลาออก`,
      description: `ต้องการ${label}ใบลาออกของ ${employeeName} หรือไม่`,
      confirmLabel: label,
      cancelLabel: "ปิด",
      tone:
        status === "APPROVED"
          ? "emerald"
          : status === "REJECTED"
            ? "red"
            : "orange",
      onConfirm: async () => {
        try {
          setSubmitting(true);

          await apiFetch(
            `/employees/${employee.id}/resignations/${resignationId}`,
            { method: "PATCH", body: JSON.stringify({ status }) },
          );

          toast.success("อัปเดตสถานะการลาออกสำเร็จ");
          await loadEmployee();
          setTab("resignation");
        } catch (error) {
          notifyError(error, "อัปเดตสถานะการลาออกไม่สำเร็จ");
          throw error;
        } finally {
          setSubmitting(false);
        }
      },
    });
  }

  function pickDocumentFile(file: File | null) {
    if (!file) {
      setDocumentFile(null);
      return false;
    }

    if (!ALLOWED_DOCUMENT_MIME.includes(file.type)) {
      toast.error("รองรับเฉพาะไฟล์ PDF, JPG, PNG หรือ WEBP");
      setDocumentFile(null);
      return false;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("ขนาดไฟล์ต้องไม่เกิน 10MB");
      setDocumentFile(null);
      return false;
    }

    setDocumentFile(file);
    return true;
  }

  if (loading) {
    return (
      <PageSurface className="px-5 py-6 sm:px-6">
        <LoadingState title="กำลังเปิดข้อมูลพนักงาน" />
      </PageSurface>
    );
  }

  if (notFound || !employee) {
    return (
      <PageSurface className="px-5 py-16 text-center sm:px-6">
        <h1 className="text-base font-semibold text-slate-900">
          ไม่พบข้อมูลพนักงานรายนี้
        </h1>
        <p className="mt-1.5 text-[13px] text-slate-500 3xl:text-[14px]">
          พนักงานอาจถูกลบไปแล้ว หรือไม่ได้อยู่ในขอบเขตที่คุณมีสิทธิ์เข้าถึง
        </p>
        <div className="mt-5">
          <ButtonLink
            href="/employees"
            icon={<ArrowLeft className="h-3.5 w-3.5" />}
          >
            กลับไปทะเบียนพนักงาน
          </ButtonLink>
        </div>
      </PageSurface>
    );
  }

  const tabs: Array<TabItem<DetailTab>> = [
    { key: "overview", label: "ภาพรวม" },
    { key: "profile", label: "ข้อมูลส่วนตัว" },
    {
      key: "probation",
      label: "ทดลองงาน",
      count: employee.probationRecords?.length ?? 0,
    },
    { key: "attendance", label: "การลงเวลา" },
    { key: "leave", label: "การลา" },
    { key: "overtime", label: "OT" },
    { key: "payroll", label: "เงินเดือน" },
    { key: "documents", label: "เอกสาร", count: employee.documents.length },
    {
      key: "history",
      label: "ประวัติการทำงาน",
      count: employee.workHistories.length,
    },
    {
      key: "resignation",
      label: "การลาออก",
      count: employee.resignations.length,
    },
  ];

  const positionText = textOf(
    employee.positionMaster?.nameTh || employee.position,
  );
  const departmentText =
    [employee.department?.nameTh, employee.division?.nameTh]
      .filter(Boolean)
      .join(" · ") || "ยังไม่ระบุแผนก";

  return (
    <PageSurface>
      {/*
        * ปุ่มย้อนกลับอยู่แถวบนสุดของหน้า ไม่ใช่ข้างรูป
        * ของเดิมเบียดอยู่ติดรูปจนดันชื่อกับป้ายบริบททั้งชุดเยื้องเข้ามา
        */}
      <div className="px-6 pt-4 sm:px-7 3xl:px-8">
        <Link
          href="/employees"
          className="inline-flex items-center gap-1.5 rounded-lg py-1 pr-2 text-[12.5px] font-semibold text-slate-500 transition hover:text-brand-700"
        >
          <ArrowLeft className="h-4 w-4" />
          ทะเบียนพนักงาน
        </Link>
      </div>

      <PageHeading
        heroMotif="employees"
        title={employeeName}
        description={`${positionText} · ${departmentText}`}
        leading={
          /* มีรูปจริงเท่านั้นถึงกดได้ วงตัวย่อไม่มีอะไรให้ดูเต็ม */
          avatarUrl ? (
            <button
              type="button"
              onClick={() => setPhotoOpen(true)}
              title="ดูรูปขนาดเต็ม"
              aria-label={`ดูรูปขนาดเต็มของ ${employeeName}`}
              className="cursor-zoom-in rounded-full outline-none ring-offset-2 transition hover:ring-2 hover:ring-brand-300 focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <Avatar name={employeeName} src={avatarUrl} size="xl" />
            </button>
          ) : (
            <Avatar name={employeeName} size="xl" />
          )
        }
        chips={
          <>
            <StatusBadge
              vocabulary={EMPLOYEE_STATUS}
              status={employee.status}
            />

            <PageChip tone="brand">{textOf(employee.company?.nameTh)}</PageChip>

            {employee.employeeType?.nameTh ? (
              <PageChip>{employee.employeeType.nameTh}</PageChip>
            ) : null}

            {employee.nickname ? (
              <PageChip>ชื่อเล่น {employee.nickname}</PageChip>
            ) : null}
          </>
        }
        actions={
          <>
            <div className={TILE_BOX}>
              <StatTile
                icon={<IdCard className="h-4 w-4" />}
                label="รหัสพนักงาน"
                value={textOf(employee.employeeCode)}
                helper="ใช้อ้างอิงทุกระบบ"
              />
              <StatTile
                icon={<CalendarDays className="h-4 w-4" />}
                label="วันที่เริ่มงาน"
                value={dateText(employee.startDate)}
                helper={
                  employee.probationEndDate
                    ? `ทดลองงานถึง ${dateText(employee.probationEndDate)}`
                    : "ไม่มีช่วงทดลองงาน"
                }
              />
              <StatTile
                icon={<Hourglass className="h-4 w-4" />}
                label="อายุงาน"
                value={tenureText(employee.startDate)}
                helper="นับถึงวันนี้"
              />
              <StatTile
                icon={<Building2 className="h-4 w-4" />}
                label="สาขา"
                value={textOf(employee.branch?.nameTh)}
                helper={`ผู้ใต้บังคับบัญชา ${countText(employee.subordinates.length)} คน`}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="danger"
                icon={<Trash2 className="h-3.5 w-3.5" />}
                disabled={submitting || employee.status === "INACTIVE"}
                onClick={confirmDeactivate}
              >
                ปิดใช้งาน
              </Button>
              <Button
                variant="primary"
                icon={<Pencil className="h-3.5 w-3.5" />}
                onClick={openEditModal}
              >
                แก้ไขข้อมูล
              </Button>
            </div>
          </>
        }
      />

      <Tabs
        className="border-slate-300"
        items={tabs}
        value={tab}
        onChange={setTab}
      />

      <div className="min-w-0">
        {tab === "overview" ? <OverviewTab employee={employee} /> : null}

        {tab === "profile" ? <ProfileTab employee={employee} /> : null}

        {tab === "probation" ? (
          <ProbationTab
            records={employee.probationRecords ?? []}
            probationPassedAt={employee.probationPassedAt}
          />
        ) : null}

        {tab === "attendance" ? (
          <ActivityTab
            mode="attendance"
            payrollPolicy={payrollPolicy}
            items={attendanceItems}
            summary={attendanceSummary}
            loading={attendanceLoading}
            accessDenied={attendanceDenied}
            error={attendanceError}
            employeeId={employee.id}
            onReload={loadAttendance}
          />
        ) : null}

        {tab === "leave" ? (
          <ActivityTab
            mode="leave"
            items={leaveItems}
            summary={leaveSummary}
            loading={leaveLoading}
            accessDenied={leaveDenied}
            error={leaveError}
            employeeId={employee.id}
            onReload={loadLeaves}
          />
        ) : null}

        {tab === "overtime" ? (
          <ActivityTab
            mode="overtime"
            items={overtimeItems}
            summary={overtimeSummary}
            loading={overtimeLoading}
            accessDenied={overtimeDenied}
            error={overtimeError}
            employeeId={employee.id}
            onReload={loadOvertime}
          />
        ) : null}

        {tab === "payroll" ? (
          <PayrollTab
            employee={employee}
            compensations={compensations}
            compensationItems={compensationItems}
            current={currentCompensation}
            loading={compensationLoading}
            accessDenied={compensationDenied}
          />
        ) : null}

        {tab === "documents" ? (
          <DocumentsTab
            documents={employee.documents}
            onOpen={handleOpenDocument}
            onDownload={handleDownloadDocument}
            onDelete={confirmDeleteDocument}
            onAdd={() => setDocumentOpen(true)}
          />
        ) : null}

        {tab === "history" ? (
          <HistoryTab histories={employee.workHistories} />
        ) : null}

        {tab === "resignation" ? (
          <ResignationTab
            resignations={employee.resignations}
            submitting={submitting}
            onAdd={() => setResignationOpen(true)}
            onChangeStatus={confirmResignationStatus}
          />
        ) : null}
      </div>

      <EditEmployeeModal
        open={editOpen}
        employee={employee}
        form={editForm}
        submitting={submitting}
        companies={companies}
        branches={branches}
        departments={departments}
        divisions={divisions}
        employeeTypes={employeeTypes}
        positions={positions}
        supervisors={supervisors}
        onChange={setEditForm}
        onClose={() => setEditOpen(false)}
        onSubmit={() => void handleUpdateEmployee()}
      />

      <Modal
        open={documentOpen}
        title="อัปโหลดเอกสารพนักงาน"
        description="รองรับ PDF, JPG, PNG และ WEBP ขนาดไม่เกิน 10MB"
        onClose={closeDocumentModal}
        footer={
          <ModalActions
            onCancel={closeDocumentModal}
            onConfirm={() => void handleUploadDocument()}
            confirmLabel="อัปโหลด"
            loading={submitting}
          />
        }
      >
        <div className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-6 py-8 text-center transition hover:border-brand-400 hover:bg-brand-50/50">
            <FileText className="h-7 w-7 text-slate-300" />

            <span className="mt-3 text-[13px] font-semibold text-slate-800 3xl:text-[14px]">
              {documentFile ? documentFile.name : "คลิกเพื่อเลือกไฟล์"}
            </span>

            <span className="mt-1 text-[12px] text-slate-400 3xl:text-[13px]">
              {documentFile
                ? `ขนาด ${(documentFile.size / 1024 / 1024).toFixed(2)} MB`
                : "PDF, JPG, PNG, WEBP · ไม่เกิน 10MB"}
            </span>

            <input
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const accepted = pickDocumentFile(
                  event.target.files?.[0] ?? null,
                );
                if (!accepted) event.target.value = "";
              }}
            />
          </label>

          <FieldGrid columns={2}>
            <Field label="ชื่อเอกสาร" required>
              <TextInput
                value={documentForm.title}
                onChange={(event) =>
                  setDocumentForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="เช่น สัญญาจ้างงานปี 2569"
              />
            </Field>

            <Field label="ประเภทเอกสาร">
              <Select
                value={documentForm.type}
                onChange={(event) =>
                  setDocumentForm((current) => ({
                    ...current,
                    type: event.target.value as EmployeeDocumentType,
                  }))
                }
              >
                {DOCUMENT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="วันที่ออกเอกสาร">
              <ThaiDateInput
                value={documentForm.issuedDate}
                onChange={(event) =>
                  setDocumentForm((current) => ({
                    ...current,
                    issuedDate: event.target.value,
                  }))
                }
                aria-label="วันที่ออกเอกสาร"
              />
            </Field>

            <Field label="วันหมดอายุ">
              <ThaiDateInput
                value={documentForm.expiredDate}
                onChange={(event) =>
                  setDocumentForm((current) => ({
                    ...current,
                    expiredDate: event.target.value,
                  }))
                }
                aria-label="วันหมดอายุ"
              />
            </Field>

            <Field label="สถานะ">
              <Select
                value={documentForm.status}
                onChange={(event) =>
                  setDocumentForm((current) => ({
                    ...current,
                    status: event.target.value as EmployeeDocumentStatus,
                  }))
                }
              >
                {DOCUMENT_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          </FieldGrid>

          <Field label="รายละเอียด">
            <Textarea
              value={documentForm.description}
              onChange={(event) =>
                setDocumentForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="บันทึกเพิ่มเติมเกี่ยวกับเอกสารฉบับนี้"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={resignationOpen}
        title="บันทึกการลาออก"
        description={`บันทึกใบลาออกของ ${employeeName}`}
        onClose={() => setResignationOpen(false)}
        footer={
          <ModalActions
            onCancel={() => setResignationOpen(false)}
            onConfirm={() => void handleCreateResignation()}
            confirmLabel="บันทึก"
            loading={submitting}
          />
        }
      >
        <div className="space-y-4">
          <FieldGrid columns={2}>
            <Field label="วันที่ยื่นลาออก" required>
              <ThaiDateInput
                value={resignationForm.resignationDate}
                onChange={(event) =>
                  setResignationForm((current) => ({
                    ...current,
                    resignationDate: event.target.value,
                  }))
                }
                aria-label="วันที่ยื่นลาออก"
              />
            </Field>

            <Field label="วันที่มีผล" required>
              <ThaiDateInput
                value={resignationForm.effectiveDate}
                onChange={(event) =>
                  setResignationForm((current) => ({
                    ...current,
                    effectiveDate: event.target.value,
                  }))
                }
                aria-label="วันที่มีผล"
              />
            </Field>
          </FieldGrid>

          <Field label="เหตุผล" required>
            <TextInput
              value={resignationForm.reason}
              onChange={(event) =>
                setResignationForm((current) => ({
                  ...current,
                  reason: event.target.value,
                }))
              }
              placeholder="ระบุเหตุผลการลาออก"
            />
          </Field>

          <Field label="หมายเหตุ">
            <Textarea
              value={resignationForm.note}
              onChange={(event) =>
                setResignationForm((current) => ({
                  ...current,
                  note: event.target.value,
                }))
              }
              placeholder="ข้อมูลเพิ่มเติมสำหรับ HR"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={photoOpen}
        title="รูปพนักงาน"
        description={employeeName}
        onClose={() => setPhotoOpen(false)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl}
          alt={employeeName}
          className="mx-auto max-h-[65vh] w-auto rounded-lg object-contain"
        />
      </Modal>

      <ActionDialog
        state={actionDialog}
        loading={submitting}
        onClose={() => setActionDialog(null)}
      />
    </PageSurface>
  );
}

/* ------------------------------------------------------------------ */
/* payload                                                             */
/* ------------------------------------------------------------------ */

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildUpdatePayload(form: CreateEmployeeForm) {
  return {
    employeeCode: form.employeeCode.trim(),
    title: emptyToNull(form.title),
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    nickname: emptyToNull(form.nickname),
    displayName: emptyToNull(form.displayName),
    email: emptyToNull(form.email),
    phone: emptyToNull(form.phone),
    positionId: emptyToNull(form.positionId),
    position: emptyToNull(form.position),
    supervisorId: emptyToNull(form.supervisorId),
    startDate: form.startDate,
    probationEndDate: emptyToNull(form.probationEndDate),
    status: form.status as EmployeeStatus,
    companyId: form.companyId,
    branchId: emptyToNull(form.branchId),
    departmentId: emptyToNull(form.departmentId),
    divisionId: emptyToNull(form.divisionId),
    employeeTypeId: emptyToNull(form.employeeTypeId),
    profile: {
      gender: form.profile.gender,
      birthDate: emptyToNull(form.profile.birthDate),
      nationalId: emptyToNull(form.profile.nationalId),
      passportNo: emptyToNull(form.profile.passportNo),
      maritalStatus: form.profile.maritalStatus,
      nationality: emptyToNull(form.profile.nationality),
      religion: emptyToNull(form.profile.religion),
      currentAddress: emptyToNull(form.profile.currentAddress),
      registeredAddress: emptyToNull(form.profile.registeredAddress),
      emergencyContactName: emptyToNull(form.profile.emergencyContactName),
      emergencyContactPhone: emptyToNull(form.profile.emergencyContactPhone),
      emergencyContactRelation: emptyToNull(
        form.profile.emergencyContactRelation,
      ),
      emergencyContactName2: emptyToNull(form.profile.emergencyContactName2),
      emergencyContactPhone2: emptyToNull(form.profile.emergencyContactPhone2),
      emergencyContactRelation2: emptyToNull(
        form.profile.emergencyContactRelation2,
      ),
      educationLevel: emptyToNull(form.profile.educationLevel),
      educationInstitute: emptyToNull(form.profile.educationInstitute),
      educationMajor: emptyToNull(form.profile.educationMajor),
      bankName: emptyToNull(form.profile.bankName),
      bankAccountNo: emptyToNull(form.profile.bankAccountNo),
      bankAccountName: emptyToNull(form.profile.bankAccountName),
      firstNameEn: emptyToNull(form.profile.firstNameEn),
      lastNameEn: emptyToNull(form.profile.lastNameEn),
      personalEmail: emptyToNull(form.profile.personalEmail),
      workPhoneExt: emptyToNull(form.profile.workPhoneExt),
      lineId: emptyToNull(form.profile.lineId),
      bloodType: emptyToNull(form.profile.bloodType),
      taxId: emptyToNull(form.profile.taxId),
      socialSecurityNo: emptyToNull(form.profile.socialSecurityNo),
      socialSecurityHospital: emptyToNull(form.profile.socialSecurityHospital),
      providentFundNo: emptyToNull(form.profile.providentFundNo),
      payrollPaymentMethod: emptyToNull(form.profile.payrollPaymentMethod),
      contractNo: emptyToNull(form.profile.contractNo),
      contractStartDate: emptyToNull(form.profile.contractStartDate),
      contractEndDate: emptyToNull(form.profile.contractEndDate),
      workLocation: emptyToNull(form.profile.workLocation),
      workPermitNo: emptyToNull(form.profile.workPermitNo),
      workPermitExpiredDate: emptyToNull(form.profile.workPermitExpiredDate),
      visaNo: emptyToNull(form.profile.visaNo),
      visaExpiredDate: emptyToNull(form.profile.visaExpiredDate),
      emergencyContactAddress: emptyToNull(
        form.profile.emergencyContactAddress,
      ),
      emergencyContactAddress2: emptyToNull(
        form.profile.emergencyContactAddress2,
      ),
      note: emptyToNull(form.profile.note),
    },
  };
}
