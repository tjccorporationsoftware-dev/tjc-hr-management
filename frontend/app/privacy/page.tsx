import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

/**
 * ประกาศความเป็นส่วนตัวของแอปพนักงาน
 * ----------------------------------
 * หน้านี้มีไว้เพื่อสองอย่างพร้อมกัน และทั้งสองอย่างบังคับ
 *
 *   1. Apple  ช่อง Privacy Policy URL ใน App Store Connect เป็นช่องบังคับของ
 *             ทุกแอป (App Review Guideline 5.1.1) และผู้รีวิวจะกดเข้ามาอ่านจริง
 *             — สิ่งที่เขียนตรงนี้ต้องครอบคลุม **ทุกสิทธิ์ที่ประกาศไว้ใน
 *             Info.plist** ของแอป ขอสิทธิ์ไหนแล้วหน้านี้ไม่พูดถึง = ถูกตีกลับ
 *             ต้นทางของรายการสิทธิ์อยู่ที่ employee-mobile/app.config.ts
 *
 *   2. PDPA   นายจ้างที่เก็บพิกัดตำแหน่งของลูกจ้างต้องแจ้งวัตถุประสงค์
 *             ระยะเวลาเก็บ และสิทธิของเจ้าของข้อมูล ไม่ว่าจะมีแอปหรือไม่
 *
 * ## ทำไมหน้านี้อยู่นอก (protected)
 *
 * ผู้รีวิวของ Apple ไม่มีบัญชีในระบบ และ URL นี้ต้องเปิดได้จากทุกที่โดยไม่ต้อง
 * ล็อกอิน — วางไว้ที่ app/privacy จึงเป็นหน้าสาธารณะเหมือน app/login
 *
 * ## ห้ามแก้เนื้อหาโดยไม่ดูแอป
 *
 * ถ้าวันใดแอปเพิ่มหรือถอดสิทธิ์ (เช่น เลิกใช้กล้อง หรือเริ่มขอปฏิทิน) ต้องกลับ
 * มาแก้รายการ PERMISSIONS ที่นี่ให้ตรงกันในคอมมิตเดียวกัน ไม่งั้นบิลด์ถัดไปจะ
 * ถูกตีกลับด้วยเหตุผลว่านโยบายไม่ตรงกับสิ่งที่แอปทำ
 */

/** วันที่ประกาศฉบับนี้มีผล — ขยับทุกครั้งที่แก้เนื้อหา */
const EFFECTIVE_DATE = "8 กันยายน 2569";

/**
 * ผู้ควบคุมข้อมูลส่วนบุคคล
 *
 * ค่าที่เว้นเป็นสตริงว่างจะไม่ถูกแสดงบนหน้าเลย — ตั้งใจให้เป็นแบบนี้เพื่อไม่ให้
 * หน้าสาธารณะขึ้นข้อความ "รอยืนยัน" ให้ผู้รีวิวของ Apple เห็น เติมค่าจริงเมื่อ
 * ฝ่ายบุคคลยืนยันที่อยู่จดทะเบียนและเบอร์ติดต่อกลางแล้ว
 */
const CONTROLLER = {
  nameTh: "บริษัท ทีเจซี คอร์ปอเรชั่น จำกัด",
  nameEn: "TJC Corporation Co., Ltd.",
  /** ที่อยู่จดทะเบียน — ยังรอฝ่ายบุคคลยืนยัน */
  address: "",
  email: "tjc.corporation.software@gmail.com",
  /** เบอร์ติดต่อกลาง — ยังรอฝ่ายบุคคลยืนยัน */
  phone: "",
};

/**
 * สิทธิ์ที่แอปขอ เทียบหนึ่งต่อหนึ่งกับ Info.plist
 *
 * ช่อง "ไม่ได้ทำอะไร" สำคัญพอ ๆ กับช่องที่บอกว่าทำอะไร — คำถามแรกที่พนักงาน
 * ถามคือ "บริษัทตามดูตำแหน่งฉันตลอดเวลาหรือเปล่า" และคำตอบต้องเป็นข้อความที่
 * ชี้กลับไปที่ค่าคอนฟิกจริงได้
 */
