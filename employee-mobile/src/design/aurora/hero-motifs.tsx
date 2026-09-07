import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

import { AURORA } from './palette';

/**
 * ลายน้ำริมขวาของหัวจอ — จอละหนึ่งลาย
 *
 * หัวจอทุกหน้าใช้โครงเดียวกัน (`PageHero`) สิ่งที่บอกว่า "นี่คือหน้าอะไร" จึง
 * เหลือแค่ชื่อจอบรรทัดเดียว ลายน้ำทำหน้าที่นั้นด้วยภาพ — เหลือบตาก็รู้ว่าอยู่
 * หน้าไหนโดยไม่ต้องอ่าน
 *
 * กติกาของทุกลายในไฟล์นี้:
 * - **ใหญ่เกินหัวจอเสมอ** แล้วปล่อยให้ `overflow: 'hidden'` ของหัวจอตัด เห็น
 *   เป็นเสี้ยวของสิ่งของ ไม่ใช่ไอคอนทั้งใบวางอยู่เฉย ๆ
 * - **จางมาก** (16%) อยู่หลังตัวหนังสือเสมอ ห้ามแย่งอ่านกับชื่อจอ
 * - **ขาวขอบเทา** ไม่ใช่สีของแบรนด์ — ผืนน้ำเงินริมซ้ายเป็นของที่มีสีอยู่แล้ว
 *   ถ้าลายน้ำมีสีอีก หัวจอจะมีของแข่งกันสองฝั่ง
 */

/** ใหญ่กว่าความสูงหัวจอหลายเท่า จะได้ล้นออกไปทุกด้านแล้วโดนตัด */
const MOTIF_SIZE = 140;

/**
 * กรอบวางลายน้ำ — ตำแหน่งกับความจางเหมือนกันทุกลาย
 *
 * ค่าเลื่อนขึ้นและออกนอกขอบขวาเป็นค่าเดียวกันหมด ลายของทุกจอจึงโผล่มาในมุม
 * เดียวกันเป๊ะ สลับหน้าแล้วไม่มีอะไรกระโดด
 */
function MotifCanvas({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        /*
         * 32% ไม่ใช่ 16% — พื้นหัวจอเป็นขาว ลายที่จางกว่านี้ผสมกับขาวแล้วได้
         * เทาระดับเดียวกับเส้นคั่น (~#e2e4e8) ซึ่งบนเครื่องจริงคือมองไม่เห็น
         * ค่านี้ให้เทาราว #b6bcc6 — เห็นว่าเป็นรูปอะไร แต่ยังจางกว่าตัวหนังสือ
         * ที่ทับอยู่ข้างหน้าหลายเท่า
         */
        opacity: 0.32,
        position: 'absolute',
        right: -30,
        top: -26,
      }}
    >
      <Svg height={MOTIF_SIZE} width={MOTIF_SIZE}>
        {children}
      </Svg>
    </View>
  );
}

/* ------------------------------------------------------------ กระดาษ */

/** ขอบกระดาษหนึ่งใบ มุมขวาบนพับ — ระบบพิกัด 46×60 ต่อหนึ่งใบ */
const SHEET_OUTLINE =
  'M0,4 C0,1.8 1.8,0 4,0 L33,0 L46,13 L46,56 C46,58.2 44.2,60 42,60 L4,60 C1.8,60 0,58.2 0,56 Z';

/** รอยพับมุม — สามเหลี่ยมเล็กที่ทำให้อ่านเป็น "กระดาษ" ไม่ใช่สี่เหลี่ยมมน */
const SHEET_FOLD = 'M33,0 L46,13 L35,13 C33.9,13 33,12.1 33,11 Z';

/** เส้นบรรทัดบนกระดาษ — [y, ความยาว] */
const SHEET_LINES: [number, number][] = [
  [26, 28],
  [35, 28],
  [44, 18],
];

/**
 * กระดาษหนึ่งใบ — ชิ้นส่วนร่วมของลายที่เป็นเรื่อง "ใบคำขอ/เอกสาร"
 *
 * `lines` ปิดได้สำหรับใบที่มีของอย่างอื่นวางทับข้างใน (ตราประทับ ปลายปากกา)
 * ไม่งั้นเส้นบรรทัดจะตัดผ่านของชิ้นนั้นจนอ่านไม่ออกว่าเป็นอะไร
 */
export function HeroSheet({
  lines = true,
  opacity = 1,
  transform,
}: {
  lines?: boolean;
  opacity?: number;
  transform: string;
}) {
  return (
    <G opacity={opacity} transform={transform}>
      <Path
        d={SHEET_OUTLINE}
        fill={AURORA.baseDeep}
        stroke={AURORA.textFaint}
        strokeWidth={2}
      />
      <Path
        d={SHEET_FOLD}
        fill="none"
        stroke={AURORA.textFaint}
        strokeWidth={2}
      />
      {lines
        ? SHEET_LINES.map(([y, length]) => (
            <Rect
              key={y}
              fill={AURORA.textFaint}
              height={2.6}
              rx={1.3}
              width={length}
              x={9}
              y={y}
            />
          ))
        : null}
    </G>
  );
}

/* ------------------------------------------------------------- ลายจริง */

/**
 * ใบคำขอปลิว — จอรายการคำขอ
 *
 * สามใบวางเอียงคนละองศาซ้อนเหลื่อมกัน อ่านเป็นกระดาษที่ปลิวอยู่ ไม่ใช่กรอบ
 * สี่เหลี่ยมซ้อนกันเฉย ๆ
 */
