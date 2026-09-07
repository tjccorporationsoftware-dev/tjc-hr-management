"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DateTimeDisplay } from "@/components/common/date-display";
import { Button } from "@/components/kit";
import { ErrorState, LoadingState } from "@/components/common/feedback-state";
import { HolidaySettingsPanel } from "@/components/settings/holiday-settings-panel";
import { getSystemSettings, updateSystemSettings } from "@/lib/api";
import type {
  AttendanceHolidayWeekday,
  SystemSettings,
} from "@/types/system-settings";

const weekdayNames: Record<AttendanceHolidayWeekday, string> = {
  SUN: "อาทิตย์",
  MON: "จันทร์",
  TUE: "อังคาร",
  WED: "พุธ",
  THU: "พฤหัสบดี",
  FRI: "ศุกร์",
  SAT: "เสาร์",
};

export function HolidayPanel() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [weeklyHolidays, setWeeklyHolidays] = useState<
    AttendanceHolidayWeekday[]
  >(["SUN"]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadData = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      try {
        if (mode === "initial") setLoading(true);
        setError(null);

        const result = await getSystemSettings();
        setSettings(result);
        setWeeklyHolidays(
          result.attendanceWeeklyHolidays?.length
            ? result.attendanceWeeklyHolidays
            : ["SUN"],
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "ไม่สามารถโหลดปฏิทินวันหยุดได้",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  const weeklyHolidayNames = useMemo(() => {
    const names = weeklyHolidays
      .map((day) => weekdayNames[day])
      .filter(Boolean);
    return names.length
      ? names.join(" · ")
      : "ยังไม่ได้เลือกวันหยุดประจำสัปดาห์";
  }, [weeklyHolidays]);

  async function saveWeeklyHolidays() {
    setSaving(true);
    setNotice(null);
    setError(null);

    try {
      const updated = await updateSystemSettings({
        attendanceWeeklyHolidays: weeklyHolidays,
      });
      setSettings(updated);
      setWeeklyHolidays(
        updated.attendanceWeeklyHolidays?.length
          ? updated.attendanceWeeklyHolidays
          : ["SUN"],
      );
      setNotice("บันทึกวันหยุดประจำสัปดาห์เรียบร้อยแล้ว");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "ไม่สามารถบันทึกวันหยุดประจำสัปดาห์ได้",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {notice ? (
        <div className="border-b border-emerald-100 bg-emerald-50/70 px-5 py-2.5 text-[12.5px] font-semibold text-emerald-700 sm:px-6 3xl:px-7 3xl:text-[13px]">
          {notice}
        </div>
      ) : null}

      {loading ? (
        <div className="px-5 3xl:px-6 4xl:px-7 py-8 xl:px-6">
          <LoadingState />
        </div>
      ) : error ? (
        <div className="px-5 3xl:px-6 4xl:px-7 py-8 xl:px-6">
          <ErrorState
            description={error}
            action={
              <Button onClick={() => void loadData("refresh")}>ลองใหม่</Button>
            }
          />
        </div>
      ) : (
        <HolidaySettingsPanel
          weeklyHolidays={weeklyHolidays}
          onWeeklyHolidaysChange={setWeeklyHolidays}
          onSaveWeeklyHolidays={() => void saveWeeklyHolidays()}
          savingWeeklyHolidays={saving}
          /* สรุปของแท็บไปอยู่ซ้ายแถบเครื่องมือเดียวกับปุ่ม ไม่ต้องมีแถบของตัวเอง */
          summary={
            <>
              วันหยุดประจำสัปดาห์{" "}
              {weeklyHolidays.length.toLocaleString("th-TH")} วัน ·{" "}
              {weeklyHolidayNames}
              {settings?.updatedAt ? (
                <>
                  {" · อัปเดต "}
                  <DateTimeDisplay value={settings.updatedAt} />
                </>
              ) : null}
            </>
          }
        />
      )}
    </>
  );
}