const PERMISSIONS = [
  {
    title: "ตำแหน่งที่ตั้ง (GPS)",
    used: "อ่านพิกัดเฉพาะวินาทีที่คุณกดปุ่มลงเวลาเข้างานหรือออกงาน เพื่อยืนยันว่าอยู่ในพื้นที่ที่บริษัทกำหนดไว้",
    notUsed:
      "แอปไม่ขอสิทธิ์ตำแหน่งแบบตลอดเวลา และไม่อ่านพิกัดขณะปิดแอปหรือทำงานเบื้องหลัง จึงติดตามความเคลื่อนไหวของคุณระหว่างวันไม่ได้",
  },
  {
    title: "กล้องและคลังรูปภาพ",
    used: "ถ่ายหรือเลือกรูปเพื่อแนบเป็นหลักฐานประกอบคำขอ เช่น ใบรับรองแพทย์ประกอบใบลาป่วย และรูปโปรไฟล์",
    notUsed:
      "เปิดใช้เมื่อคุณกดแนบไฟล์เท่านั้น ไม่มีการอ่านรูปอื่นในเครื่อง และแอปไม่ขอสิทธิ์ไมโครโฟน",
  },
  {
    title: "การยืนยันตัวตนด้วยชีวมิติ (Face ID หรือลายนิ้วมือ)",
    used: "ใช้ปลดล็อกแอปแทนการพิมพ์รหัสผ่านซ้ำ หากคุณเปิดใช้เองในหน้าตั้งค่า",
    notUsed:
      "ลายนิ้วมือและข้อมูลใบหน้าอยู่ในชิปนิรภัยของเครื่องเท่านั้น ระบบปฏิบัติการตอบกลับแอปแค่ว่าผ่านหรือไม่ผ่าน บริษัทไม่ได้รับและไม่ได้เก็บข้อมูลชีวมิติใด ๆ",
  },
  {
    title: "การแจ้งเตือน",
    used: "แจ้งผลอนุมัติใบลา ใบทำงานล่วงเวลา และประกาศจากฝ่ายบุคคล",
    notUsed:
      "ปิดได้ตลอดเวลาจากหน้าตั้งค่าในแอปหรือหน้าตั้งค่าของเครื่อง โดยยังใช้งานส่วนอื่นได้ตามปกติ",
  },
  {
    title: "เซ็นเซอร์การเคลื่อนไหวของเครื่อง",
    used: "ระบบปฏิบัติการใช้ประกอบการคำนวณตำแหน่งให้แม่นยำขึ้นขณะลงเวลา",
    notUsed:
      "แอปไม่ได้อ่านค่าเซ็นเซอร์ไปเก็บหรือส่งออก ไม่มีการนับก้าวหรือติดตามกิจกรรมออกกำลังกาย",
  },
];

/** ข้อมูลที่ระบบเก็บ แยกตามหมวด พร้อมเหตุผลที่ต้องเก็บ */
const DATA_CATEGORIES = [
  {
    title: "ข้อมูลบัญชีผู้ใช้",
    detail:
      "อีเมลที่ใช้เข้าระบบ ชื่อที่แสดง และรหัสผ่านซึ่งเก็บในรูปแบบที่ถอดกลับเป็นรหัสเดิมไม่ได้ รวมถึงเวลาที่เข้าใช้งานล่าสุดและจำนวนครั้งที่ใส่รหัสผิด เพื่อป้องกันการเดารหัสผ่าน",
  },
  {
    title: "ข้อมูลพนักงาน",
    detail:
      "รหัสพนักงาน ชื่อ-นามสกุล ตำแหน่ง สังกัด วันเริ่มงาน ข้อมูลติดต่อ และเอกสารประจำตัวที่จำเป็นต่อการจ้างงานและการยื่นต่อหน่วยงานราชการ",
  },
  {
    title: "ข้อมูลการลงเวลา",
    detail:
      "วันและเวลาที่กดเข้างานหรือออกงาน พร้อมพิกัดตำแหน่ง ณ วินาทีที่กด เพื่อคำนวณชั่วโมงทำงาน การมาสาย และค่าล่วงเวลา",
  },
  {
    title: "คำขอและเอกสารแนบ",
    detail:
      "ใบลา ใบทำงานล่วงเวลา คำขอแก้ไขเวลา คำขอเอกสาร พร้อมไฟล์แนบที่คุณเลือกส่งเอง",
  },
  {
    title: "ข้อมูลค่าจ้างและภาษี",
    detail:
      "รายการเงินได้ เงินหัก ประกันสังคม ภาษีหัก ณ ที่จ่าย และสลิปเงินเดือนย้อนหลัง ซึ่งกฎหมายกำหนดให้นายจ้างต้องจัดเก็บ",
  },
  {
    title: "ข้อมูลอุปกรณ์",
    detail:
      "รุ่นเครื่อง เวอร์ชันระบบปฏิบัติการ เวอร์ชันแอป และรหัสสำหรับส่งการแจ้งเตือน เพื่อส่งข้อความถึงเครื่องที่ถูกต้องและช่วยแก้ปัญหาเมื่อแอปทำงานผิดพลาด",
  },
  {
    title: "รายงานข้อผิดพลาด",
    detail:
      "เมื่อแอปทำงานผิดพลาด ระบบจะส่งรายละเอียดทางเทคนิคของเหตุการณ์นั้นให้ทีมพัฒนา เพื่อใช้แก้ไขข้อบกพร่องเท่านั้น",
  },
];