export function RequestsMotif() {
  return (
    <MotifCanvas>
      <HeroSheet opacity={0.5} transform="translate(16 46) rotate(-16)" />
      <HeroSheet opacity={0.75} transform="translate(52 8) rotate(11)" />
      <HeroSheet transform="translate(74 58) rotate(26)" />
    </MotifCanvas>
  );
}

/**
 * ใบเดียวกับตราประทับถูก — จอรายละเอียดคำขอ
 *
 * จอนี้ไม่ใช่ "กองคำขอ" แต่เป็นใบเดียวที่กำลังเดินอยู่ในสายอนุมัติ ลายจึงเป็น
 * ใบใหญ่ใบเดียวกับวงตราประทับ ไม่ใช่ใบปลิวสามใบแบบจอรายการ
 */
export function RequestDetailMotif() {
  return (
    <MotifCanvas>
      <HeroSheet
        opacity={0.55}
        transform="translate(20 30) rotate(-11) scale(1.1)"
      />
      <HeroSheet
        lines={false}
        transform="translate(66 52) rotate(14) scale(1.25)"
      />

      {/* ตราประทับ — วงกลมเส้นหนากับเครื่องหมายถูก เอียงแบบตราที่ปั๊มด้วยมือ */}
      <G transform="translate(104 74) rotate(-14)">
        <Circle
          cx={0}
          cy={0}
          fill="none"
          r={17}
          stroke={AURORA.textFaint}
          strokeWidth={3}
        />
        <Path
          d="M-8,0 L-2.5,6 L8.5,-6.5"
          fill="none"
          stroke={AURORA.textFaint}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={3.4}
        />
      </G>
    </MotifCanvas>
  );
}

/**
 * ใบเปล่ากับปากกา — จอยื่นคำขอและแก้ไขคำขอ
 *
 * เส้นบรรทัดบนใบที่อยู่หน้าสุดถูกปิดไว้ เพราะจอนี้คือใบที่ "ยังไม่ได้กรอก" —
 * ใบที่มีบรรทัดเต็มอยู่แล้วสื่อกลับด้านกับสิ่งที่ผู้ใช้กำลังจะทำ
 */
export function RequestFormMotif() {
  return (
    <MotifCanvas>
      <HeroSheet
        opacity={0.5}
        transform="translate(24 26) rotate(-9) scale(1.05)"
      />
      <HeroSheet
        lines={false}
        transform="translate(62 50) rotate(12) scale(1.3)"
      />

      {/* ปากกาพาดทับใบ — ด้ามยาว คอปากกา แล้วปลายแหลม */}
      <G transform="translate(92 44) rotate(38)">
        <Rect
          fill={AURORA.baseDeep}
          height={13}
          rx={4}
          stroke={AURORA.textFaint}
          strokeWidth={2.4}
          width={54}
          x={0}
          y={0}
        />
        <Rect
          fill={AURORA.textFaint}
          height={13}
          rx={1}
          width={4}
          x={50}
          y={0}
        />
        <Path
          d="M58,0 L74,6.5 L58,13 Z"
          fill={AURORA.baseDeep}
          stroke={AURORA.textFaint}
          strokeLinejoin="round"
          strokeWidth={2.4}
        />
      </G>
    </MotifCanvas>
  );
}

/** ธนบัตรหนึ่งใบ — ชิ้นส่วนของลายเงินเดือน ระบบพิกัด 76×42 */
function Banknote({
  opacity = 1,
  transform,
}: {
  opacity?: number;
  transform: string;
}) {
  const width = 76;
  const height = 42;

  return (
    <G opacity={opacity} transform={transform}>
      <Rect
        fill={AURORA.baseDeep}
        height={height}
        rx={5}
        stroke={AURORA.textFaint}
        strokeWidth={2}
        width={width}
        x={0}
        y={0}
      />
      <Circle
        cx={width / 2}
        cy={height / 2}
        fill="none"
        r={9}
        stroke={AURORA.textFaint}
        strokeWidth={2}
      />
      <Rect
        fill={AURORA.textFaint}
        height={2.6}
        rx={1.3}
        width={11}
        x={9}
        y={height / 2 - 1.3}
      />
      <Rect
        fill={AURORA.textFaint}
        height={2.6}
        rx={1.3}
        width={11}
        x={width - 20}
        y={height / 2 - 1.3}
      />
    </G>
  );
}

/**
 * ธนบัตรกับกองเหรียญ — จอสลิปเงินเดือน
 *
 * เหรียญวาดเป็นวงรีซ้อนกันเป็นกอง ไม่ใช่วงกลมเรียงกัน — กองเหรียญมองจากด้าน
 * ข้างคือภาพที่คนอ่านออกทันทีว่าเป็นเงิน ส่วนวงกลมเรียง ๆ อ่านเป็นจุดไข่ปลา
 */
export function PayslipMotif() {
  return (
    <MotifCanvas>
      <Banknote opacity={0.55} transform="translate(14 30) rotate(-12)" />
      <Banknote transform="translate(48 62) rotate(9)" />

      {/* กองเหรียญ — สามชั้น ชั้นบนสุดเห็นหน้าเหรียญเต็มวง */}
      <G transform="translate(104 26)">
        {[24, 12, 0].map((y) => (
          <Ellipse
            key={y}
            cx={0}
            cy={y}
            fill={AURORA.baseDeep}
            rx={19}
            ry={7.5}
            stroke={AURORA.textFaint}
            strokeWidth={2}
          />
        ))}
      </G>
    </MotifCanvas>
  );
}

