/**
 * พื้นหลังหัวหน้า — โทนเดียวกันทุกหน้า
 * ------------------------------------
 * ซ้ายเป็นผืนขาวสำหรับหัวเรื่อง ขวาเป็นผืนน้ำสีฟ้า คั่นด้วยแนวคลื่นที่ซัดขึ้นฝั่ง
 * แล้วมีภาพกราฟลายเส้นจาง ๆ เป็นลวดลายอยู่บนผืนน้ำ
 *
 * ลวดลายบนผืนน้ำเลือกได้ด้วย `variant` ให้ตรงกับเรื่องของหน้านั้น
 * (`chart` = หน้าสรุปตัวเลข, `approvals` = หน้าที่เป็นคิวงานรอดำเนินการ)
 *
 * วิธีใช้ — วางไว้เป็นลูกตัวแรกของกล่องหัวเรื่องที่เป็น `relative overflow-hidden`
 * แล้วให้กล่องเนื้อหาที่ตามมาเป็น `relative` เพื่อให้ลอยอยู่เหนือพื้นหลัง
 *
 *   <div className="relative overflow-hidden border-b border-slate-200 px-6 py-6">
 *     <PageHeroWave />
 *     <div className="relative ...">…</div>
 *   </div>
 *
 * ข้อควรรู้
 * - แสดงเฉพาะจอ `xl` ขึ้นไป จอเล็กเลย์เอาต์ซ้อนเป็นแนวตั้ง สีฟ้าจะทับข้อความ
 * - ยอดคลื่นสูงสุดอยู่ที่ ~42% ของความกว้าง แผงสถิติทางขวาจึงอยู่บนผืนน้ำเต็มใบ
 * - ปุ่มหรือไอคอนที่ลอยอยู่มุมขวาบนต้องมีพื้นขาวรอง ไม่งั้นอ่านไม่ออกบนผืนน้ำ
 */
export type HeroMotif =
  | "chart"
  | "approvals"
  | "attendance"
  | "payroll-review"
  | "leave-quota"
  | "onboarding"
  | "transfer"
  | "offboarding"
  | "performance"
  | "documents"
  | "payroll"
  | "withholding"
  | "settings"
  | "reports"
  | "access"
  | "employees"
  | "organization"
  | "self-service";

export function PageHeroWave({ variant = "chart" }: { variant?: HeroMotif }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 hidden xl:block"
    >
      <svg
        className="h-full w-full"
        viewBox="0 0 1440 220"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="pageHeroSea" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#e6f3ff" />
            <stop offset="34%" stopColor="#b6dbff" />
            <stop offset="68%" stopColor="#77b3fd" />
            <stop offset="100%" stopColor="#3d95f9" />
          </linearGradient>
          <linearGradient id="pageHeroSheen" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.3" />
            <stop offset="42%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* ระลอกที่ซัดขึ้นหาดไกลสุด จางที่สุด */}
        <path
          d="M1440,0 L508,0 C484,52 382,58 382,104 C382,150 470,158 440,196 C424,216 388,214 348,220 L1440,220 Z"
          fill="#77b3fd"
          fillOpacity="0.22"
        />
        {/* ระลอกชั้นกลาง */}
        <path
          d="M1440,0 L560,0 C536,52 434,58 434,104 C434,150 522,158 492,196 C476,216 440,214 400,220 L1440,220 Z"
          fill="#77b3fd"
          fillOpacity="0.38"
        />
        <path
          d="M560,0 C536,52 434,58 434,104 C434,150 522,158 492,196 C476,216 440,214 400,220"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.5"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />

        {/* ผืนน้ำหลัก */}
        <path
          d="M1440,0 L612,0 C588,52 486,58 486,104 C486,150 574,158 544,196 C528,216 492,214 452,220 L1440,220 Z"
          fill="url(#pageHeroSea)"
        />
        <path
          d="M1440,0 L612,0 C588,52 486,58 486,104 C486,150 574,158 544,196 C528,216 492,214 452,220 L1440,220 Z"
          fill="url(#pageHeroSheen)"
        />
        {/* ฟองคลื่นตรงแนวปะทะ */}
        <path
          d="M612,0 C588,52 486,58 486,104 C486,150 574,158 544,196 C528,216 492,214 452,220"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.7"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {variant === "approvals" ? (
        <ApprovalsMotif />
      ) : variant === "attendance" ? (
        <AttendanceMotif />
      ) : variant === "payroll-review" ? (
        <PayrollReviewMotif />
      ) : variant === "leave-quota" ? (
        <LeaveQuotaMotif />
      ) : variant === "onboarding" ? (
        <OnboardingMotif />
      ) : variant === "transfer" ? (
        <TransferMotif />
      ) : variant === "offboarding" ? (
        <OffboardingMotif />
      ) : variant === "performance" ? (
        <PerformanceMotif />
      ) : variant === "documents" ? (
        <DocumentsMotif />
      ) : variant === "payroll" ? (
        <PayrollMotif />
      ) : variant === "withholding" ? (
        <WithholdingMotif />
      ) : variant === "settings" ? (
        <SettingsMotif />
      ) : variant === "reports" ? (
        <ReportsMotif />
      ) : variant === "access" ? (
        <AccessMotif />
      ) : variant === "employees" ? (
        <EmployeesMotif />
      ) : variant === "organization" ? (
        <OrganizationMotif />
      ) : variant === "self-service" ? (
        <SelfServiceMotif />
      ) : (
        <ChartMotif />
      )}
    </div>
  );
}

/** กราฟสรุปตัวเลข — ใช้กับหน้าที่เป็นแดชบอร์ดหรือรายงาน */
function ChartMotif() {
  return (
    <svg
      className="absolute inset-y-0 right-0 w-[62%] text-white"
      viewBox="0 0 900 220"
      preserveAspectRatio="xMaxYMax meet"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* แกนและขีดบอกช่วง */}
      <path d="M20,196 H880" strokeOpacity="0.26" strokeWidth="1.5" />
      <path
        d="M59,200 v5 M121,200 v5 M183,200 v5 M245,200 v5 M307,200 v5 M369,200 v5 M431,200 v5 M493,200 v5"
        strokeOpacity="0.18"
        strokeWidth="1.5"
      />

      {/* แท่งกราฟ */}
      <g fill="currentColor" fillOpacity="0.18" stroke="none">
        <rect x="44" y="164" width="30" height="32" rx="6" />
        <rect x="106" y="148" width="30" height="48" rx="6" />
        <rect x="168" y="158" width="30" height="38" rx="6" />
        <rect x="230" y="134" width="30" height="62" rx="6" />
        <rect x="292" y="144" width="30" height="52" rx="6" />
        <rect x="354" y="126" width="30" height="70" rx="6" />
        <rect x="416" y="136" width="30" height="60" rx="6" />
        <rect x="478" y="120" width="30" height="76" rx="6" />
      </g>

      {/* เส้นแนวโน้มและพื้นใต้เส้น */}
      <path
        d="M59,158 C80,158 100,144 121,142 C142,140 162,150 183,150 C204,150 224,130 245,128 C266,126 286,138 307,138 C328,138 348,122 369,120 C390,118 410,130 431,130 C452,130 472,114 493,112 L493,196 L59,196 Z"
        fill="currentColor"
        fillOpacity="0.1"
        stroke="none"
      />
      <path
        d="M59,158 C80,158 100,144 121,142 C142,140 162,150 183,150 C204,150 224,130 245,128 C266,126 286,138 307,138 C328,138 348,122 369,120 C390,118 410,130 431,130 C452,130 472,114 493,112"
        strokeOpacity="0.4"
        strokeWidth="2.5"
      />
      <g fill="currentColor" fillOpacity="0.42" stroke="none">
        <circle cx="59" cy="158" r="3.5" />
        <circle cx="121" cy="142" r="3.5" />
        <circle cx="183" cy="150" r="3.5" />
        <circle cx="245" cy="128" r="3.5" />
        <circle cx="307" cy="138" r="3.5" />
        <circle cx="369" cy="120" r="3.5" />
        <circle cx="431" cy="130" r="3.5" />
        <circle cx="493" cy="112" r="3.5" />
      </g>

      {/* แถบสัดส่วนสามแถว */}
      <g fill="currentColor" stroke="none">
        <rect
          x="540"
          y="130"
          width="150"
          height="8"
          rx="4"
          fillOpacity="0.14"
        />
        <rect
          x="540"
          y="152"
          width="150"
          height="8"
          rx="4"
          fillOpacity="0.14"
        />
        <rect
          x="540"
          y="174"
          width="150"
          height="8"
          rx="4"
          fillOpacity="0.14"
        />
        <rect x="540" y="130" width="96" height="8" rx="4" fillOpacity="0.28" />
        <rect x="540" y="152" width="68" height="8" rx="4" fillOpacity="0.28" />
        <rect
          x="540"
          y="174"
          width="118"
          height="8"
          rx="4"
          fillOpacity="0.28"
        />
      </g>

      {/* วงเล็กที่ขอบขวา โผล่มาครึ่งใบ */}
      <circle cx="884" cy="132" r="34" strokeOpacity="0.12" strokeWidth="8" />
      <path
        d="M884,98 A34,34 0 0 1 913.4,149"
        strokeOpacity="0.26"
        strokeWidth="8"
      />

      {/* วงสรุปสัดส่วนใบหลัก */}
      <circle cx="768" cy="152" r="46" strokeOpacity="0.16" strokeWidth="11" />
      <path
        d="M768,106 A46,46 0 1 1 745,191.8"
        strokeOpacity="0.38"
        strokeWidth="11"
      />
      <circle
        cx="768"
        cy="152"
        r="4"
        fill="currentColor"
        fillOpacity="0.28"
        stroke="none"
      />

      <g fill="currentColor" stroke="none">
        <circle cx="524" cy="116" r="3" fillOpacity="0.2" />
        <circle cx="712" cy="192" r="2.5" fillOpacity="0.18" />
        <circle cx="28" cy="146" r="2.5" fillOpacity="0.16" />
      </g>
    </svg>
  );
}