/** ผู้ให้บริการภายนอกที่ข้อมูลไหลผ่าน — ต้องเปิดเผยตาม PDPA และ Apple ตรวจข้อนี้ */
const PROCESSORS = [
  {
    name: "Apple",
    purpose:
      "แจกจ่ายและอัปเดตแอปผ่าน App Store และ TestFlight และส่งการแจ้งเตือนเข้าเครื่อง iOS",
  },
  {
    name: "Google (Firebase Cloud Messaging)",
    purpose: "ส่งการแจ้งเตือนเข้าเครื่อง Android",
  },
  {
    name: "Expo",
    purpose: "ให้บริการระบบส่งอัปเดตแอปและตัวกลางส่งการแจ้งเตือน",
  },
  {
    name: "Sentry",
    purpose: "รวบรวมรายงานข้อผิดพลาดของแอปเพื่อให้ทีมพัฒนาแก้ไข",
  },
];

/** สิทธิของเจ้าของข้อมูลตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 */
const SUBJECT_RIGHTS = [
  "ขอเข้าถึงและขอสำเนาข้อมูลส่วนบุคคลของตน",
  "ขอแก้ไขข้อมูลที่ไม่ถูกต้องหรือไม่เป็นปัจจุบัน",
  "ขอให้ลบหรือทำลายข้อมูล เมื่อพ้นความจำเป็นและไม่ขัดต่อกฎหมายอื่น",
  "ขอให้ระงับการใช้ข้อมูลชั่วคราว",
  "คัดค้านการเก็บรวบรวม ใช้ หรือเปิดเผยข้อมูล",
  "ขอถอนความยินยอมสำหรับข้อมูลที่เก็บบนฐานความยินยอม",
  "ร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล",
];

export const metadata: Metadata = {
  title: "นโยบายความเป็นส่วนตัว | HR-TJC GROUP",
  description:
    "ประกาศความเป็นส่วนตัวสำหรับแอปพลิเคชันพนักงานและระบบบริหารงานบุคคลของ HR-TJC GROUP",
};

