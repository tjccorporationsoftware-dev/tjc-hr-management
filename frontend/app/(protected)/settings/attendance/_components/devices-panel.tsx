"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType, FormEvent, ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Cpu,
  Fingerprint,
  Link2,
  ListChecks,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCcw,
  ScanFace,
  Server,
  Smartphone,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import { EmployeePicker } from "@/components/common/employee-picker";
import {
  Button,
  IconButton,
  Modal as KitModal,
  SearchInput,
} from "@/components/kit";
import {
  createAttendanceDevice,
  createAttendanceDeviceEnrollment,
  createAttendanceLocation,
  deleteAttendanceDevice,
  deleteAttendanceDeviceEnrollment,
  deleteAttendanceLocation,
  getAttendanceDeviceEnrollments,
  getAttendanceDeviceCommands,
  getAttendanceDeviceScanLogPeople,
  getAttendanceDeviceScanLogs,
  getAttendanceDevices,
  getAttendanceLocations,
  getOrganizationBranches,
  getOrganizationCompanies,
  getTimeAdjustEmployees,
  pushAttendanceDeviceEmployees,
  updateAttendanceDevice,
  updateAttendanceLocation,
} from "@/lib/api";
import type {
  AttendanceDevice,
  AttendanceDeviceCommand,
  AttendanceDeviceEnrollment,
  AttendanceDeviceType,
  AttendanceLocation,
  AttendanceLocationType,
  AttendanceScanLog,
  AttendanceScanLogPerson,
  MasterStatus,
} from "@/types/attendance";
import type { BranchItem, CompanyItem } from "@/types/organization";

/* ------------------------------------------------------------------ */
/* design tokens (ชุดเดียวกับหน้าอื่นในระบบ)                            */
/* ------------------------------------------------------------------ */

const CONTROL_BASE =
  "h-9 3xl:h-10 w-full rounded-lg border border-slate-200 bg-white text-[13px] 3xl:text-[13.5px] text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

const INPUT_CLASS = `${CONTROL_BASE} px-3`;
const SELECT_CLASS = `${CONTROL_BASE} pl-3 pr-8`;

const TEXTAREA_CLASS =
  "w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] 3xl:text-[13.5px] leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500";

const PRIMARY_BUTTON =
  "inline-flex h-9 3xl:h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-600 px-3.5 text-[13px] 3xl:text-[13.5px] font-semibold text-white transition hover:bg-brand-700 disabled:pointer-events-none disabled:opacity-50";

const GHOST_BUTTON =
  "inline-flex h-9 3xl:h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] 3xl:text-[13.5px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-50";

const TH_CLASS =
  "border-b border-slate-300 bg-slate-50 px-5 py-3.5 text-left text-[12.5px] font-semibold tracking-normal text-slate-700 3xl:py-4 3xl:text-[13px] 4xl:py-[1.125rem] 4xl:text-[13.5px]";

/*
 * หัวตารางค้างใต้แถบบนสุด (5rem) ระหว่างเลื่อนหน้าเว็บ
 * เส้นขอบของเซลล์ที่ตรึงไว้จะไม่ถูกวาด จึงใช้เงาด้านในแทน
 * ต่ำกว่า xl ยังต้องเลื่อนตารางแนวนอน overflow จึงทำให้ sticky ตาย
 */
const STICKY_TH_CLASS =
  "xl:sticky xl:top-20 xl:z-20 xl:shadow-[inset_0_-1px_0_#cbd5e1]";

const TD_CLASS =
  "px-5 py-2.5 3xl:py-3 align-middle text-[13px] 3xl:text-[13.5px] text-slate-600";

/* ------------------------------------------------------------------ */
/* options                                                             */
/* ------------------------------------------------------------------ */

type TabKey = "devices" | "locations";

const DEVICE_TYPE_OPTIONS: {
  value: AttendanceDeviceType;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** เครื่องที่ต้องตั้งค่าเชื่อมต่อเครือข่าย */
  networked: boolean;
}[] = [
  {
    value: "FINGERPRINT",
    label: "สแกนลายนิ้วมือ",
    icon: Fingerprint,
    networked: true,
  },
  { value: "FACE_SCAN", label: "สแกนใบหน้า", icon: ScanFace, networked: true },
  { value: "QR_KIOSK", label: "ตู้สแกน QR", icon: Cpu, networked: true },
  { value: "TABLET", label: "แท็บเล็ต", icon: Smartphone, networked: false },
  {
    value: "MOBILE_APP",
    label: "โมบายแอป",
    icon: Smartphone,
    networked: false,
  },
  { value: "WEB_DEVICE", label: "อุปกรณ์เว็บ", icon: Server, networked: false },
  { value: "OTHER", label: "อื่น ๆ", icon: Cpu, networked: false },
];

const DEVICE_TYPE_MAP = new Map(
  DEVICE_TYPE_OPTIONS.map((option) => [option.value, option]),
);

const LOCATION_TYPE_OPTIONS: {
  value: AttendanceLocationType;
  label: string;
}[] = [
  { value: "OFFICE", label: "สำนักงาน" },
  { value: "BRANCH", label: "สาขา" },
  { value: "SITE", label: "ไซต์งาน" },
  { value: "CUSTOMER_SITE", label: "ไซต์ลูกค้า" },
  { value: "WFH", label: "ทำงานที่บ้าน" },
  { value: "REMOTE", label: "ทำงานทางไกล" },
  { value: "TEMPORARY_SITE", label: "จุดชั่วคราว" },
  { value: "OTHER", label: "อื่น ๆ" },
];

const LOCATION_TYPE_MAP = new Map(
  LOCATION_TYPE_OPTIONS.map((option) => [option.value, option.label]),
);

const DEFAULT_RADIUS_METERS = "50";
/** พอร์ตมาตรฐานของเครื่องสแกนตระกูล ZKTeco */
const DEFAULT_SCANNER_PORT = "4370";

type DeviceDraft = {
  code: string;
  name: string;
  type: AttendanceDeviceType;
  serialNo: string;
  ipAddress: string;
  port: string;
  brand: string;
  model: string;
  commKey: string;
  firmwareVersion: string;
  description: string;
  branchId: string;
  locationId: string;
  status: MasterStatus;
};

type LocationDraft = {
  companyId: string;
  branchId: string;
  code: string;
  nameTh: string;
  nameEn: string;
  type: AttendanceLocationType;
  address: string;
  latitude: string;
  longitude: string;
  radiusMeters: string;
  status: MasterStatus;
};

const emptyDeviceDraft: DeviceDraft = {
  code: "",
  name: "",
  type: "FINGERPRINT",
  serialNo: "",
  ipAddress: "",
  port: DEFAULT_SCANNER_PORT,
  brand: "",
  model: "",
  commKey: "",
  firmwareVersion: "",
  description: "",
  branchId: "",
  locationId: "",
  status: "ACTIVE",
};

const emptyLocationDraft: LocationDraft = {
  companyId: "",
  branchId: "",
  code: "",
  nameTh: "",
  nameEn: "",
  type: "OFFICE",
  address: "",
  latitude: "",
  longitude: "",
  radiusMeters: DEFAULT_RADIUS_METERS,
  status: "ACTIVE",
};

