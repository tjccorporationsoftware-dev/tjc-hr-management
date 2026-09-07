import { Image } from 'expo-image';
import { Fragment } from 'react';
import { Pressable, View, type TextStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Icon, Text, hitSlop, type IconName } from '@/design';
import { AURORA, PressableScale, PulseDot } from '@/design/aurora';
import { DAY_STATE_LABEL } from '@/features/attendance/calendar';
import type {
  AttendanceDay,
  AttendanceDayState,
} from '@/features/attendance/history.types';
import { publicFileUrl } from '@/lib/api/public-url';
import { thaiTime } from '@/lib/date/thai-date';

/**
 * เนื้อหาของหน้าแรก — ตัวตนและเวลาวันนี้
 * สีทุกตัวหยิบจากชุดปกติของแอป (`text` / `textMuted` / `accent`) บนพื้นสว่าง
 */

const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

/** ไอคอนประจำแต่ละรอบ — เรียงตรงกับลำดับ stamps เสมอ (เข้างาน · เข้าบ่าย · ออกงาน) */
const SESSION_ICON: IconName[] = ['clock', 'coffee', 'log-out'];

/**
 * เวลาแบบสั้นสำหรับช่องแคบ — 98 นาที → "1:38", 45 นาที → "45 นาที"
 *
 * "น." ย่อได้ทั้งนาทีและนาฬิกา — ยืนเดี่ยวหลังตัวเลขคนอ่านเป็นเวลาบอกโมง
 * ("สาย 27 น." อ่านเป็น 27 นาฬิกา) จึงเขียน "นาที" เต็มเมื่อไม่ถึงชั่วโมง
 */
function compactMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);

  return hours > 0
    ? `${hours}:${String(rest).padStart(2, '0')}`
    : `${rest} นาที`;
}

export interface HeroStamp {
  at: Date | null;
  label: string;
}

/**
 * สีประจำสถานะรายวัน
 *
 * "มาปกติ" กับ "ลา" อยู่ในโทนฟ้าทั้งคู่เพราะไม่ใช่ปัญหา เหลือส้มกับแดงไว้ให้
 * เฉพาะวันที่มีเรื่องต้องตามแก้ ตามกติกาสีของทั้งแอป
 */
const HERO_STATE_COLOR: Record<AttendanceDayState, string> = {
  ABSENT: AURORA.rose,
  /* วันหยุดเป็นเทาจาง — ไม่ใช่เรื่องดีหรือร้าย แค่ไม่ใช่วันทำงาน */
  HOLIDAY: AURORA.textFaint,
  LATE: AURORA.amber,
  LEAVE: AURORA.sky,
  MISSING_LOG: AURORA.rose,
  PRESENT: AURORA.accent,
};

function HeroAvatar({ name, url }: { name: string; url: string | null }) {
  const resolved = publicFileUrl(url);

  /* ตัวย่อสองตัวแรกของชื่อ — ใช้เมื่อยังไม่มีรูป ไม่ใช่ปล่อยวงว่าง */
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('');

  return (
    <View
      style={{
        alignItems: 'center',
        /*
         * ขาวทึบ + ขอบขาวหนา — ทำให้รูปดูเหมือน "ลอย" อยู่เหนือก้อนแสงฟ้า
         * ข้างหลัง (ดู HomeIdentity) ไม่ว่าก้อนแสงจะบังพอดีหรือไม่พอดีตำแหน่งก็ตาม
         */
        backgroundColor: '#ffffff',
        borderColor: '#ffffff',
        borderRadius: 999,
        borderWidth: 3,
        elevation: 2,
        height: 82,
        justifyContent: 'center',
        overflow: 'hidden',
        shadowColor: AURORA.accent,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.18,
        shadowRadius: 6,
        width: 82,
      }}
    >
      {resolved ? (
        <Image
          contentFit="cover"
          source={{ uri: resolved }}
          style={{ height: '100%', width: '100%' }}
          transition={160}
        />
      ) : (
        <Text
          maxScale={1.1}
          style={{ color: AURORA.accent, fontSize: 27, fontWeight: '700' }}
        >
          {initials || '—'}
        </Text>
      )}
    </View>
  );
}