/** หัวข้อระดับบนของประกาศ — เลขกำกับช่วยให้อ้างอิงข้ามหัวข้อได้เวลาตอบคำถาม */
function Section({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="flex items-baseline gap-2.5 text-[17px] font-bold tracking-tight text-slate-950">
        <span className="text-[13px] font-bold text-brand-700">{index}.</span>
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[14px] leading-[26px] text-slate-600">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
      <div className="mx-auto w-full max-w-[720px]">
        {/* ------------------------------------------------------------ หัวหน้า */}
        <Image
          src="/logo/wordmark.png"
          alt="HR-TJC GROUP"
          width={1235}
          height={719}
          priority
          className="h-[52px] w-auto"
        />

        <h1 className="mt-7 text-[30px] font-bold leading-[1.25] tracking-tight text-balance text-slate-950">
          นโยบายความเป็นส่วนตัว
        </h1>
        <p className="mt-2.5 text-[14px] leading-[24px] text-slate-500">
          สำหรับแอปพลิเคชันพนักงาน HR-TJC GROUP
          และระบบบริหารงานบุคคลที่เกี่ยวข้อง
          <br />
          มีผลตั้งแต่วันที่ {EFFECTIVE_DATE}
        </p>

        {/*
          เนื้อหาทั้งหมดอยู่บนผืนขาวผืนเดียว — โครงเดียวกับฟอร์มในหน้าเข้าสู่ระบบ
          พื้นเทาอ่อนของหน้าเป็นตัวยกผืนนี้ขึ้นมา ไม่ต้องมีเส้นกรอบมาช่วย
        */}
        <article className="mt-8 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
          <Section index={1} title="ประกาศนี้ใช้กับใคร">
            <p>
              แอปพลิเคชัน HR-TJC GROUP เป็นระบบภายในสำหรับพนักงานของ
              {CONTROLLER.nameTh} และบริษัทในเครือเท่านั้น
              ไม่เปิดให้บุคคลทั่วไปสมัครใช้งาน
              บัญชีผู้ใช้ทุกบัญชีถูกสร้างโดยฝ่ายบุคคลให้กับพนักงานที่มีสัญญาจ้างอยู่จริง
            </p>
            <p>
              ประกาศฉบับนี้อธิบายว่าบริษัทเก็บข้อมูลอะไรของคุณ เก็บไปทำอะไร
              ส่งต่อให้ใคร เก็บไว้นานเท่าใด และคุณมีสิทธิอะไรบ้าง ตามพระราชบัญญัติ
              คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562
            </p>
          </Section>

          <Section index={2} title="ผู้ควบคุมข้อมูลส่วนบุคคล">
            <p>
              {CONTROLLER.nameTh} ({CONTROLLER.nameEn})
              {CONTROLLER.address ? <> {CONTROLLER.address}</> : null}
            </p>
            <p>
              ติดต่อเรื่องข้อมูลส่วนบุคคลได้ที่{" "}
              <a
                href={`mailto:${CONTROLLER.email}`}
                className="font-semibold text-brand-700 underline underline-offset-4 hover:text-brand-800"
              >
                {CONTROLLER.email}
              </a>
              {CONTROLLER.phone ? <> หรือโทร {CONTROLLER.phone}</> : null}
            </p>
          </Section>

          <Section index={3} title="ข้อมูลที่เก็บรวบรวม">
            <ul className="space-y-4">
              {DATA_CATEGORIES.map(({ title, detail }) => (
                <li key={title}>
                  <div className="text-[14px] font-semibold text-slate-900">
                    {title}
                  </div>
                  <p className="mt-1">{detail}</p>
                </li>
              ))}
            </ul>
          </Section>

          <Section index={4} title="สิทธิ์บนเครื่องที่แอปขอ และเหตุผล">
            <p>
              แอปขอสิทธิ์เท่าที่จำเป็นต่อการทำงานเท่านั้น
              และทุกสิทธิ์ปฏิเสธได้โดยยังใช้ส่วนอื่นของแอปได้ตามปกติ
              ยกเว้นการลงเวลาซึ่งต้องใช้ตำแหน่ง
            </p>

            <ul className="space-y-5">
              {PERMISSIONS.map(({ title, used, notUsed }) => (
                <li
                  key={title}
                  className="rounded-2xl border border-brand-700/12 bg-brand-50/40 p-4"
                >
                  <div className="text-[14px] font-semibold text-slate-900">
                    {title}
                  </div>
                  <p className="mt-1.5">
                    <span className="font-semibold text-slate-700">
                      ใช้ทำอะไร —{" "}
                    </span>
                    {used}
                  </p>
                  <p className="mt-1.5">
                    <span className="font-semibold text-slate-700">
                      ไม่ได้ทำอะไร —{" "}
                    </span>
                    {notUsed}
                  </p>
                </li>
              ))}
            </ul>
          </Section>

          <Section index={5} title="วัตถุประสงค์และฐานทางกฎหมาย">
            <p>
              บริษัทใช้ข้อมูลของคุณเพื่อบริหารการจ้างงานเท่านั้น ได้แก่
              การบันทึกและคำนวณเวลาทำงาน การพิจารณาคำขอลาและทำงานล่วงเวลา
              การคำนวณและจ่ายค่าจ้าง การนำส่งภาษีและเงินสมทบประกันสังคม
              การออกเอกสารรับรอง และการติดต่อสื่อสารภายในองค์กร
            </p>
            <p>
              ฐานทางกฎหมายที่ใช้คือ ความจำเป็นเพื่อปฏิบัติตามสัญญาจ้างแรงงาน
              ความจำเป็นเพื่อปฏิบัติตามกฎหมายที่ใช้บังคับกับนายจ้าง
              และประโยชน์โดยชอบด้วยกฎหมายในการบริหารงานบุคคล
            </p>
            <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              บริษัท<span className="font-semibold text-slate-800">ไม่</span>
              ขาย ให้เช่า หรือแลกเปลี่ยนข้อมูลส่วนบุคคลของคุณกับบุคคลภายนอก และ
              <span className="font-semibold text-slate-800">ไม่</span>
              ใช้ข้อมูลของคุณเพื่อการโฆษณาหรือการติดตามข้ามแอป
            </p>
          </Section>

          <Section index={6} title="การเปิดเผยข้อมูล">
            <p>
              ภายในองค์กร ข้อมูลของคุณเข้าถึงได้เฉพาะผู้ที่มีสิทธิ์ตามหน้าที่
              เช่น ผู้บังคับบัญชาตามสายอนุมัติ ฝ่ายบุคคล และฝ่ายบัญชีเงินเดือน
            </p>
            <p>
              ภายนอกองค์กร
              ข้อมูลถูกเปิดเผยเท่าที่กฎหมายกำหนดหรือจำเป็นต่อการให้บริการ ได้แก่
              กรมสรรพากร สำนักงานประกันสังคม ธนาคารที่ใช้โอนเงินเดือน
              และผู้ให้บริการทางเทคนิคต่อไปนี้
            </p>
            <ul className="space-y-2.5">
              {PROCESSORS.map(({ name, purpose }) => (
                <li key={name} className="flex gap-2.5">
                  <span
                    aria-hidden
                    className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400"
                  />
                  <span>
                    <span className="font-semibold text-slate-800">{name}</span>{" "}
                    — {purpose}
                  </span>
                </li>
              ))}
            </ul>
            <p>
              ผู้ให้บริการเหล่านี้บางรายมีเซิร์ฟเวอร์อยู่นอกประเทศไทย
              การส่งข้อมูลออกนอกประเทศจึงเกิดขึ้นเท่าที่จำเป็นต่อการทำงานของบริการนั้น
              ภายใต้มาตรการคุ้มครองที่เหมาะสม
            </p>
          </Section>

          <Section index={7} title="ระยะเวลาเก็บรักษา">
            <p>
              ข้อมูลการจ้างงาน ค่าจ้าง ภาษี และการลงเวลา
              ถูกเก็บตลอดระยะเวลาการจ้าง และเก็บต่ออีกไม่น้อยกว่าที่กฎหมายแรงงาน
              กฎหมายภาษีอากร และกฎหมายประกันสังคมกำหนด
              นับจากวันสิ้นสุดการเป็นพนักงาน
            </p>
            <p>
              ข้อมูลอุปกรณ์และรหัสสำหรับส่งการแจ้งเตือนจะถูกลบเมื่อคุณออกจากระบบ
              ถอนการติดตั้งแอป หรือปิดการแจ้งเตือน
              ส่วนรายงานข้อผิดพลาดถูกเก็บไว้ในระยะสั้นเพื่อการแก้ไขปัญหาเท่านั้น
            </p>
          </Section>

          <Section index={8} title="ความปลอดภัยของข้อมูล">
            <p>
              การรับส่งข้อมูลระหว่างแอปกับเซิร์ฟเวอร์เข้ารหัสด้วย HTTPS ทั้งหมด
              โทเคนสำหรับเข้าใช้งานถูกเก็บในพื้นที่นิรภัยของระบบปฏิบัติการ
              (Keychain บน iOS และ Keystore บน Android)
              รหัสผ่านถูกเก็บในรูปแบบที่ถอดกลับเป็นรหัสเดิมไม่ได้
              และการเข้าถึงข้อมูลถูกจำกัดตามสิทธิ์ของผู้ใช้แต่ละคน
            </p>
          </Section>

          <Section index={9} title="สิทธิของคุณ">
            <p>ในฐานะเจ้าของข้อมูลส่วนบุคคล คุณมีสิทธิดังนี้</p>
            <ul className="space-y-2.5">
              {SUBJECT_RIGHTS.map((right) => (
                <li key={right} className="flex gap-2.5">
                  <span
                    aria-hidden
                    className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400"
                  />
                  <span>{right}</span>
                </li>
              ))}
            </ul>
            <p>
              การใช้สิทธิบางข้ออาจถูกจำกัดโดยกฎหมายอื่นที่นายจ้างต้องปฏิบัติตาม
              เช่น หน้าที่เก็บเอกสารทางภาษีและทะเบียนลูกจ้างตามระยะเวลาที่กำหนด
            </p>
          </Section>

          <Section index={10} title="ผู้เยาว์">
            <p>
              ระบบนี้ใช้กับพนักงานที่มีสัญญาจ้างกับบริษัทเท่านั้น
              ไม่ได้ออกแบบมาเพื่อเก็บข้อมูลของเด็กหรือบุคคลทั่วไป
            </p>
          </Section>

          <Section index={11} title="การเปลี่ยนแปลงประกาศนี้">
            <p>
              หากมีการแก้ไข บริษัทจะปรับวันที่มีผลด้านบนและแจ้งให้พนักงานทราบ
              ผ่านช่องทางภายในองค์กร ขอให้ตรวจสอบหน้านี้เป็นครั้งคราว
            </p>
          </Section>

          {/*
            สรุปภาษาอังกฤษ
            --------------
            ไม่ใช่ของประดับ — ผู้รีวิวของ Apple อ่านภาษาไทยไม่ออก ถ้าหน้านี้เป็น
            ไทยล้วน เขาจะยืนยันไม่ได้ว่านโยบายครอบคลุมสิทธิ์ที่แอปขอครบหรือเปล่า
            แล้วตีกลับด้วยเหตุผลว่าข้อมูลไม่พอต่อการรีวิว ย่อหน้านี้จึงต้องพูดถึง
            ตำแหน่ง กล้อง ชีวมิติ และการแจ้งเตือน ให้ครบทั้งสี่อย่าง
          */}
          <section className="mt-12 border-t border-slate-200 pt-8">
            <h2 className="text-[17px] font-bold tracking-tight text-slate-950">
              English summary
            </h2>
            <div className="mt-3 space-y-3 text-[14px] leading-[26px] text-slate-600">
              <p>
                HR-TJC GROUP is an internal workforce application for employees
                of {CONTROLLER.nameEn} and its affiliated companies. It is not
                available to the general public, and every account is created by
                the HR department for a person currently employed by the group.
              </p>
              <p>
                The app collects account details, employment records, clock-in
                and clock-out times, requests and their attachments, payroll and
                tax records, device information used to deliver notifications,
                and crash reports.
              </p>
              <p>
                <span className="font-semibold text-slate-800">Location</span>{" "}
                is read only at the moment an employee taps the clock-in or
                clock-out button, solely to confirm the employee is at an
                approved company work site. The app does not request always-on
                or background location and cannot track movement during the day.{" "}
                <span className="font-semibold text-slate-800">
                  Camera and photo library
                </span>{" "}
                are used only when the employee chooses to attach evidence to a
                request, such as a medical certificate.{" "}
                <span className="font-semibold text-slate-800">
                  Face ID and fingerprint
                </span>{" "}
                are handled entirely by the operating system; biometric data
                never leaves the device and is never received by the company.{" "}
                <span className="font-semibold text-slate-800">
                  Push notifications
                </span>{" "}
                are used to inform employees about approval results and HR
                announcements, and can be turned off at any time.
              </p>
              <p>
                Data is shared only with parties required to operate the service
                or mandated by Thai law: the Revenue Department, the Social
                Security Office, the payroll bank, Apple, Google, Expo and
                Sentry. The company does not sell, rent or trade personal data,
                and does not use it for advertising or cross-app tracking.
              </p>
              <p>
                For any privacy request, contact{" "}
                <a
                  href={`mailto:${CONTROLLER.email}`}
                  className="font-semibold text-brand-700 underline underline-offset-4 hover:text-brand-800"
                >
                  {CONTROLLER.email}
                </a>
                .
              </p>
            </div>
          </section>
        </article>

        <div className="mt-8 text-center">
          <Link
            href="/login"
            className="text-[13px] font-semibold text-brand-700 underline underline-offset-4 hover:text-brand-800"
          >
            กลับไปหน้าเข้าสู่ระบบ
          </Link>
        </div>
      </div>
    </main>
  );
}