/** คิวคำขอที่ไหลเข้ามาแล้วถูกตรวจทีละใบ — ใช้กับหน้าที่เป็นงานรออนุมัติ */
function ApprovalsMotif() {
  return (
    <svg
      className="absolute inset-y-0 right-0 w-[62%] text-white"
      viewBox="0 0 900 220"
      preserveAspectRatio="xMaxYMax meet"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* กองคำขอที่รอคิวอยู่ ใบล่างสุดโผล่พ้นขอบไปแสดงว่ายังมีต่อ */}
      <g>
        <rect
          x="40"
          y="106"
          width="430"
          height="40"
          rx="12"
          fillOpacity="0.1"
          fill="currentColor"
          strokeOpacity="0.2"
        />
        <circle
          cx="70"
          cy="126"
          r="12"
          fill="currentColor"
          fillOpacity="0.22"
          stroke="none"
        />
        <g fill="currentColor" stroke="none">
          <rect
            x="98"
            y="117"
            width="150"
            height="7"
            rx="3.5"
            fillOpacity="0.26"
          />
          <rect
            x="98"
            y="131"
            width="96"
            height="6"
            rx="3"
            fillOpacity="0.16"
          />
          <rect
            x="372"
            y="118"
            width="72"
            height="16"
            rx="8"
            fillOpacity="0.2"
          />
        </g>
      </g>
      <g>
        <rect
          x="40"
          y="156"
          width="430"
          height="40"
          rx="12"
          fillOpacity="0.1"
          fill="currentColor"
          strokeOpacity="0.2"
        />
        <circle
          cx="70"
          cy="176"
          r="12"
          fill="currentColor"
          fillOpacity="0.22"
          stroke="none"
        />
        <g fill="currentColor" stroke="none">
          <rect
            x="98"
            y="167"
            width="126"
            height="7"
            rx="3.5"
            fillOpacity="0.26"
          />
          <rect
            x="98"
            y="181"
            width="112"
            height="6"
            rx="3"
            fillOpacity="0.16"
          />
          <rect
            x="372"
            y="168"
            width="72"
            height="16"
            rx="8"
            fillOpacity="0.2"
          />
        </g>
      </g>
      <rect
        x="40"
        y="206"
        width="430"
        height="40"
        rx="12"
        fillOpacity="0.06"
        fill="currentColor"
        strokeOpacity="0.12"
      />

      {/* ความคืบหน้าของคิว กับเครื่องหมายถูกตรงกลาง */}
      <circle cx="706" cy="152" r="52" strokeOpacity="0.16" strokeWidth="11" />
      <path
        d="M706,100 A52,52 0 1 1 688.2,200.9"
        strokeOpacity="0.38"
        strokeWidth="11"
      />
      <path d="M682,152 l16,17 l32,-38" strokeOpacity="0.45" strokeWidth="8" />

      {/* ใบที่ยังไม่ถึงคิว โผล่มาครึ่งใบที่ขอบขวา */}
      <circle cx="872" cy="126" r="32" strokeOpacity="0.12" strokeWidth="8" />
      <path d="M872,110 v18 l13,8" strokeOpacity="0.24" strokeWidth="4" />

      <g fill="currentColor" stroke="none">
        <circle cx="520" cy="118" r="3" fillOpacity="0.2" />
        <circle cx="560" cy="192" r="2.5" fillOpacity="0.18" />
        <circle cx="828" cy="190" r="2.5" fillOpacity="0.16" />
      </g>
    </svg>
  );
}

/** เวลาเข้า-ออกงานบนเส้นเวลาของวัน — ใช้กับหน้าที่เป็นเรื่องการลงเวลา */
function AttendanceMotif() {
  return (
    <svg
      className="absolute inset-y-0 right-0 w-[62%] text-white"
      viewBox="0 0 900 220"
      preserveAspectRatio="xMaxYMax meet"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* ปฏิทินของเดือน ช่องที่ทึบคือวันที่มาทำงานแล้ว */}
      <rect
        x="34"
        y="104"
        width="116"
        height="96"
        rx="12"
        strokeOpacity="0.22"
      />
      <path d="M34,128 H150" strokeOpacity="0.22" />
      <path d="M62,96 v16 M122,96 v16" strokeOpacity="0.3" strokeWidth="3" />
      <g fill="currentColor" stroke="none">
        <rect x="50" y="140" width="16" height="12" rx="3" fillOpacity="0.3" />
        <rect x="74" y="140" width="16" height="12" rx="3" fillOpacity="0.3" />
        <rect x="98" y="140" width="16" height="12" rx="3" fillOpacity="0.14" />
        <rect x="122" y="140" width="16" height="12" rx="3" fillOpacity="0.3" />
        <rect x="50" y="160" width="16" height="12" rx="3" fillOpacity="0.14" />
        <rect x="74" y="160" width="16" height="12" rx="3" fillOpacity="0.3" />
        <rect x="98" y="160" width="16" height="12" rx="3" fillOpacity="0.3" />
        <rect x="122" y="160" width="16" height="12" rx="3" fillOpacity="0.3" />
        <rect x="50" y="180" width="16" height="12" rx="3" fillOpacity="0.3" />
        <rect x="74" y="180" width="16" height="12" rx="3" fillOpacity="0.14" />
      </g>

      {/*
       * แถบเวลาทำงานของแต่ละคน — เริ่มไม่พร้อมกัน ยาวไม่เท่ากัน
       * หัวและท้ายแถบคือเวลาเข้าและเวลาออก
       */}
      <g fill="currentColor" stroke="none">
        <rect
          x="196"
          y="112"
          width="252"
          height="11"
          rx="5.5"
          fillOpacity="0.26"
        />
        <rect
          x="224"
          y="136"
          width="310"
          height="11"
          rx="5.5"
          fillOpacity="0.26"
        />
        <rect
          x="196"
          y="160"
          width="216"
          height="11"
          rx="5.5"
          fillOpacity="0.26"
        />
        <rect
          x="240"
          y="184"
          width="288"
          height="11"
          rx="5.5"
          fillOpacity="0.26"
        />
      </g>
      <g fill="currentColor" stroke="none">
        <circle cx="196" cy="117.5" r="4" fillOpacity="0.5" />
        <circle cx="448" cy="117.5" r="4" fillOpacity="0.5" />
        <circle cx="224" cy="141.5" r="4" fillOpacity="0.5" />
        <circle cx="534" cy="141.5" r="4" fillOpacity="0.5" />
        <circle cx="196" cy="165.5" r="4" fillOpacity="0.5" />
        <circle cx="412" cy="165.5" r="4" fillOpacity="0.5" />
        <circle cx="240" cy="189.5" r="4" fillOpacity="0.5" />
        <circle cx="528" cy="189.5" r="4" fillOpacity="0.5" />
      </g>

      {/* เส้นเวลาของวัน พร้อมขีดบอกชั่วโมง */}
      <path d="M186,206 H600" strokeOpacity="0.24" strokeWidth="1.5" />
      <path
        d="M196,206 v6 M256,206 v6 M316,206 v6 M376,206 v6 M436,206 v6 M496,206 v6 M556,206 v6"
        strokeOpacity="0.18"
        strokeWidth="1.5"
      />

      {/* นาฬิกาบอกว่าทั้งหมดนี้คือเรื่องเวลา */}
      <circle cx="756" cy="150" r="70" strokeOpacity="0.1" strokeWidth="1.5" />
      <circle cx="756" cy="150" r="52" strokeOpacity="0.18" strokeWidth="9" />
      <path
        d="M756,98 A52,52 0 0 1 800,175"
        strokeOpacity="0.4"
        strokeWidth="9"
      />
      <path
        d="M756,150 V118 M756,150 l24,14"
        strokeOpacity="0.45"
        strokeWidth="4"
      />
      <circle
        cx="756"
        cy="150"
        r="4"
        fill="currentColor"
        fillOpacity="0.45"
        stroke="none"
      />

      <g fill="currentColor" stroke="none">
        <circle cx="640" cy="120" r="3" fillOpacity="0.2" />
        <circle cx="866" cy="188" r="2.5" fillOpacity="0.16" />
      </g>
    </svg>
  );
}

/**
 * ตรวจข้อมูลของงวดให้ครบ แล้วส่งต่อเข้าเงินเดือน
 * ใช้กับหน้าที่เป็นด่านตรวจก่อน Payroll — อ่านจากซ้ายไปขวาเป็นลำดับงาน
 * ใบสรุป → วันในงวดที่มีข้อมูลครบแล้ว → ผ่านการตรวจ → เข้าเป็นตัวเงิน
 */