/** เงาตึกมุมขวาล่าง — [กว้าง, สูง] เรียงจากซ้ายไปขวา สูงต่ำสลับกันให้ดูเป็นเมือง */
const SKYLINE: [number, number][] = [
  [16, 26],
  [12, 38],
  [20, 20],
  [14, 46],
  [11, 30],
  [18, 54],
  [13, 24],
  [16, 36],
];

/**
 * พื้นหลังการ์ดตัวตน — **น้ำเงินซ้าย ขาวขวา ตัดกันด้วยขอบโค้งเว้า ไม่ใช่ไล่สี**
 *
 * รูปทรงคือ **ขอบบนยื่นออกขวา แล้วโค้งถอยกลับเข้าซ้ายเมื่อลงมาข้างล่าง**
 * (บน 30% → ล่าง 12%) ทำด้วย `<Path>` เบซิเยร์สองชั้น: ฟ้าสดกว้างกว่าอยู่หลัง
 * น้ำเงินเข้มแคบกว่าอยู่หน้า บนพื้นขาว
 *
 * **จุดที่ยื่นออกมากสุดต้องไม่เกิน 30% ของการ์ด** — คอลัมน์ชื่อเริ่มราว 33%
 * (ระยะขอบ 18 + รูป 82 + ช่องไฟ 14) เลยเส้นนี้เมื่อไรจะไปทับชื่อ/ตำแหน่งทันที
 *
 * ใช้ `viewBox="0 0 100 100"` + `preserveAspectRatio="none"` เพื่อให้พิกัด
 * เป็นเปอร์เซ็นต์ของการ์ดจริง ไม่ต้องวัดความกว้างเองด้วย onLayout
 *
 * เงาตึกเป็นสี่เหลี่ยมเรียงกันธรรมดา ไม่ใช่ไฟล์ภาพ — ปรับสี/ความสูงได้จาก
 * โค้ดตรง ๆ และไม่ต้องแบก asset เพิ่มในแอป
 */
function CardGradientBackground() {
  return (
    <View style={{ bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 }}>
      <Svg
        height="100%"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
        width="100%"
      >
        <Rect fill="#ffffff" height={100} width={100} x={0} y={0} />
        {/*
          ฟ้าเข้มสด ไม่ใช่ฟ้าพาสเทล — ของเดิม (#a8cdf2 / #6ea8e5) จางจนกลืนไป
          กับพื้นจอที่ก็ฟ้าอ่อนอยู่แล้ว (`AURORA.base`) การ์ดพระเอกเลยไม่เด่น
          ตอนนี้ใช้สีคู่เดียวกับปุ่มและไอคอนทั้งแอป: `accentEnd` เป็นชั้นหลัง
          `accent` เป็นชั้นหน้า จึงเข้มขึ้นโดยไม่หลุดจานสี
        */}
        <Path
          d="M0,0 L30,0 C30,32 23,64 12,100 L0,100 Z"
          fill={AURORA.accentEnd}
        />
        <Path
          d="M0,0 L23,0 C23,32 16,64 6,100 L0,100 Z"
          fill={AURORA.accent}
        />
      </Svg>

      <View
        style={{
          alignItems: 'flex-end',
          bottom: 0,
          flexDirection: 'row',
          gap: 3,
          position: 'absolute',
          right: 0,
        }}
      >
        {SKYLINE.map(([width, height], index) => (
          <View
            key={index}
            style={{
              /* เงาตึกอยู่บนพื้นขาว จึงคุมความจางด้วย opacity ไม่ใช่สีจาง ๆ */
              backgroundColor: AURORA.accentEnd,
              borderTopLeftRadius: 2,
              borderTopRightRadius: 2,
              height,
              opacity: 0.42,
              width,
            }}
          />
        ))}
      </View>
    </View>
  );
}

export interface HomeIdentityProps {
  avatarUrl: string | null;
  /** ชื่อสาขา — อยู่บรรทัดของตัวเอง ไม่ต่อท้ายตำแหน่ง */
  branch: string;
  /** รหัสพนักงาน — ชิปเล็กข้างชื่อ ไม่ใช่บรรทัดยาวที่โดนตัดกลางคำ */
  code: string;
  name: string;
  onNotifications: () => void;
  onProfile: () => void;
  /** แผนก · ประเภทพนักงาน */
  role: string;
  unread: number;
}

