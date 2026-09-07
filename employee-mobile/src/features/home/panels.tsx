import { useState } from 'react';
/*
 * รูปโปรไฟล์ใช้ expo-image ไม่ใช่ Image ของ RN
 *
 * เดิมเป็น RN Image ด้วยเหตุผลว่า "รูปเดียวเล็ก ๆ ไม่คุ้มกับอีกหนึ่ง dependency"
 * ซึ่งจริงตอนรูปอยู่แค่หัวจอ แต่คอมโพเนนต์เดียวกันนี้ถูกใช้ในรายการแจ้งเตือน
 * ที่เลื่อนได้ด้วยแล้ว — RN Image ไม่มีแคชดิสก์ ทุกครั้งที่แถวหลุดจอแล้ววนกลับมา
 * คือโหลดรูปคนเดิมใหม่ทั้งรอบ
 */
import { Image } from 'expo-image';
import {
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Icon, Text, type IconName } from '@/design';
import { Sparkline } from '@/design/chart';
import {
  daysBetween,
  formatMinutes,
  formatShortDate,
} from '@/features/attendance/calendar';
import type {
  AttendanceHistory,
  AttendancePeriod,
} from '@/features/attendance/history.types';
import { money } from '@/features/payroll/payslip.types';
import { publicFileUrl } from '@/lib/api/public-url';
import {
  REQUEST_STATUS_LABEL,
  type RequestType,
} from '@/features/requests/requests.types';

import {
  AURORA,
  CountUp,
  Glass,
  PressableScale,
  SectionAction,
  glowText,
} from '@/design/aurora';

/** ตัวเลขทุกตัวกว้างเท่ากัน ไม่งั้นเวลาที่เดินอยู่จะทำให้ทั้งแถวขยับ */
const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

const REQUEST_TYPE_ICON: Record<RequestType, IconName> = {
  LEAVE: 'sun',
  OFFSITE: 'navigation',
  OVERTIME: 'moon',
  TIME_ADJUST: 'edit-3',
};

/* -------------------------------------------------------------- ทางลัด */

export interface QuickAction {
  icon: IconName;
  label: string;
  onPress: () => void;
}

/**
 * ทางลัดยื่นคำขอ — **ไอคอนสี่เหลี่ยมมนสี่ตัว ลอยบนพื้นจอ มีชื่อกำกับใต้ไอคอน**
 *
 * ไม่มีกรอบการ์ดขาวครอบ: ตัวไอคอนมีพื้นสีเข้มของตัวเองอยู่แล้ว การ์ดขาว
 * ที่เคยครอบอีกชั้นจึงเป็นเส้นซ้อนเส้นเปล่า ๆ บนพื้นจอที่ก็ขาวอยู่แล้ว
 *
 * ## กติกาความกว้าง — ห้ามใช้ flexBasis เป็นเปอร์เซ็นต์
 *
 * เคยเขียน `flexBasis: '47%'` + `flexWrap` หวังให้ได้สองคูณสอง แต่ Yoga ยอมให้
 * ปุ่มหดตัวเอง สามใบจึงเบียดกันจบในแถวแรกแล้วใบที่สี่ตกไปอยู่แถวล่างใบเดียว
 * ตอนนี้ใช้ `flex: 1` เท่ากันทุกใบในแถวที่ **ไม่มี flexWrap**
 *
 * (`PressableScale` ยกเฉพาะ flex/width ออกไปไว้ใบนอกให้แล้ว ดู `motion.tsx`)
 */
