"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, KeyRound, ShieldCheck, X } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Button, Field, Notice, TextInput } from "@/components/kit";

/**
 * เปลี่ยนรหัสผ่านของตัวเอง
 * ========================
 * เดิมไม่มีหน้านี้เลย ผู้ใช้ต้องรบกวนผู้ดูแลให้รีเซ็ตให้ทุกครั้ง
 * แปลว่าผู้ดูแลรู้รหัสผ่านของทุกคนอยู่ตลอด
 *
 * หน้านี้อยู่นอก (protected) เพราะบัญชีที่ถูกบังคับเปลี่ยนรหัสจะถูก guard
 * ฝั่งเซิร์ฟเวอร์กันไม่ให้เรียก API อื่นเลย ถ้าวางไว้ในพื้นที่ปกติจะโหลดข้อมูล
 * ประกอบหน้าไม่ได้แล้วค้างอยู่แบบนั้น
 */
/**
 * กฎรหัสผ่าน — ลอกมาจากฝั่งเซิร์ฟเวอร์ (assertStrongPassword) ให้ตรงกัน
 * ตรวจที่หน้าเว็บเพื่อบอกผลทันทีระหว่างพิมพ์ ไม่ใช่รอกดส่งแล้วค่อยรู้ว่าผิดข้อไหน
 * ของจริงยังตัดสินที่เซิร์ฟเวอร์เสมอ ตรงนี้เป็นแค่ตัวช่วย
 */
function passwordRules(password: string, identity: string[]) {
  const lower = password.toLowerCase();

  const forbiddenWords = ["password", "admin", "employee", "qwerty", "123456"];
  const personalParts = identity
    .map((part) => part?.trim().toLowerCase())
    .filter((part) => Boolean(part) && part.length >= 4);

  return [
    {
      label: "ยาว 10–128 ตัวอักษร",
      passed: password.length >= 10 && password.length <= 128,
    },
    { label: "มีตัวพิมพ์เล็ก", passed: /[a-z]/.test(password) },
    { label: "มีตัวพิมพ์ใหญ่", passed: /[A-Z]/.test(password) },
    { label: "มีตัวเลข", passed: /\d/.test(password) },
    { label: "ไม่มีช่องว่าง", passed: password.length > 0 && !/\s/.test(password) },
    {
      label: "ไม่มีคำเดาง่าย (password · admin · employee · qwerty · 123456)",
      passed:
        password.length > 0 && !forbiddenWords.some((word) => lower.includes(word)),
    },
    {
      label: "ไม่มีชื่อหรืออีเมลของตัวเอง",
      passed:
        password.length > 0 && !personalParts.some((part) => lower.includes(part)),
    },
  ];
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const { user, refreshMe } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const forced = Boolean(user?.mustChangePassword);

  const rules = useMemo(
    () =>
      passwordRules(newPassword, [
        user?.email?.split("@")[0] ?? "",
        user?.displayName ?? "",
      ]),
    [newPassword, user?.email, user?.displayName],
  );

  const allPassed = rules.every((rule) => rule.passed);
  const confirmMatched =
    confirmPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit =
    currentPassword.length > 0 && allPassed && confirmMatched && !submitting;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("รหัสผ่านใหม่กับช่องยืนยันไม่ตรงกัน");
      return;
    }

    setSubmitting(true);

    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      await refreshMe();
      router.replace("/dashboard");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "เปลี่ยนรหัสผ่านไม่สำเร็จ",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <p className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-slate-900 3xl:text-[16.5px]">
            <KeyRound className="h-4 w-4 text-brand-600" />
            เปลี่ยนรหัสผ่าน
          </p>
          <p className="mt-1 text-[13px] leading-6 text-slate-500 3xl:text-[14px]">
            {user?.email}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {forced ? (
            <Notice tone="warning">
              รหัสผ่านที่ใช้อยู่ถูกตั้งให้โดยผู้ดูแล
              <span className="font-semibold"> ต้องเปลี่ยนก่อนจึงจะใช้งานระบบได้</span>
            </Notice>
          ) : null}

          <Field label="รหัสผ่านเดิม" required>
            <TextInput
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
            />
          </Field>

          <Field label="รหัสผ่านใหม่" required>
            <TextInput
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
            />
          </Field>

          <Field
            label="ยืนยันรหัสผ่านใหม่"
            required
            hint={
              confirmPassword.length === 0
                ? undefined
                : confirmMatched
                  ? "ตรงกัน"
                  : "ยังไม่ตรงกับรหัสผ่านใหม่"
            }
          >
            <TextInput
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
            />
          </Field>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
            <p className="flex items-center justify-between gap-2 text-[12px] font-semibold text-slate-700">
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
                กติกาของรหัสผ่าน
              </span>
              <span
                className={
                  newPassword.length === 0
                    ? "text-slate-400"
                    : allPassed
                      ? "text-emerald-700"
                      : "text-amber-700"
                }
              >
                {newPassword.length === 0
                  ? `${rules.length} ข้อ`
                  : `ผ่าน ${rules.filter((rule) => rule.passed).length}/${rules.length}`}
              </span>
            </p>

            <ul className="mt-2 space-y-1">
              {rules.map((rule) => {
                const idle = newPassword.length === 0;

                return (
                  <li
                    key={rule.label}
                    className={`flex items-start gap-2 text-[12px] leading-6 ${
                      idle
                        ? "text-slate-500"
                        : rule.passed
                          ? "text-emerald-700"
                          : "text-slate-500"
                    }`}
                  >
                    {idle ? (
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                    ) : rule.passed ? (
                      <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    ) : (
                      <X className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-300" />
                    )}
                    {rule.label}
                  </li>
                );
              })}
            </ul>
          </div>

          {error ? <Notice tone="critical">{error}</Notice> : null}

          <div className="flex justify-end gap-2 pt-1">
            {forced ? null : (
              <Button type="button" onClick={() => router.back()} disabled={submitting}>
                ยกเลิก
              </Button>
            )}
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              disabled={!canSubmit}
            >
              เปลี่ยนรหัสผ่าน
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}