/**
 * แป้นตัวเลขกับแม่กุญแจ — จอตั้งรหัส PIN และจอปลดล็อก
 *
 * แป้นเป็นวงกลมเรียงสามคูณสามอยู่หลัง แม่กุญแจวางทับอยู่หน้า — สองอย่างนี้คู่กัน
 * คือภาพของ "รหัสที่กดด้วยนิ้ว" ถ้ามีแต่แม่กุญแจอย่างเดียวจะกลายเป็นเรื่อง
 * ความปลอดภัยทั่วไป ซึ่งเป็นของจอตั้งค่าความปลอดภัย ไม่ใช่จอนี้
 */
export function PinMotif() {
  const keys = [0, 1, 2].flatMap((row) =>
    [0, 1, 2].map((column) => ({
      cx: 22 + column * 32,
      cy: 16 + row * 32,
      key: `${row}-${column}`,
    })),
  );

  return (
    <MotifCanvas>
      {keys.map(({ cx, cy, key }) => (
        <Circle
          key={key}
          cx={cx}
          cy={cy}
          fill="none"
          r={11}
          stroke={AURORA.textFaint}
          strokeWidth={2}
        />
      ))}

      {/* แม่กุญแจ — ห่วงโค้งด้านบน ตัวเรือนเหลี่ยมมน แล้วรูกุญแจตรงกลาง */}
      <G transform="translate(74 60) rotate(-8)">
        <Path
          d="M11,20 L11,12 C11,4.8 16.8,-1 24,-1 C31.2,-1 37,4.8 37,12 L37,20"
          fill="none"
          stroke={AURORA.textFaint}
          strokeLinecap="round"
          strokeWidth={4}
        />
        <Rect
          fill={AURORA.baseDeep}
          height={34}
          rx={7}
          stroke={AURORA.textFaint}
          strokeWidth={3}
          width={48}
          x={0}
          y={20}
        />
        <Circle cx={24} cy={34} fill={AURORA.textFaint} r={4.5} />
        <Rect
          fill={AURORA.textFaint}
          height={9}
          rx={1.6}
          width={3.2}
          x={22.4}
          y={34}
        />
      </G>
    </MotifCanvas>
  );
}

/**
 * ลูกกุญแจกับดอกจัน — จอเปลี่ยนรหัสผ่าน
 *
 * แยกจาก `PinMotif` โดยตั้งใจ: PIN คือรหัสของเครื่องนี้เครื่องเดียว ส่วนรหัสผ่าน
 * คือกุญแจของบัญชีที่ใช้ได้ทั้งบนแอปและบนเว็บ สองจอนี้ทำคนละเรื่อง ลายจึงไม่
 * ควรเป็นภาพเดียวกัน
 */
export function PasswordMotif() {
  return (
    <MotifCanvas>
      {/* ดอกจันแทนรหัสที่ถูกปิดไว้ — เรียงเป็นแถวอยู่หลังลูกกุญแจ */}
      {[0, 1, 2, 3].map((index) => (
        <Circle
          key={index}
          cx={24 + index * 26}
          cy={22}
          fill={AURORA.textFaint}
          r={7}
        />
      ))}

      {/* ลูกกุญแจ — หัวเป็นวงแหวน ก้านยาว ปลายมีฟันสองซี่ */}
      <G transform="translate(20 62) rotate(-18)">
        <Circle
          cx={20}
          cy={20}
          fill={AURORA.baseDeep}
          r={19}
          stroke={AURORA.textFaint}
          strokeWidth={4}
        />
        <Circle cx={20} cy={20} fill={AURORA.baseDeep} r={7} />
        <Rect
          fill={AURORA.textFaint}
          height={8}
          rx={2}
          width={62}
          x={36}
          y={16}
        />
        <Rect fill={AURORA.textFaint} height={13} rx={2} width={7} x={72} y={24} />
        <Rect fill={AURORA.textFaint} height={9} rx={2} width={7} x={88} y={24} />
      </G>
    </MotifCanvas>
  );
}

/** เฟืองหนึ่งตัว — วงกลมกับฟันรอบวง ระบบพิกัดยึดจุดศูนย์กลางที่ (0,0) */
function Cog({
  opacity = 1,
  radius,
  teeth = 8,
  transform,
}: {
  opacity?: number;
  radius: number;
  teeth?: number;
  transform: string;
}) {
  const toothWidth = radius * 0.34;
  const toothHeight = radius * 0.4;

  return (
    <G opacity={opacity} transform={transform}>
      {Array.from({ length: teeth }, (_, index) => (360 / teeth) * index).map(
        (angle) => (
          <G key={angle} transform={`rotate(${angle})`}>
            <Rect
              fill={AURORA.textFaint}
              height={toothHeight}
              rx={2}
              width={toothWidth}
              x={-toothWidth / 2}
              y={-(radius + toothHeight * 0.72)}
            />
          </G>
        ),
      )}
      <Circle
        cx={0}
        cy={0}
        fill={AURORA.baseDeep}
        r={radius}
        stroke={AURORA.textFaint}
        strokeWidth={3}
      />
      <Circle
        cx={0}
        cy={0}
        fill="none"
        r={radius * 0.36}
        stroke={AURORA.textFaint}
        strokeWidth={3}
      />
    </G>
  );
}

/**
 * เฟืองสองตัวขบกัน — จอตั้งค่า
 *
 * ตัวเล็กเอียง 22 องศาเพื่อให้ฟันดูสอดกับตัวใหญ่ ไม่ใช่เฟืองสองตัวที่บังเอิญ
 * วางใกล้กัน — จอตั้งค่าคือที่ที่ของหลายอย่างทำงานร่วมกัน ภาพจึงควรเป็น
 * "ขบกัน" ไม่ใช่ "วางเรียงกัน"
 */
