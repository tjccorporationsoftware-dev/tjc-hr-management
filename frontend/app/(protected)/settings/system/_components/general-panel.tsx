"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { Loader2, RefreshCw, Save } from "lucide-react";

import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import { DateTimeDisplay } from "@/components/common/date-display";
import { ErrorState, LoadingState } from "@/components/common/feedback-state";
import {
  Button,
  Field,
  FieldGrid,
  Notice,
  Section,
  Select,
  StatTile,
  TextInput,
  Textarea,
  Toggle,
} from "@/components/kit";
import {
  getMonitoringHealth,
  getMonitoringReadiness,
  getSystemSettings,
  getSystemSettingsAudit,
  updateSystemSettings,
} from "@/lib/api";
import type { MonitoringHealth, MonitoringReadiness } from "@/types/monitoring";
import type {
  AttendanceHolidayWeekday,
  SystemSettings,
  SystemSettingsAuditItem,
  UpdateSystemSettingsPayload,
} from "@/types/system-settings";

/**
 * ตั้งค่าทั่วไป
 * ------------
 * ค่ากลางของระบบ (timezone, รูปแบบวันที่, นโยบายไฟล์/รหัสผ่าน, การแจ้งเตือน)
 * ตรรกะยกมาจากหน้า /settings/system เดิมทั้งหมด เปลี่ยนแต่การจัดวางให้เข้าชุด kit
 */

type SystemSettingsDraft = {
  organizationName: string;
  timezone: "Asia/Bangkok" | "UTC";
  locale: "th-TH" | "en-US";
  dateFormat: "DD/MM/YYYY พ.ศ." | "DD/MM/YYYY" | "YYYY-MM-DD";
  timeFormat: "HH:mm" | "HH:mm:ss";
  fiscalYearStartMonth: string;
  attendanceWeeklyHolidays: AttendanceHolidayWeekday[];
  fileUploadMaxMb: string;
  allowedFileTypes: string;
  sessionTimeoutMinutes: string;
  passwordMinLength: string;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  requireTwoFactor: boolean;
  enableEmailNotification: boolean;
  enableLineNotification: boolean;
  maintenanceMode: boolean;
};

const defaultSettings: SystemSettingsDraft = {
  organizationName: "HR-TJC GROUP",
  timezone: "Asia/Bangkok",
  locale: "th-TH",
  dateFormat: "DD/MM/YYYY พ.ศ.",
  timeFormat: "HH:mm",
  fiscalYearStartMonth: "1",
  attendanceWeeklyHolidays: ["SUN"],
  fileUploadMaxMb: "20",
  allowedFileTypes: "pdf, doc, docx, xls, xlsx, png, jpg, jpeg",
  sessionTimeoutMinutes: "480",
  passwordMinLength: "8",
  requireUppercase: false,
  requireLowercase: false,
  requireNumber: false,
  requireSymbol: false,
  requireTwoFactor: false,
  enableEmailNotification: true,
  enableLineNotification: false,
  maintenanceMode: false,
};

