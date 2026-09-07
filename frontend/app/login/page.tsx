"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  HelpCircle,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogIn,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { ApiClientError } from "@/lib/api";
import { getDefaultDashboardPath } from "@/lib/default-dashboard";

/**
 * เข้าสู่ระบบ
 * ----------
 * จอแรกที่พนักงานเห็น และเป็นจอเดียวที่คนนอกองค์กรเปิดถึง — หน้าตาจึงต้องบอก
 * ให้ได้ในสองวินาทีว่านี่คือระบบของบริษัท ใช้โครงและโทนเดียวกับจอล็อกอินของ
 * แอปมือถือ (employee-mobile) เพื่อให้พนักงานที่ใช้ทั้งสองทางเห็นเป็นระบบเดียวกัน
 *
 * โครงของจอ — สามก้อน น้ำหนักไม่เท่ากัน
 *   ตรา (มีแสงฟ้าหนุน) → ฟอร์ม → ทางออกเมื่อเข้าไม่ได้ (พื้นฟ้าจาง)
 *
 * ไม่มีการ์ดครอบฟอร์ม: ทั้งจอมีของอยู่คอลัมน์เดียว กรอบจึงไม่ได้แยกมันออกจาก
 * อะไร มีแต่ทำให้เกิดขอบซ้อนขอบกับช่องกรอกที่อยู่ข้างใน
 *
 * ของเดิมเป็นสองคอลัมน์ ครึ่งซ้ายเป็นแผงโฆษณาที่เขียนศัพท์ภายในทีมพัฒนา
 * (Auth / RBAC / Phase 8) ซึ่งไม่มีความหมายกับพนักงานที่เข้ามาใช้จริง
 */