export function SettingsMotif() {
  return (
    <MotifCanvas>
      <Cog radius={34} teeth={9} transform="translate(58 44)" />
      <Cog opacity={0.6} radius={22} teeth={7} transform="translate(104 96) rotate(22)" />
    </MotifCanvas>
  );
}

/** โล่หนึ่งใบ — ระบบพิกัด 44×54 มุมบนซ้ายที่ (0,0) */
const SHIELD_OUTLINE =
  'M22,0 L44,9 L44,27 C44,42.5 34,50.5 22,54 C10,50.5 0,42.5 0,27 L0,9 Z';

/**
 * โล่กับรูกุญแจ — จอความปลอดภัย
 *
 * ไม่ใช้แม่กุญแจเหมือน `PinMotif` ทั้งที่เป็นเรื่องความปลอดภัยเหมือนกัน —
 * จอ PIN พูดถึง "รหัสที่กดด้วยนิ้ว" ส่วนจอนี้พูดถึงการปกป้องบัญชีทั้งใบ
 * (รหัสผ่าน ไบโอเมตริก อุปกรณ์ที่เข้าได้) โล่คือภาพของการปกป้อง ไม่ใช่ของ
 * การใส่รหัส
 */
export function SecurityMotif() {
  return (
    <MotifCanvas>
      <G opacity={0.5} transform="translate(10 58) rotate(-14)">
        <Path
          d={SHIELD_OUTLINE}
          fill={AURORA.baseDeep}
          stroke={AURORA.textFaint}
          strokeLinejoin="round"
          strokeWidth={3}
        />
      </G>

      <G transform="translate(54 20) scale(1.25)">
        <Path
          d={SHIELD_OUTLINE}
          fill={AURORA.baseDeep}
          stroke={AURORA.textFaint}
          strokeLinejoin="round"
          strokeWidth={3}
        />
        {/* รูกุญแจ — วงกลมกับก้านคว่ำ บอกว่าโล่ใบนี้เป็นเรื่องการล็อก */}
        <Circle
          cx={22}
          cy={22}
          fill="none"
          r={6}
          stroke={AURORA.textFaint}
          strokeWidth={3}
        />
        <Path
          d="M22,28 L22,38"
          stroke={AURORA.textFaint}
          strokeLinecap="round"
          strokeWidth={3}
        />
      </G>
    </MotifCanvas>
  );
}

/** กระดิ่งหนึ่งใบ — ระบบพิกัด 44×43 มุมบนซ้ายที่ (0,0) */
const BELL_BODY =
  'M22,2 C13.7,2 7,8.7 7,17 L7,26 L3,33 L41,33 L37,26 L37,17 C37,8.7 30.3,2 22,2 Z';
const BELL_CLAPPER = 'M16,37 C16,40.3 18.7,43 22,43 C25.3,43 28,40.3 28,37';

function Bell({
  opacity = 1,
  transform,
}: {
  opacity?: number;
  transform: string;
}) {
  return (
    <G opacity={opacity} transform={transform}>
      <Path
        d={BELL_BODY}
        fill={AURORA.baseDeep}
        stroke={AURORA.textFaint}
        strokeLinejoin="round"
        strokeWidth={3}
      />
      <Path
        d={BELL_CLAPPER}
        fill="none"
        stroke={AURORA.textFaint}
        strokeLinecap="round"
        strokeWidth={3}
      />
    </G>
  );
}

/**
 * กระดิ่งกับคลื่นเสียง — จอตั้งค่าการแจ้งเตือน
 *
 * คลื่นสองเส้นข้างกระดิ่งใบใหญ่คือสิ่งที่ทำให้ภาพนี้อ่านเป็น "กำลังดัง" ไม่ใช่
 * กระดิ่งที่แขวนอยู่เฉย ๆ — จอนี้ตั้งค่าว่าจะให้อะไร "เด้ง" ขึ้นจอบ้าง
 */
export function NotificationMotif() {
  return (
    <MotifCanvas>
      <Bell opacity={0.5} transform="translate(6 62) rotate(-16) scale(0.8)" />
      <Bell transform="translate(52 22) rotate(10)" />

      {/* คลื่นเสียงสองชั้นทางขวาของกระดิ่งใบใหญ่ */}
      <G transform="translate(108 44)">
        <Path
          d="M0,-14 C7,-7 7,7 0,14"
          fill="none"
          stroke={AURORA.textFaint}
          strokeLinecap="round"
          strokeWidth={3}
        />
        <Path
          d="M11,-24 C22,-12 22,12 11,24"
          fill="none"
          stroke={AURORA.textFaint}
          strokeLinecap="round"
          strokeWidth={3}
        />
      </G>
    </MotifCanvas>
  );
}

/* ------------------------------------------------ ลายของจอที่เพิ่งย้ายผิว */

/**
 * ช่วงที่มองเห็นจริงของกรอบลาย
 *
 * กรอบสูง 140 แต่หัวจอสูงแค่ 60 และกรอบถูกเลื่อนขึ้น 26 — ที่เหลือให้เห็นจึง
 * เป็นแถบ y ประมาณ 26–86 กว้างประมาณ x 0–128 เท่านั้น ของชิ้นหลักของทุกลาย
 * ต้องอยู่ในกรอบนี้ ไม่งั้นจะเหลือแต่ยอดโผล่มานิดเดียวจนดูไม่ออกว่าเป็นอะไร
 */