type EmployeeOption = {
  id: string;
  employeeCode?: string | null;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/* page                                                                */
/* ------------------------------------------------------------------ */

/** ตัวเลขสรุปที่หน้าหลักเอาไปวางข้างหัวเรื่อง */
export type DevicesSummary = {
  devices: number;
  scanners: number;
  enrolled: number;
  locations: number;
  synced: number;
};

export function AttendanceDevicesPanel({
  activeTab,
  onSummaryChange,
}: {
  /** แท็บมาจากหน้าหลัก — panel นี้ไม่มีแถบแท็บของตัวเองแล้ว */
  activeTab: TabKey;
  onSummaryChange?: (summary: DevicesSummary) => void;
}) {
  const [devices, setDevices] = useState<AttendanceDevice[]>([]);
  const [locations, setLocations] = useState<AttendanceLocation[]>([]);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  /** deviceId → จำนวนพนักงานที่ผูกไว้ ใช้โชว์ในตาราง */
  const [enrollmentCounts, setEnrollmentCounts] = useState<
    Record<string, number>
  >({});

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");

  const [deviceFormOpen, setDeviceFormOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<AttendanceDevice | null>(
    null,
  );
  const [deviceDraft, setDeviceDraft] = useState<DeviceDraft>(emptyDeviceDraft);
  const [deviceSaving, setDeviceSaving] = useState(false);

  const [locationFormOpen, setLocationFormOpen] = useState(false);
  const [editingLocation, setEditingLocation] =
    useState<AttendanceLocation | null>(null);
  const [locationDraft, setLocationDraft] =
    useState<LocationDraft>(emptyLocationDraft);
  const [locationSaving, setLocationSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  const [enrollDevice, setEnrollDevice] = useState<AttendanceDevice | null>(
    null,
  );
  const [scanLogDevice, setScanLogDevice] = useState<AttendanceDevice | null>(
    null,
  );
  const [pushDevice, setPushDevice] = useState<AttendanceDevice | null>(null);

  const [dialogState, setDialogState] = useState<ActionDialogState | null>(
    null,
  );
  const [dialogLoading, setDialogLoading] = useState(false);

  /* ---------------------------------------------------------------- */
  /* data                                                              */
  /* ---------------------------------------------------------------- */

  const loadEnrollmentCounts = useCallback(
    async (deviceList: AttendanceDevice[]) => {
      const results = await Promise.allSettled(
        deviceList.map((device) => getAttendanceDeviceEnrollments(device.id)),
      );

      const counts: Record<string, number> = {};
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          counts[deviceList[index].id] = result.value.length;
        }
      });

      setEnrollmentCounts(counts);
    },
    [],
  );

  const loadData = useCallback(
    async (mode: "initial" | "refresh" = "initial", notify = false) => {
      try {
        if (mode === "initial") setLoading(true);
        else setRefreshing(true);

        const [
          deviceResult,
          locationResult,
          companyResult,
          branchResult,
          employeeResult,
        ] = await Promise.allSettled([
          getAttendanceDevices(),
          getAttendanceLocations(),
          getOrganizationCompanies({
            page: 1,
            pageSize: 200,
            status: "ACTIVE",
          }),
          getOrganizationBranches({ page: 1, pageSize: 500, status: "ACTIVE" }),
          getTimeAdjustEmployees(),
        ]);

        if (deviceResult.status !== "fulfilled") {
          throw deviceResult.reason instanceof Error
            ? deviceResult.reason
            : new Error("โหลดรายการอุปกรณ์ลงเวลาไม่สำเร็จ");
        }

        if (locationResult.status !== "fulfilled") {
          throw locationResult.reason instanceof Error
            ? locationResult.reason
            : new Error("โหลดรายการจุดลงเวลาไม่สำเร็จ");
        }

        setDevices(deviceResult.value);
        setLocations(locationResult.value);
        if (companyResult.status === "fulfilled")
          setCompanies(companyResult.value.items);
        if (branchResult.status === "fulfilled")
          setBranches(branchResult.value.items);
        if (employeeResult.status === "fulfilled")
          setEmployees(employeeResult.value.items as EmployeeOption[]);

        await loadEnrollmentCounts(deviceResult.value);

        if (notify) toast.success("รีเฟรชข้อมูลเรียบร้อยแล้ว");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadEnrollmentCounts],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  /* ---------------------------------------------------------------- */
  /* derived                                                           */
  /* ---------------------------------------------------------------- */

  const keyword = q.trim().toLowerCase();

  const filteredDevices = useMemo(() => {
    if (!keyword) return devices;
    return devices.filter((device) =>
      [
        device.code,
        device.name,
        device.serialNo,
        device.ipAddress,
        device.brand,
        device.model,
        device.branch?.nameTh,
        device.location?.nameTh,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }, [devices, keyword]);

  const filteredLocations = useMemo(() => {
    if (!keyword) return locations;
    return locations.filter((location) =>
      [location.code, location.nameTh, location.nameEn, location.branch?.nameTh]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }, [keyword, locations]);

  const stats = useMemo(() => {
    const scanners = devices.filter(
      (device) => DEVICE_TYPE_MAP.get(device.type)?.networked,
    );
    const enrolledTotal = Object.values(enrollmentCounts).reduce(
      (sum, value) => sum + value,
      0,
    );

    return {
      devices: devices.length,
      scanners: scanners.length,
      locations: locations.length,
      enrolled: enrolledTotal,
      synced: devices.filter((device) => Boolean(device.lastSyncAt)).length,
    };
  }, [devices, enrollmentCounts, locations]);

  const branchOptions = useMemo(() => {
    const map = new Map<string, { id: string; code: string; nameTh: string }>();
    for (const branch of branches) map.set(branch.id, branch);
    for (const location of locations)
      if (location.branch?.id) map.set(location.branch.id, location.branch);
    for (const device of devices)
      if (device.branch?.id) map.set(device.branch.id, device.branch);
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [branches, devices, locations]);

  const deviceLocationOptions = useMemo(() => {
    if (!deviceDraft.branchId) return locations;
    return locations.filter(
      (location) =>
        !location.branch?.id || location.branch.id === deviceDraft.branchId,
    );
  }, [deviceDraft.branchId, locations]);

  const locationBranchOptions = useMemo(() => {
    if (!locationDraft.companyId) return branches;
    return branches.filter(
      (branch) => branch.companyId === locationDraft.companyId,
    );
  }, [branches, locationDraft.companyId]);

  /* ---------------------------------------------------------------- */
  /* device form                                                       */
  /* ---------------------------------------------------------------- */

  function openCreateDevice() {
    setEditingDevice(null);
    setDeviceDraft(emptyDeviceDraft);
    setDeviceFormOpen(true);
  }

  function openEditDevice(device: AttendanceDevice) {
    setEditingDevice(device);
    setDeviceDraft({
      code: device.code,
      name: device.name,
      type: device.type,
      serialNo: device.serialNo ?? "",
      ipAddress: device.ipAddress ?? "",
      port: device.port != null ? String(device.port) : "",
      brand: device.brand ?? "",
      model: device.model ?? "",
      commKey: device.commKey ?? "",
      firmwareVersion: device.firmwareVersion ?? "",
      description: device.description ?? "",
      branchId: device.branchId ?? "",
      locationId: device.locationId ?? "",
      status: device.status,
    });
    setDeviceFormOpen(true);
  }

  function updateDeviceDraft<K extends keyof DeviceDraft>(
    key: K,
    value: DeviceDraft[K],
  ) {
    setDeviceDraft((current) => ({ ...current, [key]: value }));
  }

  async function submitDeviceForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!deviceDraft.code.trim()) {
      toast.error("กรุณาระบุรหัสอุปกรณ์");
      return;
    }
    if (!deviceDraft.name.trim()) {
      toast.error("กรุณาระบุชื่ออุปกรณ์");
      return;
    }

    const port = deviceDraft.port.trim() ? Number(deviceDraft.port) : undefined;
    if (
      port !== undefined &&
      (!Number.isInteger(port) || port < 1 || port > 65535)
    ) {
      toast.error("พอร์ตต้องเป็นตัวเลข 1-65535");
      return;
    }

    setDeviceSaving(true);
    try {
      if (editingDevice) {
        await updateAttendanceDevice(editingDevice.id, {
          code: deviceDraft.code.trim(),
          name: deviceDraft.name.trim(),
          type: deviceDraft.type,
          serialNo: deviceDraft.serialNo.trim() || null,
          ipAddress: deviceDraft.ipAddress.trim() || null,
          port: port ?? null,
          brand: deviceDraft.brand.trim() || null,
          model: deviceDraft.model.trim() || null,
          commKey: deviceDraft.commKey.trim() || null,
          firmwareVersion: deviceDraft.firmwareVersion.trim() || null,
          description: deviceDraft.description.trim() || null,
          branchId: deviceDraft.branchId || null,
          locationId: deviceDraft.locationId || null,
          status: deviceDraft.status,
        });
        toast.success(`อัปเดตอุปกรณ์ "${deviceDraft.name.trim()}" แล้ว`);
      } else {
        await createAttendanceDevice({
          code: deviceDraft.code.trim(),
          name: deviceDraft.name.trim(),
          type: deviceDraft.type,
          serialNo: deviceDraft.serialNo.trim() || undefined,
          ipAddress: deviceDraft.ipAddress.trim() || undefined,
          port,
          brand: deviceDraft.brand.trim() || undefined,
          model: deviceDraft.model.trim() || undefined,
          commKey: deviceDraft.commKey.trim() || undefined,
          firmwareVersion: deviceDraft.firmwareVersion.trim() || undefined,
          description: deviceDraft.description.trim() || undefined,
          branchId: deviceDraft.branchId || undefined,
          locationId: deviceDraft.locationId || undefined,
          status: deviceDraft.status,
        });
        toast.success(`เพิ่มอุปกรณ์ "${deviceDraft.name.trim()}" แล้ว`);
      }

      setDeviceFormOpen(false);
      setEditingDevice(null);
      await loadData("refresh");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "บันทึกอุปกรณ์ไม่สำเร็จ",
      );
    } finally {
      setDeviceSaving(false);
    }
  }

  function confirmDeleteDevice(device: AttendanceDevice) {
    setDialogState({
      tone: "red",
      title: "ลบอุปกรณ์ลงเวลา",
      description: `ต้องการลบ "${device.name}" (${device.code}) ใช่หรือไม่ ประวัติการลงเวลาที่เคยบันทึกไว้จะยังอยู่`,
      confirmLabel: "ลบอุปกรณ์",
      onConfirm: async () => {
        setDialogLoading(true);
        try {
          await deleteAttendanceDevice(device.id);
          toast.success(`ลบอุปกรณ์ "${device.name}" แล้ว`);
          setDialogState(null);
          await loadData("refresh");
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "ลบอุปกรณ์ไม่สำเร็จ",
          );
        } finally {
          setDialogLoading(false);
        }
      },
    });
  }

  /* ---------------------------------------------------------------- */
  /* location form                                                     */
  /* ---------------------------------------------------------------- */

  function openCreateLocation() {
    setEditingLocation(null);
    setLocationDraft({
      ...emptyLocationDraft,
      companyId: companies[0]?.id ?? "",
    });
    setLocationFormOpen(true);
  }

  function openEditLocation(location: AttendanceLocation) {
    setEditingLocation(location);
    setLocationDraft({
      companyId: location.companyId,
      branchId: location.branchId ?? "",
      code: location.code,
      nameTh: location.nameTh,
      nameEn: location.nameEn ?? "",
      type: location.type,
      address: location.address ?? "",
      latitude: location.latitude != null ? String(location.latitude) : "",
      longitude: location.longitude != null ? String(location.longitude) : "",
      radiusMeters: String(location.radiusMeters ?? DEFAULT_RADIUS_METERS),
      status: location.status,
    });
    setLocationFormOpen(true);
  }

  function updateLocationDraft<K extends keyof LocationDraft>(
    key: K,
    value: LocationDraft[K],
  ) {
    setLocationDraft((current) => ({ ...current, [key]: value }));
  }

  /** ปักหมุดจากตำแหน่งปัจจุบันของเครื่องที่เปิดหน้านี้ */
  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("เบราว์เซอร์นี้ไม่รองรับการขอพิกัด GPS");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationDraft((current) => ({
          ...current,
          latitude: position.coords.latitude.toFixed(7),
          longitude: position.coords.longitude.toFixed(7),
        }));
        toast.success("ปักหมุดจากตำแหน่งปัจจุบันแล้ว");
        setLocating(false);
      },
      (geoError) => {
        const messages: Record<number, string> = {
          [geoError.PERMISSION_DENIED]: "ผู้ใช้ไม่อนุญาตให้เข้าถึงตำแหน่ง GPS",
          [geoError.POSITION_UNAVAILABLE]: "ไม่พบข้อมูลตำแหน่งจากอุปกรณ์",
          [geoError.TIMEOUT]: "การขอพิกัดใช้เวลานานเกินไป",
        };
        toast.error(messages[geoError.code] ?? "ไม่สามารถขอพิกัด GPS ได้");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  async function submitLocationForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!locationDraft.companyId) {
      toast.error("กรุณาเลือกบริษัท");
      return;
    }
    if (!locationDraft.code.trim() || !locationDraft.nameTh.trim()) {
      toast.error("กรุณาระบุรหัสและชื่อจุดลงเวลา");
      return;
    }

    const latitude = locationDraft.latitude.trim()
      ? Number(locationDraft.latitude)
      : undefined;
    const longitude = locationDraft.longitude.trim()
      ? Number(locationDraft.longitude)
      : undefined;

    if ((latitude === undefined) !== (longitude === undefined)) {
      toast.error("กรุณาระบุทั้งละติจูดและลองจิจูด หรือเว้นว่างทั้งคู่");
      return;
    }
    if (
      latitude !== undefined &&
      (Number.isNaN(latitude) || latitude < -90 || latitude > 90)
    ) {
      toast.error("ละติจูดต้องอยู่ระหว่าง -90 ถึง 90");
      return;
    }
    if (
      longitude !== undefined &&
      (Number.isNaN(longitude) || longitude < -180 || longitude > 180)
    ) {
      toast.error("ลองจิจูดต้องอยู่ระหว่าง -180 ถึง 180");
      return;
    }

    const radiusMeters = Number(locationDraft.radiusMeters);
    if (!Number.isFinite(radiusMeters) || radiusMeters < 1) {
      toast.error("รัศมีต้องเป็นตัวเลขมากกว่า 0");
      return;
    }

    setLocationSaving(true);
    try {
      if (editingLocation) {
        await updateAttendanceLocation(editingLocation.id, {
          branchId: locationDraft.branchId || null,
          code: locationDraft.code.trim(),
          nameTh: locationDraft.nameTh.trim(),
          nameEn: locationDraft.nameEn.trim() || null,
          type: locationDraft.type,
          address: locationDraft.address.trim() || null,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          radiusMeters,
          status: locationDraft.status,
        });
        toast.success(`อัปเดตจุดลงเวลา "${locationDraft.nameTh.trim()}" แล้ว`);
      } else {
        await createAttendanceLocation({
          companyId: locationDraft.companyId,
          branchId: locationDraft.branchId || undefined,
          code: locationDraft.code.trim(),
          nameTh: locationDraft.nameTh.trim(),
          nameEn: locationDraft.nameEn.trim() || undefined,
          type: locationDraft.type,
          address: locationDraft.address.trim() || undefined,
          latitude,
          longitude,
          radiusMeters,
          status: locationDraft.status,
        });
        toast.success(`เพิ่มจุดลงเวลา "${locationDraft.nameTh.trim()}" แล้ว`);
      }

      setLocationFormOpen(false);
      setEditingLocation(null);
      await loadData("refresh");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "บันทึกจุดลงเวลาไม่สำเร็จ",
      );
    } finally {
      setLocationSaving(false);
    }
  }

  function confirmDeleteLocation(location: AttendanceLocation) {
    setDialogState({
      tone: "red",
      title: "ลบจุดลงเวลา",
      description: `ต้องการลบ "${location.nameTh}" (${location.code}) ใช่หรือไม่`,
      confirmLabel: "ลบจุดลงเวลา",
      onConfirm: async () => {
        setDialogLoading(true);
        try {
          await deleteAttendanceLocation(location.id);
          toast.success(`ลบจุดลงเวลา "${location.nameTh}" แล้ว`);
          setDialogState(null);
          await loadData("refresh");
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "ลบจุดลงเวลาไม่สำเร็จ",
          );
        } finally {
          setDialogLoading(false);
        }
      },
    });
  }

  /* ---------------------------------------------------------------- */
  /* render                                                            */
  /* ---------------------------------------------------------------- */

  // ส่งตัวเลขสรุปให้หัวเรื่องของหน้าเมื่อข้อมูลเปลี่ยน
  useEffect(() => {
    onSummaryChange?.(stats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    stats.devices,
    stats.scanners,
    stats.enrolled,
    stats.locations,
    stats.synced,
  ]);

  const showingCount =
    activeTab === "devices" ? filteredDevices.length : filteredLocations.length;
  const totalCount =
    activeTab === "devices" ? devices.length : locations.length;

  return (
    <>
      {/* ตัวกรองอยู่แถวเดียวกับช่องค้นหา เหมือนหน้าผู้ใช้และสิทธิ์ */}
      <div className="flex flex-col gap-3 border-b border-slate-300 bg-slate-50/70 px-5 py-3 sm:px-6 xl:flex-row xl:items-center xl:justify-between 3xl:px-7">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={
              activeTab === "devices" ? openCreateDevice : openCreateLocation
            }
          >
            {activeTab === "devices" ? "เพิ่มอุปกรณ์" : "เพิ่มจุดลงเวลา"}
          </Button>

          {q ? (
            <button
              type="button"
              onClick={() => setQ("")}
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
              ? `เจอ ${showingCount.toLocaleString("th-TH")} จาก ${totalCount.toLocaleString("th-TH")} รายการ`
              : `ทั้งหมด ${totalCount.toLocaleString("th-TH")} รายการ`}
          </p>

          <div className="[&_input]:bg-white">
            <SearchInput
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder={
                activeTab === "devices"
                  ? "ค้นหารหัส ชื่อ ซีเรียล IP"
                  : "ค้นหารหัส ชื่อจุด สาขา"
              }
              className="w-full sm:w-60"
              aria-label={
                activeTab === "devices" ? "ค้นหาอุปกรณ์" : "ค้นหาจุดลงเวลา"
              }
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
            onClick={() => loadData("refresh", true)}
          />
        </div>
      </div>

      {/* table */}
      {loading ? (
        <PanelMessage>
          <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
          กำลังโหลดข้อมูล…
        </PanelMessage>
      ) : activeTab === "devices" ? (
        filteredDevices.length === 0 ? (
          <PanelMessage>
            {devices.length === 0
              ? "ยังไม่มีอุปกรณ์ลงเวลา กด เพิ่มอุปกรณ์ เพื่อเริ่มตั้งค่าเครื่องสแกน"
              : "ไม่พบอุปกรณ์ที่ตรงกับคำค้น"}
          </PanelMessage>
        ) : (
          <div className="divide-y divide-slate-200">
            {/*
              รายการทีละเครื่อง ไม่ใช่ตาราง — ตารางเดิมกว้าง 1080px ต้องเลื่อนแนวนอน
              ทั้งที่ครึ่งหนึ่งของคอลัมน์เป็นข้อความสั้น ๆ ที่ยุบรวมเป็นบรรทัดรองได้
            */}
            {filteredDevices.map((device) => {
              const typeOption = DEVICE_TYPE_MAP.get(device.type);
              const Icon = typeOption?.icon ?? Cpu;
              const enrolled = enrollmentCounts[device.id] ?? 0;

              return (
                <article
                  key={device.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5 transition-colors even:bg-brand-50/40 hover:bg-brand-50/70 sm:px-6 3xl:px-7"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                    <Icon className="h-4 w-4" />
                  </span>

                  <div className="min-w-[13rem] flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="truncate text-[13.5px] font-bold text-slate-900 3xl:text-[14.5px]">
                        {device.name}
                      </p>
                      <span className="inline-flex shrink-0 items-center rounded-full bg-brand-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-brand-700">
                        {typeOption?.label ?? device.type}
                      </span>
                    </div>
                    <p className="truncate text-[11.5px] text-slate-500 3xl:text-[12px]">
                      {[
                        device.code,
                        device.serialNo ? `S/N ${device.serialNo}` : null,
                        [device.brand, device.model]
                          .filter(Boolean)
                          .join(" ") || null,
                        device.firmwareVersion
                          ? `FW ${device.firmwareVersion}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>

                  {/* ค่าประจำเครื่อง เรียงติดกันคั่นด้วยเส้น */}
                  <div className="flex shrink-0 items-stretch divide-x divide-brand-100">
                    <DeviceFact
                      label="การเชื่อมต่อ"
                      value={
                        device.ipAddress
                          ? `${device.ipAddress}${device.port ? `:${device.port}` : ""}`
                          : "ยังไม่ตั้งค่าเครือข่าย"
                      }
                      muted={!device.ipAddress}
                      width="w-40"
                    />
                    <DeviceFact
                      label="ที่ติดตั้ง"
                      value={device.branch?.nameTh ?? "ทุกสาขา"}
                      hint={device.location?.nameTh ?? "ไม่ผูกจุดลงเวลา"}
                      hintMuted={!device.location}
                      width="w-44"
                    />
                    <DeviceFact
                      label="ซิงก์ล่าสุด"
                      value={formatDateTime(device.lastSyncAt)}
                      muted={!device.lastSyncAt}
                      width="w-36"
                    />
                  </div>

                  {/* กดที่จำนวนคนเพื่อไปหน้าผูกพนักงานของเครื่องนี้ */}
                  <button
                    type="button"
                    onClick={() => setEnrollDevice(device)}
                    className={cn(
                      "inline-flex w-24 shrink-0 items-center justify-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition",
                      enrolled > 0
                        ? "border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100"
                        : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
                    )}
                  >
                    <Link2 className="h-3 w-3" />
                    {enrolled > 0 ? `${enrolled} คน` : "ยังไม่ผูก"}
                  </button>

                  <div className="w-24 shrink-0">
                    <StatusPill status={device.status} />
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <IconAction
                      label="ประวัติการสแกน"
                      onClick={() => setScanLogDevice(device)}
                    >
                      <ListChecks className="h-4 w-4" />
                    </IconAction>
                    <IconAction
                      label="ส่งรายชื่อลงเครื่อง"
                      onClick={() => setPushDevice(device)}
                    >
                      <Upload className="h-4 w-4" />
                    </IconAction>
                    <IconAction
                      label="ผูกพนักงาน"
                      onClick={() => setEnrollDevice(device)}
                    >
                      <Users className="h-4 w-4" />
                    </IconAction>
                    <IconAction
                      label="แก้ไข"
                      onClick={() => openEditDevice(device)}
                    >
                      <Pencil className="h-4 w-4" />
                    </IconAction>
                    <IconAction
                      label="ลบ"
                      tone="text-rose-600 hover:bg-rose-50"
                      onClick={() => confirmDeleteDevice(device)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconAction>
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : filteredLocations.length === 0 ? (
        <PanelMessage>
          {locations.length === 0
            ? "ยังไม่มีจุดลงเวลา GPS"
            : "ไม่พบจุดลงเวลาที่ตรงกับคำค้น"}
        </PanelMessage>
      ) : (
        <div className="overflow-x-auto xl:overflow-visible">
          <table className="w-full min-w-[900px] border-collapse text-sm max-[1536px]:text-xs">
            <thead>
              <tr className="border-b border-slate-200">
                <th className={cn(TH_CLASS, STICKY_TH_CLASS)}>จุดลงเวลา</th>
                <th className={cn(TH_CLASS, STICKY_TH_CLASS)}>ประเภท</th>
                <th className={cn(TH_CLASS, STICKY_TH_CLASS)}>บริษัท / สาขา</th>
                <th className={cn(TH_CLASS, STICKY_TH_CLASS)}>พิกัด</th>
                <th className={cn(TH_CLASS, STICKY_TH_CLASS)}>รัศมี</th>
                <th className={cn(TH_CLASS, STICKY_TH_CLASS)}>สถานะ</th>
                <th className={cn(TH_CLASS, STICKY_TH_CLASS, "text-right")}>
                  จัดการ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLocations.map((location) => {
                const hasGps =
                  location.latitude != null && location.longitude != null;

                return (
                  <tr
                    key={location.id}
                    className="transition hover:bg-brand-50/55"
                  >
                    <td className={TD_CLASS}>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                          <MapPin className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-slate-900 3xl:text-[14px]">
                            {location.nameTh}
                          </span>
                          <span className="block truncate text-[11px] text-slate-500">
                            {location.code}
                          </span>
                        </span>
                      </div>
                    </td>

                    <td className={TD_CLASS}>
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                        {LOCATION_TYPE_MAP.get(location.type) ?? location.type}
                      </span>
                    </td>

                    <td className={TD_CLASS}>
                      <span className="block text-[11px] text-slate-700">
                        {location.company?.nameTh ?? "-"}
                      </span>
                      <span className="block text-[11px] text-slate-500">
                        {location.branch?.nameTh ?? "ทุกสาขา"}
                      </span>
                    </td>

                    <td className={TD_CLASS}>
                      {hasGps ? (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-[11px] text-brand-700 underline-offset-2 hover:underline"
                        >
                          {Number(location.latitude).toFixed(6)},{" "}
                          {Number(location.longitude).toFixed(6)}
                        </a>
                      ) : (
                        <span className="text-[11px] text-slate-400">
                          ยังไม่ปักหมุด
                        </span>
                      )}
                    </td>

                    <td className={TD_CLASS}>
                      <span className="text-[11px] text-slate-700">
                        {location.radiusMeters
                          ? `${location.radiusMeters} ม.`
                          : "-"}
                      </span>
                    </td>

                    <td className={TD_CLASS}>
                      <StatusPill status={location.status} />
                    </td>

                    <td className={cn(TD_CLASS, "text-right")}>
                      <div className="inline-flex items-center gap-1">
                        <IconAction
                          label="แก้ไข"
                          onClick={() => openEditLocation(location)}
                        >
                          <Pencil className="h-4 w-4" />
                        </IconAction>
                        <IconAction
                          label="ลบ"
                          tone="text-rose-600 hover:bg-rose-50"
                          onClick={() => confirmDeleteLocation(location)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconAction>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------------- device modal ---------------- */}
      {deviceFormOpen ? (
        <Modal
          title={editingDevice ? "แก้ไขอุปกรณ์ลงเวลา" : "เพิ่มอุปกรณ์ลงเวลา"}
          subtitle="เครื่องสแกนลายนิ้วมือ/ใบหน้าให้กรอกข้อมูลเชื่อมต่อ เพื่อให้ส่งข้อมูลสแกนเข้าระบบได้"
          onClose={() => setDeviceFormOpen(false)}
        >
          <form onSubmit={submitDeviceForm}>
            <div className="max-h-[62vh] space-y-5 overflow-y-auto">
              <FormSection title="ข้อมูลอุปกรณ์">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="รหัสอุปกรณ์" required>
                    <input
                      value={deviceDraft.code}
                      onChange={(event) =>
                        updateDeviceDraft("code", event.target.value)
                      }
                      placeholder="เช่น FP-HQ-01"
                      className={INPUT_CLASS}
                    />
                  </Field>

                  <Field label="ชื่ออุปกรณ์" required>
                    <input
                      value={deviceDraft.name}
                      onChange={(event) =>
                        updateDeviceDraft("name", event.target.value)
                      }
                      placeholder="เช่น เครื่องสแกนนิ้ว ประตูหน้า"
                      className={INPUT_CLASS}
                    />
                  </Field>

                  <Field label="ประเภท">
                    <select
                      value={deviceDraft.type}
                      onChange={(event) =>
                        updateDeviceDraft(
                          "type",
                          event.target.value as AttendanceDeviceType,
                        )
                      }
                      className={SELECT_CLASS}
                    >
                      {DEVICE_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="หมายเลขเครื่อง (S/N)">
                    <input
                      value={deviceDraft.serialNo}
                      onChange={(event) =>
                        updateDeviceDraft("serialNo", event.target.value)
                      }
                      placeholder="เช่น 1234567890"
                      className={INPUT_CLASS}
                    />
                  </Field>
                </div>
              </FormSection>

              <FormSection
                title="การเชื่อมต่อเครื่องสแกน"
                hint="ใช้เมื่อเครื่องต้องเชื่อมต่อผ่านเครือข่าย เช่น ZKTeco พอร์ตมาตรฐานคือ 4370"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="IP Address">
                    <input
                      value={deviceDraft.ipAddress}
                      onChange={(event) =>
                        updateDeviceDraft("ipAddress", event.target.value)
                      }
                      placeholder="192.168.1.201"
                      className={INPUT_CLASS}
                    />
                  </Field>

                  <Field label="พอร์ต">
                    <input
                      value={deviceDraft.port}
                      onChange={(event) =>
                        updateDeviceDraft("port", event.target.value)
                      }
                      placeholder={DEFAULT_SCANNER_PORT}
                      inputMode="numeric"
                      className={INPUT_CLASS}
                    />
                  </Field>

                  <Field label="ยี่ห้อ">
                    <input
                      value={deviceDraft.brand}
                      onChange={(event) =>
                        updateDeviceDraft("brand", event.target.value)
                      }
                      placeholder="เช่น ZKTeco, Hikvision"
                      className={INPUT_CLASS}
                    />
                  </Field>

                  <Field label="รุ่น">
                    <input
                      value={deviceDraft.model}
                      onChange={(event) =>
                        updateDeviceDraft("model", event.target.value)
                      }
                      placeholder="เช่น K40, F18"
                      className={INPUT_CLASS}
                    />
                  </Field>

                  <Field
                    label="รหัสสื่อสาร (Comm Key)"
                    hint="ตั้งไว้ในเครื่อง ค่าเริ่มต้นมักเป็น 0"
                  >
                    <input
                      value={deviceDraft.commKey}
                      onChange={(event) =>
                        updateDeviceDraft("commKey", event.target.value)
                      }
                      placeholder="0"
                      className={INPUT_CLASS}
                    />
                  </Field>

                  <Field label="เวอร์ชันเฟิร์มแวร์">
                    <input
                      value={deviceDraft.firmwareVersion}
                      onChange={(event) =>
                        updateDeviceDraft("firmwareVersion", event.target.value)
                      }
                      placeholder="เช่น 6.60"
                      className={INPUT_CLASS}
                    />
                  </Field>
                </div>
              </FormSection>

              <FormSection title="ที่ตั้งและสถานะ">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="สาขา">
                    <select
                      value={deviceDraft.branchId}
                      onChange={(event) => {
                        updateDeviceDraft("branchId", event.target.value);
                        updateDeviceDraft("locationId", "");
                      }}
                      className={SELECT_CLASS}
                    >
                      <option value="">ทุกสาขา</option>
                      {branchOptions.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.code} · {branch.nameTh}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field
                    label="จุดลงเวลาที่ผูก"
                    hint="ใช้บันทึกสถานที่ให้กับรายการสแกนที่มาจากเครื่องนี้"
                  >
                    <select
                      value={deviceDraft.locationId}
                      onChange={(event) =>
                        updateDeviceDraft("locationId", event.target.value)
                      }
                      className={SELECT_CLASS}
                    >
                      <option value="">ไม่ผูกจุดลงเวลา</option>
                      {deviceLocationOptions.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.code} · {location.nameTh}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="สถานะ">
                    <select
                      value={deviceDraft.status}
                      onChange={(event) =>
                        updateDeviceDraft(
                          "status",
                          event.target.value as MasterStatus,
                        )
                      }
                      className={SELECT_CLASS}
                    >
                      <option value="ACTIVE">เปิดใช้งาน</option>
                      <option value="INACTIVE">ปิดใช้งาน</option>
                    </select>
                  </Field>
                </div>

                <div className="mt-4">
                  <Field label="หมายเหตุ">
                    <textarea
                      value={deviceDraft.description}
                      onChange={(event) =>
                        updateDeviceDraft("description", event.target.value)
                      }
                      rows={2}
                      placeholder="เช่น ติดตั้งที่ประตูทางเข้าชั้น 1"
                      className={TEXTAREA_CLASS}
                    />
                  </Field>
                </div>
              </FormSection>
            </div>

            <ModalFooter>
              <button
                type="button"
                onClick={() => setDeviceFormOpen(false)}
                disabled={deviceSaving}
                className={GHOST_BUTTON}
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={deviceSaving}
                className={PRIMARY_BUTTON}
              >
                {deviceSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {editingDevice ? "บันทึกการแก้ไข" : "เพิ่มอุปกรณ์"}
              </button>
            </ModalFooter>
          </form>
        </Modal>
      ) : null}

      {/* ---------------- location modal ---------------- */}
      {locationFormOpen ? (
        <Modal
          title={editingLocation ? "แก้ไขจุดลงเวลา" : "เพิ่มจุดลงเวลา"}
          subtitle="กำหนดพิกัดและรัศมีที่อนุญาตให้พนักงานลงเวลาผ่าน GPS"
          onClose={() => setLocationFormOpen(false)}
        >
          <form onSubmit={submitLocationForm}>
            <div className="max-h-[62vh] space-y-5 overflow-y-auto">
              <FormSection title="ข้อมูลจุดลงเวลา">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="บริษัท" required>
                    <select
                      value={locationDraft.companyId}
                      onChange={(event) => {
                        updateLocationDraft("companyId", event.target.value);
                        updateLocationDraft("branchId", "");
                      }}
                      disabled={Boolean(editingLocation)}
                      className={SELECT_CLASS}
                    >
                      <option value="">เลือกบริษัท</option>
                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.code} · {company.nameTh}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="สาขา">
                    <select
                      value={locationDraft.branchId}
                      onChange={(event) =>
                        updateLocationDraft("branchId", event.target.value)
                      }
                      className={SELECT_CLASS}
                    >
                      <option value="">ทุกสาขา</option>
                      {locationBranchOptions.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.code} · {branch.nameTh}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="รหัสจุดลงเวลา" required>
                    <input
                      value={locationDraft.code}
                      onChange={(event) =>
                        updateLocationDraft("code", event.target.value)
                      }
                      placeholder="เช่น GPS_HQ"
                      className={INPUT_CLASS}
                    />
                  </Field>

                  <Field label="ชื่อ (ไทย)" required>
                    <input
                      value={locationDraft.nameTh}
                      onChange={(event) =>
                        updateLocationDraft("nameTh", event.target.value)
                      }
                      placeholder="เช่น สำนักงานใหญ่"
                      className={INPUT_CLASS}
                    />
                  </Field>

                  <Field label="ชื่อ (อังกฤษ)">
                    <input
                      value={locationDraft.nameEn}
                      onChange={(event) =>
                        updateLocationDraft("nameEn", event.target.value)
                      }
                      placeholder="เช่น Head Office"
                      className={INPUT_CLASS}
                    />
                  </Field>

                  <Field label="ประเภท">
                    <select
                      value={locationDraft.type}
                      onChange={(event) =>
                        updateLocationDraft(
                          "type",
                          event.target.value as AttendanceLocationType,
                        )
                      }
                      className={SELECT_CLASS}
                    >
                      {LOCATION_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </FormSection>

              <FormSection
                title="พิกัด GPS"
                hint="เว้นว่างทั้งคู่ได้ถ้าจุดนี้ไม่ต้องตรวจพิกัด"
              >
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="ละติจูด">
                    <input
                      value={locationDraft.latitude}
                      onChange={(event) =>
                        updateLocationDraft("latitude", event.target.value)
                      }
                      placeholder="15.2035500"
                      className={INPUT_CLASS}
                    />
                  </Field>

                  <Field label="ลองจิจูด">
                    <input
                      value={locationDraft.longitude}
                      onChange={(event) =>
                        updateLocationDraft("longitude", event.target.value)
                      }
                      placeholder="104.8144000"
                      className={INPUT_CLASS}
                    />
                  </Field>

                  <Field label="รัศมี (เมตร)" required>
                    <input
                      value={locationDraft.radiusMeters}
                      onChange={(event) =>
                        updateLocationDraft("radiusMeters", event.target.value)
                      }
                      inputMode="numeric"
                      className={INPUT_CLASS}
                    />
                  </Field>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={useMyLocation}
                    disabled={locating}
                    className={GHOST_BUTTON}
                  >
                    {locating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MapPin className="h-4 w-4" />
                    )}
                    ใช้ตำแหน่งปัจจุบัน
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      updateLocationDraft("latitude", "");
                      updateLocationDraft("longitude", "");
                      toast.info("ล้างพิกัดแล้ว");
                    }}
                    className={GHOST_BUTTON}
                  >
                    <X className="h-4 w-4" />
                    ล้างพิกัด
                  </button>

                  {locationDraft.latitude && locationDraft.longitude ? (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${locationDraft.latitude},${locationDraft.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className={GHOST_BUTTON}
                    >
                      เปิดใน Google Maps
                    </a>
                  ) : null}
                </div>

                {/* แผนที่แสดงตำแหน่งหมุด (ฝัง Google Maps ไม่ต้องใช้ API key) */}
                {isValidCoordinate(
                  locationDraft.latitude,
                  locationDraft.longitude,
                ) ? (
                  <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                    <iframe
                      title="แผนที่ตำแหน่งจุดลงเวลา"
                      src={`https://maps.google.com/maps?q=${locationDraft.latitude},${locationDraft.longitude}&z=16&hl=th&output=embed`}
                      className="h-56 w-full border-0 max-[1536px]:h-48"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                ) : (
                  <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs text-slate-400">
                    ระบุพิกัด หรือกด &quot;ใช้ตำแหน่งปัจจุบัน&quot;
                    เพื่อดูแผนที่
                  </p>
                )}
              </FormSection>

              <FormSection title="ที่อยู่และสถานะ">
                <Field label="ที่อยู่">
                  <textarea
                    value={locationDraft.address}
                    onChange={(event) =>
                      updateLocationDraft("address", event.target.value)
                    }
                    rows={2}
                    className={TEXTAREA_CLASS}
                  />
                </Field>

                <div className="mt-4 sm:w-1/2">
                  <Field label="สถานะ">
                    <select
                      value={locationDraft.status}
                      onChange={(event) =>
                        updateLocationDraft(
                          "status",
                          event.target.value as MasterStatus,
                        )
                      }
                      className={SELECT_CLASS}
                    >
                      <option value="ACTIVE">เปิดใช้งาน</option>
                      <option value="INACTIVE">ปิดใช้งาน</option>
                    </select>
                  </Field>
                </div>
              </FormSection>
            </div>

            <ModalFooter>
              <button
                type="button"
                onClick={() => setLocationFormOpen(false)}
                disabled={locationSaving}
                className={GHOST_BUTTON}
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={locationSaving}
                className={PRIMARY_BUTTON}
              >
                {locationSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {editingLocation ? "บันทึกการแก้ไข" : "เพิ่มจุดลงเวลา"}
              </button>
            </ModalFooter>
          </form>
        </Modal>
      ) : null}

      {/* ---------------- enrollment modal ---------------- */}
      {enrollDevice ? (
        <EnrollmentModal
          device={enrollDevice}
          employees={employees}
          onClose={() => setEnrollDevice(null)}
          onChanged={async () => {
            await loadEnrollmentCounts(devices);
          }}
        />
      ) : null}

      {/* ---------------- push employees modal ---------------- */}
      {pushDevice ? (
        <PushEmployeesModal
          device={pushDevice}
          employees={employees}
          onClose={() => setPushDevice(null)}
          onChanged={async () => {
            await loadEnrollmentCounts(devices);
          }}
        />
      ) : null}

      {/* ---------------- scan log modal ---------------- */}
      {scanLogDevice ? (
        <ScanLogModal
          device={scanLogDevice}
          onClose={() => setScanLogDevice(null)}
        />
      ) : null}

      <ActionDialog
        state={dialogState}
        loading={dialogLoading}
        onClose={() => setDialogState(null)}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* enrollment modal                                                    */
/* ------------------------------------------------------------------ */

function EnrollmentModal({
  device,
  employees,
  onClose,
  onChanged,
}: {
  device: AttendanceDevice;
  employees: EmployeeOption[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [items, setItems] = useState<AttendanceDeviceEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [deviceUserId, setDeviceUserId] = useState("");
  const [fingerCount, setFingerCount] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setItems(await getAttendanceDeviceEnrollments(device.id));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "โหลดรายการผูกพนักงานไม่สำเร็จ",
      );
    } finally {
      setLoading(false);
    }
  }, [device.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [load]);

  const enrolledIds = useMemo(
    () => new Set(items.map((item) => item.employeeId)),
    [items],
  );

  const availableEmployees = useMemo(
    () => employees.filter((employee) => !enrolledIds.has(employee.id)),
    [employees, enrolledIds],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!employeeId) {
      toast.error("กรุณาเลือกพนักงาน");
      return;
    }
    if (!deviceUserId.trim()) {
      toast.error("กรุณาระบุรหัสผู้ใช้ในเครื่อง");
      return;
    }

    setSaving(true);
    try {
      await createAttendanceDeviceEnrollment(device.id, {
        employeeId,
        deviceUserId: deviceUserId.trim(),
        fingerCount: fingerCount.trim() ? Number(fingerCount) : undefined,
      });
      toast.success("ผูกพนักงานกับเครื่องแล้ว");
      setEmployeeId("");
      setDeviceUserId("");
      setFingerCount("");
      await load();
      await onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "ผูกพนักงานไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: AttendanceDeviceEnrollment) {
    try {
      await deleteAttendanceDeviceEnrollment(device.id, item.id);
      toast.success("ยกเลิกการผูกแล้ว");
      await load();
      await onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "ยกเลิกการผูกไม่สำเร็จ",
      );
    }
  }

  return (
    <Modal
      title={`ผูกพนักงานกับ ${device.name}`}
      subtitle="เครื่องสแกนส่งมาแค่รหัสผู้ใช้ ต้องผูกกับพนักงานก่อนระบบถึงจะรู้ว่าเป็นใคร"
      onClose={onClose}
      wide
    >
      <div className="max-h-[62vh] space-y-4 overflow-y-auto">
        <form
          onSubmit={submit}
          className="grid gap-3 border-b border-brand-100 pb-4 sm:grid-cols-[minmax(0,1fr)_150px_120px_auto]"
        >
          <Field label="พนักงาน" required>
            {/*
              ค้นด้วยการพิมพ์ ไม่ใช่ไล่เลื่อนรายชื่อ — บริษัทมีพนักงานหลักร้อยคน
              ค้นในรายชื่อที่หน้านี้โหลดมาแล้ว จึงไม่ต้องยิงเซิร์ฟเวอร์ซ้ำ
              และไม่ต้องพึ่งสิทธิ์อ่านทะเบียนพนักงานของผู้ใช้ที่มาตั้งค่าเครื่องสแกน
            */}
            <EmployeePicker
              value={employeeId}
              onChange={(nextId) => setEmployeeId(nextId)}
              options={availableEmployees}
              placeholder="พิมพ์ชื่อหรือรหัสพนักงาน"
            />
          </Field>

          <Field label="รหัสในเครื่อง" required>
            <input
              value={deviceUserId}
              onChange={(event) => setDeviceUserId(event.target.value)}
              placeholder="เช่น 1001"
              className={INPUT_CLASS}
            />
          </Field>

          <Field label="จำนวนนิ้ว">
            <input
              value={fingerCount}
              onChange={(event) => setFingerCount(event.target.value)}
              placeholder="2"
              inputMode="numeric"
              className={INPUT_CLASS}
            />
          </Field>

          <div className="flex items-end">
            <button type="submit" disabled={saving} className={PRIMARY_BUTTON}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              ผูก
            </button>
          </div>
        </form>

        {loading ? (
          <PanelMessage>
            <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
            กำลังโหลด…
          </PanelMessage>
        ) : items.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-[13px] font-semibold text-slate-600">
              ยังไม่มีพนักงานผูกกับเครื่องนี้
            </p>
            <p className="mt-1 text-[12.5px] text-slate-400">
              รายการสแกนที่ส่งเข้ามาจะยังแมปกับพนักงานไม่ได้
            </p>
          </div>
        ) : (
          <div className="divide-y divide-brand-50 border-y border-brand-100">
            {/*
              รายการทีละคน ไม่ใช่ตาราง — ตารางเดิมกว้าง 620px ในป๊อปอัพจนต้องเลื่อน
              ทั้งที่มีแค่สี่ค่าและปุ่มลบหนึ่งปุ่ม
            */}
            {items.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-2 py-2.5 transition-colors hover:bg-brand-50/60"
              >
                {/* รหัสในเครื่องคือกุญแจที่ใช้จับคู่ จึงเด่นสุดในแถว */}
                <span className="flex h-8 min-w-[2.5rem] shrink-0 items-center justify-center rounded-lg bg-brand-50 px-2 text-[12.5px] font-bold tabular-nums text-brand-700">
                  {item.deviceUserId}
                </span>

                <div className="min-w-[10rem] flex-1">
                  <p className="break-words text-[13px] font-bold text-slate-900 3xl:text-[13.5px]">
                    {item.employee?.displayName ??
                      [item.employee?.firstName, item.employee?.lastName]
                        .filter(Boolean)
                        .join(" ") ??
                      "-"}
                  </p>
                  <p className="truncate text-[11.5px] tabular-nums text-slate-500">
                    {[
                      item.employee?.employeeCode,
                      item.fingerCount ? `${item.fingerCount} นิ้ว` : null,
                      `ผูกเมื่อ ${formatDateTime(item.enrolledAt)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>

                <IconAction
                  label="ยกเลิกการผูก"
                  tone="text-rose-600 hover:bg-rose-50"
                  onClick={() => void remove(item)}
                >
                  <Trash2 className="h-4 w-4" />
                </IconAction>
              </div>
            ))}
          </div>
        )}
      </div>

      <ModalFooter>
        <button type="button" onClick={onClose} className={GHOST_BUTTON}>
          ปิด
        </button>
      </ModalFooter>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* scan log modal                                                      */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* push employees modal                                                */
/* ------------------------------------------------------------------ */

function PushEmployeesModal({
  device,
  employees,
  onClose,
  onChanged,
}: {
  device: AttendanceDevice;
  employees: EmployeeOption[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [mode, setMode] = useState<"branch" | "selected">("branch");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);

  const [commands, setCommands] = useState<AttendanceDeviceCommand[]>([]);
  const [counts, setCounts] = useState({
    pending: 0,
    sent: 0,
    done: 0,
    failed: 0,
  });
  const [loadingCommands, setLoadingCommands] = useState(true);

  const loadCommands = useCallback(async () => {
    try {
      setLoadingCommands(true);
      const result = await getAttendanceDeviceCommands(device.id);
      setCommands(result.items);
      setCounts(result.meta);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "โหลดสถานะการส่งไม่สำเร็จ",
      );
    } finally {
      setLoadingCommands(false);
    }
  }, [device.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCommands();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadCommands]);

  const filteredEmployees = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return employees;

    return employees.filter((employee) =>
      [
        employee.employeeCode,
        employee.displayName,
        employee.firstName,
        employee.lastName,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword)),
    );
  }, [employees, search]);

  function toggle(id: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (mode === "selected" && selectedIds.size === 0) {
      toast.error("กรุณาเลือกพนักงานอย่างน้อยหนึ่งคน");
      return;
    }

    setSending(true);
    try {
      const result = await pushAttendanceDeviceEmployees(
        device.id,
        mode === "selected" ? [...selectedIds] : undefined,
      );

      toast.success(
        result.newEnrollmentCount > 0
          ? `เข้าคิวส่ง ${result.queuedCount} คน (ผูกรหัสใหม่ให้ ${result.newEnrollmentCount} คน)`
          : `เข้าคิวส่ง ${result.queuedCount} คน`,
      );

      setSelectedIds(new Set());
      await loadCommands();
      await onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "ส่งรายชื่อลงเครื่องไม่สำเร็จ",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      title={`ส่งรายชื่อลงเครื่อง · ${device.name}`}
      subtitle="เครื่องจะมารับคำสั่งเองภายในไม่กี่วินาที แล้วชื่อจะขึ้นในเครื่องให้เก็บลายนิ้วมือได้เลย"
      onClose={onClose}
      wide
    >
      <div className="max-h-[62vh] space-y-4 overflow-y-auto">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { value: "branch" as const, label: "ทั้งสาขาของเครื่องนี้" },
            { value: "selected" as const, label: "เลือกเป็นรายคน" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMode(option.value)}
              className={cn(
                "inline-flex h-9 items-center rounded-lg border px-3 text-xs font-semibold transition",
                mode === option.value
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {mode === "branch" ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3 text-xs text-slate-600">
            ส่งพนักงานที่ยังทำงานอยู่ทั้งหมดในสาขาที่เครื่องนี้สังกัด
            คนที่เคยส่งไปแล้วจะถูกส่งซ้ำเพื่ออัปเดตชื่อ ไม่สร้างรหัสซ้ำ
            {device.branchId ? null : (
              <span className="mt-1 block font-semibold text-amber-700">
                เครื่องนี้ยังไม่ได้ผูกสาขา — ต้องเลือกเป็นรายคน
                หรือกำหนดสาขาให้เครื่องก่อน
              </span>
            )}
          </p>
        ) : (
          <div className="space-y-2">
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหาชื่อหรือรหัสพนักงาน"
            />

            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
              {filteredEmployees.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-400">
                  ไม่พบพนักงานตามคำค้น
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filteredEmployees.map((employee) => (
                    <li key={employee.id}>
                      <label className="flex cursor-pointer items-center gap-2.5 px-4 py-2.5 transition hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(employee.id)}
                          onChange={() => toggle(employee.id)}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600"
                        />
                        <span className="text-xs font-semibold text-slate-900">
                          {employee.displayName ??
                            `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim()}
                        </span>
                        <span className="text-xs text-slate-500">
                          {employee.employeeCode}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="text-[11px] text-slate-500">
              เลือกไว้ {selectedIds.size.toLocaleString("th-TH")} คน
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <CommandCountChip
              count={counts.pending}
              label="รอเครื่องมารับ"
              className="border-slate-200 bg-slate-50 text-slate-600"
            />
            <CommandCountChip
              count={counts.sent}
              label="ส่งแล้วรอผล"
              className="border-sky-200 bg-sky-50 text-sky-700"
            />
            <CommandCountChip
              count={counts.done}
              label="ลงเครื่องสำเร็จ"
              className="border-emerald-200 bg-emerald-50 text-emerald-700"
            />
            <CommandCountChip
              count={counts.failed}
              label="ล้มเหลว"
              className="border-rose-200 bg-rose-50 text-rose-700"
            />
            {counts.pending + counts.sent + counts.done + counts.failed ===
            0 ? (
              <span className="text-slate-400">
                ยังไม่เคยส่งรายชื่อลงเครื่อง
              </span>
            ) : null}
          </div>

          <button
            type="button"
            onClick={loadCommands}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
            title="รีเฟรชสถานะ"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
          </button>
        </div>

        {loadingCommands ? (
          <PanelMessage>
            <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
            กำลังโหลด…
          </PanelMessage>
        ) : commands.length === 0 ? null : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className={TH_CLASS}>พนักงาน</th>
                  <th className={TH_CLASS}>สั่งเมื่อ</th>
                  <th className={TH_CLASS}>สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {commands.map((command) => (
                  <tr key={command.id} className="border-b border-slate-100">
                    <td className={TD_CLASS}>
                      <span className="text-xs text-slate-800">
                        {command.employee
                          ? `${command.employee.firstName} ${command.employee.lastName}`.trim()
                          : "—"}
                      </span>
                      {command.employee ? (
                        <span className="ml-1.5 text-xs text-slate-500">
                          {command.employee.employeeCode}
                        </span>
                      ) : null}
                    </td>
                    <td className={TD_CLASS}>
                      <span className="text-xs text-slate-600">
                        {formatDateTime(command.createdAt)}
                      </span>
                    </td>
                    <td className={TD_CLASS}>
                      <CommandStatusPill status={command.status} />
                      {command.errorMessage ? (
                        <span className="ml-1.5 text-[11px] text-rose-600">
                          {command.errorMessage}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ModalFooter>
        <button type="button" onClick={onClose} className={GHOST_BUTTON}>
          ปิด
        </button>
        <Button
          type="button"
          variant="primary"
          loading={sending}
          onClick={submit}
          disabled={mode === "branch" && !device.branchId}
        >
          ส่งรายชื่อลงเครื่อง
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function CommandCountChip({
  count,
  label,
  className,
}: {
  count: number;
  label: string;
  className: string;
}) {
  if (count <= 0) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 font-semibold",
        className,
      )}
    >
      {label} {count.toLocaleString("th-TH")}
    </span>
  );
}

function CommandStatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    PENDING: {
      label: "รอเครื่องมารับ",
      className: "border-slate-200 bg-slate-50 text-slate-600",
    },
    SENT: {
      label: "ส่งแล้วรอผล",
      className: "border-sky-200 bg-sky-50 text-sky-700",
    },
    DONE: {
      label: "ลงเครื่องสำเร็จ",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    },
    FAILED: {
      label: "ล้มเหลว",
      className: "border-rose-200 bg-rose-50 text-rose-700",
    },
  };

  const item = map[status] ?? {
    label: status,
    className: "border-slate-200 bg-slate-50 text-slate-600",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        item.className,
      )}
    >
      {item.label}
    </span>
  );
}

function ScanLogModal({
  device,
  onClose,
}: {
  device: AttendanceDevice;
  onClose: () => void;
}) {
  /*
   * สองชั้น: ชั้นแรกยุบเป็นรายคน ชั้นสองคือรายการดิบของคนที่เลือก
   * เครื่องเดียวมีการแตะวันละหลายสิบครั้ง ไล่ดูเป็นรายการยาว ๆ แล้วหาไม่เจอว่า
   * ใครมาไม่มา จึงให้เห็นภาพรวมรายคนก่อน แล้วค่อยเจาะดูทีละคน
   */
  const [people, setPeople] = useState<AttendanceScanLogPerson[]>([]);
  const [summary, setSummary] = useState({
    people: 0,
    scans: 0,
    unenrolled: 0,
  });
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [selected, setSelected] = useState<AttendanceScanLogPerson | null>(
    null,
  );

  const [items, setItems] = useState<AttendanceScanLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingItems, setLoadingItems] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  const loadPeople = useCallback(async () => {
    try {
      setLoadingPeople(true);
      const result = await getAttendanceDeviceScanLogPeople(device.id);
      setPeople(result.items);
      setSummary(result.meta);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "โหลดสรุปการสแกนไม่สำเร็จ",
      );
    } finally {
      setLoadingPeople(false);
    }
  }, [device.id]);

  const loadItems = useCallback(async () => {
    if (!selected) return;

    try {
      setLoadingItems(true);
      const result = await getAttendanceDeviceScanLogs(device.id, {
        page: 1,
        pageSize: 200,
        status: statusFilter || undefined,
        deviceUserId: selected.deviceUserId,
      });
      setItems(result.items);
      setTotal(result.meta.total);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "โหลดประวัติการสแกนไม่สำเร็จ",
      );
    } finally {
      setLoadingItems(false);
    }
  }, [device.id, selected, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPeople();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadPeople]);

  useEffect(() => {
    if (!selected) return;

    const timer = window.setTimeout(() => {
      void loadItems();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadItems, selected]);

  const openPerson = (person: AttendanceScanLogPerson) => {
    setSelected(person);
    setStatusFilter("");
    setItems([]);
    setTotal(0);
  };

  const personLabel = selected
    ? (selected.employeeName ?? `รหัสในเครื่อง ${selected.deviceUserId}`)
    : "";

  return (
    <Modal
      title={`ประวัติการสแกน · ${device.name}`}
      subtitle={
        selected
          ? `ทุกครั้งที่ ${personLabel} แตะเครื่องนี้ (เก็บถาวร แก้ไขไม่ได้)`
          : "ยุบเป็นรายคน กดที่ชื่อเพื่อดูรายการแตะทั้งหมดของคนนั้น"
      }
      onClose={onClose}
      wide
    >
      <div className="max-h-[62vh] space-y-4 overflow-y-auto">
        {selected ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                กลับไปรายชื่อ
              </button>

              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { value: "", label: "ทั้งหมด" },
                  { value: "MATCHED", label: "บันทึกสำเร็จ" },
                  { value: "UNMATCHED", label: "ยังไม่ผูก" },
                  { value: "DUPLICATE", label: "แตะซ้ำ" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatusFilter(option.value)}
                    className={cn(
                      "inline-flex h-8 items-center rounded-lg border px-3 text-[11px] font-semibold transition",
                      statusFilter === option.value
                        ? "border-brand-600 bg-brand-50 text-brand-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={loadItems}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                  title="รีเฟรช"
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="-mx-5 border-y border-brand-100 bg-brand-50/50 px-5 py-2.5">
              <p className="text-[13.5px] font-bold text-slate-900 3xl:text-[14px]">
                {personLabel}
              </p>
              <p className="mt-0.5 text-[11.5px] text-slate-500 3xl:text-[12px]">
                รหัสในเครื่อง{" "}
                <span className="font-semibold tabular-nums text-slate-700">
                  {selected.deviceUserId}
                </span>
                {selected.employeeCode ? ` · ${selected.employeeCode}` : ""} ·{" "}
                {total.toLocaleString("th-TH")} รายการ
              </p>
            </div>

            {loadingItems ? (
              <PanelMessage>
                <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
                กำลังโหลด…
              </PanelMessage>
            ) : items.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
                ไม่มีรายการตามเงื่อนไขที่เลือก
              </p>
            ) : (
              <div className="divide-y divide-brand-50 border-y border-brand-100">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-2"
                  >
                    <span className="w-44 shrink-0 text-[12.5px] tabular-nums text-slate-800 3xl:text-[13px]">
                      {formatDateTime(item.logTime)}
                    </span>
                    <ScanStatusPill status={item.normalizeStatus} />
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-slate-400">
                      {item.errorMessage ?? ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {/* สรุปของเครื่องนี้ เป็นช่องคั่นเส้นเหมือนรายการหน้าอื่น */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-100 pb-2">
              <div className="flex flex-wrap items-stretch divide-x divide-brand-100">
                <ScanFact
                  label="คนที่แตะ"
                  value={`${summary.people.toLocaleString("th-TH")} คน`}
                />
                <ScanFact
                  label="การแตะทั้งหมด"
                  value={`${summary.scans.toLocaleString("th-TH")} ครั้ง`}
                />
                <ScanFact
                  label="ยังไม่ผูกพนักงาน"
                  value={`${summary.unenrolled.toLocaleString("th-TH")} รหัส`}
                  tone={summary.unenrolled > 0 ? "warning" : undefined}
                />
              </div>

              <button
                type="button"
                onClick={loadPeople}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                title="รีเฟรช"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
              </button>
            </div>

            {loadingPeople ? (
              <PanelMessage>
                <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
                กำลังโหลด…
              </PanelMessage>
            ) : people.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
                ยังไม่มีประวัติการสแกน
              </p>
            ) : (
              <div className="divide-y divide-brand-50 border-y border-brand-100">
                {/*
                  รายการทีละคน ไม่ใช่ตาราง — ตารางเดิมกว้าง 640px ในป๊อปอัพจนต้องเลื่อน
                  และคอลัมน์ "การแตะ" มีชิปหลายอันจนแถวสูงไม่เท่ากัน
                */}
                {people.map((person) => (
                  <button
                    key={person.deviceUserId}
                    type="button"
                    onClick={() => openPerson(person)}
                    className="group flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-brand-50/70"
                  >
                    <span className="min-w-[11rem] flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span
                          className={cn(
                            "break-words text-[13px] font-bold 3xl:text-[13.5px]",
                            person.employeeName
                              ? "text-slate-900"
                              : "text-amber-700",
                          )}
                        >
                          {person.employeeName ?? "ยังไม่ผูกพนักงาน"}
                        </span>
                        {person.employeeCode ? (
                          <span className="shrink-0 text-[11.5px] tabular-nums text-slate-400">
                            {person.employeeCode}
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate text-[11.5px] text-slate-500">
                        รหัสในเครื่อง {person.deviceUserId || "-"}
                        {person.lastScanAt
                          ? ` · ล่าสุด ${formatDateTime(person.lastScanAt)}`
                          : " · ยังไม่เคยแตะ"}
                      </span>
                    </span>

                    <span className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <span className="text-[12.5px] font-semibold tabular-nums text-slate-800 3xl:text-[13px]">
                        {person.total.toLocaleString("th-TH")} ครั้ง
                      </span>
                      <ScanCountChip
                        count={person.matched}
                        label="สำเร็จ"
                        className="bg-emerald-50 text-emerald-700"
                      />
                      <ScanCountChip
                        count={person.duplicate}
                        label="ซ้ำ"
                        className="bg-slate-100 text-slate-500"
                      />
                      <ScanCountChip
                        count={person.unmatched}
                        label="ไม่ผูก"
                        className="bg-amber-50 text-amber-800"
                      />
                      <ScanCountChip
                        count={person.locked}
                        label="งวดปิดแล้ว"
                        className="bg-rose-50 text-rose-700"
                      />
                    </span>

                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-brand-600" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <ModalFooter>
        <button type="button" onClick={onClose} className={GHOST_BUTTON}>
          ปิด
        </button>
      </ModalFooter>
    </Modal>
  );
}

/** ตัวเลขสรุปหนึ่งช่องในป๊อปอัพประวัติการสแกน */
function ScanFact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warning";
}) {
  return (
    <div className="min-w-0 px-3 first:pl-0 last:pr-0">
      <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
        {label}
      </p>
      <p
        className={cn(
          "whitespace-nowrap text-[13px] font-semibold tabular-nums 3xl:text-[13.5px]",
          tone === "warning" ? "text-amber-700" : "text-slate-900",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** ตัวเลขย่อยข้างจำนวนครั้ง ซ่อนไปเลยถ้าเป็นศูนย์ จะได้ไม่รกตา */
function ScanCountChip({
  count,
  label,
  className,
}: {
  count: number;
  label: string;
  className: string;
}) {
  if (count <= 0) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
        className,
      )}
    >
      {label} {count.toLocaleString("th-TH")}
    </span>
  );
}

function ScanStatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    MATCHED: {
      label: "บันทึกสำเร็จ",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    },
    UNMATCHED: {
      label: "ยังไม่ผูก",
      className: "border-amber-200 bg-amber-50 text-amber-800",
    },
    DUPLICATE: {
      label: "แตะซ้ำ",
      className: "border-slate-200 bg-slate-50 text-slate-500",
    },
  };
  const item = map[status] ?? {
    label: status,
    className: "border-slate-200 bg-slate-50 text-slate-600",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold 3xl:px-3 3xl:text-[13px]",
        item.className,
      )}
    >
      {item.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* small ui                                                            */
/* ------------------------------------------------------------------ */

function Modal({
  title,
  subtitle,
  onClose,
  wide,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <KitModal
      open
      title={title}
      description={subtitle}
      size={wide ? "lg" : "md"}
      onClose={onClose}
    >
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
      {/* ป้ายฟ้าคั่นด้วยเส้นบาง ชุดเดียวกับฟอร์มอื่นทั้งระบบ */}
      <div className="mb-2.5 border-b border-brand-100 pb-1.5">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-500">
          {title}
        </p>
        {hint ? (
          <p className="mt-0.5 text-[11.5px] leading-5 text-slate-400">
            {hint}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[12.5px] font-medium text-slate-600 3xl:text-[13px]">
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-[11.5px] leading-5 text-slate-400">
          {hint}
        </span>
      ) : null}
    </label>
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

/** ค่าประจำเครื่องหนึ่งช่องในรายการอุปกรณ์ */
function DeviceFact({
  label,
  value,
  hint,
  muted = false,
  hintMuted = false,
  width = "w-36",
}: {
  label: string;
  value: string;
  hint?: string;
  muted?: boolean;
  hintMuted?: boolean;
  width?: string;
}) {
  return (
    <div className={cn("min-w-0 px-3 first:pl-0 last:pr-0", width)}>
      <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-400">
        {label}
      </p>
      <p
        className={cn(
          "truncate text-[12.5px] font-semibold tabular-nums 3xl:text-[13px]",
          muted ? "text-slate-400" : "text-slate-900",
        )}
      >
        {value}
      </p>
      {hint ? (
        <p
          className={cn(
            "truncate text-[11px] 3xl:text-[11.5px]",
            hintMuted ? "text-slate-300" : "text-slate-500",
          )}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: MasterStatus }) {
  const active = status === "ACTIVE";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold 3xl:px-3 3xl:text-[13px]",
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-500",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          active ? "bg-emerald-500" : "bg-slate-400",
        )}
      />
      {active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
    </span>
  );
}

function PanelMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 px-6 py-10 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

/** พิกัดครบและอยู่ในช่วงที่ถูกต้อง (ก่อนเอาไปฝังแผนที่) */
function isValidCoordinate(lat: string, lng: string) {
  const la = Number(lat);
  const lo = Number(lng);
  return (
    lat.trim() !== "" &&
    lng.trim() !== "" &&
    Number.isFinite(la) &&
    Number.isFinite(lo) &&
    la >= -90 &&
    la <= 90 &&
    lo >= -180 &&
    lo <= 180
  );
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "ยังไม่เคยซิงก์";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