function formatUptime(seconds?: number) {
  if (!seconds && seconds !== 0) return "-";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours.toLocaleString("th-TH")} ชม. ${minutes.toLocaleString("th-TH")} นาที`;
}

function settingsToDraft(settings: SystemSettings): SystemSettingsDraft {
  return {
    organizationName: settings.organizationName,
    timezone: settings.timezone,
    locale: settings.locale,
    dateFormat: settings.dateFormat,
    timeFormat: settings.timeFormat,
    fiscalYearStartMonth: String(settings.fiscalYearStartMonth),
    attendanceWeeklyHolidays: settings.attendanceWeeklyHolidays?.length
      ? settings.attendanceWeeklyHolidays
      : ["SUN"],
    fileUploadMaxMb: String(settings.fileUploadMaxMb),
    allowedFileTypes: settings.allowedFileTypes.join(", "),
    sessionTimeoutMinutes: String(settings.sessionTimeoutMinutes),
    passwordMinLength: String(settings.passwordMinLength),
    requireUppercase: settings.requireUppercase,
    requireLowercase: settings.requireLowercase,
    requireNumber: settings.requireNumber,
    requireSymbol: settings.requireSymbol,
    requireTwoFactor: settings.requireTwoFactor,
    enableEmailNotification: settings.enableEmailNotification,
    enableLineNotification: settings.enableLineNotification,
    maintenanceMode: settings.maintenanceMode,
  };
}

function draftToPayload(
  settings: SystemSettingsDraft,
): UpdateSystemSettingsPayload {
  return {
    organizationName: settings.organizationName.trim(),
    timezone: settings.timezone,
    locale: settings.locale,
    dateFormat: settings.dateFormat,
    timeFormat: settings.timeFormat,
    fiscalYearStartMonth: Number(settings.fiscalYearStartMonth),
    fileUploadMaxMb: Number(settings.fileUploadMaxMb),
    allowedFileTypes: settings.allowedFileTypes
      .split(",")
      .map((item) => item.trim().replace(/^\./, "").toLowerCase())
      .filter(Boolean),
    sessionTimeoutMinutes: Number(settings.sessionTimeoutMinutes),
    passwordMinLength: Number(settings.passwordMinLength),
    requireUppercase: settings.requireUppercase,
    requireLowercase: settings.requireLowercase,
    requireNumber: settings.requireNumber,
    requireSymbol: settings.requireSymbol,
    requireTwoFactor: settings.requireTwoFactor,
    enableEmailNotification: settings.enableEmailNotification,
    enableLineNotification: settings.enableLineNotification,
    maintenanceMode: settings.maintenanceMode,
  };
}

export function GeneralSettingsPanel() {
  const [settings, setSettings] = useState<SystemSettingsDraft>(defaultSettings);
  const [savedSettings, setSavedSettings] = useState<SystemSettings | null>(null);
  const [auditItems, setAuditItems] = useState<SystemSettingsAuditItem[]>([]);
  const [health, setHealth] = useState<MonitoringHealth | null>(null);
  const [readiness, setReadiness] = useState<MonitoringReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<ActionDialogState | null>(null);
  const [dialogLoading, setDialogLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  const loadData = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      try {
        if (mode === "initial") setLoading(true);
        if (mode === "refresh") setRefreshing(true);
        setError(null);

        const [settingsResult, auditResult, healthResult, readinessResult] =
          await Promise.allSettled([
            getSystemSettings(),
            getSystemSettingsAudit({ page: 1, pageSize: 5 }),
            getMonitoringHealth(),
            getMonitoringReadiness(),
          ]);

        if (settingsResult.status === "fulfilled") {
          setSavedSettings(settingsResult.value);
          setSettings(settingsToDraft(settingsResult.value));
          setLoadedAt(settingsResult.value.updatedAt);
        } else {
          throw settingsResult.reason instanceof Error
            ? settingsResult.reason
            : new Error("ไม่สามารถโหลด System Settings ได้");
        }

        if (auditResult.status === "fulfilled")
          setAuditItems(auditResult.value.data);
        if (healthResult.status === "fulfilled") setHealth(healthResult.value);
        if (readinessResult.status === "fulfilled")
          setReadiness(readinessResult.value);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "ไม่สามารถโหลดข้อมูลระบบได้",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  const metrics = useMemo(() => {
    const dependencySummary = readiness?.dependencySummary ?? {
      total: 0,
      ok: 0,
      degraded: 0,
      down: 0,
    };
    return {
      dependencies: dependencySummary.total,
      ok: dependencySummary.ok,
      degraded: dependencySummary.degraded,
      down: dependencySummary.down,
    };
  }, [readiness]);

  function updateSetting<K extends keyof SystemSettingsDraft>(
    key: K,
    value: SystemSettingsDraft[K],
  ) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    setError(null);

    try {
      const updated = await updateSystemSettings(draftToPayload(settings));
      setSavedSettings(updated);
      setSettings(settingsToDraft(updated));
      setLoadedAt(updated.updatedAt);
      setNotice("บันทึกค่าระบบลงฐานข้อมูลเรียบร้อยแล้ว");

      const audit = await getSystemSettingsAudit({ page: 1, pageSize: 5 });
      setAuditItems(audit.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "ไม่สามารถบันทึกค่าระบบได้",
      );
    } finally {
      setSaving(false);
    }
  }

  function openResetDialog() {
    setDialogState({
      title: "รีเซ็ตค่าเริ่มต้นกลางของระบบ",
      description:
        "ต้องการบันทึกค่าเริ่มต้นกลางกลับลงฐานข้อมูลหรือไม่ การเปลี่ยนแปลงนี้จะถูกบันทึกใน audit และไม่แก้ค่ารอบเงินเดือนเฉพาะบริษัทโดยตรง",
      confirmLabel: "รีเซ็ต",
      cancelLabel: "ยกเลิก",
      tone: "orange",
      onConfirm: async () => {
        setDialogLoading(true);
        try {
          const updated = await updateSystemSettings(
            draftToPayload(defaultSettings),
          );
          setSavedSettings(updated);
          setSettings(settingsToDraft(updated));
          setNotice("รีเซ็ตและบันทึกค่าระบบลงฐานข้อมูลเรียบร้อยแล้ว");
          setLoadedAt(updated.updatedAt);
          const audit = await getSystemSettingsAudit({ page: 1, pageSize: 5 });
          setAuditItems(audit.data);
        } finally {
          setDialogLoading(false);
        }
      },
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-[repeat(4,minmax(10.5rem,max-content))] sm:divide-y-0">
          <StatTile
            label="สถานะบริการ"
            value={health?.status === "ok" ? "ปกติ" : "-"}
            tone={health?.status === "ok" ? "positive" : "warning"}
            helper="Service health"
          />
          <StatTile
            label="Dependency"
            value={`${metrics.ok}/${metrics.dependencies || "-"}`}
            tone={metrics.down > 0 ? "warning" : "neutral"}
            helper="ที่ตอบสนองปกติ"
          />
          <StatTile
            label="Readiness"
            value={readiness?.status ?? "-"}
            tone={readiness?.status === "ok" ? "positive" : "warning"}
            helper="ความพร้อมของระบบ"
          />
          <StatTile
            label="Uptime"
            value={formatUptime(health?.uptimeSeconds)}
            helper={settings.timezone}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {loadedAt ? (
            <span className="text-[13px] text-slate-500">
              อัปเดตล่าสุด <DateTimeDisplay value={loadedAt} />
            </span>
          ) : null}
          <Button
            variant="secondary"
            onClick={() => void loadData("refresh")}
            disabled={refreshing || saving}
            icon={
              refreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )
            }
          >
            รีเฟรช
          </Button>
          <Button variant="secondary" onClick={openResetDialog} disabled={saving}>
            รีเซ็ตค่าเริ่มต้น
          </Button>
        </div>
      </div>

      {notice ? (
        <div className="px-5 py-3">
          <Notice tone="positive">{notice}</Notice>
        </div>
      ) : null}

      {loading ? (
        <div className="px-5 py-8">
          <LoadingState />
        </div>
      ) : error ? (
        <div className="px-5 py-8">
          <ErrorState
            description={error}
            action={
              <Button onClick={() => void loadData("refresh")}>ลองใหม่</Button>
            }
          />
        </div>
      ) : (
        <form onSubmit={saveSettings}>
          <Section
            title="ข้อมูลองค์กรและรูปแบบวันที่"
            description="ค่าพื้นฐานที่ส่งผลต่อการแสดงผลทั้งระบบ"
          >
            <FieldGrid columns={3}>
              <Field label="ชื่อระบบ/องค์กร">
                <TextInput
                  value={settings.organizationName}
                  onChange={(event) =>
                    updateSetting("organizationName", event.target.value)
                  }
                />
              </Field>
              <Field label="Timezone">
                <Select
                  value={settings.timezone}
                  onChange={(event) =>
                    updateSetting(
                      "timezone",
                      event.target.value as SystemSettingsDraft["timezone"],
                    )
                  }
                >
                  <option value="Asia/Bangkok">Asia/Bangkok</option>
                  <option value="UTC">UTC</option>
                </Select>
              </Field>
              <Field label="ภาษา">
                <Select
                  value={settings.locale}
                  onChange={(event) =>
                    updateSetting(
                      "locale",
                      event.target.value as SystemSettingsDraft["locale"],
                    )
                  }
                >
                  <option value="th-TH">ไทย (th-TH)</option>
                  <option value="en-US">อังกฤษ (en-US)</option>
                </Select>
              </Field>
              <Field label="รูปแบบวันที่">
                <Select
                  value={settings.dateFormat}
                  onChange={(event) =>
                    updateSetting(
                      "dateFormat",
                      event.target.value as SystemSettingsDraft["dateFormat"],
                    )
                  }
                >
                  <option value="DD/MM/YYYY พ.ศ.">DD/MM/YYYY พ.ศ.</option>
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                </Select>
              </Field>
              <Field label="รูปแบบเวลา">
                <Select
                  value={settings.timeFormat}
                  onChange={(event) =>
                    updateSetting(
                      "timeFormat",
                      event.target.value as SystemSettingsDraft["timeFormat"],
                    )
                  }
                >
                  <option value="HH:mm">HH:mm</option>
                  <option value="HH:mm:ss">HH:mm:ss</option>
                </Select>
              </Field>
              <Field label="เดือนเริ่มต้นปีงบประมาณ">
                <Select
                  value={settings.fiscalYearStartMonth}
                  onChange={(event) =>
                    updateSetting("fiscalYearStartMonth", event.target.value)
                  }
                >
                  {Array.from({ length: 12 }, (_, index) => (
                    <option key={index + 1} value={String(index + 1)}>
                      {String(index + 1).padStart(2, "0")}
                    </option>
                  ))}
                </Select>
              </Field>
            </FieldGrid>
          </Section>

          <Section
            title="ไฟล์แนบ"
            description="ใช้กับเอกสาร ใบลา OT และหลักฐานต่าง ๆ"
          >
            <FieldGrid columns={2}>
              <Field label="ขนาดไฟล์สูงสุด (MB)">
                <TextInput
                  type="number"
                  min="1"
                  max="200"
                  value={settings.fileUploadMaxMb}
                  onChange={(event) =>
                    updateSetting("fileUploadMaxMb", event.target.value)
                  }
                />
              </Field>
              <Field
                label="ชนิดไฟล์ที่อนุญาต"
                hint="คั่นแต่ละชนิดด้วยเครื่องหมายจุลภาค"
              >
                <Textarea
                  value={settings.allowedFileTypes}
                  onChange={(event) =>
                    updateSetting("allowedFileTypes", event.target.value)
                  }
                />
              </Field>
            </FieldGrid>
          </Section>

          <Section
            title="นโยบายรหัสผ่านและ session"
            description="ใช้ตอนตั้งรหัสผ่านใหม่และตอนเข้าสู่ระบบ"
          >
            <FieldGrid columns={2}>
              <Field label="Session หมดอายุใน (นาที)">
                <TextInput
                  type="number"
                  min="15"
                  max="1440"
                  value={settings.sessionTimeoutMinutes}
                  onChange={(event) =>
                    updateSetting("sessionTimeoutMinutes", event.target.value)
                  }
                />
              </Field>
              <Field label="รหัสผ่านขั้นต่ำ (ตัวอักษร)">
                <TextInput
                  type="number"
                  min="6"
                  max="128"
                  value={settings.passwordMinLength}
                  onChange={(event) =>
                    updateSetting("passwordMinLength", event.target.value)
                  }
                />
              </Field>
            </FieldGrid>

            <div className="mt-2 grid divide-y divide-slate-100 sm:grid-cols-2 sm:gap-x-8 sm:divide-y-0 sm:[&>*]:border-b sm:[&>*]:border-slate-100">
              <Toggle
                label="ต้องมีตัวพิมพ์ใหญ่"
                checked={settings.requireUppercase}
                onChange={(checked) => updateSetting("requireUppercase", checked)}
              />
              <Toggle
                label="ต้องมีตัวพิมพ์เล็ก"
                checked={settings.requireLowercase}
                onChange={(checked) => updateSetting("requireLowercase", checked)}
              />
              <Toggle
                label="ต้องมีตัวเลข"
                checked={settings.requireNumber}
                onChange={(checked) => updateSetting("requireNumber", checked)}
              />
              <Toggle
                label="ต้องมีสัญลักษณ์"
                checked={settings.requireSymbol}
                onChange={(checked) => updateSetting("requireSymbol", checked)}
              />
              <Toggle
                label="บังคับใช้ 2FA"
                checked={settings.requireTwoFactor}
                onChange={(checked) => updateSetting("requireTwoFactor", checked)}
              />
              <Toggle
                label="โหมดปิดปรับปรุงระบบ"
                hint="ผู้ใช้ทั่วไปจะเข้าใช้งานไม่ได้ชั่วคราว"
                checked={settings.maintenanceMode}
                onChange={(checked) => updateSetting("maintenanceMode", checked)}
              />
            </div>
          </Section>

          <Section title="การแจ้งเตือน" description="ช่องทางแจ้งเตือนหลักของระบบ">
            <div className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:gap-x-8 sm:divide-y-0">
              <Toggle
                label="อีเมล"
                checked={settings.enableEmailNotification}
                onChange={(checked) =>
                  updateSetting("enableEmailNotification", checked)
                }
              />
              <Toggle
                label="LINE"
                checked={settings.enableLineNotification}
                onChange={(checked) =>
                  updateSetting("enableLineNotification", checked)
                }
              />
            </div>
          </Section>

          <Section
            title="สถานะระบบเบื้องหลัง"
            description="ตรวจ service และ dependency จาก Monitoring API"
          >
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {(readiness?.dependencies ?? []).map((dependency) => (
                <div
                  key={dependency.name}
                  className="rounded-lg border border-slate-200 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-[13px] font-semibold text-slate-800">
                      {dependency.name}
                    </p>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-bold uppercase ${
                        dependency.status === "ok"
                          ? "bg-emerald-100 text-emerald-700"
                          : dependency.status === "degraded"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {dependency.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {dependency.message}
                  </p>
                  <p className="mt-1.5 text-xs text-slate-400">
                    {dependency.latencyMs} ms ·{" "}
                    <DateTimeDisplay value={dependency.checkedAt} />
                  </p>
                </div>
              ))}
              {(readiness?.dependencies ?? []).length === 0 ? (
                <p className="text-[13px] text-slate-400">
                  ยังไม่มีข้อมูล dependency จาก monitoring API
                </p>
              ) : null}
            </div>
          </Section>

          <Section
            title="ประวัติการแก้ค่าระบบ"
            description="ห้ารายการล่าสุด"
          >
            <div className="grid gap-1.5">
              {auditItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
                >
                  <span className="truncate font-medium text-slate-800">
                    {item.changedBy?.displayName ||
                      item.changedBy?.email ||
                      "ระบบ"}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">
                    <DateTimeDisplay value={item.createdAt} />
                  </span>
                </div>
              ))}
              {auditItems.length === 0 ? (
                <p className="text-[13px] text-slate-400">
                  ยังไม่มีประวัติการแก้ไขค่าระบบ
                </p>
              ) : null}
            </div>
          </Section>

          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <p className="text-xs text-slate-400">
              {savedSettings ? `Record ID: ${savedSettings.id}` : null}
            </p>
            <Button
              type="submit"
              disabled={saving}
              icon={
                saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )
              }
            >
              {saving ? "กำลังบันทึก" : "บันทึกค่าระบบ"}
            </Button>
          </div>
        </form>
      )}

      <ActionDialog
        state={dialogState}
        loading={dialogLoading}
        onClose={() => setDialogState(null)}
      />
    </>
  );
}