const MOTIF_TOP = 26;

/** ตำแหน่งเสาของอาคาร — เว้นระยะเท่ากันใต้หน้าจั่ว */
const HQ_COLUMNS = [28, 48, 68, 88, 108];

/**
 * อาคารสำนักงานใหญ่ — หน้าหลักของผู้บริหาร
 *
 * รอบก่อน ๆ วาดเป็นตึกสูงสามหลัง (ครั้งแรกใส่หน้าต่างเป็นจุด ครั้งที่สองเป็น
 * เส้นแบ่งชั้น) ทั้งสองแบบพอย่อลงมาอยู่ในแถบสูง 60 แล้วจางลง เหลือแค่กรอบ
 * สี่เหลี่ยมสามกรอบเรียงกัน ซึ่งไม่ได้อ่านว่า "บริษัท" มากไปกว่ากล่องสามใบ
 *
 * แบบนี้ใช้รูปทรงที่จำได้จากเงา: **หน้าจั่วสามเหลี่ยมวางบนแถวเสา** เป็นภาพ
 * แทนสำนักงานใหญ่ที่อ่านออกทันทีแม้เห็นแค่ครึ่งเดียว และไม่มีรายละเอียดย่อย
 * ที่จะกลายเป็นลายพร้อยตอนจาง
 *
 * ฐานเสาถูกตัดที่ขอบล่างของหัวจอโดยตั้งใจ (เหมือนอาคารที่โผล่พ้นขอบภาพ)
 */
export function ExecutiveHomeMotif() {
  return (
    <MotifCanvas>
      {/* หน้าจั่ว — เส้นเดียวปิดสามเหลี่ยม ไม่มีลายในตัว */}
      <Path
        d={`M14,${MOTIF_TOP + 22} L68,${MOTIF_TOP - 6} L122,${MOTIF_TOP + 22} Z`}
        fill={AURORA.baseDeep}
        stroke={AURORA.textFaint}
        strokeLinejoin="round"
        strokeWidth={3}
      />

      {/* คานใต้หน้าจั่ว — ตัวที่ทำให้สามเหลี่ยมกับเสาอ่านเป็นอาคารเดียวกัน */}
      <Rect
        fill={AURORA.baseDeep}
        height={9}
        rx={2}
        stroke={AURORA.textFaint}
        strokeWidth={2.6}
        width={116}
        x={12}
        y={MOTIF_TOP + 22}
      />

      {HQ_COLUMNS.map((x) => (
        <Rect
          fill={AURORA.baseDeep}
          height={52}
          key={x}
          rx={2}
          stroke={AURORA.textFaint}
          strokeWidth={2.6}
          width={11}
          x={x}
          y={MOTIF_TOP + 33}
        />
      ))}
    </MotifCanvas>
  );
}

/**
 * แท่งกราฟกับเส้นแนวโน้ม — จอตัวชี้วัดบริหาร
 *
 * มีทั้งแท่งและเส้นเพราะจอนี้อ่านสองอย่างพร้อมกัน: ค่าปัจจุบัน (แท่ง) กับ
 * ทิศทางเทียบเดือนก่อน (เส้น) — ถ้ามีแต่แท่งจะกลายเป็นลายของจอรายงานเฉย ๆ
 */
export function InsightsMotif() {
  /** ฐานของแท่งอยู่ที่ขอบล่างของแถบที่มองเห็น ไม่ใช่ก้นกรอบ */
  const base = 88;
  const bars: [number, number][] = [
    [10, 26],
    [36, 42],
    [62, 34],
    [88, 56],
  ];

  return (
    <MotifCanvas>
      {bars.map(([x, height]) => (
        <Rect
          key={x}
          fill={AURORA.baseDeep}
          height={height}
          rx={5}
          stroke={AURORA.textFaint}
          strokeWidth={2.6}
          width={22}
          x={x}
          y={base - height}
        />
      ))}

      {/* เส้นหักพุ่งขึ้นพร้อมหัวลูกศร — วางพาดเหนือแท่ง ไม่ใช่ในระนาบเดียวกัน */}
      <Path
        d="M8,68 L38,48 L64,56 L118,28"
        fill="none"
        stroke={AURORA.textFaint}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={3.4}
      />
      <Path
        d="M102,26 L119,27 L116,44"
        fill="none"
        stroke={AURORA.textFaint}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={3.4}
      />
    </MotifCanvas>
  );
}

/** หน้าปัดนาฬิกาหนึ่งเรือน — ใช้ซ้ำในลายที่เป็นเรื่องเวลา */
function ClockFace({
  opacity = 1,
  radius,
  transform,
}: {
  opacity?: number;
  radius: number;
  transform: string;
}) {
  return (
    <G opacity={opacity} transform={transform}>
      <Circle
        cx={0}
        cy={0}
        fill={AURORA.baseDeep}
        r={radius}
        stroke={AURORA.textFaint}
        strokeWidth={3}
      />
      <Path
        d={`M0,0 L0,${-radius * 0.58}`}
        stroke={AURORA.textFaint}
        strokeLinecap="round"
        strokeWidth={3.4}
      />
      <Path
        d={`M0,0 L${radius * 0.46},${radius * 0.26}`}
        stroke={AURORA.textFaint}
        strokeLinecap="round"
        strokeWidth={3.4}
      />
    </G>
  );
}