function PayrollReviewMotif() {
  return (
    <svg
      className="absolute inset-y-0 right-0 w-[62%] text-white"
      viewBox="0 0 900 220"
      preserveAspectRatio="xMaxYMax meet"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* ใบสรุปของงวด */}
      <path
        d="M34,116 a10,10 0 0 1 10,-10 h84 l26,26 v72 a10,10 0 0 1 -10,10 h-100 a10,10 0 0 1 -10,-10 Z"
        strokeOpacity="0.24"
      />
      <path d="M128,106 v18 a8,8 0 0 0 8,8 h18" strokeOpacity="0.2" />
      <path d="M56,152 h44 M56,168 h56" strokeOpacity="0.2" />
      <path d="M56,186 l9,9 l17,-19" strokeOpacity="0.4" strokeWidth="2.5" />

      {/* วันในงวด — ช่องทึบคือวันที่มีข้อมูลครบแล้ว */}
      <g fill="currentColor" stroke="none">
        <rect x="196" y="118" width="30" height="20" rx="5" fillOpacity="0.3" />
        <rect x="234" y="118" width="30" height="20" rx="5" fillOpacity="0.3" />
        <rect
          x="272"
          y="118"
          width="30"
          height="20"
          rx="5"
          fillOpacity="0.14"
        />
        <rect x="310" y="118" width="30" height="20" rx="5" fillOpacity="0.3" />
        <rect x="348" y="118" width="30" height="20" rx="5" fillOpacity="0.3" />
        <rect
          x="386"
          y="118"
          width="30"
          height="20"
          rx="5"
          fillOpacity="0.14"
        />
        <rect x="196" y="146" width="30" height="20" rx="5" fillOpacity="0.3" />
        <rect
          x="234"
          y="146"
          width="30"
          height="20"
          rx="5"
          fillOpacity="0.14"
        />
        <rect x="272" y="146" width="30" height="20" rx="5" fillOpacity="0.3" />
        <rect x="310" y="146" width="30" height="20" rx="5" fillOpacity="0.3" />
        <rect x="348" y="146" width="30" height="20" rx="5" fillOpacity="0.3" />
        <rect x="386" y="146" width="30" height="20" rx="5" fillOpacity="0.3" />
      </g>
      {/* แถบความคืบหน้าของงวด */}
      <g fill="currentColor" stroke="none">
        <rect
          x="196"
          y="182"
          width="220"
          height="8"
          rx="4"
          fillOpacity="0.14"
        />
        <rect
          x="196"
          y="182"
          width="152"
          height="8"
          rx="4"
          fillOpacity="0.34"
        />
      </g>

      {/* ส่งต่อไปขั้นถัดไป */}
      <path
        d="M440,152 h50 M478,140 l12,12 l-12,12"
        strokeOpacity="0.28"
        strokeWidth="2.5"
      />

      {/* ผ่านการตรวจแล้ว */}
      <path
        d="M576,104 L630,122 v34 C630,178 606,192 576,198 C546,192 522,178 522,156 v-34 Z"
        strokeOpacity="0.26"
      />
      <path d="M552,150 l16,16 l30,-34" strokeOpacity="0.45" strokeWidth="3" />

      {/* เข้าเป็นตัวเงิน — เหรียญซ้อนกันสามชั้น */}
      <g strokeOpacity="0.3">
        <ellipse cx="762" cy="186" rx="46" ry="15" />
        <ellipse cx="762" cy="162" rx="46" ry="15" />
        <ellipse cx="762" cy="138" rx="46" ry="15" />
        <path d="M716,138 v48 M808,138 v48" strokeOpacity="0.22" />
      </g>

      {/* วงสรุปที่ขอบขวา โผล่มาครึ่งใบ */}
      <circle cx="878" cy="140" r="38" strokeOpacity="0.12" strokeWidth="9" />
      <path
        d="M878,102 A38,38 0 0 1 909,159"
        strokeOpacity="0.26"
        strokeWidth="9"
      />

      <g fill="currentColor" stroke="none">
        <circle cx="500" cy="112" r="3" fillOpacity="0.2" />
        <circle cx="676" cy="188" r="2.5" fillOpacity="0.16" />
      </g>
    </svg>
  );
}

/**
 * โควตาวันลาของแต่ละคน — ใช้ไปเท่าไร เหลือเท่าไร ปรับเพิ่ม/ลดได้
 * ใช้กับหน้าที่เป็นเรื่องสิทธิ์วันลา
 */
function LeaveQuotaMotif() {
  return (
    <svg
      className="absolute inset-y-0 right-0 w-[62%] text-white"
      viewBox="0 0 900 220"
      preserveAspectRatio="xMaxYMax meet"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* ปฏิทิน — ช่องทึบคือวันที่ลาไปแล้ว */}
      <rect
        x="34"
        y="112"
        width="120"
        height="88"
        rx="12"
        strokeOpacity="0.22"
      />
      <path d="M34,136 H154" strokeOpacity="0.22" />
      <path d="M64,104 v16 M124,104 v16" strokeOpacity="0.3" strokeWidth="3" />
      <g fill="currentColor" stroke="none">
        <rect x="50" y="148" width="18" height="13" rx="3" fillOpacity="0.14" />
        <rect x="76" y="148" width="18" height="13" rx="3" fillOpacity="0.32" />
        <rect
          x="102"
          y="148"
          width="18"
          height="13"
          rx="3"
          fillOpacity="0.14"
        />
        <rect
          x="128"
          y="148"
          width="18"
          height="13"
          rx="3"
          fillOpacity="0.14"
        />
        <rect x="50" y="169" width="18" height="13" rx="3" fillOpacity="0.14" />
        <rect x="76" y="169" width="18" height="13" rx="3" fillOpacity="0.14" />
        <rect
          x="102"
          y="169"
          width="18"
          height="13"
          rx="3"
          fillOpacity="0.32"
        />
        <rect
          x="128"
          y="169"
          width="18"
          height="13"
          rx="3"
          fillOpacity="0.32"
        />
      </g>

      {/*
       * แถบโควตารายประเภท — รางคือสิทธิ์ทั้งหมด ส่วนที่ทึบคือที่ใช้ไปแล้ว
       * ยาวไม่เท่ากันเพราะแต่ละประเภทได้สิทธิ์ไม่เท่ากัน
       */}
      <g fill="currentColor" stroke="none">
        <rect
          x="196"
          y="120"
          width="250"
          height="10"
          rx="5"
          fillOpacity="0.14"
        />
        <rect
          x="196"
          y="120"
          width="96"
          height="10"
          rx="5"
          fillOpacity="0.34"
        />

        <rect
          x="196"
          y="150"
          width="200"
          height="10"
          rx="5"
          fillOpacity="0.14"
        />
        <rect
          x="196"
          y="150"
          width="150"
          height="10"
          rx="5"
          fillOpacity="0.34"
        />

        <rect
          x="196"
          y="180"
          width="284"
          height="10"
          rx="5"
          fillOpacity="0.14"
        />
        <rect
          x="196"
          y="180"
          width="58"
          height="10"
          rx="5"
          fillOpacity="0.34"
        />
      </g>
      <g fill="currentColor" stroke="none">
        <circle cx="292" cy="125" r="4.5" fillOpacity="0.5" />
        <circle cx="346" cy="155" r="4.5" fillOpacity="0.5" />
        <circle cx="254" cy="185" r="4.5" fillOpacity="0.5" />
      </g>

      {/* ปรับเพิ่ม / ลด รายคน */}
      <circle cx="536" cy="130" r="17" strokeOpacity="0.22" />
      <path
        d="M527,130 h18 M536,121 v18"
        strokeOpacity="0.4"
        strokeWidth="2.5"
      />
      <circle cx="536" cy="178" r="17" strokeOpacity="0.22" />
      <path d="M527,178 h18" strokeOpacity="0.4" strokeWidth="2.5" />

      {/* วงสัดส่วนวันคงเหลือ */}
      <circle cx="712" cy="152" r="54" strokeOpacity="0.15" strokeWidth="11" />
      <path
        d="M712,98 A54,54 0 1 1 665,178"
        strokeOpacity="0.4"
        strokeWidth="11"
      />
      <circle
        cx="712"
        cy="152"
        r="4"
        fill="currentColor"
        fillOpacity="0.3"
        stroke="none"
      />

      {/* วงเล็กที่ขอบขวา โผล่มาครึ่งใบ */}
      <circle cx="872" cy="128" r="34" strokeOpacity="0.12" strokeWidth="8" />
      <path
        d="M872,94 A34,34 0 0 1 901,145"
        strokeOpacity="0.26"
        strokeWidth="8"
      />

      <g fill="currentColor" stroke="none">
        <circle cx="600" cy="112" r="3" fillOpacity="0.2" />
        <circle cx="620" cy="192" r="2.5" fillOpacity="0.16" />
      </g>
    </svg>
  );
}

/**
 * เส้นทางของคนใหม่ตั้งแต่ประกาศรับสมัครจนกลายเป็นพนักงาน
 * ใช้กับหน้าที่รวมงานสรรหาและงานต้อนรับไว้ด้วยกัน
 */
function OnboardingMotif() {
  return (
    <svg
      className="absolute inset-y-0 right-0 w-[62%] text-white"
      viewBox="0 0 900 220"
      preserveAspectRatio="xMaxYMax meet"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* ประกาศรับสมัคร */}
      <rect
        x="34"
        y="112"
        width="112"
        height="86"
        rx="12"
        strokeOpacity="0.24"
      />
      <g fill="currentColor" stroke="none">
        <rect x="52" y="132" width="52" height="8" rx="4" fillOpacity="0.3" />
        <rect x="52" y="150" width="76" height="6" rx="3" fillOpacity="0.16" />
        <rect x="52" y="164" width="60" height="6" rx="3" fillOpacity="0.16" />
        <rect x="52" y="180" width="40" height="6" rx="3" fillOpacity="0.16" />
      </g>

      {/* ผู้สมัครที่เข้ามา */}
      <g strokeOpacity="0.3">
        <circle cx="204" cy="132" r="12" />
        <path d="M184,178 C184,152 224,152 224,178" />
        <circle cx="258" cy="126" r="14" />
        <path d="M234,178 C234,148 282,148 282,178" />
        <circle cx="316" cy="132" r="12" />
        <path d="M296,178 C296,152 336,152 336,178" />
      </g>
      <path d="M184,190 H336" strokeOpacity="0.18" strokeWidth="1.5" />

      {/* คัดแล้วส่งต่อ */}
      <path
        d="M368,152 h44 M402,140 l12,12 l-12,12"
        strokeOpacity="0.26"
        strokeWidth="2.5"
      />

      {/* เช็กลิสต์ต้อนรับ — ติ๊กไปแล้วสองข้อ */}
      <g>
        <rect
          x="446"
          y="112"
          width="20"
          height="20"
          rx="6"
          strokeOpacity="0.28"
        />
        <path d="M451,122 l4,4 l8,-9" strokeOpacity="0.45" strokeWidth="2.5" />
        <rect
          x="446"
          y="146"
          width="20"
          height="20"
          rx="6"
          strokeOpacity="0.28"
        />
        <path d="M451,156 l4,4 l8,-9" strokeOpacity="0.45" strokeWidth="2.5" />
        <rect
          x="446"
          y="180"
          width="20"
          height="20"
          rx="6"
          strokeOpacity="0.2"
        />
      </g>
      <g fill="currentColor" stroke="none">
        <rect
          x="478"
          y="118"
          width="92"
          height="7"
          rx="3.5"
          fillOpacity="0.24"
        />
        <rect
          x="478"
          y="152"
          width="76"
          height="7"
          rx="3.5"
          fillOpacity="0.24"
        />
        <rect
          x="478"
          y="186"
          width="60"
          height="7"
          rx="3.5"
          fillOpacity="0.14"
        />
      </g>

      {/* บัตรพนักงานใหม่ */}
      <path d="M672,92 v22" strokeOpacity="0.2" />
      <rect
        x="616"
        y="114"
        width="112"
        height="84"
        rx="12"
        strokeOpacity="0.26"
      />
      <circle cx="648" cy="144" r="13" strokeOpacity="0.3" />
      <path d="M630,178 C630,156 666,156 666,178" strokeOpacity="0.3" />
      <g fill="currentColor" stroke="none">
        <rect
          x="678"
          y="136"
          width="36"
          height="7"
          rx="3.5"
          fillOpacity="0.26"
        />
        <rect x="678" y="151" width="28" height="6" rx="3" fillOpacity="0.16" />
        <rect x="678" y="165" width="32" height="6" rx="3" fillOpacity="0.16" />
      </g>

      {/* วงสรุปที่ขอบขวา โผล่มาครึ่งใบ */}
      <circle cx="856" cy="146" r="44" strokeOpacity="0.14" strokeWidth="10" />
      <path
        d="M856,102 A44,44 0 0 1 891,168"
        strokeOpacity="0.3"
        strokeWidth="10"
      />

      <g fill="currentColor" stroke="none">
        <circle cx="592" cy="110" r="3" fillOpacity="0.2" />
        <circle cx="596" cy="192" r="2.5" fillOpacity="0.16" />
      </g>
    </svg>
  );
}

