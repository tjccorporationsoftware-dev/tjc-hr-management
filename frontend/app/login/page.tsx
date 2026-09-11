"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Clock,
  Eye,
  EyeOff,
  HelpCircle,
  IdCard,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogIn,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { ApiClientError } from "@/lib/api";
import { getDefaultDashboardPath } from "@/lib/default-dashboard";

/**
 * เข้าสู่ระบบ
 * ----------
 * จอแรกที่พนักงานเห็น และเป็นจอเดียวที่คนนอกองค์กรเปิดถึง — ต้องบอกให้ได้ใน
 * สองวินาทีว่านี่คือระบบของบริษัทไหน
 *
 * ## ทำไมเป็นสองคอลัมน์ ไม่ใช่คอลัมน์เดียวกลางจอ
 *
 * แอปมือถือใช้คอลัมน์เดียวเพราะจอกว้าง 390px ไม่มีทางเลือกอื่น แต่บนเว็บที่กว้าง
 * 1440px ขึ้นไป คอลัมน์เดียวจะเหลือพื้นที่ว่างสองข้างเป็นบริเวณกว้าง อ่านเป็น
 * หน้าที่ยังโหลดไม่เสร็จ — จอนี้จึงวางสองคอลัมน์แล้วจัดทั้งก้อนไว้กลางจอ
 *
 *   ซ้าย  ตัวตนขององค์กร — ตรา หัวเรื่อง และสิ่งที่ทำได้ในระบบ วางบนพื้นหน้า
 *   ขวา   ที่ทำงานจริง — ฟอร์มกับทางออกเมื่อเข้าไม่ได้ อยู่บนผืนขาวที่ยกขึ้นมา
 *
 * พื้นหน้าเป็นเทาอ่อน ฟอร์มเป็นผืนขาวผืนเดียวของหน้า — สองระดับนี้บอกได้เองว่า
 * ตรงไหนคือที่ที่ต้องลงมือทำ โดยไม่ต้องมีเส้นคั่นหรือแผ่นสีมาช่วย
 *
 * สิ่งที่ยกมาจากแอปคือ **โทนและคำพูด** (ชุดสีฟ้าเดียวกัน ช่องกรอกมีไอคอนนำหน้า
 * ปุ่มมีลูกศรต่อท้าย ข้อความชุดเดียวกัน) ไม่ใช่การจัดวาง — คนที่ใช้ทั้งสองทางจะ
 * รู้สึกว่าเป็นระบบเดียวกัน โดยที่แต่ละทางยังเป็นหน้าตาที่ถูกต้องของสื่อนั้น
 *
 * จอแคบกว่า lg เหลือแค่ตรากับฟอร์ม — หัวเรื่องและรายการสามข้อถูกซ่อน เพราะมัน
 * จะดันฟอร์มตกขอบจอ ต้องเลื่อนก่อนถึงจะเจอปุ่มเข้าสู่ระบบ
 */

/** ช่องกรอกที่มีไอคอนนำหน้า — เว้นซ้ายให้ไอคอน และใช้เส้นขอบโทนฟ้าเดียวกับแอป */
const INPUT_WITH_ICON =
  "h-12 w-full rounded-2xl border border-brand-700/15 bg-white pl-11 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-100";

/** ปุ่มหลักของจอ — ชิ้นเดียวที่ยกขึ้นจากพื้น เงาจึงลึกกว่าของอื่น */
const PRIMARY_BUTTON =
  "mt-6 flex h-13 w-full items-center justify-center gap-2.5 rounded-2xl bg-brand-700 px-4 text-[15px] font-bold tracking-[0.01em] text-white shadow-[0_8px_16px_-4px_rgba(29,78,216,0.35)] transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-65";