/** คนหนึ่งคน — หัวกลมกับไหล่ ระบบพิกัดยึดกลางหัวที่ (0,0) */
function Person({
  opacity = 1,
  transform,
}: {
  opacity?: number;
  transform: string;
}) {
  return (
    <G opacity={opacity} transform={transform}>
      <Circle
        cx={0}
        cy={0}
        fill={AURORA.baseDeep}
        r={12}
        stroke={AURORA.textFaint}
        strokeWidth={3}
      />
      <Path
        d="M-21,38 C-21,24 -11,17 0,17 C11,17 21,24 21,38"
        fill={AURORA.baseDeep}
        stroke={AURORA.textFaint}
        strokeLinecap="round"
        strokeWidth={3}
      />
    </G>
  );
}

/**
 * นาฬิกากับคน — จอเวลาทำงานวันนี้
 *
 * ไม่ใช่นาฬิกาลอยเดี่ยว ๆ เพราะจอนี้ไม่ได้ตอบว่า "กี่โมง" แต่ตอบว่า
 * "ใครมาแล้วบ้าง" — คนที่ยืนข้างเรือนนาฬิกาคือส่วนที่ทำให้ภาพตรงกับจอ
 */
export function WorkClockMotif() {
  return (
    <MotifCanvas>
      <ClockFace opacity={0.5} radius={19} transform="translate(14 46)" />
      <ClockFace radius={30} transform="translate(58 56)" />
      <Person transform="translate(110 48)" />
    </MotifCanvas>
  );
}

/**
 * คนสามคน — จอกำลังคน
 *
 * ซ้อนเหลื่อมกันสามคน ไม่ใช่เรียงเป็นแถว — กำลังคนคือ "กลุ่ม" ไม่ใช่รายชื่อ
 */
export function PeopleMotif() {
  return (
    <MotifCanvas>
      <Person opacity={0.5} transform="translate(20 52) scale(0.85)" />
      <Person opacity={0.75} transform="translate(112 50) scale(0.85)" />
      <Person transform="translate(66 44) scale(1.1)" />
    </MotifCanvas>
  );
}

/**
 * ธนบัตรกับแท่งกราฟ — จอค่าจ้างระดับองค์กร
 *
 * ต่างจากลายสลิป (`PayslipMotif`) ที่เป็นธนบัตรกับกองเหรียญ — จอนี้ไม่ใช่
 * เงินของใครคนหนึ่ง แต่เป็นยอดรวมที่ต้องดูแนวโน้มรายเดือน แท่งกราฟจึงแทน
 * กองเหรียญ
 */
export function PayrollMotif() {
  const bars: [number, number][] = [
    [92, 22],
    [107, 36],
    [122, 50],
  ];

  return (
    <MotifCanvas>
      <Banknote opacity={0.5} transform="translate(4 28) rotate(-9)" />
      <Banknote transform="translate(16 58) rotate(7)" />

      {bars.map(([x, height]) => (
        <Rect
          key={x}
          fill={AURORA.baseDeep}
          height={height}
          rx={4}
          stroke={AURORA.textFaint}
          strokeWidth={2.6}
          width={12}
          x={x}
          y={86 - height}
        />
      ))}
    </MotifCanvas>
  );
}

/** กล่องหนึ่งหน่วยในผัง — สี่เหลี่ยมมนกับเส้นชื่อข้างใน */
function OrgNode({
  opacity = 1,
  transform,
  width = 38,
}: {
  opacity?: number;
  transform: string;
  width?: number;
}) {
  return (
    <G opacity={opacity} transform={transform}>
      <Rect
        fill={AURORA.baseDeep}
        height={24}
        rx={6}
        stroke={AURORA.textFaint}
        strokeWidth={2.6}
        width={width}
        x={0}
        y={0}
      />
      <Rect
        fill={AURORA.textFaint}
        height={3}
        rx={1.5}
        width={width - 18}
        x={9}
        y={10.5}
      />
    </G>
  );
}

/**
 * กล่องต่อกันเป็นชั้น — จอผังองค์กร
 *
 * เส้นเชื่อมสำคัญกว่าตัวกล่อง เพราะสิ่งที่จอนี้บอกคือ "ใครขึ้นกับใคร"
 * ไม่ใช่ "มีกี่หน่วย" — กล่องลอยเรียงกันเฉย ๆ จะอ่านเป็นลายของจอกำลังคน
 */
export function OrgChartMotif() {
  return (
    <MotifCanvas>
      {/* เส้นเชื่อมอยู่หลังกล่องเสมอ ไม่งั้นเส้นจะพาดทับขอบกล่อง */}
      <Path
        d="M63,52 L63,60 M19,60 L107,60 M19,60 L19,68 M63,60 L63,68 M107,60 L107,68"
        fill="none"
        stroke={AURORA.textFaint}
        strokeLinecap="round"
        strokeWidth={2.6}
      />

      <OrgNode transform="translate(40 28)" width={46} />
      <OrgNode opacity={0.6} transform="translate(0 68)" />
      <OrgNode opacity={0.85} transform="translate(44 68)" />
      <OrgNode transform="translate(88 68)" />
    </MotifCanvas>
  );
}

/**
 * ใบรายงานกับแท่งกราฟข้างใน — จอรายงาน
 *
 * แท่งอยู่ "ในใบ" ไม่ใช่ข้าง ๆ เพราะสิ่งที่ผู้ใช้ได้จากจอนี้คือไฟล์ที่มีตัวเลข
 * อยู่ข้างใน ไม่ใช่กราฟบนจอ
 */