/**
 * ย้ายคนจากหน่วยงานหนึ่งไปอีกหน่วยงานหนึ่ง โดยตั้งวันที่มีผลไว้ล่วงหน้า
 * ใช้กับหน้าที่เป็นเรื่องคำสั่งโยกย้าย/ปรับตำแหน่ง
 */
function TransferMotif() {
  return (
    <svg
      className="absolute inset-y-0 right-0 w-[62%] text-white"
      viewBox="0 0 900 220"
      preserveAspectRatio="xMaxYMax meet"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* หน่วยงานต้นทาง */}
      <rect
        x="34"
        y="118"
        width="104"
        height="76"
        rx="12"
        strokeOpacity="0.22"
      />
      <path d="M34,142 H138" strokeOpacity="0.2" />
      <circle cx="70" cy="166" r="11" strokeOpacity="0.28" />
      <path d="M52,190 C52,172 88,172 88,190" strokeOpacity="0.28" />
      <g fill="currentColor" stroke="none">
        <rect x="104" y="158" width="20" height="6" rx="3" fillOpacity="0.18" />
        <rect x="104" y="172" width="14" height="6" rx="3" fillOpacity="0.18" />
      </g>

      {/* คนที่ถูกย้าย เดินไปตามเส้นทาง */}
      <path
        d="M162,156 C210,132 250,180 298,156"
        strokeOpacity="0.24"
        strokeWidth="2.5"
      />
      <circle cx="230" cy="152" r="15" strokeOpacity="0.34" />
      <path d="M204,192 C204,162 256,162 256,192" strokeOpacity="0.34" />
      <path
        d="M312,156 h44 M344,144 l12,12 l-12,12"
        strokeOpacity="0.3"
        strokeWidth="2.5"
      />

      {/* หน่วยงานปลายทาง */}
      <rect
        x="384"
        y="118"
        width="104"
        height="76"
        rx="12"
        strokeOpacity="0.3"
      />
      <path d="M384,142 H488" strokeOpacity="0.24" />
      <circle cx="420" cy="166" r="11" strokeOpacity="0.34" />
      <path d="M402,190 C402,172 438,172 438,190" strokeOpacity="0.34" />
      <path d="M452,164 l7,7 l14,-16" strokeOpacity="0.42" strokeWidth="2.5" />

      {/* ใบคำสั่งที่ระบุวันมีผล */}
      <rect
        x="548"
        y="112"
        width="112"
        height="88"
        rx="12"
        strokeOpacity="0.26"
      />
      <path
        d="M576,104 v14 M632,104 v14"
        strokeOpacity="0.24"
        strokeWidth="3"
      />
      <path d="M548,136 H660" strokeOpacity="0.22" />
      <g fill="currentColor" stroke="none">
        <rect
          x="566"
          y="150"
          width="42"
          height="7"
          rx="3.5"
          fillOpacity="0.26"
        />
        <rect x="566" y="166" width="60" height="6" rx="3" fillOpacity="0.16" />
        <rect x="566" y="180" width="34" height="6" rx="3" fillOpacity="0.16" />
      </g>

      {/* นาฬิกาบอกว่าเป็นคำสั่งที่ตั้งไว้ล่วงหน้า */}
      <circle cx="768" cy="152" r="46" strokeOpacity="0.16" strokeWidth="10" />
      <path
        d="M768,106 A46,46 0 0 1 807,175"
        strokeOpacity="0.36"
        strokeWidth="10"
      />
      <path
        d="M768,152 V124 M768,152 l21,12"
        strokeOpacity="0.4"
        strokeWidth="4"
      />
      <circle
        cx="768"
        cy="152"
        r="4"
        fill="currentColor"
        fillOpacity="0.4"
        stroke="none"
      />

      {/* วงเล็กที่ขอบขวา โผล่มาครึ่งใบ */}
      <circle cx="880" cy="132" r="32" strokeOpacity="0.12" strokeWidth="8" />
      <path
        d="M880,100 A32,32 0 0 1 907,148"
        strokeOpacity="0.24"
        strokeWidth="8"
      />

      <g fill="currentColor" stroke="none">
        <circle cx="520" cy="110" r="3" fillOpacity="0.2" />
        <circle cx="700" cy="192" r="2.5" fillOpacity="0.16" />
      </g>
    </svg>
  );
}

/**
 * เคลียร์ของ ปิดสิทธิ์ ส่งมอบงาน ให้ครบก่อนพนักงานพ้นสภาพ
 * ใช้กับหน้าที่เป็นเรื่องการออกจากงาน
 */
function OffboardingMotif() {
  return (
    <svg
      className="absolute inset-y-0 right-0 w-[62%] text-white"
      viewBox="0 0 900 220"
      preserveAspectRatio="xMaxYMax meet"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* เช็กลิสต์เคลียร์ของ — ติ๊กไปแล้วสองข้อ เหลืออีกข้อ */}
      <g>
        <rect
          x="34"
          y="112"
          width="20"
          height="20"
          rx="6"
          strokeOpacity="0.28"
        />
        <path d="M39,122 l4,4 l8,-9" strokeOpacity="0.45" strokeWidth="2.5" />
        <rect
          x="34"
          y="146"
          width="20"
          height="20"
          rx="6"
          strokeOpacity="0.28"
        />
        <path d="M39,156 l4,4 l8,-9" strokeOpacity="0.45" strokeWidth="2.5" />
        <rect
          x="34"
          y="180"
          width="20"
          height="20"
          rx="6"
          strokeOpacity="0.2"
        />
      </g>
      <g fill="currentColor" stroke="none">
        <rect
          x="66"
          y="118"
          width="96"
          height="7"
          rx="3.5"
          fillOpacity="0.24"
        />
        <rect
          x="66"
          y="152"
          width="78"
          height="7"
          rx="3.5"
          fillOpacity="0.24"
        />
        <rect
          x="66"
          y="186"
          width="62"
          height="7"
          rx="3.5"
          fillOpacity="0.14"
        />
      </g>

      {/* คืนของ — กล่องอุปกรณ์ที่ส่งคืน */}
      <path
        d="M212,140 l40,-18 l40,18 v42 l-40,18 l-40,-18 Z"
        strokeOpacity="0.26"
      />
      <path d="M212,140 l40,18 l40,-18 M252,158 v42" strokeOpacity="0.2" />

      {/* ส่งมอบงานให้คนต่อไป */}
      <circle cx="356" cy="140" r="14" strokeOpacity="0.3" />
      <path d="M332,184 C332,154 380,154 380,184" strokeOpacity="0.3" />
      <path
        d="M396,158 h44 M428,146 l12,12 l-12,12"
        strokeOpacity="0.28"
        strokeWidth="2.5"
      />
      <circle cx="480" cy="140" r="14" strokeOpacity="0.3" />
      <path d="M456,184 C456,154 504,154 504,184" strokeOpacity="0.3" />

      {/* ปิดสิทธิ์เข้าระบบ — กุญแจล็อก */}
      <rect
        x="556"
        y="146"
        width="76"
        height="56"
        rx="12"
        strokeOpacity="0.3"
      />
      <path d="M574,146 v-14 a20,20 0 0 1 40,0 v14" strokeOpacity="0.3" />
      <circle
        cx="594"
        cy="172"
        r="5"
        fill="currentColor"
        fillOpacity="0.4"
        stroke="none"
      />
      <path d="M594,177 v10" strokeOpacity="0.4" strokeWidth="3" />

      {/* วงสรุปความคืบหน้าของการเคลียร์ */}
      <circle cx="760" cy="152" r="50" strokeOpacity="0.15" strokeWidth="10" />
      <path
        d="M760,102 A50,50 0 1 1 717,178"
        strokeOpacity="0.36"
        strokeWidth="10"
      />
      <path d="M738,152 l14,14 l28,-32" strokeOpacity="0.42" strokeWidth="6" />

      {/* วงเล็กที่ขอบขวา โผล่มาครึ่งใบ */}
      <circle cx="880" cy="132" r="32" strokeOpacity="0.12" strokeWidth="8" />
      <path
        d="M880,100 A32,32 0 0 1 907,148"
        strokeOpacity="0.24"
        strokeWidth="8"
      />

      <g fill="currentColor" stroke="none">
        <circle cx="668" cy="112" r="3" fillOpacity="0.2" />
        <circle cx="690" cy="192" r="2.5" fillOpacity="0.16" />
      </g>
    </svg>
  );
}

/**
 * ให้คะแนนตามหัวข้อที่ถ่วงน้ำหนัก แล้วสรุปเป็นผลรายรอบ
 * ใช้กับหน้าที่เป็นเรื่องประเมินผลและวินัยพนักงาน
 */
