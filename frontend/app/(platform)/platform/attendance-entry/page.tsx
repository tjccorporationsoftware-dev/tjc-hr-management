"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Clock, Loader2, RefreshCw, Save } from "lucide-react";

import { apiFetch } from "@/lib/api";

/* ------------------------------------------------------------------ */
/* types                                                               */
/* ------------------------------------------------------------------ */

type Company = {
  id: string;
  code: string;
  nameTh: string;
};

type Employee = {
  id: string;
  employeeCode: string | null;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  companyId: string | null;
};

type EmployeeListResponse = {
  items: Employee[];
};

type AttendanceLog = {
  id: string;
  employeeId: string;
  logType: string;
  logTime: string;
};

type AttendanceLogListResponse = {
  items: AttendanceLog[];
};

type RowState = {
  timeIn: string; // เข้างานเช้า (CHECK_IN ก่อนเที่ยง)
  timeAfternoon: string; // เข้างานบ่าย (CHECK_IN หลังเที่ยง)
  timeOut: string; // ออกงาน
  saving: boolean;
  /** มีเวลาที่บันทึกไว้แล้วในระบบ */
  savedIn: boolean;
  savedAfternoon: boolean;
  savedOut: boolean;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function todayISODate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function employeeName(employee: Employee) {
  return (
    employee.displayName?.trim() ||
    [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim() ||
    employee.employeeCode ||
    "-"
  );
}

/** "2026-07-24" + "08:30" → ISO ที่ระบุ +07:00 ชัดเจน */
function toBangkokISO(date: string, time: string) {
  return `${date}T${time}:00+07:00`;
}

/** ISO → "HH:mm" ตามเวลาไทย (ใช้ prefill จาก log เดิม) */
function toBangkokHHmm(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * แปลงข้อความเวลาที่พิมพ์ → "HH:mm" 24 ชม. (รับหลายรูปแบบ)
 * "" → "" (ว่าง), พิมพ์ผิด → null
 * รองรับ: "8" "830" "0830" "1830" "8:30" "08:5"
 */
function normalizeTime(raw: string): string | null {
  const s = raw.trim();
  if (!s) return "";

  let hh: number;
  let mm: number;

  if (s.includes(":")) {
    const [h, m] = s.split(":");
    hh = Number(h);
    mm = Number(m || "0");
  } else {
    const digits = s.replace(/\D/g, "");
    if (!digits) return null;
    if (digits.length <= 2) {
      hh = Number(digits);
      mm = 0;
    } else {
      const padded = digits.padStart(4, "0").slice(-4);
      hh = Number(padded.slice(0, 2));
      mm = Number(padded.slice(2, 4));
    }
  }

  if (
    !Number.isInteger(hh) ||
    !Number.isInteger(mm) ||
    hh < 0 ||
    hh > 23 ||
    mm < 0 ||
    mm > 59
  ) {
    return null;
  }

  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** ช่องกรอกเวลา 24 ชม. ธีมมืด (แทน native time picker ที่เป็น AM/PM + สีขาว) */
function TimeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      maxLength={5}
      value={value}
      placeholder="--:--"
      onChange={(event) => onChange(event.target.value)}
      onBlur={(event) => {
        const normalized = normalizeTime(event.target.value);
        if (normalized !== null) onChange(normalized);
      }}
      className="h-10 w-28 rounded-xl border border-slate-700 bg-slate-800 px-3 text-center font-mono text-sm tabular-nums text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30"
    />
  );
}

/* ------------------------------------------------------------------ */
/* page                                                                */
/* ------------------------------------------------------------------ */

export default function PlatformAttendanceEntryPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [date, setDate] = useState(todayISODate());

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loading, setLoading] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  /* ---------------------------------------------------------------- */

  useEffect(() => {
    (async () => {
      try {
        const result = await apiFetch<Company[]>(
          "/organization/companies?pageSize=100&status=ACTIVE",
        );
        const list = Array.isArray(result) ? result : [];
        setCompanies(list);
        if (list.length > 0) setCompanyId(list[0].id);
      } catch {
        setMessage({ type: "err", text: "โหลดรายชื่อบริษัทไม่สำเร็จ" });
      } finally {
        setLoadingCompanies(false);
      }
    })();
  }, []);

  const loadEmployeesAndLogs = useCallback(async () => {
    if (!companyId || !date) return;

    setLoading(true);
    setMessage(null);
    try {
      const empRes = await apiFetch<EmployeeListResponse>(
        `/employees?page=1&pageSize=100&companyId=${companyId}&status=ACTIVE`,
      );
      const emps = empRes.items ?? [];
      setEmployees(emps);

      // ดึง log ของวันนั้นมา prefill (best-effort — ถ้าไม่มีสิทธิ์อ่านก็ข้าม)
      let logs: AttendanceLog[] = [];
      try {
        const logRes = await apiFetch<AttendanceLogListResponse>(
          `/attendance/logs?dateFrom=${date}&dateTo=${date}&pageSize=100`,
        );
        logs = logRes.items ?? [];
      } catch {
        logs = [];
      }

      const byEmployee = new Map<
        string,
        { in?: string; afternoon?: string; out?: string }
      >();
      for (const log of logs) {
        const entry = byEmployee.get(log.employeeId) ?? {};
        const hhmm = toBangkokHHmm(log.logTime);
        if (log.logType === "CHECK_IN") {
          // แยกเช้า/บ่ายจากเวลา (ก่อน/หลังเที่ยง) เหมือนที่ daily summary ใช้
          const isAfternoon = hhmm >= "12:00";
          if (isAfternoon) {
            if (!entry.afternoon) entry.afternoon = hhmm;
          } else if (!entry.in) {
            entry.in = hhmm;
          }
        }
        if (log.logType === "CHECK_OUT") {
          entry.out = hhmm;
        }
        byEmployee.set(log.employeeId, entry);
      }

      const nextRows: Record<string, RowState> = {};
      for (const emp of emps) {
        const existing = byEmployee.get(emp.id);
        nextRows[emp.id] = {
          timeIn: existing?.in ?? "",
          timeAfternoon: existing?.afternoon ?? "",
          timeOut: existing?.out ?? "",
          saving: false,
          savedIn: Boolean(existing?.in),
          savedAfternoon: Boolean(existing?.afternoon),
          savedOut: Boolean(existing?.out),
        };
      }
      setRows(nextRows);
    } catch {
      setMessage({ type: "err", text: "โหลดรายชื่อพนักงานไม่สำเร็จ" });
      setEmployees([]);
      setRows({});
    } finally {
      setLoading(false);
    }
  }, [companyId, date]);

  useEffect(() => {
    void loadEmployeesAndLogs();
  }, [loadEmployeesAndLogs]);

  function updateRow(employeeId: string, patch: Partial<RowState>) {
    setRows((current) => ({
      ...current,
      [employeeId]: { ...current[employeeId], ...patch },
    }));
  }

  /** บันทึกเวลาเข้า/ออกของพนักงาน 1 คน (สร้าง log เท่าที่กรอก) */
  async function saveRow(employee: Employee): Promise<boolean> {
    const row = rows[employee.id];
    if (!row) return false;
    if (!row.timeIn && !row.timeAfternoon && !row.timeOut) return true;

    // normalize + ตรวจรูปแบบก่อนส่ง (เผื่อกดบันทึกโดยไม่ได้ blur)
    const nIn = normalizeTime(row.timeIn);
    const nAft = normalizeTime(row.timeAfternoon);
    const nOut = normalizeTime(row.timeOut);
    if (nIn === null || nAft === null || nOut === null) {
      return false; // รูปแบบเวลาไม่ถูกต้อง
    }

    const post = (logType: "CHECK_IN" | "CHECK_OUT", time: string) =>
      apiFetch("/attendance/logs/manual", {
        method: "POST",
        body: JSON.stringify({
          employeeId: employee.id,
          logType,
          logTime: toBangkokISO(date, time),
          note: "กรอกจากหน้ากรอกเวลา (platform)",
        }),
      });

    updateRow(employee.id, { saving: true });
    try {
      if (nIn && !row.savedIn) await post("CHECK_IN", nIn);
      if (nAft && !row.savedAfternoon) await post("CHECK_IN", nAft);
      if (nOut && !row.savedOut) await post("CHECK_OUT", nOut);

      updateRow(employee.id, {
        saving: false,
        timeIn: nIn,
        timeAfternoon: nAft,
        timeOut: nOut,
        savedIn: Boolean(nIn),
        savedAfternoon: Boolean(nAft),
        savedOut: Boolean(nOut),
      });
      return true;
    } catch {
      updateRow(employee.id, { saving: false });
      return false;
    }
  }

  async function handleSaveRow(employee: Employee) {
    setMessage(null);
    const ok = await saveRow(employee);
    setMessage(
      ok
        ? { type: "ok", text: `บันทึกเวลาของ ${employeeName(employee)} แล้ว` }
        : { type: "err", text: `บันทึกของ ${employeeName(employee)} ไม่สำเร็จ` },
    );
  }

  async function handleSaveAll() {
    setSavingAll(true);
    setMessage(null);
    let okCount = 0;
    let failCount = 0;

    for (const emp of employees) {
      const row = rows[emp.id];
      if (!row) continue;
      const hasNew =
        (row.timeIn && !row.savedIn) ||
        (row.timeAfternoon && !row.savedAfternoon) ||
        (row.timeOut && !row.savedOut);
      if (!hasNew) continue;

      const ok = await saveRow(emp);
      if (ok) okCount += 1;
      else failCount += 1;
    }

    setSavingAll(false);
    setMessage({
      type: failCount === 0 ? "ok" : "err",
      text:
        failCount === 0
          ? `บันทึกทั้งหมดแล้ว ${okCount.toLocaleString("th-TH")} คน`
          : `บันทึกสำเร็จ ${okCount} คน ล้มเหลว ${failCount} คน`,
    });
  }

  const pendingCount = useMemo(
    () =>
      employees.filter((emp) => {
        const row = rows[emp.id];
        return (
          row &&
          ((row.timeIn && !row.savedIn) ||
            (row.timeAfternoon && !row.savedAfternoon) ||
            (row.timeOut && !row.savedOut))
        );
      }).length,
    [employees, rows],
  );

  /* ---------------------------------------------------------------- */

  const inputClass =
    "h-10 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30 disabled:opacity-50";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-100">
          <Clock className="h-5 w-5 text-violet-400" />
          กรอกเวลาเข้า-ออกงาน
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          กรอกเวลาลงเวลาให้พนักงานเอง (ดูจากแหล่งอื่นแล้วมาบันทึก) — บันทึกเป็น
          MANUAL เข้าระบบตามปกติ
        </p>
      </div>

      {/* controls */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-400">บริษัท</span>
          <select
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
            disabled={loadingCompanies}
            className={cn(inputClass, "min-w-56")}
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.code} · {company.nameTh}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-400">วันที่</span>
          <span className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className={cn(inputClass, "pl-9")}
            />
          </span>
        </label>

        <button
          type="button"
          onClick={loadEmployeesAndLogs}
          disabled={loading}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 text-sm font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          โหลดใหม่
        </button>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-400">
            ยังไม่บันทึก {pendingCount.toLocaleString("th-TH")} คน
          </span>
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={savingAll || pendingCount === 0}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50"
          >
            {savingAll ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            บันทึกทั้งหมด
          </button>
        </div>
      </div>

      {message ? (
        <div
          className={cn(
            "rounded-xl border px-4 py-2.5 text-sm",
            message.type === "ok"
              ? "border-emerald-800 bg-emerald-950/50 text-emerald-300"
              : "border-rose-800 bg-rose-950/50 text-rose-300",
          )}
        >
          {message.text}
        </div>
      ) : null}

      {/* table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
            กำลังโหลด…
          </div>
        ) : employees.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">
            ไม่พบพนักงานในบริษัทนี้
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-900/80">
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-semibold">พนักงาน</th>
                <th className="px-4 py-3 font-semibold">เข้างานเช้า</th>
                <th className="px-4 py-3 font-semibold">เข้างานบ่าย</th>
                <th className="px-4 py-3 font-semibold">ออกงาน</th>
                <th className="px-4 py-3 text-right font-semibold">บันทึก</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const row = rows[emp.id];
                if (!row) return null;
                const fullySaved =
                  (!row.timeIn || row.savedIn) &&
                  (!row.timeAfternoon || row.savedAfternoon) &&
                  (!row.timeOut || row.savedOut) &&
                  (row.savedIn || row.savedAfternoon || row.savedOut);
                const isEmpty =
                  !row.timeIn && !row.timeAfternoon && !row.timeOut;

                return (
                  <tr
                    key={emp.id}
                    className="border-b border-slate-800/70 transition hover:bg-slate-900/40"
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-100">
                        {employeeName(emp)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {emp.employeeCode ?? "—"}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <TimeField
                        value={row.timeIn}
                        onChange={(v) =>
                          updateRow(emp.id, { timeIn: v, savedIn: false })
                        }
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <TimeField
                        value={row.timeAfternoon}
                        onChange={(v) =>
                          updateRow(emp.id, {
                            timeAfternoon: v,
                            savedAfternoon: false,
                          })
                        }
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <TimeField
                        value={row.timeOut}
                        onChange={(v) =>
                          updateRow(emp.id, { timeOut: v, savedOut: false })
                        }
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {fullySaved ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-950/60 px-2.5 py-1 text-xs font-semibold text-emerald-400">
                          <Check className="h-3.5 w-3.5" />
                          บันทึกแล้ว
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSaveRow(emp)}
                          disabled={row.saving || isEmpty}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-700 bg-violet-950/40 px-3 py-1.5 text-xs font-semibold text-violet-300 transition hover:bg-violet-900/40 disabled:opacity-40"
                        >
                          {row.saving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
                          บันทึก
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-slate-500">
        หมายเหตุ: เวลาเข้า/ออกที่บันทึกไปแล้วจะขึ้น &quot;บันทึกแล้ว&quot; และช่องจะไม่ส่งซ้ำ
        หากต้องแก้เวลาที่บันทึกผิด ให้ไปแก้ที่หน้าจัดการเวลาในระบบบริษัท
      </p>
    </div>
  );
}