export function ReportMotif() {
  const bars: [number, number][] = [
    [12, 12],
    [23, 21],
    [34, 16],
    [45, 27],
  ];

  return (
    <MotifCanvas>
      <HeroSheet opacity={0.45} transform="translate(10 30) rotate(-12)" />

      <G transform="translate(56 24) rotate(8) scale(1.2)">
        <Path
          d={SHEET_OUTLINE}
          fill={AURORA.baseDeep}
          stroke={AURORA.textFaint}
          strokeWidth={2}
        />
        <Path
          d={SHEET_FOLD}
          fill="none"
          stroke={AURORA.textFaint}
          strokeWidth={2}
        />
        {bars.map(([x, height]) => (
          <Rect
            key={x}
            fill={AURORA.textFaint}
            height={height}
            rx={1.6}
            width={7}
            x={x}
            y={48 - height}
          />
        ))}
      </G>
    </MotifCanvas>
  );
}

/**
 * พระอาทิตย์กับพระจันทร์ — จอลาและโอที
 *
 * สองเรื่องในจอเดียวจึงต้องมีสองดวง: กลางวันคือวันลา (คนไม่อยู่ในเวลางาน)
 * กลางคืนคือโอที (คนอยู่ต่อหลังเวลางาน) — ใช้ดวงเดียวจะเหลือแค่ครึ่งเรื่อง
 */
export function LeaveOvertimeMotif() {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315];

  return (
    <MotifCanvas>
      <G opacity={0.7} transform="translate(34 56)">
        {rays.map((angle) => (
          <G key={angle} transform={`rotate(${angle})`}>
            <Path
              d="M0,-24 L0,-31"
              stroke={AURORA.textFaint}
              strokeLinecap="round"
              strokeWidth={3.2}
            />
          </G>
        ))}
        <Circle
          cx={0}
          cy={0}
          fill={AURORA.baseDeep}
          r={18}
          stroke={AURORA.textFaint}
          strokeWidth={3}
        />
      </G>

      {/* พระจันทร์เสี้ยว — ขอบนอกกับขอบในเป็นเส้นทางปิดเส้นเดียว เว้าไปทางขวา */}
      <Path
        d="M26,-28 C10,-22 -1,-7 -1,11 C-1,29 10,44 26,50 C4,50 -14,32 -14,11 C-14,-10 4,-28 26,-28 Z"
        fill={AURORA.baseDeep}
        stroke={AURORA.textFaint}
        strokeLinejoin="round"
        strokeWidth={3}
        transform="translate(98 45) rotate(-20)"
      />
    </MotifCanvas>
  );
}

/**
 * เหรียญกับนาฬิกา — จอค่าจ้างรายวัน
 *
 * จอนี้คือ "เวลาคูณเงิน" ตามตัวอักษร (เริ่มคิดค่าแรงเมื่อสแกนเข้างาน) ลายจึง
 * ต้องมีทั้งสองอย่าง ไม่ใช่เงินอย่างเดียวแบบจอค่าจ้างองค์กร
 */
export function DailyCostMotif() {
  return (
    <MotifCanvas>
      <G opacity={0.7} transform="translate(26 40)">
        {[30, 15, 0].map((y) => (
          <Ellipse
            key={y}
            cx={0}
            cy={y}
            fill={AURORA.baseDeep}
            rx={20}
            ry={8}
            stroke={AURORA.textFaint}
            strokeWidth={2.6}
          />
        ))}
      </G>

      <ClockFace radius={30} transform="translate(84 54)" />
    </MotifCanvas>
  );
}

/**
 * ใบซ้อนกับตราประทับถูก — จอคิวอนุมัติ
 *
 * ต่างจาก `RequestDetailMotif` ที่เป็นใบเดียวถูกประทับแล้ว — จอคิวคือ "กอง"
 * ที่ยังรอถูกประทับ ตราจึงลอยอยู่เหนือกอง ไม่ได้ปั๊มลงบนใบใดใบหนึ่ง
 */
export function ApprovalMotif() {
  return (
    <MotifCanvas>
      <HeroSheet opacity={0.4} transform="translate(2 40) rotate(-18)" />
      <HeroSheet opacity={0.65} transform="translate(28 30) rotate(-6)" />
      <HeroSheet transform="translate(56 22) rotate(7)" />

      <G transform="translate(114 52) rotate(-12)">
        <Circle
          cx={0}
          cy={0}
          fill={AURORA.baseDeep}
          r={21}
          stroke={AURORA.textFaint}
          strokeWidth={3.4}
        />
        <Path
          d="M-9.5,0 L-3,7 L10,-8"
          fill="none"
          stroke={AURORA.textFaint}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={4}
        />
      </G>
    </MotifCanvas>
  );
}

/**
 * บัตรพนักงานห้อยสาย — จอโปรไฟล์
 *
 * บัตรที่มีรูปกับเส้นชื่อ อ่านเป็น "ตัวตนในบริษัท" ซึ่งตรงกับจอนี้มากกว่า
 * รูปคนเปล่า ๆ (ที่เป็นลายของจอกำลังคน)
 */