function PerformanceMotif() {
  return (
    <svg
      className="absolute inset-y-0 right-0 w-[62%] text-white"
      viewBox="0 0 900 220"
      preserveAspectRatio="xMaxYMax meet"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* แบบประเมิน — หัวข้อพร้อมแถบคะแนนที่ให้ไม่เท่ากัน */}
      <rect
        x="34"
        y="106"
        width="240"
        height="96"
        rx="12"
        strokeOpacity="0.22"
      />
      <g fill="currentColor" stroke="none">
        <rect
          x="54"
          y="126"
          width="58"
          height="7"
          rx="3.5"
          fillOpacity="0.26"
        />
        <rect
          x="128"
          y="126"
          width="126"
          height="7"
          rx="3.5"
          fillOpacity="0.12"
        />
        <rect
          x="128"
          y="126"
          width="92"
          height="7"
          rx="3.5"
          fillOpacity="0.32"
        />

        <rect
          x="54"
          y="150"
          width="46"
          height="7"
          rx="3.5"
          fillOpacity="0.26"
        />
        <rect
          x="128"
          y="150"
          width="126"
          height="7"
          rx="3.5"
          fillOpacity="0.12"
        />
        <rect
          x="128"
          y="150"
          width="60"
          height="7"
          rx="3.5"
          fillOpacity="0.32"
        />

        <rect
          x="54"
          y="174"
          width="52"
          height="7"
          rx="3.5"
          fillOpacity="0.26"
        />
        <rect
          x="128"
          y="174"
          width="126"
          height="7"
          rx="3.5"
          fillOpacity="0.12"
        />
        <rect
          x="128"
          y="174"
          width="110"
          height="7"
          rx="3.5"
          fillOpacity="0.32"
        />
      </g>

      {/* ดาวให้คะแนน */}
      <path
        d="M320,120 l9,19 l21,3 l-15,15 l4,21 l-19,-10 l-19,10 l4,-21 l-15,-15 l21,-3 Z"
        strokeOpacity="0.34"
      />
      <path
        d="M320,168 l6,13 l14,2 l-10,10 l2,14 l-12,-7 l-12,7 l2,-14 l-10,-10 l14,-2 Z"
        strokeOpacity="0.2"
      />

      {/* ผลรวมของรอบ — แนวโน้มที่ดีขึ้น */}
      <path d="M392,196 H596" strokeOpacity="0.24" strokeWidth="1.5" />
      <g fill="currentColor" fillOpacity="0.18" stroke="none">
        <rect x="400" y="164" width="26" height="32" rx="6" />
        <rect x="438" y="148" width="26" height="48" rx="6" />
        <rect x="476" y="154" width="26" height="42" rx="6" />
        <rect x="514" y="128" width="26" height="68" rx="6" />
        <rect x="552" y="116" width="26" height="80" rx="6" />
      </g>
      <path
        d="M413,158 L451,142 L489,148 L527,122 L565,110"
        strokeOpacity="0.4"
        strokeWidth="2.5"
      />
      <circle
        cx="565"
        cy="110"
        r="4.5"
        fill="currentColor"
        fillOpacity="0.45"
        stroke="none"
      />

      {/* หนังสือเตือน — เอกสารที่มีเครื่องหมายตกใจ */}
      <path
        d="M628,116 a10,10 0 0 1 10,-10 h50 l24,24 v62 a10,10 0 0 1 -10,10 h-64 a10,10 0 0 1 -10,-10 Z"
        strokeOpacity="0.24"
      />
      <path d="M688,106 v16 a8,8 0 0 0 8,8 h16" strokeOpacity="0.2" />
      <path d="M670,142 v22" strokeOpacity="0.42" strokeWidth="3.5" />
      <circle
        cx="670"
        cy="176"
        r="3"
        fill="currentColor"
        fillOpacity="0.42"
        stroke="none"
      />

      {/* วงสรุปคะแนนรวม */}
      <circle cx="826" cy="152" r="46" strokeOpacity="0.15" strokeWidth="10" />
      <path
        d="M826,106 A46,46 0 1 1 786,175"
        strokeOpacity="0.36"
        strokeWidth="10"
      />
      <circle
        cx="826"
        cy="152"
        r="4"
        fill="currentColor"
        fillOpacity="0.3"
        stroke="none"
      />

      <g fill="currentColor" stroke="none">
        <circle cx="608" cy="110" r="3" fillOpacity="0.2" />
        <circle cx="748" cy="192" r="2.5" fillOpacity="0.16" />
      </g>
    </svg>
  );
}

/**
 * ออกหนังสือรับรองให้พนักงาน และรับเรื่องร้องเรียนเข้ามาดำเนินการ
 * ใช้กับหน้าศูนย์บริการพนักงาน
 */
function DocumentsMotif() {
  return (
    <svg
      className="absolute inset-y-0 right-0 w-[62%] text-white"
      viewBox="0 0 900 220"
      preserveAspectRatio="xMaxYMax meet"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* คำขอที่รอคิวอยู่ข้างหลัง */}
      <rect
        x="52"
        y="100"
        width="150"
        height="100"
        rx="12"
        strokeOpacity="0.12"
      />
      <rect
        x="42"
        y="108"
        width="150"
        height="100"
        rx="12"
        strokeOpacity="0.18"
      />

      {/* หนังสือรับรองที่ออกแล้ว — มีตราประทับมุมล่าง */}
      <path
        d="M232,120 a12,12 0 0 1 12,-12 h74 l30,30 v74 a12,12 0 0 1 -12,12 h-92 a12,12 0 0 1 -12,-12 Z"
        strokeOpacity="0.26"
      />
      <path d="M318,108 v18 a12,12 0 0 0 12,12 h18" strokeOpacity="0.22" />
      <g fill="currentColor" stroke="none">
        <rect x="254" y="150" width="66" height="6" rx="3" fillOpacity="0.24" />
        <rect x="254" y="166" width="86" height="6" rx="3" fillOpacity="0.18" />
        <rect x="254" y="182" width="48" height="6" rx="3" fillOpacity="0.18" />
      </g>
      <circle cx="330" cy="180" r="17" strokeOpacity="0.34" />
      <circle cx="330" cy="180" r="11" strokeOpacity="0.2" />

      {/* ลงนามอนุมัติ */}
      <path
        d="M396,178 c16,-16 26,4 40,-8 c10,-9 16,4 28,-6"
        strokeOpacity="0.36"
        strokeWidth="2.5"
      />
      <path d="M392,196 H480" strokeOpacity="0.2" strokeWidth="1.5" />
      <path d="M470,146 l14,14 l-30,10 l6,-14 Z" strokeOpacity="0.28" />
      <path d="M484,160 l18,-18 l-14,-14 l-18,18" strokeOpacity="0.24" />

      {/* เรื่องร้องเรียนที่พนักงานส่งเข้ามา */}
      <path
        d="M546,116 a12,12 0 0 1 12,-12 h94 a12,12 0 0 1 12,12 v50 a12,12 0 0 1 -12,12 h-58 l-26,22 v-22 h-10 a12,12 0 0 1 -12,-12 Z"
        strokeOpacity="0.26"
      />
      <path d="M604,124 v26" strokeOpacity="0.4" strokeWidth="3.5" />
      <circle
        cx="604"
        cy="162"
        r="3"
        fill="currentColor"
        fillOpacity="0.4"
        stroke="none"
      />

      {/* ติดตามเป็นลำดับขั้นจนปิดเรื่อง */}
      <path d="M714,152 H832" strokeOpacity="0.22" strokeWidth="1.5" />
      <circle cx="714" cy="152" r="9" strokeOpacity="0.3" />
      <circle cx="773" cy="152" r="9" strokeOpacity="0.3" />
      <circle
        cx="832"
        cy="152"
        r="13"
        fill="currentColor"
        fillOpacity="0.18"
        stroke="none"
      />
      <circle cx="832" cy="152" r="13" strokeOpacity="0.4" />
      <path d="M826,152 l4.5,4.5 l8,-9" strokeOpacity="0.5" strokeWidth="2.5" />

      <g fill="currentColor" stroke="none">
        <circle cx="700" cy="196" r="3" fillOpacity="0.18" />
        <circle cx="524" cy="112" r="2.5" fillOpacity="0.16" />
      </g>
    </svg>
  );
}

/**
 * ทำเงินเดือนรายงวด — คำนวณ ตรวจ อนุมัติ แล้วโอนออก
 * ใช้กับหน้ารอบจ่ายเงินเดือน
 */