/** สิ่งที่พนักงานทำได้ในระบบ — เขียนด้วยคำที่คนใช้งานเข้าใจ ไม่ใช่ชื่อโมดูล */
const HIGHLIGHTS = [
  {
    icon: Clock,
    title: "ลงเวลาเข้า-ออกงาน",
    detail: "ดูสรุปเวลารายวันและยอดหักได้ทันที",
  },
  {
    icon: CalendarCheck,
    title: "ใบลาและโอที",
    detail: "ยื่น อนุมัติ และติดตามสถานะในที่เดียว",
  },
  {
    icon: Wallet,
    title: "สลิปเงินเดือนและเอกสาร",
    detail: "เปิดย้อนหลังได้เอง ไม่ต้องรอฝ่ายบุคคล",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const { login, verifyTwoFactor, isAuthenticated, isLoading, user } = useAuth();

  const [username, setUsername] = useState("");
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
        username,
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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 text-slate-900">
      {/*
        คอลัมน์ซ้ายกว้างตายตัว ไม่ใช่ 1fr — ถ้าให้มันยืดเต็มที่ว่าง ข้อความจะไป
        กองอยู่ชิดซ้ายแล้วเหลือช่องว่างยาวก่อนถึงฟอร์ม อ่านเป็นสองก้อนที่ไม่
        เกี่ยวกัน พอกำหนดความกว้างแล้วจัดทั้งตารางไว้กลางจอ สองฝั่งจะอยู่ใกล้กัน
        ในระยะที่ยังแยกออกว่าคนละหน้าที่
      */}
      <div className="grid w-full max-w-[900px] items-center gap-8 lg:grid-cols-[420px_420px] lg:justify-center lg:gap-16">
        {/* ------------------------------------------------ ฝั่งซ้าย: ตัวตนองค์กร */}
        <section>
          {/*
            ใช้โลโก้แนวนอนที่มีชื่ออยู่ในรูปแล้ว จึงไม่ต้องเขียนชื่อซ้ำข้าง ๆ อีก
            (ไอคอนสี่เหลี่ยมยังใช้ในเมนูข้างกับ favicon ซึ่งเป็นที่ที่รูปต้องเล็ก
            จนอ่านตัวหนังสือในรูปไม่ออก)
          */}
          <Image
            src="/logo/wordmark.png"
            alt="HR-TJC GROUP"
            width={1235}
            height={719}
            priority
            className="mx-auto h-[60px] w-auto lg:mx-0 lg:h-[72px]"
          />

          {/*
            จอเล็กเห็นแค่ตรากับฟอร์ม — ถ้าปล่อยหัวเรื่องกับรายการสามข้อไว้ด้วย
            มันจะดันฟอร์มตกขอบจอ ต้องเลื่อนก่อนถึงจะเจอปุ่มเข้าสู่ระบบ
            สามข้อนี้เป็นของที่อ่านผ่าน ๆ ไม่ใช่ของที่คนเปิดหน้านี้มาเพื่อทำ
          */}
          <div className="hidden lg:block">
            {/*
              ไม่บังคับขึ้นบรรทัดเอง — ความกว้างของคอลัมน์เปลี่ยนตามจอ การใส่ <br />
              ทำให้บางความกว้างมีคำเดียวตกไปอยู่บรรทัดสุดท้าย ปล่อยให้ text-balance
              เกลี่ยความยาวสองบรรทัดให้เท่า ๆ กันเองดีกว่า
            */}
            <h2 className="mt-8 text-[30px] font-bold leading-[1.3] tracking-tight text-balance text-slate-950 xl:text-[33px]">
              เวลาทำงาน คำขอ และเงินเดือน อยู่ในที่เดียวกัน
            </h2>

            <ul className="mt-8 space-y-5">
              {HIGHLIGHTS.map(({ icon: Icon, title, detail }) => (
                <li key={title} className="flex items-start gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-brand-700/8 text-brand-700">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>

                  <div className="min-w-0 pt-0.5">
                    <div className="text-[14px] font-semibold text-slate-900">
                      {title}
                    </div>
                    <div className="mt-0.5 text-[12.5px] leading-[18px] text-slate-500">
                      {detail}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ------------------------------------------------------ ฝั่งขวา: ฟอร์ม */}
        {/*
          ฟอร์มอยู่บนผืนขาวที่ยกขึ้นจากพื้นเทาอ่อนของหน้า — ก่อนหน้านี้ทั้งหน้าเป็น
          สีขาวหมดแล้วคั่นสองฝั่งด้วยเส้นบางเส้นเดียว ผลคือฟอร์มลอยอยู่บนที่ว่าง
          ไม่มีอะไรบอกว่าตรงไหนคือที่ที่ต้องลงมือทำ พื้นที่ต่างระดับกันบอกได้
          โดยไม่ต้องมีเส้น และเป็นผืนขาวผืนเดียวของหน้าตามกติกาของระบบ
        */}
        <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-8">
          <div className="mx-auto w-full max-w-[356px]">
            {step === "credentials" ? (
              <>
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
                      ใช้รหัสพนักงานกับรหัสผ่านที่ฝ่ายบุคคลออกให้
                    </p>
                  </div>
                </div>

                <form onSubmit={handleLoginSubmit} className="mt-6">
                  {/* สองช่องกรอกอยู่ชิดกันเป็นคู่ แล้วเว้นห่างจากปุ่มมากกว่า —
                      ปุ่มคือการกระทำ ไม่ใช่ช่องที่สาม */}
                  <div className="space-y-3">
                    <div>
                      <label
                        htmlFor="login-username"
                        className="mb-1.5 block text-[12.5px] font-medium text-slate-600"
                      >
                        รหัสพนักงาน
                      </label>
                      <div className="relative">
                        <IdCard className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                        {/* ผู้ดูแลระบบที่ไม่มีรหัสพนักงานใส่อีเมลในช่องนี้ได้ ฝั่ง backend แยกเอง */}
                        <input
                          id="login-username"
                          value={username}
                          onChange={(event) => setUsername(event.target.value)}
                          type="text"
                          autoComplete="username"
                          autoCapitalize="none"
                          spellCheck={false}
                          className={INPUT_WITH_ICON}
                          placeholder="เช่น 690034"
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
                    ลูกศรอยู่ท้ายข้อความ ไม่ใช่หน้าข้อความ — ปุ่มนี้พาไปข้างใน
                    สายตาที่อ่านจบคำแล้วเจอลูกศรต่อท้ายจะได้ทิศทางฟรี ๆ
                  */}
                  <button
                    type="submit"
                    disabled={submitting}
                    className={PRIMARY_BUTTON}
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

                {/*
                  ทางออกเมื่อเข้าไม่ได้ — คำถามที่เกิดกับจอนี้บ่อยที่สุด
                  อยู่บนพื้นฟ้าจาง ไม่ใช่ตัวหนังสือเทาลอย ๆ: ของที่ต้องหาเจอตอน
                  กำลังหงุดหงิดว่าเข้าไม่ได้ ต้องมีรูปทรงให้เล็งถูกโดยไม่ต้องอ่าน
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

                <form onSubmit={handleTwoFactorSubmit} className="mt-6">
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
                    className={PRIMARY_BUTTON}
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
                    กลับไปกรอกรหัสพนักงานและรหัสผ่านใหม่
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