export function ProfileMotif() {
  return (
    <MotifCanvas>
      <G transform="translate(36 10) rotate(-8)">
        {/* สายคล้อง — สองเส้นบรรจบที่คลิปบนหัวบัตร */}
        <Path
          d="M18,-6 L38,16 M58,-6 L38,16"
          fill="none"
          stroke={AURORA.textFaint}
          strokeLinecap="round"
          strokeWidth={3}
        />
        <Rect
          fill={AURORA.baseDeep}
          height={12}
          rx={3}
          stroke={AURORA.textFaint}
          strokeWidth={2.6}
          width={14}
          x={31}
          y={14}
        />

        <Rect
          fill={AURORA.baseDeep}
          height={70}
          rx={8}
          stroke={AURORA.textFaint}
          strokeWidth={3}
          width={76}
          x={0}
          y={26}
        />
        <Circle
          cx={26}
          cy={52}
          fill={AURORA.baseDeep}
          r={13}
          stroke={AURORA.textFaint}
          strokeWidth={3}
        />
        <Path
          d="M12,76 C12,66 18,61 26,61 C34,61 40,66 40,76"
          fill="none"
          stroke={AURORA.textFaint}
          strokeLinecap="round"
          strokeWidth={3}
        />
        <Rect
          fill={AURORA.textFaint}
          height={4}
          rx={2}
          width={22}
          x={48}
          y={46}
        />
        <Rect
          fill={AURORA.textFaint}
          height={4}
          rx={2}
          width={16}
          x={48}
          y={58}
        />
        <Rect
          fill={AURORA.textFaint}
          height={4}
          rx={2}
          width={20}
          x={48}
          y={70}
        />
      </G>
    </MotifCanvas>
  );
}

/**
 * ตารางช่องเมนู — แผงเพิ่มเติม
 *
 * ช่องมนเรียงเป็นตาราง คือภาพของ "ที่รวมทางเข้าอย่างอื่น" ซึ่งเป็นหน้าที่ของ
 * แผงนี้ทั้งหมด ไม่ได้พูดถึงเรื่องใดเรื่องหนึ่งโดยเฉพาะจึงไม่ควรมีของชิ้นใด
 * เด่นกว่าชิ้นอื่น
 */
export function MoreMotif() {
  const cells = [0, 1].flatMap((row) =>
    [0, 1, 2].map((column) => ({
      key: `${row}-${column}`,
      x: 12 + column * 42,
      y: 24 + row * 38,
    })),
  );

  return (
    <MotifCanvas>
      {cells.map((cell) => (
        <Rect
          key={cell.key}
          fill={AURORA.baseDeep}
          height={30}
          rx={9}
          stroke={AURORA.textFaint}
          strokeWidth={2.8}
          width={30}
          x={cell.x}
          y={cell.y}
        />
      ))}
    </MotifCanvas>
  );
}

/**
 * ปฏิทินกับเข็มนาฬิกา — จอประวัติการลงเวลา
 *
 * ปฏิทินบอกว่าเป็นเรื่อง "ย้อนหลังหลายวัน" ส่วนนาฬิกาบอกว่าสิ่งที่บันทึกไว้
 * คือเวลา — จอลงเวลาของวันนี้ใช้หน้าปัดอย่างเดียว ตรงนี้จึงต้องมีปฏิทินนำ
 */
export function AttendanceHistoryMotif() {
  const dots = [0, 1].flatMap((row) =>
    [0, 1, 2, 3].map((column) => ({
      cx: 15 + column * 18,
      cy: 44 + row * 16,
      key: `${row}-${column}`,
    })),
  );

  return (
    <MotifCanvas>
      <G transform="translate(6 12) rotate(-7)">
        <Rect
          fill={AURORA.baseDeep}
          height={80}
          rx={9}
          stroke={AURORA.textFaint}
          strokeWidth={3}
          width={84}
          x={0}
          y={12}
        />
        {/* ห่วงแขวนสองอัน — ตัวที่ทำให้กรอบสี่เหลี่ยมอ่านเป็นปฏิทิน */}
        <Path
          d="M23,4 L23,20 M61,4 L61,20"
          stroke={AURORA.textFaint}
          strokeLinecap="round"
          strokeWidth={3.4}
        />
        <Path d="M0,32 L84,32" stroke={AURORA.textFaint} strokeWidth={2.6} />
        {dots.map((dot) => (
          <Circle
            key={dot.key}
            cx={dot.cx}
            cy={dot.cy}
            fill={AURORA.textFaint}
            r={3.4}
          />
        ))}
      </G>

      <ClockFace radius={24} transform="translate(112 62)" />
    </MotifCanvas>
  );
}

/**
 * ใบทวิ 50 กับตราประทับเปอร์เซ็นต์ — จอหนังสือรับรองการหักภาษี
 *
 * เครื่องหมายเปอร์เซ็นต์ในวงตรา คือสิ่งที่แยกใบนี้ออกจากใบคำขอทั่วไป —
 * เอกสารภาษีคือใบที่ "มีอัตรากำกับ" ไม่ใช่ใบที่รออนุมัติ
 */
export function TaxMotif() {
  return (
    <MotifCanvas>
      <HeroSheet opacity={0.45} transform="translate(8 28) rotate(-12)" />
      <HeroSheet
        lines={false}
        transform="translate(48 22) rotate(8) scale(1.2)"
      />

      <G transform="translate(112 56) rotate(-10)">
        <Circle
          cx={0}
          cy={0}
          fill={AURORA.baseDeep}
          r={22}
          stroke={AURORA.textFaint}
          strokeWidth={3.4}
        />
        {/* เครื่องหมาย % — วงบน เส้นทแยง วงล่าง */}
        <Circle
          cx={-7}
          cy={-7}
          fill="none"
          r={4.6}
          stroke={AURORA.textFaint}
          strokeWidth={3}
        />
        <Path
          d="M-11,11 L11,-11"
          stroke={AURORA.textFaint}
          strokeLinecap="round"
          strokeWidth={3}
        />
        <Circle
          cx={7}
          cy={7}
          fill="none"
          r={4.6}
          stroke={AURORA.textFaint}
          strokeWidth={3}
        />
      </G>
    </MotifCanvas>
  );
}