function PayrollMotif() {
  return (
    <svg
      className="absolute inset-y-0 right-0 w-[62%] text-white"
      viewBox="0 0 900 220"
      preserveAspectRatio="xMaxYMax meet"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* ปฏิทินงวด — รอบจ่ายที่วนซ้ำทุกเดือน */}
      <rect
        x="40"
        y="112"
        width="104"
        height="88"
        rx="12"
        strokeOpacity="0.22"
      />
      <path d="M40,138 H144" strokeOpacity="0.22" />
      <path d="M64,112 v-12 M120,112 v-12" strokeOpacity="0.28" />
      <g fill="currentColor" stroke="none">
        <circle cx="66" cy="158" r="4" fillOpacity="0.18" />
        <circle cx="92" cy="158" r="4" fillOpacity="0.18" />
        <circle cx="118" cy="158" r="4" fillOpacity="0.3" />
        <circle cx="66" cy="180" r="4" fillOpacity="0.18" />
        <circle cx="92" cy="180" r="4" fillOpacity="0.18" />
      </g>

      {/* สลิปเงินเดือน — รายได้หักลบแล้วเหลือสุทธิ */}
      <path
        d="M186,116 a10,10 0 0 1 10,-10 h108 a10,10 0 0 1 10,10 v84 l-16,-10 l-16,10 l-16,-10 l-16,10 l-16,-10 l-16,10 l-16,-10 l-16,10 Z"
        strokeOpacity="0.26"
      />
      <g fill="currentColor" stroke="none">
        <rect x="204" y="130" width="46" height="6" rx="3" fillOpacity="0.24" />
        <rect x="262" y="130" width="34" height="6" rx="3" fillOpacity="0.16" />
        <rect x="204" y="148" width="38" height="6" rx="3" fillOpacity="0.24" />
        <rect x="262" y="148" width="34" height="6" rx="3" fillOpacity="0.16" />
      </g>
      <path d="M204,166 H296" strokeOpacity="0.24" strokeWidth="1.5" />
      <g fill="currentColor" stroke="none">
        <rect x="228" y="176" width="68" height="8" rx="4" fillOpacity="0.34" />
      </g>

      {/* เครื่องคิดเลข — ขั้นคำนวณ */}
      <rect
        x="352"
        y="112"
        width="84"
        height="88"
        rx="12"
        strokeOpacity="0.22"
      />
      <rect
        x="366"
        y="126"
        width="56"
        height="16"
        rx="4"
        strokeOpacity="0.24"
      />
      <g fill="currentColor" stroke="none">
        <circle cx="372" cy="158" r="3.5" fillOpacity="0.2" />
        <circle cx="394" cy="158" r="3.5" fillOpacity="0.2" />
        <circle cx="416" cy="158" r="3.5" fillOpacity="0.2" />
        <circle cx="372" cy="178" r="3.5" fillOpacity="0.2" />
        <circle cx="394" cy="178" r="3.5" fillOpacity="0.2" />
        <circle cx="416" cy="178" r="3.5" fillOpacity="0.34" />
      </g>

      {/* เหรียญกองขึ้นตามยอดของงวด */}
      <g strokeOpacity="0.26">
        <ellipse cx="512" cy="186" rx="34" ry="11" />
        <path d="M478,186 v-14 a34,11 0 0 0 68,0 v14" />
        <ellipse cx="512" cy="164" rx="34" ry="11" />
        <path d="M478,164 v-14 a34,11 0 0 0 68,0 v14" />
        <ellipse cx="512" cy="142" rx="34" ry="11" />
      </g>

      {/* โอนเข้าบัญชีพนักงาน */}
      <path d="M596,152 H700" strokeOpacity="0.3" strokeWidth="2.5" />
      <path d="M686,138 l16,14 l-16,14" strokeOpacity="0.3" strokeWidth="2.5" />
      <path
        d="M726,124 a12,12 0 0 1 12,-12 h74 a12,12 0 0 1 12,12 v56 a12,12 0 0 1 -12,12 h-74 a12,12 0 0 1 -12,-12 Z"
        strokeOpacity="0.24"
      />
      <path d="M726,142 H824" strokeOpacity="0.2" />
      <g fill="currentColor" stroke="none">
        <rect x="742" y="158" width="40" height="6" rx="3" fillOpacity="0.22" />
        <rect x="742" y="172" width="24" height="6" rx="3" fillOpacity="0.16" />
      </g>
      <circle
        cx="852"
        cy="152"
        r="15"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="none"
      />
      <circle cx="852" cy="152" r="15" strokeOpacity="0.38" />
      <path d="M845,152 l5,5 l9,-10" strokeOpacity="0.5" strokeWidth="2.5" />

      <g fill="currentColor" stroke="none">
        <circle cx="580" cy="116" r="3" fillOpacity="0.18" />
        <circle cx="668" cy="196" r="2.5" fillOpacity="0.16" />
      </g>
    </svg>
  );
}

/**
 * หักภาษี ณ ที่จ่ายแล้วนำส่งกรมสรรพากร
 * ใช้กับหน้าบันทึกการจ่ายเงินให้ผู้รับที่ไม่ใช่ลูกจ้าง (ภ.ง.ด.3)
 */
function WithholdingMotif() {
  return (
    <svg
      className="absolute inset-y-0 right-0 w-[62%] text-white"
      viewBox="0 0 900 220"
      preserveAspectRatio="xMaxYMax meet"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* ใบเสร็จรับเงินที่ขอบล่างหยัก */}
      <path
        d="M54,116 a10,10 0 0 1 10,-10 h96 a10,10 0 0 1 10,10 v86 l-14,-9 l-14,9 l-14,-9 l-14,9 l-14,-9 l-14,9 l-14,-9 l-14,9 Z"
        strokeOpacity="0.26"
      />
      <g fill="currentColor" stroke="none">
        <rect x="72" y="130" width="44" height="6" rx="3" fillOpacity="0.24" />
        <rect x="126" y="130" width="28" height="6" rx="3" fillOpacity="0.16" />
        <rect x="72" y="148" width="36" height="6" rx="3" fillOpacity="0.24" />
        <rect x="126" y="148" width="28" height="6" rx="3" fillOpacity="0.16" />
      </g>
      <path d="M72,166 H154" strokeOpacity="0.24" strokeWidth="1.5" />
      <g fill="currentColor" stroke="none">
        <rect x="100" y="176" width="54" height="8" rx="4" fillOpacity="0.32" />
      </g>

      {/* เงินก้อนที่จ่ายออก แล้วถูกหักส่วนหนึ่งเป็นภาษี */}
      <path d="M212,152 H300" strokeOpacity="0.3" strokeWidth="2.5" />
      <path d="M286,138 l16,14 l-16,14" strokeOpacity="0.3" strokeWidth="2.5" />

      <circle cx="368" cy="152" r="34" strokeOpacity="0.22" />
      <path d="M352,168 L384,136" strokeOpacity="0.42" strokeWidth="2.5" />
      <circle cx="356" cy="142" r="7" strokeOpacity="0.36" />
      <circle cx="380" cy="162" r="7" strokeOpacity="0.36" />

      {/* ส่วนที่หักไว้ ไหลไปอีกทาง */}
      <path d="M414,152 H500" strokeOpacity="0.24" strokeWidth="2" />
      <path d="M486,140 l14,12 l-14,12" strokeOpacity="0.24" strokeWidth="2" />

      {/* แบบ ภ.ง.ด.3 ที่ต้องยื่น */}
      <path
        d="M528,112 a10,10 0 0 1 10,-10 h60 l26,26 v74 a10,10 0 0 1 -10,10 h-76 a10,10 0 0 1 -10,-10 Z"
        strokeOpacity="0.26"
      />
      <path d="M598,102 v18 a8,8 0 0 0 8,8 h18" strokeOpacity="0.2" />
      <g fill="currentColor" stroke="none">
        <rect x="548" y="146" width="52" height="6" rx="3" fillOpacity="0.22" />
        <rect x="548" y="162" width="66" height="6" rx="3" fillOpacity="0.16" />
        <rect x="548" y="178" width="38" height="6" rx="3" fillOpacity="0.16" />
      </g>

      {/* นำส่งกรมสรรพากร */}
      <path d="M666,152 H716" strokeOpacity="0.24" strokeWidth="2" />
      <path d="M704,142 l12,10 l-12,10" strokeOpacity="0.24" strokeWidth="2" />

      <path d="M744,196 H864" strokeOpacity="0.26" strokeWidth="2" />
      <path
        d="M752,196 v-46 M780,196 v-46 M828,196 v-46 M856,196 v-46"
        strokeOpacity="0.24"
      />
      <path d="M738,150 H870 L804,110 Z" strokeOpacity="0.28" />

      <g fill="currentColor" stroke="none">
        <circle cx="470" cy="112" r="3" fillOpacity="0.18" />
        <circle cx="648" cy="196" r="2.5" fillOpacity="0.16" />
      </g>
    </svg>
  );
}

/**
 * ตั้งค่าที่ทำครั้งเดียวแล้วใช้ทุกงวด — กฎ อัตรา และโครงสร้าง
 * ใช้กับหน้าตั้งค่าของโซนเงินเดือน
 */
function SettingsMotif() {
  return (
    <svg
      className="absolute inset-y-0 right-0 w-[62%] text-white"
      viewBox="0 0 900 220"
      preserveAspectRatio="xMaxYMax meet"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* เล่มกฎที่เปิดค้างไว้ */}
      <path d="M46,190 V120 a44,14 0 0 1 62,0 v70" strokeOpacity="0.22" />
      <path d="M170,190 V120 a44,14 0 0 0 -62,0 v70" strokeOpacity="0.22" />
      <path
        d="M46,190 a44,12 0 0 0 62,0 a44,12 0 0 0 62,0"
        strokeOpacity="0.26"
      />
      <g fill="currentColor" stroke="none">
        <rect
          x="62"
          y="136"
          width="34"
          height="5"
          rx="2.5"
          fillOpacity="0.18"
        />
        <rect
          x="62"
          y="150"
          width="28"
          height="5"
          rx="2.5"
          fillOpacity="0.14"
        />
        <rect
          x="122"
          y="136"
          width="34"
          height="5"
          rx="2.5"
          fillOpacity="0.18"
        />
        <rect
          x="122"
          y="150"
          width="28"
          height="5"
          rx="2.5"
          fillOpacity="0.14"
        />
      </g>

      {/* แถบเลื่อนตั้งค่า — สามค่าที่ตั้งไว้ไม่เท่ากัน */}
      <g strokeOpacity="0.24">
        <path d="M222,126 H346" />
        <path d="M222,156 H346" />
        <path d="M222,186 H346" />
      </g>
      <g fill="currentColor" stroke="none">
        <circle cx="266" cy="126" r="7" fillOpacity="0.34" />
        <circle cx="318" cy="156" r="7" fillOpacity="0.34" />
        <circle cx="242" cy="186" r="7" fillOpacity="0.34" />
      </g>

      {/* เฟืองสองตัวขบกัน */}
      <circle cx="452" cy="150" r="30" strokeOpacity="0.26" />
      <circle cx="452" cy="150" r="12" strokeOpacity="0.2" />
      <g strokeOpacity="0.26">
        <path d="M452,112 v10 M452,178 v10 M414,150 h10 M480,150 h10" />
        <path d="M425,123 l7,7 M472,170 l7,7 M479,123 l-7,7 M432,170 l-7,7" />
      </g>

      <circle cx="530" cy="188" r="19" strokeOpacity="0.2" />
      <circle cx="530" cy="188" r="7" strokeOpacity="0.16" />
      <g strokeOpacity="0.2">
        <path d="M530,163 v7 M530,206 v7 M505,188 h7 M548,188 h7" />
      </g>

      {/* ตารางอัตราแบบขั้นบันได */}
      <path d="M596,196 H830" strokeOpacity="0.24" strokeWidth="1.5" />
      <g fill="currentColor" fillOpacity="0.18" stroke="none">
        <rect x="606" y="176" width="38" height="20" rx="4" />
        <rect x="654" y="160" width="38" height="36" rx="4" />
        <rect x="702" y="140" width="38" height="56" rx="4" />
        <rect x="750" y="116" width="38" height="80" rx="4" />
      </g>
      <path
        d="M606,176 H644 V160 H692 V140 H740 V116 H788"
        strokeOpacity="0.4"
        strokeWidth="2.5"
      />

      {/* ติ๊กว่าตั้งค่าครบแล้ว */}
      <circle
        cx="856"
        cy="130"
        r="15"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="none"
      />
      <circle cx="856" cy="130" r="15" strokeOpacity="0.38" />
      <path d="M849,130 l5,5 l9,-10" strokeOpacity="0.5" strokeWidth="2.5" />

      <g fill="currentColor" stroke="none">
        <circle cx="576" cy="118" r="3" fillOpacity="0.18" />
        <circle cx="380" cy="196" r="2.5" fillOpacity="0.16" />
      </g>
    </svg>
  );
}

