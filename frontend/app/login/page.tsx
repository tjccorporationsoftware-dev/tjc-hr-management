"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { ApiClientError } from "@/lib/api";
import { getDefaultDashboardPath } from "@/lib/default-dashboard";

export default function LoginPage() {
  const router = useRouter();
  const { login, verifyTwoFactor, isAuthenticated, isLoading, user } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [step, setStep] = useState<"credentials" | "twoFactor">("credentials");
  const [twoFactorToken, setTwoFactorToken] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorExpiresAt, setTwoFactorExpiresAt] = useState("");
  const [debugTwoFactorCode, setDebugTwoFactorCode] = useState<
    string | undefined
  >(undefined);

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      router.replace(getDefaultDashboardPath(user));
    }
  }, [isAuthenticated, isLoading, router, user]);

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setSubmitting(true);

      const result = await login({
        email,
        password,
      });

      if (result.requiresTwoFactor) {
        setTwoFactorToken(result.twoFactorToken);
        setTwoFactorExpiresAt(result.expiresAt);
        setDebugTwoFactorCode(result.debugTwoFactorCode);
        setTwoFactorCode("");
        setStep("twoFactor");

        toast.info("กรุณากรอกรหัสยืนยัน 2FA");
        return;
      }

      toast.success("เข้าสู่ระบบสำเร็จ");
      router.replace(result.redirectTo);
    } catch (error) {
      if (error instanceof ApiClientError) {
        toast.error(error.message);
      } else {
        toast.error("เข้าสู่ระบบไม่สำเร็จ");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTwoFactorSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setSubmitting(true);

      const result = await verifyTwoFactor({
        twoFactorToken,
        code: twoFactorCode,
      });

      toast.success("ยืนยัน 2FA สำเร็จ");
      router.replace(result.redirectTo);
    } catch (error) {
      if (error instanceof ApiClientError) {
        toast.error(error.message);
      } else {
        toast.error("ยืนยัน 2FA ไม่สำเร็จ");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function resetToCredentials() {
    setStep("credentials");
    setTwoFactorToken("");
    setTwoFactorCode("");
    setTwoFactorExpiresAt("");
    setDebugTwoFactorCode(undefined);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-900">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-[1280px] items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden lg:block">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-8 inline-flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">
              <ShieldCheck className="h-4 w-4" />
              HR Workforce Management System
            </div>

            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-slate-950">
              ระบบบริหารงานบุคคลสำหรับองค์กรยุคใหม่
            </h1>

            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-500">
              รองรับการจัดการผู้ใช้ สิทธิ์ องค์กร พนักงาน การลงเวลา การลา OT
              เอกสาร และรายงาน โดยออกแบบให้ปลอดภัย เป็นระบบ และขยายต่อได้
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                ["Auth", "JWT + Refresh Token"],
                ["RBAC", "Role & Permission"],
                ["Phase 8", "Login Protection + 2FA"],
              ].map(([title, desc]) => (
                <div
                  key={title}
                  className="rounded-3xl border border-slate-200 bg-slate-50 p-5"
                >
                  <div className="text-sm font-semibold text-slate-900">
                    {title}
                  </div>
                  <div className="mt-2 text-sm text-slate-500">{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[460px]">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            {step === "credentials" ? (
              <>
                <div className="mb-8 flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
                    <LockKeyhole className="h-6 w-6" />
                  </div>

                  <div>
                    <h2 className="text-2xl font-semibold text-slate-950">
                      เข้าสู่ระบบ
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      ลงชื่อเข้าใช้งานระบบ HR
                    </p>
                  </div>
                </div>

                <form onSubmit={handleLoginSubmit} className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      อีเมล
                    </label>
                    <input
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      type="email"
                      autoComplete="email"
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                      placeholder="demo0008@example.com"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      รหัสผ่าน
                    </label>
                    <div className="relative">
                      <input
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-12 text-sm text-slate-900 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        placeholder="กรอกรหัสผ่าน"
                      />

                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        aria-label="toggle password visibility"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        กำลังเข้าสู่ระบบ...
                      </>
                    ) : (
                      "เข้าสู่ระบบ"
                    )}
                  </button>
                </form>

              </>
            ) : (
              <>
                <div className="mb-8 flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
                    <KeyRound className="h-6 w-6" />
                  </div>

                  <div>
                    <h2 className="text-2xl font-semibold text-slate-950">
                      ยืนยัน 2FA
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      กรอกรหัสยืนยัน 6 หลักเพื่อเข้าใช้งานระบบ
                    </p>
                  </div>
                </div>

                <form onSubmit={handleTwoFactorSubmit} className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      รหัสยืนยัน 2FA
                    </label>
                    <input
                      value={twoFactorCode}
                      onChange={(event) =>
                        setTwoFactorCode(
                          event.target.value.replace(/\D/g, "").slice(0, 6),
                        )
                      }
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-center text-2xl font-semibold tracking-[0.45em] text-slate-900 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                      placeholder="000000"
                    />
                  </div>

                  {debugTwoFactorCode ? (
                    <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
                      <div className="font-semibold">Dev 2FA Code</div>
                      <div className="mt-1 text-2xl font-bold tracking-[0.3em]">
                        {debugTwoFactorCode}
                      </div>
                      <div className="mt-2 text-xs text-blue-700">
                        แสดงเฉพาะโหมด development เท่านั้น
                      </div>
                    </div>
                  ) : null}

                  {twoFactorExpiresAt ? (
                    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
                      รหัสนี้มีอายุถึง:{" "}
                      {new Date(twoFactorExpiresAt).toLocaleString("th-TH")}
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={submitting || twoFactorCode.length !== 6}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        กำลังยืนยัน...
                      </>
                    ) : (
                      "ยืนยันและเข้าสู่ระบบ"
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={resetToCredentials}
                    disabled={submitting}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    กลับไปกรอกอีเมลและรหัสผ่านใหม่
                  </button>
                </form>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}