/**
 * ส่วนตัวตนด้านบนของการ์ดพระเอก — **การ์ดไล่สีฟ้าเต็มใบ**
 *
 * เคยลองแบ่งครึ่งเป็นสี่เหลี่ยมทึบฟ้า/ขาว ซึ่งดูเป็นกล่องสองกล่องต่อกันมากกว่า
 * เป็นลวดลายเดียว แล้วลองก้อนแสงกลมกระจุกมุมเดียว ตอนนี้เป็นไล่สีฟ้าคลุมทั้ง
 * ใบการ์ด (`CardGradientBackground`) แทน — ให้ความรู้สึก "มีสี" ทั่วทั้งการ์ด
 * โดยไม่ต้องตีกรอบแบ่งพื้นที่ และรูปโปรไฟล์วงขาวขอบหนาก็ยังลอยเด่นอยู่บนพื้นสี
 *
 * กระดิ่งแจ้งเตือนเป็นป้ายมุมขวาบนของการ์ดนี้ (absolute) — คอลัมน์ชื่อจึงมี
 * `paddingRight` เผื่อไว้ไม่ให้ชื่อ/รหัสพนักงานไปชนกับวงกระดิ่ง
 */
export function HomeIdentity({
  avatarUrl,
  branch,
  code,
  name,
  onNotifications,
  onProfile,
  role,
  unread,
}: HomeIdentityProps) {
  return (
    <View
      style={{
        alignItems: 'center',
        borderColor: AURORA.glassBorder,
        borderRadius: 20,
        borderWidth: 1,
        flexDirection: 'row',
        gap: 14,
        overflow: 'hidden',
        padding: 18,
      }}
    >
      <CardGradientBackground />

      <View>
        <PressableScale
          accessibilityLabel="โปรไฟล์ของฉัน"
          accessibilityRole="button"
          onPress={onProfile}
        >
          <HeroAvatar name={name} url={avatarUrl} />
        </PressableScale>

        {/* รหัสพนักงานเป็นป้ายเล็กคาดขอบล่างของวงรูป แทนที่จะแย่งที่บรรทัดชื่อ/ตำแหน่ง */}
        {code ? (
          <View
            style={{
              alignItems: 'center',
              bottom: -4,
              left: 0,
              position: 'absolute',
              right: 0,
            }}
          >
            <View
              /*
               * พื้นเทา ไม่ใช่น้ำเงิน — ชิปนี้คาบอยู่บนแถบน้ำเงินของการ์ดพอดี
               * น้ำเงินบนน้ำเงินเหลือแค่เส้นขอบขาวบาง ๆ ที่แยกให้ เทาจึงตัดกับ
               * ทั้งสองฝั่งที่มันคาบอยู่ (น้ำเงินซ้าย ขาวขวา) ได้พร้อมกัน
               *
               * พื้นอ่อนแล้วตัวหนังสือต้องเป็นสีเข้ม ขาวบนเทาอ่อนอ่านไม่ออกที่ 9px
               */
              style={{
                backgroundColor: '#e4e7ec',
                borderColor: '#ffffff',
                borderRadius: 999,
                borderWidth: 1.5,
                paddingHorizontal: 8,
                paddingVertical: 1.5,
              }}
            >
              <Text
                maxScale={1.05}
                style={[
                  TABULAR,
                  {
                    color: AURORA.text,
                    fontSize: 9,
                    fontWeight: '700',
                    lineHeight: 12,
                  },
                ]}
              >
                {code}
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      <View style={{ flex: 1, gap: 2, paddingRight: 46 }}>
        {/*
          ชื่อได้ทั้งบรรทัดคนเดียว ไม่ต้องแบ่งที่กับรหัสพนักงานอีกแล้ว —
          ไม่มี numberOfLines ด้วย ชื่อยาวเกินให้ตัดขึ้นบรรทัดที่สองแทนที่จะ
          โดนตัดจุดสามจุด (เคยเป็น "สุภาพร สอ..." ตอนที่ฟอนต์ใหญ่ขึ้น)
        */}
        <Text
          maxScale={1.1}
          style={{
            color: AURORA.text,
            fontSize: 21,
            fontWeight: '700',
          }}
        >
          {name || 'ยินดีต้อนรับ'}
        </Text>

        {role ? (
          <Text
            numberOfLines={1}
            style={{ color: AURORA.textMuted, fontSize: 14.5 }}
          >
            {role}
          </Text>
        ) : null}

        {/* ไม่มี numberOfLines — ชื่อสาขาเป็นชื่อบริษัทเต็ม ยาวเกินให้ตัดขึ้นบรรทัดใหม่ ไม่ใช่ตัดจุดสามจุด */}
        {branch ? (
          <Text
            style={{
              color: AURORA.textFaint,
              fontSize: 13.5,
              lineHeight: 18,
            }}
          >
            {branch}
          </Text>
        ) : null}
      </View>

      {/*
        กระดิ่งเป็นลูกตัวสุดท้ายของการ์ด ไม่ใช่ตัวแรก — ลูกที่มาทีหลังอยู่ชั้นบน
        เสมอใน RN ตอนอยู่ตัวแรกคอลัมน์ชื่อ (flex เต็มแถว) จะทับพื้นที่ของมัน
        แล้วกินสัมผัสไปทั้งหมด กดกระดิ่งไม่ติดแม้จะเห็นปุ่มอยู่
      */}
      <Pressable
        accessibilityLabel={
          unread > 0 ? `การแจ้งเตือน ${unread} รายการ` : 'การแจ้งเตือน'
        }
        accessibilityRole="button"
        hitSlop={hitSlop}
        onPress={onNotifications}
        /*
         * ขาวทึบ ไม่ใช่ accentSoft — พื้นการ์ดเป็นฟ้าแล้ว ฟ้าจาง 8% บนฟ้าคือ
         * มองไม่เห็น (กติกาเดียวกับที่เขียนไว้ที่ AURORA.accentSoft)
         */
        style={({ pressed }) => ({
          alignItems: 'center',
          backgroundColor: '#ffffff',
          borderRadius: 999,
          elevation: 2,
          height: 44,
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
          position: 'absolute',
          right: 10,
          shadowColor: AURORA.accent,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.16,
          shadowRadius: 5,
          top: 10,
          width: 44,
          zIndex: 2,
        })}
      >
        <Icon color={AURORA.accent} name="bell" size={19} />
        {unread > 0 ? (
          <View
            style={{
              backgroundColor: AURORA.rose,
              borderRadius: 999,
              height: 9,
              position: 'absolute',
              right: 11,
              top: 10,
              width: 9,
            }}
          />
        ) : null}
      </Pressable>
    </View>
  );
}

export interface TodayStatusProps {
  dateLabel: string | null;
  day: AttendanceDay | null;
  /**
   * เวลาตามกะของแต่ละรอบ ("HH:mm") เรียงตรงกับ `stamps`
   * null = กะไม่ได้กำหนดรอบนั้น หรือยังไม่รู้ตารางของวันนี้
   */
  expected: (string | null)[];
  /** เวลาปัจจุบันจากเซิร์ฟเวอร์ — ใช้ตัดสินว่ารอบไหนเลยเวลาตามกะแล้ว */
  now: Date;
  /**
   * หมายเหตุเหนือเส้นเวลา — ใช้กับวันที่ยัง "ลงเวลาได้แต่ผิดปกติ" เช่นวันหยุด
   * ที่ถูกเรียกมาทำงาน ต่างจาก `restLabel` ตรงที่ไม่ได้แทนเส้นเวลาทั้งเส้น
   */
  noteLabel?: string | null;
  restLabel: string | null;
  stamps: HeroStamp[];
}

/**
 * เวลาลงงานของวันนี้ — ส่วนล่างของการ์ดพระเอกสีน้ำเงิน
 */
export function TodayStatus({
  dateLabel,
  day,
  expected,
  noteLabel = null,
  now,
  restLabel,
  stamps,
}: TodayStatusProps) {
  const stateColor = day ? HERO_STATE_COLOR[day.state] : null;

  /*
   * เส้นเวลาเดินตาม **เวลาของกะ** ไม่ใช่ตามการกดปุ่ม
   *
   * เดิมจุดจะขยับก็ต่อเมื่อมีการลงเวลาจริง คนที่ลืมกดตอนบ่ายจึงเห็นเส้นค้างอยู่ที่
   * รอบเช้าทั้งวัน ทั้งที่เลยเวลาเลิกงานไปแล้ว — จอโกหกว่า "ยังไม่ถึงเวลา"
   *
   * ตอนนี้รอบไหนที่เลยเวลาตามกะแล้วถือว่า "ผ่านไปแล้ว" ไม่ว่าจะกดหรือไม่
   * ถ้าผ่านแล้วแต่ไม่มีเวลาลง = ลืมกด ต้องขึ้นว่า "ไม่ได้ลงเวลา"
   */
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const passed = expected.map((at) => {
    if (!at) return false;

    const [hour, minute] = at.split(':').map(Number);

    if (hour === undefined || minute === undefined) return false;

    return nowMinutes >= hour * 60 + minute;
  });

  /* จุดเต้นอยู่ที่รอบล่าสุดที่ถึงเวลาแล้ว (หรือที่ลงเวลาไปแล้ว) */
  const currentIndex = stamps.reduce(
    (latest, stamp, index) => (stamp.at || passed[index] ? index : latest),
    -1,
  );

  /*
   * รายละเอียดของแต่ละรอบ — "สาย" ต้องเกาะรอบที่ลงเวลาเข้าจริง ไม่ใช่แปะ
   * ช่องแรกไว้ตายตัว (คนที่มาทำงานเฉพาะรอบบ่ายจะได้ไม่มีป้ายสายห้อยอยู่ใต้
   * ช่องที่เป็นขีดกลาง)
   */
  const lateIndex = stamps.findIndex((stamp, index) => index < 2 && stamp.at);

  const details: ({ alert: boolean; text: string } | null)[] = [
    null,
    null,
    day && day.earlyCheckoutMinutes > 0
      ? {
          alert: true,
          text: `ออกก่อน ${compactMinutes(day.earlyCheckoutMinutes)}`,
        }
      : day && day.otMinutes > 0
        ? { alert: false, text: `OT ${compactMinutes(day.otMinutes)}` }
        : null,
  ];

  if (day && day.lateMinutes > 0 && lateIndex >= 0) {
    details[lateIndex] = {
      alert: true,
      text: `สาย ${compactMinutes(day.lateMinutes)}`,
    };
  }

  return (
    <View style={{ gap: 12 }}>
          {/* ------------------------------------------- เวลาวันนี้ */}
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text
                maxScale={1.2}
                style={{
                  color: AURORA.textFaint,
                  fontSize: 10.5,
                  fontWeight: '700',
                  letterSpacing: 1.3,
                }}
              >
                การลงเวลาวันนี้
              </Text>
              <Text
                maxScale={1.2}
                numberOfLines={1}
                style={{ color: AURORA.text, fontSize: 13.5 }}
              >
                {dateLabel ?? ''}
              </Text>
            </View>

            {day && stateColor ? (
              <View
                style={{
                  alignItems: 'center',
                  backgroundColor: `${stateColor}26`,
                  borderRadius: 999,
                  flexDirection: 'row',
                  gap: 6,
                  paddingHorizontal: 11,
                  paddingVertical: 5,
                }}
              >
                <View
                  style={{
                    backgroundColor: stateColor,
                    borderRadius: 999,
                    height: 5,
                    width: 5,
                  }}
                />
                <Text
                  maxScale={1.1}
                  numberOfLines={1}
                  style={{
                    color: stateColor,
                    fontSize: 10.5,
                    fontWeight: '700',
                  }}
                >
                  {DAY_STATE_LABEL[day.state]}
                </Text>
              </View>
            ) : null}
          </View>

          {restLabel ? (
            <View
              style={{ alignItems: 'center', flexDirection: 'row', gap: 10 }}
            >
              <Icon color={AURORA.textMuted} name="coffee" size={22} />
              <Text style={{ color: AURORA.textMuted, flex: 1 }}>
                {restLabel}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 9 }}>
              {/* วันหยุดที่มาทำงาน — บอกไว้เหนือเส้นเวลา ไม่ใช่แทนเส้นเวลา */}
              {noteLabel ? (
                <View
                  style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}
                >
                  <Icon color={AURORA.amber} name="coffee" size={16} />
                  <Text
                    style={{
                      color: AURORA.amber,
                      flex: 1,
                      fontSize: 11.5,
                      lineHeight: 16,
                    }}
                  >
                    {noteLabel}
                  </Text>
                </View>
              ) : null}

              {/* เส้นเวลาสามจุด — เห็นด้วยตาเดียวว่าวันนี้เดินมาถึงไหน */}
              <View style={{ alignItems: 'center', flexDirection: 'row' }}>
                {stamps.map((stamp, index) => {
                  const done = Boolean(stamp.at);
                  const missed = !done && Boolean(passed[index]);
                  const reached = done || missed;

                  return (
                    <Fragment key={stamp.label}>
                      {index > 0 ? (
                        <View
                          style={{
                            /*
                             * รางเป็นสีเดียวตลอดเส้น **ไม่เปลี่ยนตามความคืบหน้า**
                             * สิ่งที่บอกว่าเดินมาถึงไหนคือสีของเม็ด ถ้ารางเปลี่ยนสี
                             * ด้วยก็กลายเป็นสัญญาณซ้ำสองชั้นที่แย่งกันเอง
                             *
                             * หนา 6 เท่ากันทั้งเส้น — เส้นบางทำให้เม็ดดูลอย
                             * ไม่มีอะไรรองรับ
                             */
                            backgroundColor: AURORA.glassBorder,
                            borderRadius: 999,
                            flex: 1,
                            height: 5,
                            /* เหลื่อมเข้าใต้เม็ดเล็กน้อย ไม่ให้เห็นรอยต่อ */
                            marginHorizontal: -3,
                          }}
                        />
                      ) : null}

                      {/*
                        รอบล่าสุดที่ลงไปแล้วเป็นจุดเต้น ไม่ใช่จุดนิ่ง — บอกว่า
                        "ตอนนี้อยู่ตรงนี้" ซึ่งเป็นข้อมูลจริง ไม่ใช่อนิเมชันประดับ
                        รอบที่ผ่านไปแล้วและรอบที่ยังไม่ถึงยังนิ่งเหมือนเดิม
                      */}
                      {/*
                        เม็ดบนราง — ขอบขาวหนา 3 คือสิ่งที่ทำให้เม็ดดูนูนขึ้นมา
                        จากราง ไม่ใช่จุดที่ถูกวางทับ (รางลอดอยู่ข้างหลังขอบขาว)
                      */}
                      {reached && index === currentIndex ? (
                        <View
                          style={{
                            alignItems: 'center',
                            backgroundColor: AURORA.glassStrong,
                            borderRadius: 999,
                            height: 19,
                            justifyContent: 'center',
                            width: 19,
                          }}
                        >
                          <PulseDot
                            color={missed ? AURORA.amber : AURORA.accent}
                            size={12}
                          />
                        </View>
                      ) : (
                        <View
                          style={{
                            backgroundColor: done
                              ? AURORA.accent
                              : missed
                                ? AURORA.amber
                                : AURORA.glassBorder,
                            borderColor: AURORA.glassStrong,
                            borderRadius: 999,
                            borderWidth: 2.5,
                            height: 17,
                            width: 17,
                          }}
                        />
                      )}
                    </Fragment>
                  );
                })}
              </View>

              {/* ป้ายชื่อรอบ + เวลาตามกะ เกาะอยู่ใต้เส้นเวลาโดยตรง */}
              <View style={{ flexDirection: 'row' }}>
                {stamps.map((stamp, index) => {
                  const alignItems =
                    index === 0
                      ? 'flex-start'
                      : index === stamps.length - 1
                        ? 'flex-end'
                        : 'center';

                  return (
                    <View
                      key={stamp.label}
                      style={{ alignItems, flex: 1, gap: 1 }}
                    >
                      <Text
                        maxScale={1.1}
                        numberOfLines={1}
                        style={{
                          color: AURORA.textMuted,
                          fontSize: 10.5,
                          fontWeight: '700',
                        }}
                      >
                        {stamp.label}
                      </Text>
                      {expected[index] ? (
                        <Text
                          maxScale={1.1}
                          numberOfLines={1}
                          style={[TABULAR, { color: AURORA.textFaint, fontSize: 9.5 }]}
                        >
                          {expected[index]}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>

              {/*
               * ผลจริงของแต่ละรอบ — เส้นบนคั่นจากตารางเวลาด้านบน + เส้นตั้ง
               * แบ่งสามคอลัมน์ ทั้งสองเส้นอยู่ด้วยกัน ไม่ใช่เลือกอย่างใดอย่างหนึ่ง
               */}
              <View
                style={{
                  borderTopColor: AURORA.glassBorder,
                  borderTopWidth: 1,
                  flexDirection: 'row',
                  paddingTop: 8,
                }}
              >
                {stamps.map((stamp, index) => {
                  const done = Boolean(stamp.at);
                  const missed = !done && Boolean(passed[index]);
                  const detail = details[index];

                  /*
                   * รอบที่ลงเวลาไปแล้วและไม่มีอะไรผิดปกติ ต้องบอกว่า "ลงเวลาแล้ว"
                   *
                   * เดิมตกไปเข้าเงื่อนไขสุดท้ายจนขึ้น "ยังไม่มีข้อมูล" ทั้งที่มีเวลา
                   * แสดงอยู่เหนือบรรทัดนั้นเอง เพราะ `details` จะไม่ null เฉพาะตอนมี
                   * สาย/ออกก่อน/OT เท่านั้น — วันที่มาตรงเวลาคือวันที่ดูเหมือนระบบพัง
                   *
                   * ไม่ใช้คำว่า "ตรงเวลา" เพราะ `lateMinutes` ที่ backend ส่งมาเป็น
                   * ยอดรวมทั้งวัน ถูกแปะไว้ที่รอบเข้าแรกที่ลงเวลารอบเดียว (`lateIndex`)
                   * ถ้ามาเช้าตรงแต่เข้าบ่ายสาย ช่องบ่ายจะไม่มี detail — เขียนว่า
                   * "ตรงเวลา" ตรงนั้นคือโกหก ส่วน "ลงเวลาแล้ว" จริงเสมอ
                   */
                  const status = detail
                    ? detail.text
                    : done
                      ? 'ลงเวลาแล้ว'
                      : missed
                        ? 'ไม่ได้ลงเวลา'
                        : expected[index]
                          ? 'ยังไม่ถึงเวลา'
                          : 'ยังไม่มีข้อมูล';

                  return (
                    <View
                      key={stamp.label}
                      style={{
                        borderLeftColor: AURORA.glassBorder,
                        borderLeftWidth: index > 0 ? 1 : 0,
                        flex: 1,
                        gap: 4,
                        paddingHorizontal: 8,
                      }}
                    >
                      <View
                        style={{ alignItems: 'center', flexDirection: 'row', gap: 4 }}
                      >
                        <Icon
                          color={AURORA.textFaint}
                          name={SESSION_ICON[index] ?? 'clock'}
                          size={11}
                        />
                        <Text
                          maxScale={1.1}
                          numberOfLines={1}
                          style={{
                            color: AURORA.textFaint,
                            flex: 1,
                            fontSize: 9,
                            lineHeight: 12,
                          }}
                        >
                          เวลา{stamp.label}
                        </Text>
                      </View>

                      {stamp.at ? (
                        <Text
                          maxScale={1.1}
                          numberOfLines={1}
                          style={[
                            TABULAR,
                            {
                              color: AURORA.text,
                              fontSize: 15,
                              fontWeight: '800',
                              lineHeight: 18,
                            },
                          ]}
                        >
                          {thaiTime(stamp.at)}
                        </Text>
                      ) : (
                        <Text
                          maxScale={1.1}
                          style={[
                            TABULAR,
                            {
                              color: AURORA.textFaint,
                              fontSize: 15,
                              fontWeight: '500',
                              lineHeight: 18,
                            },
                          ]}
                        >
                          —
                        </Text>
                      )}

                      {/*
                        "สาย 42 นาที" เกาะอยู่กับการ์ดรอบที่มันพูดถึง ไม่มี
                        รายละเอียดก็ยังต้องบอกสถานะเสมอ (ลงเวลาแล้ว /
                        ไม่ได้ลงเวลา / ยังไม่ถึงเวลา) ไม่ปล่อยการ์ดว่างให้เดาเอง
                      */}
                      <View
                        style={{ alignItems: 'center', flexDirection: 'row', gap: 3 }}
                      >
                        <Icon
                          color={
                            detail?.alert
                              ? AURORA.amber
                              : done
                                ? AURORA.emerald
                                : AURORA.textFaint
                          }
                          name={
                            detail?.alert
                              ? 'alert-circle'
                              : done && !detail
                                ? 'check-circle'
                                : 'info'
                          }
                          size={9.5}
                        />
                        <Text
                          maxScale={1.1}
                          numberOfLines={1}
                          style={{
                            color: detail
                              ? detail.alert
                                ? AURORA.amber
                                : AURORA.accent
                              : done
                                ? AURORA.emerald
                                : AURORA.textFaint,
                            flex: 1,
                            fontSize: 9.5,
                            fontWeight: detail || done ? '700' : '500',
                            lineHeight: 12,
                          }}
                        >
                          {status}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
    </View>
  );
}