/**
 * รวมไฟล์ที่ระบบออกได้และสถิติขององค์กรไว้ที่เดียว
 * ใช้กับหน้าศูนย์เอกสารและสถิติ
 */
function ReportsMotif() {
  return (
    <svg
      className="absolute inset-y-0 right-0 w-[62%] text-white"
      viewBox="0 0 900 220"
      preserveAspectRatio="xMaxYMax meet"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* แฟ้มเอกสารซ้อนกัน แล้วดึงออกมาหนึ่งใบ */}
      <path
        d="M44,132 a10,10 0 0 1 10,-10 h40 l12,14 h48 a10,10 0 0 1 10,10 v56 a10,10 0 0 1 -10,10 h-100 a10,10 0 0 1 -10,-10 Z"
        strokeOpacity="0.22"
      />
      <path
        d="M96,116 a8,8 0 0 1 8,-8 h50 l20,20 v58 a8,8 0 0 1 -8,8 h-62 a8,8 0 0 1 -8,-8 Z"
        strokeOpacity="0.3"
      />
      <path d="M154,108 v14 a6,6 0 0 0 6,6 h14" strokeOpacity="0.24" />
      <g fill="currentColor" stroke="none">
        <rect x="112" y="142" width="42" height="6" rx="3" fillOpacity="0.24" />
        <rect x="112" y="156" width="54" height="6" rx="3" fillOpacity="0.16" />
        <rect x="112" y="170" width="34" height="6" rx="3" fillOpacity="0.16" />
      </g>

      {/* ดาวน์โหลดออกมา */}
      <path d="M232,124 v42" strokeOpacity="0.4" strokeWidth="2.5" />
      <path d="M220,156 l12,12 l12,-12" strokeOpacity="0.4" strokeWidth="2.5" />
      <path d="M210,186 h44" strokeOpacity="0.28" strokeWidth="2.5" />

      {/* กราฟแท่งของสถิติ */}
      <path d="M300,196 H520" strokeOpacity="0.24" strokeWidth="1.5" />
      <g fill="currentColor" fillOpacity="0.18" stroke="none">
        <rect x="310" y="158" width="28" height="38" rx="5" />
        <rect x="352" y="136" width="28" height="60" rx="5" />
        <rect x="394" y="150" width="28" height="46" rx="5" />
        <rect x="436" y="118" width="28" height="78" rx="5" />
        <rect x="478" y="104" width="28" height="92" rx="5" />
      </g>
      <path
        d="M324,150 L366,128 L408,142 L450,110 L492,96"
        strokeOpacity="0.4"
        strokeWidth="2.5"
      />
      <circle
        cx="492"
        cy="96"
        r="4.5"
        fill="currentColor"
        fillOpacity="0.45"
        stroke="none"
      />

      {/* กราฟวงกลมของสัดส่วน */}
      <circle cx="612" cy="152" r="44" strokeOpacity="0.16" strokeWidth="10" />
      <path
        d="M612,108 A44,44 0 0 1 651,173"
        strokeOpacity="0.38"
        strokeWidth="10"
      />
      <path
        d="M651,173 A44,44 0 0 1 574,175"
        strokeOpacity="0.24"
        strokeWidth="10"
      />

      {/* ตารางข้อมูลที่พร้อมส่งออก */}
      <rect
        x="704"
        y="108"
        width="156"
        height="88"
        rx="12"
        strokeOpacity="0.24"
      />
      <path d="M704,134 H860 M756,134 V196 M808,134 V196" strokeOpacity="0.2" />
      <g fill="currentColor" stroke="none">
        <rect x="716" y="116" width="26" height="6" rx="3" fillOpacity="0.24" />
        <rect x="768" y="116" width="26" height="6" rx="3" fillOpacity="0.18" />
        <rect x="820" y="116" width="26" height="6" rx="3" fillOpacity="0.18" />
        <rect
          x="716"
          y="148"
          width="26"
          height="5"
          rx="2.5"
          fillOpacity="0.14"
        />
        <rect
          x="768"
          y="148"
          width="26"
          height="5"
          rx="2.5"
          fillOpacity="0.14"
        />
        <rect
          x="820"
          y="148"
          width="26"
          height="5"
          rx="2.5"
          fillOpacity="0.14"
        />
        <rect
          x="716"
          y="170"
          width="26"
          height="5"
          rx="2.5"
          fillOpacity="0.14"
        />
        <rect
          x="768"
          y="170"
          width="26"
          height="5"
          rx="2.5"
          fillOpacity="0.14"
        />
        <rect
          x="820"
          y="170"
          width="26"
          height="5"
          rx="2.5"
          fillOpacity="0.14"
        />
      </g>

      <g fill="currentColor" stroke="none">
        <circle cx="556" cy="112" r="3" fillOpacity="0.18" />
        <circle cx="680" cy="196" r="2.5" fillOpacity="0.16" />
      </g>
    </svg>
  );
}

/**
 * บัญชีผู้ใช้ บทบาท และสิทธิ์ที่แต่ละบทบาทเปิดได้
 * ใช้กับหน้าผู้ใช้และสิทธิ์
 */
function AccessMotif() {
  return (
    <svg
      className="absolute inset-y-0 right-0 w-[62%] text-white"
      viewBox="0 0 900 220"
      preserveAspectRatio="xMaxYMax meet"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* บัญชีผู้ใช้สามคน คนหนึ่งเด่นกว่าเพื่อน */}
      <circle cx="70" cy="140" r="15" strokeOpacity="0.2" />
      <path d="M46,190 a24,24 0 0 1 48,0" strokeOpacity="0.2" />

      <circle cx="122" cy="132" r="19" strokeOpacity="0.32" />
      <path d="M92,190 a30,30 0 0 1 60,0" strokeOpacity="0.32" />

      <circle cx="176" cy="140" r="15" strokeOpacity="0.2" />
      <path d="M152,190 a24,24 0 0 1 48,0" strokeOpacity="0.2" />

      {/* ผูกกับบทบาท */}
      <path d="M228,150 H300" strokeOpacity="0.28" strokeWidth="2.5" />
      <path
        d="M288,140 l12,10 l-12,10"
        strokeOpacity="0.28"
        strokeWidth="2.5"
      />

      {/* โล่สิทธิ์ */}
      <path
        d="M382,100 l52,20 v40 c0,30 -22,46 -52,58 c-30,-12 -52,-28 -52,-58 v-40 Z"
        strokeOpacity="0.3"
      />
      <path
        d="M360,152 l14,14 l30,-32"
        strokeOpacity="0.45"
        strokeWidth="2.5"
      />

      {/* รายการสิทธิ์ที่ติ๊กเปิด-ปิดไม่เท่ากัน */}
      <rect
        x="486"
        y="106"
        width="180"
        height="88"
        rx="12"
        strokeOpacity="0.22"
      />
      <g strokeOpacity="0.3">
        <rect x="502" y="122" width="12" height="12" rx="3" />
        <rect x="502" y="144" width="12" height="12" rx="3" />
        <rect x="502" y="166" width="12" height="12" rx="3" />
      </g>
      <path d="M505,128 l3,3 l6,-7" strokeOpacity="0.45" strokeWidth="2" />
      <path d="M505,172 l3,3 l6,-7" strokeOpacity="0.45" strokeWidth="2" />
      <g fill="currentColor" stroke="none">
        <rect x="526" y="125" width="92" height="6" rx="3" fillOpacity="0.24" />
        <rect x="526" y="147" width="70" height="6" rx="3" fillOpacity="0.14" />
        <rect
          x="526"
          y="169"
          width="108"
          height="6"
          rx="3"
          fillOpacity="0.24"
        />
      </g>

      {/* กุญแจเข้าระบบ */}
      <circle cx="740" cy="128" r="18" strokeOpacity="0.3" />
      <circle cx="740" cy="128" r="7" strokeOpacity="0.24" />
      <path d="M752,141 L806,195" strokeOpacity="0.3" strokeWidth="2.5" />
      <path
        d="M786,175 l14,-14 M798,187 l12,-12"
        strokeOpacity="0.3"
        strokeWidth="2.5"
      />

      {/* ล็อกที่ปิดอยู่ */}
      <rect
        x="828"
        y="150"
        width="46"
        height="38"
        rx="8"
        strokeOpacity="0.26"
      />
      <path d="M838,150 v-10 a13,13 0 0 1 26,0 v10" strokeOpacity="0.26" />
      <circle
        cx="851"
        cy="168"
        r="4"
        fill="currentColor"
        fillOpacity="0.32"
        stroke="none"
      />

      <g fill="currentColor" stroke="none">
        <circle cx="452" cy="112" r="3" fillOpacity="0.18" />
        <circle cx="700" cy="196" r="2.5" fillOpacity="0.16" />
      </g>
    </svg>
  );
}

/**
 * ทะเบียนพนักงานและโครงสร้างสังกัด
 * ใช้กับหน้าข้อมูลพนักงาน
 */