/** ระยะขอบซ้ายของช่องกรอกที่มีไอคอนนำหน้า */
const INPUT_WITH_ICON =
  "h-12 w-full rounded-2xl border border-brand-700/15 bg-white pl-11 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-100";

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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white px-6 py-12 text-slate-900">
      {/*
        แสงฟ้าจางหลังตรา — จอนี้ไม่มีการ์ดและไม่มีแถบสีให้ยึดสายตา แต่หัวจอ
        ก็ยังต้องหนักกว่าท้ายจอ แสงกลมไล่จางทำงานตรงนั้นได้โดยไม่มีขอบสักเส้น
        (ต้องเป็น radial-gradient ไม่ใช่วงกลมโปร่งแสง ซึ่งจะเห็นเป็นจานสีฟ้า)
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[540px] w-[540px] -translate-x-1/2 -translate-y-1/3"
        style={{
          /*
            closest-side บังคับให้ไล่สีจบพอดีที่ขอบกล่อง — ค่าปกติ (farthest-corner)
            ไล่ไปจบที่มุม แปลว่ากลางขอบยังมีสีเหลืออยู่ แล้วเห็นเป็นสี่เหลี่ยมขอบคม
          */
          background:
            "radial-gradient(circle closest-side, rgba(59,130,246,0.17) 0%, rgba(59,130,246,0.055) 55%, rgba(59,130,246,0) 100%)",
        }}
      />

      <div className="relative w-full max-w-[400px]">
        {/* ------------------------------------------------------------ ตรา */}
        <div className="flex flex-col items-center gap-3">
          <Image
            src="/logo/app-icon.png"
            alt="HR-TJC GROUP"
            width={1024}
            height={1024}
            priority
            className="h-[88px] w-[88px] object-contain"
          />

          {/*
            คำโปรยบรรทัดเดียวสั้น ๆ อ่านเป็นหางของตรา ไม่ใช่ประโยคที่ตั้งใจให้อ่าน
            — ข้อความเดียวกับจอล็อกอินของแอป
          */}
          <p className="text-center text-[12.5px] tracking-[0.01em] text-slate-500">
            เวลาทำงาน คำขอ และข้อมูลในที่เดียว
          </p>
        </div>

        {step === "credentials" ? (
          <>
            {/* -------------------------------------------------------- ฟอร์ม */}
            <div className="mt-9">
              {/*
                หัวฟอร์ม = ไอคอนในแผ่นฟ้าจาง + ชื่อ + คำอธิบาย เรียงเป็นแถวเดียว
                โครงเดียวกับหัวเรื่องของทุกหน้าหลังล็อกอิน
              */}
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-brand-700/8 text-brand-700">
                  <LogIn className="h-5 w-5" />
                </span>

                <div className="min-w-0">
                  <h1 className="text-xl font-bold tracking-tight text-slate-950">
                    เข้าสู่ระบบ
                  </h1>
                  <p className="mt-0.5 text-xs text-slate-500">
                    ใช้อีเมลบริษัทที่ฝ่ายบุคคลออกให้
                  </p>
                </div>
              </div>

              <form onSubmit={handleLoginSubmit} className="mt-4">
                {/* สองช่องกรอกอยู่ชิดกันเป็นคู่ แล้วเว้นห่างจากปุ่มมากกว่า —
                    ปุ่มคือการกระทำ ไม่ใช่ช่องที่สาม */}
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="login-email"
                      className="mb-1.5 block text-[12.5px] font-medium text-slate-600"
                    >
                      อีเมล
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                      <input
                        id="login-email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        type="email"
                        autoComplete="email"
                        className={INPUT_WITH_ICON}
                        placeholder="employee@company.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="login-password"
                      className="mb-1.5 block text-[12.5px] font-medium text-slate-600"
                    >
                      รหัสผ่าน
                    </label>
                    <div className="relative">
                      <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                      <input
                        id="login-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        className={`${INPUT_WITH_ICON} pr-12`}
                        placeholder="••••••••"
                      />

                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        aria-label="แสดงหรือซ่อนรหัสผ่าน"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/*
                  ลูกศรไปข้างหน้าอยู่ท้ายข้อความ ไม่ใช่หน้าข้อความ — ปุ่มนี้พาไป
                  ข้างใน สายตาที่อ่านจบคำแล้วเจอลูกศรต่อท้ายจะได้ทิศทางฟรี ๆ
                  เงาลึกกว่าของอื่นในจอ เพราะเป็นชิ้นเดียวที่ยกขึ้นจากพื้น
                */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-6 flex h-[54px] w-full items-center justify-center gap-2.5 rounded-2xl bg-brand-700 px-4 text-[15px] font-bold tracking-[0.01em] text-white shadow-[0_8px_16px_-4px_rgba(29,78,216,0.35)] transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-65"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-[18px] w-[18px] animate-spin" />
                      กำลังเข้าสู่ระบบ...
                    </>
                  ) : (
                    <>
                      เข้าสู่ระบบ
                      <ArrowRight className="h-[18px] w-[18px]" />
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* ------------------------------------------------------ ท้ายจอ */}
            {/*
              ทางออกเมื่อเข้าไม่ได้ — คำถามที่เกิดกับจอนี้บ่อยที่สุด
              อยู่บนพื้นฟ้าจาง ไม่ใช่ตัวหนังสือเทาลอย ๆ กลางจอ: ของที่ต้องหาเจอ
              ตอนกำลังหงุดหงิดว่าเข้าไม่ได้ ต้องมีรูปทรงให้เล็งถูกโดยไม่ต้องอ่าน
            */}
            <div className="mt-8 flex items-start gap-3 rounded-[18px] bg-brand-700/8 px-4 py-3.5">
              <HelpCircle className="mt-0.5 h-[19px] w-[19px] shrink-0 text-brand-700" />
              <div className="min-w-0">
                <div className="text-[12.5px] font-bold leading-[17px] text-slate-900">
                  ลืมรหัสผ่าน หรือยังไม่มีบัญชี
                </div>
                <div className="mt-0.5 text-[11.5px] leading-4 text-slate-500">
                  ติดต่อฝ่ายบุคคลของบริษัทเพื่อขอบัญชีหรือรหัสผ่านใหม่
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* ----------------------------------------------------- ยืนยัน 2FA */}
            <div className="mt-9">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-brand-700/8 text-brand-700">
                  <KeyRound className="h-5 w-5" />
                </span>

                <div className="min-w-0">
                  <h1 className="text-xl font-bold tracking-tight text-slate-950">
                    ยืนยัน 2FA
                  </h1>
                  <p className="mt-0.5 text-xs text-slate-500">
                    กรอกรหัสยืนยัน 6 หลักเพื่อเข้าใช้งานระบบ
                  </p>
                </div>
              </div>

              <form onSubmit={handleTwoFactorSubmit} className="mt-4">
                <label
                  htmlFor="login-2fa"
                  className="mb-1.5 block text-[12.5px] font-medium text-slate-600"
                >
                  รหัสยืนยัน 2FA
                </label>
                <input
                  id="login-2fa"
                  value={twoFactorCode}
                  onChange={(event) =>
                    setTwoFactorCode(
                      event.target.value.replace(/\D/g, "").slice(0, 6),
                    )
                  }
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="h-14 w-full rounded-2xl border border-brand-700/15 bg-white px-4 text-center text-2xl font-semibold tracking-[0.45em] text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
                  placeholder="000000"
                />

                {debugTwoFactorCode ? (
                  <div className="mt-3 rounded-[18px] bg-brand-700/8 px-4 py-3.5 text-brand-800">
                    <div className="text-[12.5px] font-bold">
                      รหัสสำหรับทดสอบ
                    </div>
                    <div className="mt-1 text-2xl font-bold tracking-[0.3em]">
                      {debugTwoFactorCode}
                    </div>
                    <div className="mt-1 text-[11.5px] text-brand-700/80">
                      แสดงเฉพาะโหมด development เท่านั้น
                    </div>
                  </div>
                ) : null}

                {twoFactorExpiresAt ? (
                  <div className="mt-3 text-center text-[11.5px] text-slate-500">
                    รหัสนี้มีอายุถึง{" "}
                    {new Date(twoFactorExpiresAt).toLocaleString("th-TH")}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={submitting || twoFactorCode.length !== 6}
                  className="mt-6 flex h-[54px] w-full items-center justify-center gap-2.5 rounded-2xl bg-brand-700 px-4 text-[15px] font-bold tracking-[0.01em] text-white shadow-[0_8px_16px_-4px_rgba(29,78,216,0.35)] transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-65"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-[18px] w-[18px] animate-spin" />
                      กำลังยืนยัน...
                    </>
                  ) : (
                    <>
                      ยืนยันและเข้าสู่ระบบ
                      <ArrowRight className="h-[18px] w-[18px]" />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={resetToCredentials}
                  disabled={submitting}
                  className="mt-2.5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 text-[13px] font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-65"
                >
                  <ArrowLeft className="h-4 w-4" />
                  กลับไปกรอกอีเมลและรหัสผ่านใหม่
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