export function QuickRow({ items }: { items: QuickAction[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {items.map((item) => (
        <PressableScale
          accessibilityRole="button"
          key={item.label}
          onPress={item.onPress}
          style={{
            alignItems: 'center',
            flex: 1,
            gap: 6,
            paddingHorizontal: 4,
            paddingVertical: 8,
          }}
        >
          <View
            style={{
              alignItems: 'center',
              backgroundColor: AURORA.accent,
              /* สี่เหลี่ยมมน ไม่ใช่วงกลม — ตามแบบการ์ดทางลัดของแอปอื่นในกลุ่มนี้ */
              borderRadius: 17,
              elevation: 2,
              height: 54,
              justifyContent: 'center',
              shadowColor: AURORA.accent,
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.22,
              shadowRadius: 6,
              width: 54,
            }}
          >
            <Icon color="#ffffff" name={item.icon} size={24} />
          </View>

          <Text
            /* การ์ดแคบ ห้ามให้ระบบขยายฟอนต์จนชื่อถูกตัดกลางคำ */
            maxScale={1.05}
            numberOfLines={1}
            style={{
              color: AURORA.text,
              fontSize: 12.5,
              fontWeight: '700',
              lineHeight: 16,
            }}
          >
            {item.label}
          </Text>
        </PressableScale>
      ))}
    </View>
  );
}

/* ---------------------------------------------------------- คำขอของฉัน */

/**
 * สีของสถานะคำขอ — ใช้ชุดเดียวกับแท็บ "คำขอ" (`(tabs)/requests.tsx`) ทุกตัว
 * เพราะเป็นสถานะเดียวกัน แค่มาโผล่คนละจอ ถ้าให้สีไม่ตรงกันผู้ใช้จะงงว่า
 * ทำไมใบเดียวกันเปลี่ยนสีตอนสลับจอ
 *
 * "รออนุมัติ" ไม่ใช่คำเตือน เป็นแค่ของที่กำลังเดินอยู่ จึงเป็นฟ้าสด (`sky`)
 * "อนุมัติแล้ว" ได้เขียว (`emerald`) — เขียวเดียวกับที่จอเก่าทั้งแอปใช้กับ
 * "อนุมัติ/สำเร็จ" มาตลอด เหลือแดงไว้ให้เฉพาะใบที่ถูกตีกลับ ซึ่งเป็นใบเดียว
 * ที่ผู้ยื่นต้องลงมือทำอะไรต่อ
 */
const REQUEST_STATUS_COLOR: Record<string, string> = {
  APPROVED: AURORA.emerald,
  CANCELLED: AURORA.textFaint,
  DRAFT: AURORA.textFaint,
  HR_APPROVED: AURORA.emerald,
  HR_REJECTED: AURORA.rose,
  MANAGER_APPROVED: AURORA.sky,
  MANAGER_REJECTED: AURORA.rose,
  REJECTED: AURORA.rose,
  SUBMITTED: AURORA.sky,
};

export interface RequestRow {
  /** ปริมาณของใบนั้น เช่น "1 วัน" / "3.5 ชม." */
  amount: string | null;
  /** คนที่ทำให้สถานะนี้เกิดขึ้น — อนุมัติแล้วคือคนอนุมัติ ยังรออยู่คือคนที่ต้องอนุมัติต่อ */
  approverName: string | null;
  id: string;
  reason: string | null;
  status: string;
  /** บรรทัดรองใต้ชื่อเรื่อง — วันที่อย่างเดียว */
  subtitle: string | null;
  title: string;
  type: RequestType;
}

export interface RequestsPanelProps {
  items: RequestRow[];
  onOpen: (item: RequestRow) => void;
}

/**
 * คำขอล่าสุดที่ฉันยื่น
 *
 * ตอบคำถามที่คนถามบ่อยที่สุดรองจาก "วันนี้ลงเวลาหรือยัง" — **เรื่องที่ยื่นไป
 * ถึงไหนแล้ว** เดิมหน้าแรกบอกแค่จำนวนใบที่ค้างเป็นตัวเลขในการ์ดวันลา ซึ่งไม่ได้
 * บอกว่าเป็นใบไหนและติดอยู่ขั้นไหน
 *
 * ## การจัดวางแต่ละใบ
 *
 * แบ่งด้วยเส้นคั่นบาง (`glassBorder`) ระหว่างใบ — สามการ์ดที่ไม่มีขอบเขตชัด
 * เคยดูเป็นก้อนเดียวกันโดยเฉพาะตอนวงไอคอนซ้ายสุดจางบนพื้นขาว เส้นคั่นใช้
 * `borderTopWidth` ของแถวถัดไป (ไม่ใช่แถวแรก) แบบเดียวกับ `LeavePanel` ด้านล่าง
 *
 * ไม่ใช้ `<Glass>` ห่อทีละใบ — สามการ์ดซ้อนกันจะกลายเป็นกล่องซ้อนกล่อง เส้นคั่น
 * บาง ๆ พอแล้วสำหรับรายการสามใบ
 *
 *   [ ☀ ]  11 ส.ค. · ● อนุมัติแล้ว     ← บรรทัดกำกับ: เมื่อไร ถึงไหนแล้ว
 *          ลาพักร้อน          1 วัน ›  ← บรรทัดหลัก: เรื่องอะไร เท่าไร
 *
 * วงไอคอนซ้ายสุดตอบว่า "เรื่องอะไร" (ประเภทคำขอ) ส่วนจุด+ข้อความสถานะตอบว่า
 * "ถึงไหนแล้ว" — สองอย่างนี้ทำหน้าที่ต่างกันจึงแยกสีกันได้โดยไม่ขัดกัน วงไอคอน
 * เป็น `accentSoft` เสมอไม่ว่าสถานะจะเป็นอะไร ส่วนจุด/ข้อความสถานะเปลี่ยนสีตาม
 * `REQUEST_STATUS_COLOR`
 *
 * วงไอคอนมีเส้นขอบ `glassBorder` เสมอ ไม่ใช่พื้นสีลอยเฉย ๆ — วางอยู่บนพื้นจอ
 * โดยตรง ไม่ได้อยู่ในการ์ดขาว ถ้าไม่มีขอบ `accentSoft` (ฟ้า 8%) จะจางจนดูเหมือน
 * ลอยไม่มีขอบเขต (รูปแบบเดียวกับ `HeroAvatar` ใน `today-hero.tsx`)
 *
 * บรรทัดกำกับมาก่อนชื่อเรื่อง เพราะสามใบล่าสุดมักเป็นเรื่องเดียวกันซ้ำ ๆ
 * ("ลาพักร้อน" สองใบในภาพเดียว) สิ่งที่แยกใบออกจากกันจริง ๆ คือวันที่กับสถานะ
 */
export function RequestsPanel({ items, onOpen }: RequestsPanelProps) {
  if (items.length === 0) {
    return (
      <Text style={{ color: AURORA.textMuted }} variant="caption">
        ยังไม่มีคำขอที่ยื่นไว้
      </Text>
    );
  }

  return (
    <View style={{ gap: 6 }}>
      {items.map((item) => {
        const color = REQUEST_STATUS_COLOR[item.status] ?? AURORA.textFaint;

        return (
          <PressableScale
            accessibilityRole="button"
            key={item.id}
            onPress={() => onOpen(item)}
            style={{
              backgroundColor: '#ffffff',
              borderColor: AURORA.glassBorder,
              borderRadius: 18,
              borderWidth: 1,
              elevation: 2,
              gap: 3,
              paddingHorizontal: 12,
              paddingVertical: 10,
              shadowColor: AURORA.accent,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.07,
              shadowRadius: 12,
            }}
          >
            {/* บรรทัดบน — เรื่องอะไร (สำคัญสุด) + ป้ายสถานะแบบแคปซูล */}
            <View
              style={{ alignItems: 'center', flexDirection: 'row', gap: 6 }}
            >
              <Icon
                color={AURORA.accent}
                name={REQUEST_TYPE_ICON[item.type]}
                size={13}
              />

              <Text
                maxScale={1.2}
                numberOfLines={1}
                style={{
                  color: AURORA.text,
                  flex: 1,
                  fontSize: 13,
                  fontWeight: '700',
                  lineHeight: 16,
                }}
              >
                {item.title}
              </Text>

              <View
                style={{
                  backgroundColor: `${color}1f`,
                  borderRadius: 999,
                  paddingHorizontal: 7,
                  paddingVertical: 1.5,
                }}
              >
                <Text
                  maxScale={1.1}
                  numberOfLines={1}
                  style={{
                    color,
                    fontSize: 9.5,
                    fontWeight: '700',
                    lineHeight: 12,
                  }}
                >
                  {REQUEST_STATUS_LABEL[item.status] ?? item.status}
                </Text>
              </View>
            </View>

            {/* บรรทัดเหตุผล — ใส่เมื่อมีเท่านั้น ไม่งั้นเว้นว่างไปเลย ไม่บังคับมีทุกใบ */}
            {item.reason ? (
              <Text
                maxScale={1.2}
                numberOfLines={1}
                style={{ color: AURORA.textMuted, fontSize: 10, lineHeight: 13 }}
              >
                {item.reason}
              </Text>
            ) : null}

            {/* บรรทัดล่าง — ยื่นเมื่อไร, ใครเกี่ยวข้อง, แล้วไปที่ไหนต่อ */}
            <View
              style={{ alignItems: 'center', flexDirection: 'row', gap: 6 }}
            >
              <Text
                maxScale={1.1}
                numberOfLines={1}
                style={[
                  TABULAR,
                  { color: AURORA.textFaint, flex: 1, fontSize: 10, lineHeight: 13 },
                ]}
              >
                {`ยื่นเมื่อ ${[item.subtitle, item.amount].filter(Boolean).join(' · ')}`}
              </Text>

              {item.approverName ? (
                <Text
                  maxScale={1.1}
                  numberOfLines={1}
                  style={{
                    color: AURORA.textMuted,
                    fontSize: 10,
                    fontWeight: '600',
                    lineHeight: 13,
                    maxWidth: 90,
                  }}
                >
                  {item.approverName}
                </Text>
              ) : null}

              <Icon
                color={AURORA.textFaint}
                name="chevron-right"
                size={14}
              />
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

/* -------------------------------------------------------- รอบเงินเดือน */

export interface PeriodPanelProps {
  /** โหลดไม่สำเร็จ — ต้องบอกให้รู้ ไม่ใช่ปล่อยการ์ดว่าง */
  failed?: boolean;
  /**
   * บอกวันที่สลิปจะออกไหม — โชว์เฉพาะคนที่มีสิทธิ์ดูเงินเดือน
   *
   * เดิมเป็น callback ของลิงก์ "ดูสลิป" ตอนนี้เหลือแค่ข้อความบอกกำหนด
   * เพราะแท็บเงินเดือนอยู่บนแถบล่างอยู่แล้ว ลิงก์ซ้ำที่นี่ไม่ได้พาไปไหนใหม่
   */
  canViewSlips?: boolean;
  /** ไม่มีค่า = ซ่อนปุ่ม "ไปแก้เวลา" (สิทธิ์แก้เวลายังไม่เปิดให้พนักงานคนนี้) */
  onFixMissingLogs?: () => void;
  onRetry?: () => void;
  /** ช่วงที่นับจริง — แสดงไว้ให้เทียบกับสลิปได้ว่าเป็นคนละช่วงหรือเปล่า */
  period: AttendancePeriod | null;
  recordedDays: number;
  summary: AttendanceHistory['summary'] | undefined;
  today: string;
}

/** วันที่มาทำงานจริง — สายก็ยังนับว่ามา ต่างจาก presentDays ที่ตัดวันสายออก */
function workedDays(summary: AttendanceHistory['summary']) {
  return summary.presentDays + summary.lateDays;
}

/**
 * รอบเงินเดือนที่กำลังสะสมอยู่ — **ไม่ใช่สรุปเวลาทำงาน**
 *
 * ## ทำไมเป็นตารางตัวเลข ไม่ใช่กราฟ
 *
 * ลองมาสองแบบแล้วเลิกใช้ทั้งคู่: กราฟเส้นชั่วโมงทำงานรายวันพังกับข้อมูลจริง
 * (งวดหนึ่งมี 26 วันแต่ลงครบแค่ 3 วัน เส้นเลยขาดเป็นช่วง ๆ) ส่วนกราฟเส้นสะสม
 * (ผลรวมวันทำงานสะสมไปเรื่อย ๆ) แก้ปัญหาเส้นขาดได้ แต่ผู้ใช้อ่านไม่ออกว่าเส้น
 * ที่ขึ้นๆ นั้นหมายถึงอะไร — ตัวเลขมีแค่ 6 ค่า ยังไม่ถึงจุดที่กราฟคุ้มกว่าตาราง
 * ตอนนี้จึงเป็นตารางตัวเลข 6 ช่องแน่น ๆ (แดชบอร์ดเล็ก) อ่านตรง ๆ ไม่ต้องแปล
 * จากรูปทรงเส้น
 *
 * ## ทำไมไม่ใช่สี่ช่องน้ำหนักเท่ากันเหมือนตอนแรก
 *
 * รอบแรกวางวันทำงาน/OT/สาย/ลงเวลาไม่ครบเป็นสี่ช่องเท่ากันหมด ทั้งที่ในสี่
 * อย่างนั้นมีแค่ "ลงเวลาไม่ครบ" อย่างเดียวที่ผู้ใช้ต้องลงมือทำอะไรต่อ (ไม่แก้
 * จะถูกนับเป็นขาดงานตอนปิดรอบ) ที่เหลือเป็นแค่ตัวเลขติดตามเฉย ๆ
 *
 * ตอนนี้แยกเป็นสองส่วนที่ตอบคนละคำถาม: **ตารางแดชบอร์ด** ตอบ "ตัวเลขจริง
 * เป็นเท่าไร" ทั้งหมด (วันทำงาน/ลงเวลาไม่ครบ/วันลา/OT/สาย/รวมวันในรอบ)
 * **การ์ดสีเน้น** ตอบ "ต้องทำอะไรไหม" แยกต่างหาก (หรือการ์ดฟ้าบอก "เรียบร้อยดี"
 * ถ้าไม่มีอะไรต้องแก้ — ต้องไม่โล่งไปตอนทุกอย่างปกติ) ตัดตัวเลขเทียบกับรอบก่อน
 * ทิ้งไปด้วย เพราะต้นรอบข้อมูลน้อยจนเทียบแล้วชวนสับสนมากกว่าเป็นประโยชน์
 * (เช่น "น้อยกว่ารอบก่อน 27 วัน" ทั้งที่เพิ่งทำงานมาแค่วันเดียว)
 *
 * ต่างจากการ์ด "เงินเดือน" ข้างล่างที่เป็นสลิปของงวด **ที่จ่ายไปแล้ว** —
 * ใบนี้คืองวดที่ยังปิดไม่ลง ตัวเลขยังขยับได้จนถึงวันตัด
 */
export function PeriodPanel({
  failed = false,
  canViewSlips,
  onFixMissingLogs,
  onRetry,
  period,
  recordedDays,
  summary,
  today,
}: PeriodPanelProps) {
  /*
   * ไม่มีข้อมูลก็ยังต้องคงการ์ดไว้ — เคยซ่อนทั้งใบเมื่อยังไม่มีสรุป พอวันที่
   * คำขอล้มเหลวจริง ๆ การ์ดก็หายไปทั้งใบโดยไม่บอกอะไร ซึ่งผู้ใช้อ่านว่า
   * "ข้อมูลหาย" ไม่ใช่ "โหลดไม่ได้" สองอย่างนี้ต้องแยกให้ออกจากกัน
   */
  if (failed || !summary || recordedDays === 0) {
    return (
      <View style={{ gap: 4 }}>
        <Text style={{ color: AURORA.textMuted }} variant="caption">
          {failed
            ? 'โหลดสรุปรอบนี้ไม่สำเร็จ'
            : 'ยังไม่มีบันทึกเวลาในรอบเงินเดือนนี้'}
        </Text>
        {failed && onRetry ? (
          <SectionAction label="ลองใหม่" onPress={onRetry} />
        ) : null}
      </View>
    );
  }

  const worked = workedDays(summary);

  /* เหลืออีกกี่วันจะปิดงวด — ค่าติดลบแปลว่างวดปิดแล้วแต่ระบบยังไม่ขยับช่วง */
  const daysLeft = period ? daysBetween(today, period.to) : null;
  const incompleteDays = summary.absentDays + summary.missingLogDays;

  /* จำนวนวันทั้งหมดของรอบ กับที่เดินผ่านไปแล้ว — ใช้กับแถบความคืบหน้า */
  const span = period ? daysBetween(period.from, period.to) : null;
  const spanDays = span === null ? 0 : span + 1;
  const elapsedDays =
    daysLeft === null ? spanDays : Math.min(Math.max(spanDays - daysLeft, 0), spanDays);

  /*
   * ช่วงสีบนแถบความคืบหน้า — วันที่ผ่านไปแล้วแยกตามสถานะจริงของวันนั้น
   * เรียงจาก "ดี" ไป "ต้องตามแก้" ให้สีแดงไปกองท้ายสุดของส่วนที่ถูกเติม
   * ไม่ใช่แทรกอยู่กลางแถบจนอ่านสัดส่วนยาก
   */
  const barSegments = [
    {
      color: AURORA.accent,
      days: summary.presentDays,
      key: 'present',
      label: 'มาปกติ',
    },
    { color: AURORA.amber, days: summary.lateDays, key: 'late', label: 'มาสาย' },
    { color: AURORA.sky, days: summary.leaveDays, key: 'leave', label: 'ลา' },
    {
      color: AURORA.rose,
      days: incompleteDays,
      key: 'incomplete',
      label: 'ขาด/ไม่ครบ',
    },
  ].filter((segment) => segment.days > 0);

  /*
   * สามตัวเลขที่ไปโผล่บนสลิปจริง ๆ — วันทำงานเป็นฐานเงินเดือน OT บวกเพิ่ม
   * สายอาจโดนหัก ส่วน "ลงเวลาไม่ครบ" ไม่อยู่ในแถวนี้เพราะเป็นเรื่องที่ต้อง
   * ลงมือแก้ ไม่ใช่ตัวเลขไว้ดูเฉย ๆ — มันมีการ์ดของตัวเองข้างล่าง
   */
  const payStats: { color: string; icon: IconName; label: string; value: string }[] =
    [
      {
        color: AURORA.accent,
        icon: 'check-circle',
        label: 'ทำงานจริง',
        value: `${worked} วัน`,
      },
      {
        color: AURORA.sky,
        icon: 'trending-up',
        label: 'OT สะสม',
        value: formatMinutes(summary.otMinutes),
      },
      {
        /* ศูนย์นาทีไม่ใช่คำเตือน ต้องเป็นสีกลาง ไม่งั้นส้มจะกลายเป็นสีตกแต่ง */
        color: summary.totalLateMinutes > 0 ? AURORA.amber : AURORA.textFaint,
        icon: 'clock',
        label: 'สายสะสม',
        value: formatMinutes(summary.totalLateMinutes),
      },
    ];

  return (
    <View style={{ gap: 14 }}>
      {/* ช่วงของรอบ + เหลืออีกกี่วันจะปิด */}
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 10 }}>
        <Text
          maxScale={1.2}
          numberOfLines={1}
          style={[TABULAR, { color: AURORA.textMuted, flex: 1, fontSize: 12 }]}
        >
          {period
            ? `${formatShortDate(period.from) ?? ''} – ${formatShortDate(period.to) ?? ''}`
            : 'รอบปัจจุบัน'}
        </Text>
        {daysLeft !== null && daysLeft > 0 ? (
          <View
            style={{
              backgroundColor: AURORA.accentSoft,
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 3,
            }}
          >
            <Text
              maxScale={1.1}
              style={[TABULAR, { color: AURORA.accent, fontSize: 10.5, fontWeight: '700' }]}
            >
              ปิดรอบอีก {daysLeft} วัน
            </Text>
          </View>
        ) : null}
      </View>

      {/*
       * ภาพรวมทั้งงวด — สามชั้นเรียงตามลำดับที่คนอ่าน:
       *   1. รอบเดินมาถึงไหนแล้ว (แถบสีตามสถานะ + คำอธิบายสี)
       *   2. สามตัวเลขที่กระทบเงินในสลิป (ทำงานจริง / OT / สาย)
       *   3. วันลาที่ใช้ไป — คั่นเส้นเพราะเป็นคนละเรื่องกับสามตัวข้างบน
       *
       * **มีพื้นฟ้าอ่อนเป็นถาดรอง** — เดิมวางลอยบนผิวจอโดยไม่มีอะไรรับ ทั้งสาม
       * ชั้นเลยอ่านเป็นของสามชิ้นที่บังเอิญอยู่ใกล้กัน ไม่ใช่ "ภาพรวมของรอบนี้"
       * ก้อนเดียว โดยเฉพาะแถวตัวเลขสามช่องที่ลอยเด่นที่สุด
       *
       * ถาดไม่ใช่การ์ด: ไม่มีเงา ไม่ยกตัวขึ้นจากผิว เป็นแค่พื้นที่บอกขอบเขต
       * ว่าของในนี้เป็นเรื่องเดียวกัน (กติกา "หนึ่งจอ = หนึ่งผิว" ยังอยู่ครบ)
       */}
      <View
        style={{
          backgroundColor: AURORA.base,
          borderColor: `${AURORA.accent}14`,
          borderRadius: 20,
          borderWidth: 1,
          gap: 14,
          padding: 14,
        }}
      >
        <View style={{ gap: 8 }}>
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}>
            <Text
              maxScale={1.2}
              numberOfLines={1}
              style={{ color: AURORA.textMuted, flex: 1, fontSize: 11.5 }}
            >
              รอบนี้ผ่านไปแล้ว
            </Text>
            <Text
              maxScale={1.1}
              style={[
                TABULAR,
                { color: AURORA.text, fontSize: 12.5, fontWeight: '800' },
              ]}
            >
              {elapsedDays}
            </Text>
            <Text
              maxScale={1.1}
              style={[TABULAR, { color: AURORA.textFaint, fontSize: 11 }]}
            >
              / {spanDays} วัน
            </Text>
          </View>

          {/*
           * แถบไม่ใช่สีเดียวแล้ว — ซอยตามสถานะของวันที่ผ่านไปจริง (มาปกติ /
           * มาสาย / ลา / ขาด-ไม่ครบ) ส่วนที่ยังไม่ถึงคือรางเทาที่โผล่ท้ายแถบ
           *
           * ความกว้างแต่ละช่วงคิดจาก "จำนวนวันหารด้วยทั้งรอบ" ตรง ๆ ไม่ใช่ flex
           * เพื่อให้ผลรวมของทุกช่วงเท่ากับสัดส่วนวันที่ผ่านไปแล้วพอดี
           */}
          <View
            style={{
              /* รางต้องเข้มกว่าพื้นถาด ไม่งั้นส่วนที่ยังไม่ถึงจะกลืนหายไป */
              backgroundColor: 'rgba(16, 24, 40, 0.1)',
              borderRadius: 999,
              flexDirection: 'row',
              height: 8,
              overflow: 'hidden',
            }}
          >
            {barSegments.map((segment) => (
              <View
                key={segment.key}
                style={{
                  backgroundColor: segment.color,
                  height: 8,
                  width: `${(segment.days / Math.max(spanDays, 1)) * 100}%`,
                }}
              />
            ))}
          </View>

          {/*
           * คำอธิบายสี — โชว์เฉพาะช่วงที่มีวันจริง พร้อมจำนวนวันกำกับเสมอ
           * (กติกา dataviz ข้อ 1: ห้ามให้สีเป็นทางเดียวที่สื่อความหมาย)
           */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {barSegments.map((segment) => (
              <View
                key={segment.key}
                style={{ alignItems: 'center', flexDirection: 'row', gap: 5 }}
              >
                <View
                  style={{
                    backgroundColor: segment.color,
                    borderRadius: 999,
                    height: 6,
                    width: 6,
                  }}
                />
                <Text
                  maxScale={1.1}
                  numberOfLines={1}
                  style={[
                    TABULAR,
                    { color: AURORA.textMuted, fontSize: 10.5 },
                  ]}
                >
                  {segment.label} {segment.days} วัน
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/*
          สามช่องคั่นด้วยเส้นตั้ง ไม่ใช่ช่องว่าง — ช่องว่างอย่างเดียวทำให้สาม
          ตัวเลขอ่านเป็นของแยกกันสามชิ้น ทั้งที่มันคือสามด้านของรอบเดียวกัน
          และช่องกลางที่เป็นขีด (ยังไม่มี OT) ดูเหมือนที่ว่างเปล่ายิ่งกว่าเดิม

          พื้นขาวใต้แถวคือชั้นที่สองในถาด — ตัวเลขคือของที่ต้องอ่านก่อนเพื่อน
          ในถาดนี้ จึงเป็นชิ้นเดียวที่ลอยขึ้นมาจากพื้นฟ้า
        */}
        <View
          style={{
            backgroundColor: AURORA.baseDeep,
            borderRadius: 16,
            flexDirection: 'row',
            overflow: 'hidden',
          }}
        >
          {payStats.map((stat, index) => (
            <View
              key={stat.label}
              style={{
                alignItems: 'center',
                borderLeftColor: `${AURORA.accent}14`,
                borderLeftWidth: index > 0 ? 1 : 0,
                flex: 1,
                gap: 6,
                paddingHorizontal: 4,
                paddingVertical: 12,
              }}
            >
              <View
                style={{
                  alignItems: 'center',
                  backgroundColor: `${stat.color}16`,
                  borderRadius: 999,
                  height: 34,
                  justifyContent: 'center',
                  width: 34,
                }}
              >
                <Icon color={stat.color} name={stat.icon} size={16} />
              </View>
              <Text
                maxScale={1.1}
                numberOfLines={1}
                style={[
                  TABULAR,
                  {
                    color: AURORA.text,
                    fontSize: 16,
                    fontWeight: '800',
                    letterSpacing: -0.3,
                    lineHeight: 20,
                  },
                ]}
              >
                {stat.value}
              </Text>
              <Text
                maxScale={1.1}
                numberOfLines={1}
                style={{ color: AURORA.textFaint, fontSize: 10, lineHeight: 13 }}
              >
                {stat.label}
              </Text>
            </View>
          ))}
        </View>

        <View
          style={{
            alignItems: 'center',
            /* เข้มกว่า `glassBorder` หนึ่งขั้น — เส้นระดับการ์ดจางหายบนพื้นถาด */
            borderTopColor: `${AURORA.accent}1f`,
            borderTopWidth: 1,
            flexDirection: 'row',
            gap: 7,
            paddingTop: 12,
          }}
        >
          <Icon color={AURORA.textFaint} name="calendar" size={13} />
          <Text
            maxScale={1.2}
            numberOfLines={1}
            style={{ color: AURORA.textMuted, flex: 1, fontSize: 11.5 }}
          >
            วันลาที่ใช้ในรอบนี้
          </Text>
          <Text
            maxScale={1.1}
            style={[
              TABULAR,
              { color: AURORA.text, fontSize: 12.5, fontWeight: '800' },
            ]}
          >
            {summary.leaveDays} วัน
          </Text>
        </View>
      </View>

      {/*
       * เรื่องที่ต้องลงมือทำ — แยกจากการ์ดกราฟเพราะคนละเรื่องกัน (กราฟตอบ
       * "แนวโน้ม" ส่วนนี้ตอบ "ต้องทำอะไรไหม") มีสองสถานะเสมอ ไม่ปล่อยโล่ง
       * ตอนไม่มีอะไรต้องแก้
       */}
      {incompleteDays > 0 ? (
        /* ข้อความซ้าย ปุ่มขวา — ปุ่มไม่ต้องรอให้อ่านจบสองบรรทัดก่อนถึงจะเจอ */
        <View
          style={{
            alignItems: 'center',
            backgroundColor: `${AURORA.rose}0c`,
            borderRadius: 14,
            flexDirection: 'row',
            gap: 10,
            padding: 10,
          }}
        >
          <View style={{ flex: 1, gap: 3 }}>
            <Text
              maxScale={1.1}
              numberOfLines={1}
              style={[
                TABULAR,
                { color: AURORA.rose, fontSize: 13.5, fontWeight: '800' },
              ]}
            >
              ลงเวลาไม่ครบ {incompleteDays} วัน
            </Text>
            <Text style={{ color: AURORA.textMuted, fontSize: 10 }}>
              ไม่แก้ก่อนปิดรอบจะถูกนับเป็นขาดงาน
            </Text>
          </View>

          {onFixMissingLogs ? (
            <PressableScale
              accessibilityRole="button"
              onPress={onFixMissingLogs}
            >
              <View
                style={{
                  alignItems: 'center',
                  backgroundColor: AURORA.rose,
                  borderRadius: 999,
                  flexDirection: 'row',
                  gap: 4,
                  paddingHorizontal: 11,
                  paddingVertical: 6,
                }}
              >
                <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '700' }}>
                  ไปแก้เวลา
                </Text>
                <Icon color="#ffffff" name="arrow-right" size={12} />
              </View>
            </PressableScale>
          ) : null}
        </View>
      ) : (
        <View
          style={{
            alignItems: 'center',
            backgroundColor: `${AURORA.accent}0c`,
            borderRadius: 14,
            flexDirection: 'row',
            gap: 8,
            padding: 10,
          }}
        >
          <Icon color={AURORA.accent} name="check-circle" size={16} />
          <Text style={{ color: AURORA.text, flex: 1, fontSize: 12, fontWeight: '600' }}>
            ลงเวลาครบทุกวันในรอบนี้
          </Text>
        </View>
      )}

      {canViewSlips ? (
        <Text style={{ color: AURORA.textFaint, fontSize: 11 }}>
          {period
            ? `สลิปออกหลัง ${formatShortDate(period.to) ?? 'ปิดรอบ'}`
            : 'สลิปออกหลังปิดรอบ'}
        </Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------ วันลา */

export interface LeaveType {
  entitlementDays: number;
  leaveTypeId: string;
  name: string;
  pendingDays: number;
  remainingDays: number;
  usedDays: number;
}

/** สีชิ้นโดนัทวันลา — ไล่จากน้ำเงินเข้มไปฟ้าอ่อน อยู่ในโทนฟ้าทั้งหมด */
const LEAVE_COLORS = ['#1d4ed8', '#2f6bf0', '#0284c7', '#38bdf8'];

/** แสดงแยกชิ้นกี่ประเภท ที่เหลือรวมเป็นชิ้น "อื่นๆ" ชิ้นเดียว */
const LEAVE_SLICE_LIMIT = 4;

const DONUT_SIZE = 116;
const DONUT_THICKNESS = 17;

/**
 * สิทธิ์การลาของฉัน — **โดนัทใบเดียว คำอธิบายอยู่ด้านขวา**
 *
 * เคยเป็นแถบสัดส่วนต่อกันแนวตั้ง แล้วเปลี่ยนเป็นการ์ดวงแหวนสองคอลัมน์ ตอนนี้
 * รวมเป็นโดนัทวงเดียว ชิ้นละประเภท — เห็นทั้ง "เหลือรวมกี่วัน" (กลางวง) และ
 * "กระจุกอยู่ประเภทไหน" (ขนาดชิ้น) พร้อมกันในที่เดียว
 *
 * แยกชิ้นแค่สี่ประเภทแรกตามลำดับที่ผู้เรียกจัดมาแล้ว (ของที่ใกล้ตัวก่อน)
 * ที่เหลือรวบเป็นชิ้น "อื่นๆ" สีเทา กดแล้วเปิดดูทั้งหมดได้ — โดนัทสิบห้าชิ้น
 * แยกชิ้นเล็ก ๆ ไม่ได้บอกอะไรนอกจากทำให้อ่านไม่ออก
 *
 * **ตัวเลขต้องอยู่ในคำอธิบายเสมอ** ไม่ใช่ให้เดาจากขนาดชิ้น (กติกา dataviz
 * ข้อ 1: ห้ามให้สี/รูปทรงเป็นทางเดียวที่สื่อความหมาย)
 */
export function LeavePanel({
  onMore,
  types,
}: {
  onMore?: () => void;
  types: LeaveType[];
}) {
  const usable = types.filter((type) => type.entitlementDays > 0);

  if (usable.length === 0) {
    return (
      <Text style={{ color: AURORA.textMuted }} variant="caption">
        ยังไม่มีโควตาวันลาในระบบ
      </Text>
    );
  }

  const head = usable.slice(0, LEAVE_SLICE_LIMIT);
  const tail = usable.slice(LEAVE_SLICE_LIMIT);
  const tailRemaining = tail.reduce(
    (sum, type) => sum + Math.max(type.remainingDays, 0),
    0,
  );

  const slices = [
    ...head.map((type, index) => ({
      color: LEAVE_COLORS[index] ?? AURORA.accent,
      label: type.name,
      value: Math.max(type.remainingDays, 0),
    })),
    ...(tail.length > 0
      ? [
          {
            color: AURORA.textFaint,
            label: `อื่นๆ (${tail.length} ประเภท)`,
            value: tailRemaining,
          },
        ]
      : []),
  ].filter((slice) => slice.value > 0);

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = (DONUT_SIZE - DONUT_THICKNESS) / 2;
  const circumference = 2 * Math.PI * radius;

  /*
   * ตำแหน่งเริ่มของแต่ละชิ้นสะสมกันไปเรื่อย ๆ — สร้างด้วย reduce ไม่ใช่ตัวแปร
   * `let` ที่ถูกเขียนทับใน map เพราะ React Compiler ห้ามแก้ค่าตัวแปรนอก callback
   * ระหว่างเรนเดอร์ (เคยติด lint มาแล้วตอนทำกราฟเส้น)
   */
  const arcs = slices.reduce<{ color: string; dash: number; start: number }[]>(
    (acc, slice) => {
      const previous = acc.length > 0 ? acc[acc.length - 1] : undefined;
      const start = previous ? previous.start + previous.dash : 0;

      return [
        ...acc,
        {
          color: slice.color,
          dash: total > 0 ? (slice.value / total) * circumference : 0,
          start,
        },
      ];
    },
    [],
  );

  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', gap: 16 }}>
      <View style={{ height: DONUT_SIZE, width: DONUT_SIZE }}>
        <Svg height={DONUT_SIZE} width={DONUT_SIZE}>
          {/* รางสีจาง — กันไม่ให้วงหายไปเลยตอนไม่มีวันลาเหลือสักประเภท */}
          <Circle
            cx={DONUT_SIZE / 2}
            cy={DONUT_SIZE / 2}
            fill="none"
            r={radius}
            stroke={AURORA.glassBorder}
            strokeWidth={DONUT_THICKNESS}
          />

          {arcs.map((arc, index) => (
            <Circle
              cx={DONUT_SIZE / 2}
              cy={DONUT_SIZE / 2}
              fill="none"
              key={index}
              r={radius}
              stroke={arc.color}
              strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
              strokeDashoffset={-arc.start}
              strokeWidth={DONUT_THICKNESS}
              /* เริ่มชิ้นแรกที่ 12 นาฬิกา ไม่ใช่ 3 นาฬิกา */
              transform={`rotate(-90 ${DONUT_SIZE / 2} ${DONUT_SIZE / 2})`}
            />
          ))}
        </Svg>

        <View
          style={{
            alignItems: 'center',
            bottom: 0,
            justifyContent: 'center',
            left: 0,
            position: 'absolute',
            right: 0,
            top: 0,
          }}
        >
          <Text
            maxScale={1.1}
            style={[
              TABULAR,
              { color: AURORA.text, fontSize: 24, fontWeight: '800', lineHeight: 30 },
            ]}
          >
            {total}
          </Text>
          <Text style={{ color: AURORA.textFaint, fontSize: 10, lineHeight: 13 }}>
            วันคงเหลือ
          </Text>
        </View>
      </View>

      {/* คำอธิบายชิ้นโดนัท — ชื่อประเภทกับตัวเลขอยู่ด้วยกันเสมอ */}
      <View style={{ flex: 1, gap: 7 }}>
        {slices.map((slice, index) => {
          const isOther = tail.length > 0 && index === slices.length - 1;

          const row = (
            <View
              style={{ alignItems: 'center', flexDirection: 'row', gap: 7 }}
            >
              <View
                style={{
                  backgroundColor: slice.color,
                  borderRadius: 3,
                  height: 9,
                  width: 9,
                }}
              />
              <Text
                maxScale={1.1}
                numberOfLines={1}
                style={{ color: AURORA.textMuted, flex: 1, fontSize: 11.5 }}
              >
                {slice.label}
              </Text>
              <Text
                maxScale={1.1}
                style={[
                  TABULAR,
                  { color: AURORA.text, fontSize: 12, fontWeight: '700' },
                ]}
              >
                {slice.value}
              </Text>
              {isOther ? (
                <Icon color={AURORA.textFaint} name="chevron-right" size={14} />
              ) : null}
            </View>
          );

          return isOther ? (
            <PressableScale
              accessibilityRole="button"
              key={slice.label}
              onPress={onMore}
            >
              {row}
            </PressableScale>
          ) : (
            <View key={slice.label}>{row}</View>
          );
        })}
      </View>
    </View>
  );
}

export interface PayPanelProps {
  netPay: number;
  onPress: () => void;
  periodName: string;
  trend: number[];
}

export function PayPanel({
  netPay,
  onPress,
  periodName,
  trend,
}: PayPanelProps) {
  return (
    <PressableScale accessibilityRole="button" onPress={onPress}>
      <Glass glow={AURORA.accent} style={{ padding: 18 }}>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text
              numberOfLines={1}
              style={{ color: AURORA.textFaint }}
              variant="caption"
            >
              รับสุทธิ · {periodName}
            </Text>
            <View
              style={{ alignItems: 'flex-end', flexDirection: 'row', gap: 5 }}
            >
              <CountUp
                format={(value) => money(value)}
                maxScale={1.1}
                style={[
                  TABULAR,
                  glowText(AURORA.text, 16),
                  { fontWeight: '800' },
                ]}
                value={netPay}
                variant="h1"
              />
              <Text
                style={{ color: AURORA.textMuted, paddingBottom: 5 }}
                variant="caption"
              >
                บาท
              </Text>
            </View>
          </View>

          {trend.length >= 2 ? (
            <Sparkline
              color={AURORA.accent}
              height={36}
              values={trend}
              width={78}
            />
          ) : null}

          <Icon color={AURORA.textFaint} name="chevron-right" size={20} />
        </View>
      </Glass>
    </PressableScale>
  );
}

/* ---------------------------------------------------------- แถวเตือน */

export interface NoticePanelProps {
  color: string;
  icon: IconName;
  message: string;
  onPress?: () => void;
  actionLabel?: string;
  style?: StyleProp<ViewStyle>;
  title: string;
}

/** การ์ดแจ้งเตือน/งานค้าง — ใช้เงาเรืองสีของเรื่องนั้นแทนพื้นสีทึบ */
export function NoticePanel({
  color,
  icon,
  message,
  onPress,
  actionLabel,
  style,
  title,
}: NoticePanelProps) {
  /*
   * แถบเตือนอยู่ในแผ่นเดียวกับส่วนอื่น ไม่ใช่การ์ดลอยของตัวเอง — ที่ทำให้มัน
   * สะดุดตาคือ **พื้นสีจาง** ของแถบ ไม่ใช่ขอบกับเงา (ดู AGENTS.md ข้อ 3.6)
   */
  const body = (
    <View
      style={[
        {
          backgroundColor: `${color}0f`,
          borderRadius: 18,
          padding: 14,
        },
        style,
      ]}
    >
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 13 }}>
        <View
          style={{
            alignItems: 'center',
            /* พื้นเป็นสีเดียวกับไอคอนแบบจางมาก ไม่ตีกรอบ — กรอบสีทำให้ดูแข็ง */
            backgroundColor: `${color}14`,
            borderRadius: 999,
            height: 42,
            justifyContent: 'center',
            width: 42,
          }}
        >
          <Icon color={color} name={icon} size={20} />
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: AURORA.text }} variant="bodyStrong">
            {title}
          </Text>
          <Text style={{ color: AURORA.textMuted }} variant="caption">
            {message}
          </Text>
        </View>

        {actionLabel ? (
          <Text style={[glowText(color, 8), { fontWeight: '700' }]} variant="caption">
            {actionLabel}
          </Text>
        ) : onPress ? (
          <Icon color={color} name="chevron-right" size={20} />
        ) : null}
      </View>
    </View>
  );

  if (!onPress) {
    return body;
  }

  return (
    <PressableScale accessibilityRole="button" onPress={onPress}>
      {body}
    </PressableScale>
  );
}

/* ---------------------------------------------------------- รูปโปรไฟล์ */

/** ขนาดรูปบนหัวจอ — ใหญ่พอให้เห็นหน้าคนในรูปจริง ไม่ใช่แค่จุดสีกลม */
/*
 * รูปโปรไฟล์บนหัวจอ — ใหญ่พอให้เห็นหน้าคนในรูปจริง ไม่ใช่แค่จุดสีกลม
 * 56 เล็กไปเมื่อวางคู่กับชื่อสามบรรทัด รูปเลยดูเป็นไอคอนประกอบมากกว่าเป็นรูปคน
 */
const AVATAR_SIZE = 64;

export interface ProfileAvatarProps {
  name: string;
  /** ขนาดด้าน — หัวจอใช้ค่าตั้งต้น ส่วนแถวในรายการส่งค่าที่เล็กกว่ามาเอง */
  size?: number;
  url: string | null;
}

/**
 * รูปโปรไฟล์บนหัวจอ
 *
 * รองรับทั้ง url เต็มและพาธสัมพัทธ์ที่ backend เก็บไว้ (เช่น /uploads/...)
 * โดยต่อกับ base url ของ API ให้เอง — ถ้าโหลดไม่ขึ้นหรือไม่มีรูป จะตกกลับไป
 * เป็นอักษรย่อในวงกลม ไม่ปล่อยกรอบว่างหรือไอคอนรูปภาพแตก
 */
export function ProfileAvatar({
  name,
  size = AVATAR_SIZE,
  url,
}: ProfileAvatarProps) {
  const [failed, setFailed] = useState(false);

  const source = publicFileUrl(url);

  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: AURORA.baseDeep,
        borderColor: AURORA.glassBorder,
        borderRadius: 999,
        borderWidth: 1,
        height: size,
        justifyContent: 'center',
        overflow: 'hidden',
        width: size,
      }}
    >
      {source && !failed ? (
        <Image
          accessibilityLabel={name ? `รูปโปรไฟล์ของ ${name}` : 'รูปโปรไฟล์'}
          /* แคชทั้งในหน่วยความจำและบนดิสก์ — รูปคนเดิมโหลดครั้งเดียวพอ */
          cachePolicy="memory-disk"
          contentFit="cover"
          onError={() => setFailed(true)}
          source={{ uri: source }}
          style={{ height: size, width: size }}
          transition={140}
        />
      ) : name ? (
        /* อักษรย่อต้องโตตามวง ไม่งั้นวงเล็กในรายการจะได้ตัวอักษรล้นออกนอกกรอบ */
        <Text
          maxScale={1.1}
          style={{
            color: AURORA.accent,
            fontSize: Math.round(size * 0.42),
            fontWeight: '800',
          }}
        >
          {name.slice(0, 1)}
        </Text>
      ) : (
        <Icon
          color={AURORA.accent}
          name="user"
          size={Math.round(size * 0.5)}
        />
      )}
    </View>
  );
}