function EmployeesMotif() {
  return (
    <svg
      className="absolute inset-y-0 right-0 w-[62%] text-white"
      viewBox="0 0 900 220"
      preserveAspectRatio="xMaxYMax meet"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* บัตรพนักงาน */}
      <rect
        x="44"
        y="108"
        width="150"
        height="94"
        rx="12"
        strokeOpacity="0.26"
      />
      <path d="M44,132 H194" strokeOpacity="0.2" />
      <circle cx="82" cy="164" r="14" strokeOpacity="0.3" />
      <path d="M62,196 a20,20 0 0 1 40,0" strokeOpacity="0.3" />
      <g fill="currentColor" stroke="none">
        <rect x="116" y="150" width="58" height="6" rx="3" fillOpacity="0.24" />
        <rect x="116" y="164" width="44" height="6" rx="3" fillOpacity="0.16" />
        <rect x="116" y="178" width="52" height="6" rx="3" fillOpacity="0.16" />
        <rect x="104" y="118" width="30" height="6" rx="3" fillOpacity="0.2" />
      </g>

      {/* รายชื่อที่ค้นหาได้ */}
      <rect
        x="236"
        y="112"
        width="180"
        height="86"
        rx="12"
        strokeOpacity="0.2"
      />
      <g strokeOpacity="0.26">
        <circle cx="258" cy="134" r="7" />
        <circle cx="258" cy="156" r="7" />
        <circle cx="258" cy="178" r="7" />
      </g>
      <g fill="currentColor" stroke="none">
        <rect x="274" y="131" width="90" height="6" rx="3" fillOpacity="0.22" />
        <rect
          x="274"
          y="153"
          width="120"
          height="6"
          rx="3"
          fillOpacity="0.16"
        />
        <rect x="274" y="175" width="72" height="6" rx="3" fillOpacity="0.16" />
      </g>

      {/* แว่นขยายค้นหา */}
      <circle cx="470" cy="140" r="26" strokeOpacity="0.3" />
      <path d="M489,159 L512,182" strokeOpacity="0.3" strokeWidth="2.5" />

      {/* ผังสังกัด: บริษัท → สาขา → แผนก */}
      <rect x="700" y="96" width="72" height="30" rx="8" strokeOpacity="0.3" />
      <path
        d="M736,126 v18 M624,144 H848 M624,144 v16 M736,144 v16 M848,144 v16"
        strokeOpacity="0.22"
      />
      <rect
        x="590"
        y="160"
        width="68"
        height="28"
        rx="8"
        strokeOpacity="0.24"
      />
      <rect
        x="702"
        y="160"
        width="68"
        height="28"
        rx="8"
        strokeOpacity="0.24"
      />
      <rect
        x="814"
        y="160"
        width="68"
        height="28"
        rx="8"
        strokeOpacity="0.24"
      />

      <g fill="currentColor" stroke="none">
        <circle cx="556" cy="112" r="3" fillOpacity="0.18" />
        <circle cx="548" cy="196" r="2.5" fillOpacity="0.16" />
      </g>
    </svg>
  );
}

/**
 * บริษัท สาขา แผนก และผังการบังคับบัญชา
 * ใช้กับหน้าโครงสร้างองค์กร
 */
function OrganizationMotif() {
  return (
    <svg
      className="absolute inset-y-0 right-0 w-[62%] text-white"
      viewBox="0 0 900 220"
      preserveAspectRatio="xMaxYMax meet"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* อาคารสำนักงานใหญ่ */}
      <path d="M48,200 V118 l52,-26 l52,26 v82" strokeOpacity="0.26" />
      <path d="M36,200 H164" strokeOpacity="0.26" />
      <g fill="currentColor" stroke="none">
        <rect x="68" y="134" width="16" height="16" rx="3" fillOpacity="0.2" />
        <rect x="94" y="134" width="16" height="16" rx="3" fillOpacity="0.2" />
        <rect x="120" y="134" width="16" height="16" rx="3" fillOpacity="0.2" />
        <rect x="68" y="160" width="16" height="16" rx="3" fillOpacity="0.14" />
        <rect x="94" y="160" width="16" height="16" rx="3" fillOpacity="0.14" />
        <rect
          x="120"
          y="160"
          width="16"
          height="16"
          rx="3"
          fillOpacity="0.14"
        />
      </g>

      {/* สาขาย่อยสองหลัง */}
      <path d="M196,200 V150 h44 v50" strokeOpacity="0.2" />
      <path d="M262,200 V162 h38 v38" strokeOpacity="0.16" />

      {/* ผังการบังคับบัญชา */}
      <rect x="470" y="94" width="86" height="32" rx="8" strokeOpacity="0.32" />
      <path
        d="M513,126 v18 M382,144 H644 M382,144 v18 M513,144 v18 M644,144 v18"
        strokeOpacity="0.24"
      />
      <rect
        x="346"
        y="162"
        width="72"
        height="30"
        rx="8"
        strokeOpacity="0.24"
      />
      <rect
        x="477"
        y="162"
        width="72"
        height="30"
        rx="8"
        strokeOpacity="0.24"
      />
      <rect
        x="608"
        y="162"
        width="72"
        height="30"
        rx="8"
        strokeOpacity="0.24"
      />

      {/* ทีมในแต่ละกล่อง */}
      <g fill="currentColor" stroke="none">
        <circle cx="370" cy="177" r="5" fillOpacity="0.18" />
        <circle cx="386" cy="177" r="5" fillOpacity="0.18" />
        <circle cx="501" cy="177" r="5" fillOpacity="0.18" />
        <circle cx="517" cy="177" r="5" fillOpacity="0.18" />
        <circle cx="632" cy="177" r="5" fillOpacity="0.18" />
        <circle cx="648" cy="177" r="5" fillOpacity="0.18" />
      </g>

      {/* ป้ายบริษัทในเครือ */}
      <rect
        x="726"
        y="112"
        width="140"
        height="88"
        rx="12"
        strokeOpacity="0.22"
      />
      <path d="M726,140 H866" strokeOpacity="0.18" />
      <g fill="currentColor" stroke="none">
        <rect x="742" y="120" width="42" height="6" rx="3" fillOpacity="0.22" />
        <rect x="742" y="154" width="70" height="6" rx="3" fillOpacity="0.16" />
        <rect x="742" y="172" width="52" height="6" rx="3" fillOpacity="0.16" />
      </g>

      <g fill="currentColor" stroke="none">
        <circle cx="700" cy="112" r="3" fillOpacity="0.18" />
        <circle cx="312" cy="112" r="2.5" fillOpacity="0.16" />
      </g>
    </svg>
  );
}

/**
 * บัตรพนักงาน นาฬิกาลงเวลา และคำขอที่ยื่นเอง
 * ใช้กับหน้าหลักของพนักงาน (ESS)
 */
function SelfServiceMotif() {
  return (
    <svg
      className="absolute inset-y-0 right-0 w-[62%] text-white"
      viewBox="0 0 900 220"
      preserveAspectRatio="xMaxYMax meet"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* บัตรพนักงานห้อยสายคล้องคอ */}
      <path d="M96,18 l38,42 M172,18 l-38,42" strokeOpacity="0.2" />
      <rect x="86" y="60" width="96" height="128" rx="12" strokeOpacity="0.3" />
      <circle cx="134" cy="98" r="16" strokeOpacity="0.26" />
      <path d="M110,134 a24,20 0 0 1 48,0" strokeOpacity="0.26" />
      <g fill="currentColor" stroke="none">
        <rect x="106" y="150" width="56" height="6" rx="3" fillOpacity="0.2" />
        <rect x="116" y="164" width="36" height="6" rx="3" fillOpacity="0.14" />
      </g>

      {/* นาฬิกาลงเวลา เข็มชี้เวลาเข้างาน */}
      <circle cx="330" cy="120" r="52" strokeOpacity="0.3" />
      <path d="M330,88 v34 l24,14" strokeOpacity="0.32" />
      <path
        d="M330,60 v8 M330,172 v8 M270,120 h8 M382,120 h8"
        strokeOpacity="0.2"
      />

      {/* ปฏิทินวันลา ทำเครื่องหมายไว้หนึ่งวัน */}
      <rect
        x="452"
        y="72"
        width="120"
        height="104"
        rx="12"
        strokeOpacity="0.26"
      />
      <path d="M452,102 H572 M482,60 v22 M542,60 v22" strokeOpacity="0.22" />
      <g fill="currentColor" stroke="none">
        <rect
          x="470"
          y="116"
          width="18"
          height="14"
          rx="4"
          fillOpacity="0.18"
        />
        <rect
          x="502"
          y="116"
          width="18"
          height="14"
          rx="4"
          fillOpacity="0.26"
        />
        <rect
          x="534"
          y="116"
          width="18"
          height="14"
          rx="4"
          fillOpacity="0.18"
        />
        <rect
          x="470"
          y="142"
          width="18"
          height="14"
          rx="4"
          fillOpacity="0.14"
        />
        <rect
          x="502"
          y="142"
          width="18"
          height="14"
          rx="4"
          fillOpacity="0.14"
        />
      </g>

      {/* สลิปเงินเดือนของตัวเอง */}
      <path
        d="M640,54 h132 v148 l-16,-10 l-16,10 l-16,-10 l-16,10 l-16,-10 l-16,10 l-16,-10 l-20,10 Z"
        strokeOpacity="0.24"
      />
      <g fill="currentColor" stroke="none">
        <rect x="660" y="78" width="60" height="6" rx="3" fillOpacity="0.22" />
        <rect
          x="660"
          y="98"
          width="92"
          height="5"
          rx="2.5"
          fillOpacity="0.14"
        />
        <rect
          x="660"
          y="114"
          width="92"
          height="5"
          rx="2.5"
          fillOpacity="0.14"
        />
        <rect
          x="660"
          y="130"
          width="72"
          height="5"
          rx="2.5"
          fillOpacity="0.14"
        />
        <rect x="660" y="152" width="52" height="8" rx="4" fillOpacity="0.24" />
      </g>

      {/* เครื่องหมายถูกของคำขอที่อนุมัติแล้ว */}
      <circle cx="820" cy="150" r="28" strokeOpacity="0.24" />
      <path d="M806,150 l10,10 l20,-22" strokeOpacity="0.3" />

      <g fill="currentColor" stroke="none">
        <circle cx="242" cy="52" r="3" fillOpacity="0.18" />
        <circle cx="610" cy="188" r="2.5" fillOpacity="0.16" />
      </g>
    </svg>
  );
}
