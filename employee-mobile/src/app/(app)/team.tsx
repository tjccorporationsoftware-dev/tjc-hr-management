import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, Input, SkeletonList, Text } from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  PageHero,
  PageSection,
  PeopleMotif,
  PeriodBar,
  Reveal,
  SectionAction,
} from '@/design/aurora';
import {
  formatMinutes,
  monthOf,
  todayKey,
} from '@/features/attendance/calendar';
import {
  TEAM_STATUS_LABEL,
  useTeamSummary,
  type TeamMember,
  type TeamStatus,
} from '@/features/team/team';
import { DayPickerSheet } from '@/features/executive/royal-day-picker';
import { DonutChart } from '@/features/executive/royal';
import { ApiError } from '@/lib/api/api-error';
import { thaiDate, thaiTime } from '@/lib/date/thai-date';

/**
 * ทีมของฉัน — เวลาเข้าออกของลูกทีม "รายวัน"
 *
 * ตอบคำถามที่หัวหน้าถามจริงตอนเช้า: วันนี้ใครยังไม่มา ใครมาสาย ใครลา และ
 * ใครลงเวลาไม่ครบ — ทั้งหมดของ **วันที่เลือก** ไม่ใช่เฉพาะวันนี้ (เลื่อนย้อน
 * กลับได้ทีละวัน) ตัวเลขสะสมทั้งเดือนอยู่ท้ายจอในฐานะบริบท ไม่ใช่พระเอก
 *
 * รายชื่อเรียงตาม "ต้องทำอะไรกับคนนี้ไหม" ไม่ใช่เรียงตามตัวอักษร (backend
 * เรียงมาให้แล้ว) คนที่ยังไม่เข้างานอยู่บนสุดเพราะเป็นสิ่งเดียวที่หัวหน้า
 * ทำอะไรได้ทันที ส่วนคนที่ลาเป็นเรื่องที่รู้อยู่แล้ว
 *
 * ผิวขาวผืนเดียวชุดเดียวกับจออื่นของแอป (`PageHero` + `PageSection` + `AURORA`)
 */

/** สีของสถานะ — ชุดเดียวกับจอลงเวลาและห้องผู้บริหาร */
const STATUS_COLOR: Record<TeamStatus, string> = {
  ABSENT: AURORA.rose,
  HOLIDAY: AURORA.textFaint,
  LATE: AURORA.amber,
  LEAVE: AURORA.sky,
  NOT_CHECKED_IN: AURORA.amber,
  OFFSITE: AURORA.emerald,
  PRESENT: AURORA.emerald,
};

/** วันเป็นสตริง "YYYY-MM-DD" เลื่อนแบบ UTC ไม่ให้เขตเวลาเครื่องมาขยับวัน */
function shiftDay(dateKey: string, delta: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const moved = new Date(Date.UTC(year!, month! - 1, day! + delta));

  return moved.toISOString().slice(0, 10);
}

function formatFullDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);

  return thaiDate(new Date(Date.UTC(year!, month! - 1, day!)), {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
    weekday: 'short',
    year: 'numeric',
  });
}

/** "08:32" จากเวลาที่ backend ส่งมา — ไม่มีค่าให้ขีดไว้ ไม่ใช่เว้นว่าง */
function timeText(value?: Date | null): string {
  if (!value) return '—';

  const parsed = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsed.getTime())) return '—';

  return thaiTime(parsed);
}

/** ตัวย่อชื่อสำหรับวงกลมแทนรูป — ใช้คำแรกกับคำที่สอง */
function initialsOf(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return '';

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('');
}

/**
 * ลูกทีมหนึ่งคนของวันที่เลือก
 *
 * เวลาเข้า-ออกอยู่บรรทัดเดียวกันเสมอแม้จะยังไม่มีค่า — หัวหน้ากวาดตาลงคอลัมน์
 * เดียวเพื่อหาคนที่ยังไม่มี "ออก" ได้ ถ้าซ่อนบรรทัดตอนไม่มีค่า แถวจะสูงไม่เท่ากัน
 * แล้วการกวาดตาแบบนั้นทำไม่ได้
 */
function MemberRow({
  divider,
  member,
  onPress,
}: {
  divider: boolean;
  member: TeamMember;
  onPress: () => void;
}) {
  const color = STATUS_COLOR[member.status];
  const meta = [member.employeeCode, member.position]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityLabel={`ดูรายละเอียดของ ${member.name ?? 'ลูกทีม'}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? 'rgba(37, 99, 235, 0.06)' : 'transparent',
        borderTopColor: AURORA.glassBorder,
        borderTopWidth: divider ? 1 : 0,
        flexDirection: 'row',
        gap: 12,
        marginHorizontal: -4,
        paddingHorizontal: 4,
        paddingVertical: 11,
      })}
    >
      <View
        style={{
          alignItems: 'center',
          backgroundColor: `${color}1a`,
          borderRadius: 999,
          height: 38,
          justifyContent: 'center',
          width: 38,
        }}
      >
        <Text maxScale={1} style={{ color, fontSize: 12.5, fontWeight: '800' }}>
          {initialsOf(member.name) || '—'}
        </Text>
      </View>

      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 10 }}>
          <Text
            numberOfLines={1}
            style={{
              color: AURORA.text,
              flex: 1,
              fontSize: 13.5,
              fontWeight: '700',
              lineHeight: 19,
            }}
          >
            {member.name ?? 'ไม่ระบุชื่อ'}
          </Text>

          {/* ป้ายสถานะ = จุดกลม + ข้อความสีเดียวกัน ตามกติกาของแอป */}
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: 6 }}>
            <View
              style={{
                backgroundColor: color,
                borderRadius: 999,
                height: 5,
                width: 5,
              }}
            />
            <Text
              maxScale={1.1}
              numberOfLines={1}
              style={{
                color,
                fontSize: 10.5,
                fontWeight: '700',
                lineHeight: 14,
              }}
            >
              {TEAM_STATUS_LABEL[member.status]}
            </Text>
          </View>
        </View>

        {meta ? (
          <Text
            numberOfLines={1}
            style={{ color: AURORA.textMuted, fontSize: 11, lineHeight: 16 }}
          >
            {meta}
          </Text>
        ) : null}

        <Text
          style={{
            color: AURORA.textFaint,
            fontSize: 11,
            fontVariant: ['tabular-nums'],
            lineHeight: 16,
          }}
        >
          {`เข้า ${timeText(member.morningInAt)} · ออก ${timeText(member.checkOutAt)}`}
          {member.afternoonInAt
            ? ` · บ่าย ${timeText(member.afternoonInAt)}`
            : ''}
        </Text>

        {/* บรรทัดเตือนขึ้นเฉพาะเมื่อมีของให้ทำจริง — สายกี่นาที ลงเวลาไม่ครบ
            หรือมีใบรออนุมัติค้างอยู่ที่หัวหน้าคนนี้ */}
        {member.lateMinutes > 0 ||
        member.hasMissingLog ||
        member.pendingRequests > 0 ? (
          <Text
            style={{
              color: member.hasMissingLog ? AURORA.amber : AURORA.textMuted,
              fontSize: 11,
              fontVariant: ['tabular-nums'],
              lineHeight: 16,
            }}
          >
            {[
              member.lateMinutes > 0
                ? `สาย ${formatMinutes(member.lateMinutes)}`
                : null,
              member.hasMissingLog ? 'ลงเวลาไม่ครบคู่' : null,
              member.pendingRequests > 0
                ? `รออนุมัติ ${member.pendingRequests} ใบ`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ) : null}
      </View>

      <Icon color={AURORA.textFaint} name="chevron-right" size={17} />
    </Pressable>
  );
}

/** บรรทัดตัวเลขสะสมของเดือน */
function MonthLine({
  divider,
  label,
  value,
}: {
  divider: boolean;
  label: string;
  value: string;
}) {
  return (
    <View
      style={{
        alignItems: 'center',
        borderTopColor: AURORA.glassBorder,
        borderTopWidth: divider ? 1 : 0,
        flexDirection: 'row',
        gap: 12,
        paddingVertical: 9,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          color: AURORA.text,
          flex: 1,
          fontSize: 12.5,
          lineHeight: 18,
        }}
      >
        {label}
      </Text>
      <Text
        maxScale={1.1}
        style={{
          color: AURORA.text,
          fontSize: 12.5,
          fontVariant: ['tabular-nums'],
          fontWeight: '700',
          lineHeight: 18,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export default function TeamScreen() {
  const { gutter } = useResponsive();
  const router = useRouter();

  const today = todayKey();
  const [date, setDate] = useState(today);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');
  /* เดือนที่ปฏิทินเปิดค้างอยู่ — ตั้งใหม่ทุกครั้งที่กดเปิด ให้ตามวันที่เลือก */
  const [pickerMonth, setPickerMonth] = useState(() => monthOf(todayKey()));
  const [pickerOpen, setPickerOpen] = useState(false);

  const isToday = date === today;
  /* ยอดสะสมผูกกับเดือนของวันที่กำลังดู ไม่ใช่เดือนปฏิทินปัจจุบันเสมอไป */
  const team = useTeamSummary({ date, month: monthOf(date) });

  const data = team.data;
  const counts = data?.todayCounts;
  const members = data?.members ?? [];

  /*
   * ค่าเริ่มต้นโชว์เฉพาะคนที่ต้องจัดการ — ทีมยี่สิบคนที่มาปกติหมด
   * ไม่มีประโยชน์ที่จะให้เลื่อนผ่านทั้งยี่สิบแถวเพื่อหาคนเดียวที่ขาด
   */
  const needsAttention = members.filter(
    (member) =>
      member.status === 'ABSENT' ||
      member.status === 'NOT_CHECKED_IN' ||
      member.status === 'LATE' ||
      member.hasMissingLog,
  );

  /* พิมพ์ค้นหาเมื่อไร = ค้นทั้งทีมเสมอ ไม่ใช่ค้นเฉพาะในรายการที่กรองไว้ก่อน
     ไม่งั้นพิมพ์ชื่อคนที่มาตรงเวลาแล้วขึ้นว่าไม่พบ ทั้งที่เขาอยู่ในทีม */
  const keyword = search.trim().toLowerCase();
  const visible = keyword
    ? members.filter((member) =>
        [member.name, member.employeeCode, member.position]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(keyword),
      )
    : showAll
      ? members
      : needsAttention;

  /*
   * ฐานของอัตราคือคนที่ต้องมาทำงานวันนั้น ไม่ใช่ทั้งทีม — คนลาไม่ควรถูกนับเป็น
   * "ยังไม่มา" เพราะจะทำให้ตัวเลขดูแย่ทั้งที่ทุกอย่างปกติ
   */
  const expectedToday = counts
    ? counts.PRESENT +
      counts.LATE +
      counts.OFFSITE +
      counts.NOT_CHECKED_IN +
      counts.ABSENT
    : 0;
  const attendanceRate =
    counts && expectedToday > 0
      ? Math.round(
          ((counts.PRESENT + counts.LATE + counts.OFFSITE) / expectedToday) *
            100,
        )
      : 0;

  /*
   * ชิ้นในวงแหวนใช้สีเดียวกับจุดสถานะในรายชื่อ — สีเดียวกันต้องหมายถึงเรื่อง
   * เดียวกันเสมอ ไม่งั้นวงแหวนกับรายการอ่านเป็นคนละภาษา
   *
   * "มาทำงาน" รวมคนที่ทำงานนอกสถานที่ไว้ด้วย เพราะสำหรับหัวหน้ามันคือ
   * "อยู่ในงานแล้ว" เหมือนกัน ต่างกันแค่สถานที่ ซึ่งไปดูได้ที่รายชื่อรายคน
   */
  const otPeople = members.filter((member) => member.otMinutes > 0).length;

  const slices = [
    {
      color: STATUS_COLOR.PRESENT,
      label: 'มาทำงาน',
      value: (counts?.PRESENT ?? 0) + (counts?.OFFSITE ?? 0),
    },
    { color: STATUS_COLOR.LATE, label: 'มาสาย', value: counts?.LATE ?? 0 },
    { color: STATUS_COLOR.LEAVE, label: 'ลา', value: counts?.LEAVE ?? 0 },
    {
      color: 'rgba(87, 96, 122, 0.35)',
      label: 'ยังไม่เข้า',
      value: counts?.NOT_CHECKED_IN ?? 0,
    },
    { color: STATUS_COLOR.ABSENT, label: 'ขาดงาน', value: counts?.ABSENT ?? 0 },
  ].map((slice) => ({ ...slice, text: `${slice.value} คน` }));

  const monthTotals = data?.monthTotals;

  return (
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            Platform.OS === 'web' ? undefined : (
              <RefreshControl
                onRefresh={() => void team.refetch()}
                refreshing={team.isRefetching}
                tintColor={AURORA.textMuted}
              />
            )
          }
          showsVerticalScrollIndicator={false}
        >
          <Reveal>
            <PageHero
              decoration={<PeopleMotif />}
              icon="arrow-left"
              iconLabel="ย้อนกลับ"
              onIconPress={() => router.back()}
              subtitle="เวลาเข้าออกและสถานะของลูกทีมรายวัน"
              title="ทีมของฉัน"
            />
          </Reveal>

          {/* แถบเลือกวัน — ตัวกลางของทั้งแอป (`PeriodBar`) ไม่ใช่ของที่จอนี้
              เขียนเอง อยู่นอกสถานะโหลด/ผิดพลาด เปลี่ยนวันได้แม้วันที่ดูอยู่
              จะโหลดไม่ผ่าน */}
          <Reveal delay={40}>
            <View style={{ paddingHorizontal: gutter, paddingTop: 18 }}>
              <PeriodBar
                backLabel="วันก่อนหน้า"
                canGoNext={!isToday}
                forwardLabel="วันถัดไป"
                label={formatFullDate(date)}
                onPick={() => {
                  setPickerMonth(monthOf(date));
                  setPickerOpen(true);
                }}
                onShift={(delta) =>
                  setDate((current) => shiftDay(current, delta))
                }
                pickLabel="เลือกวัน"
              />
            </View>
          </Reveal>

          {team.isPending ? (
            <View style={{ paddingHorizontal: gutter, paddingTop: 22 }}>
              <SkeletonList rows={6} />
            </View>
          ) : team.isError ? (
            <View
              style={{
                alignItems: 'center',
                gap: 7,
                paddingHorizontal: gutter,
                paddingVertical: 30,
              }}
            >
              <View
                style={{
                  alignItems: 'center',
                  backgroundColor: `${AURORA.rose}1a`,
                  borderRadius: 999,
                  height: 52,
                  justifyContent: 'center',
                  marginBottom: 4,
                  width: 52,
                }}
              >
                <Icon color={AURORA.rose} name="alert-circle" size={23} />
              </View>
              <Text style={{ color: AURORA.text }} variant="bodyStrong">
                ยังโหลดข้อมูลทีมไม่ได้
              </Text>
              <Text
                style={{ color: AURORA.textMuted, textAlign: 'center' }}
                variant="caption"
              >
                {team.error instanceof ApiError
                  ? team.error.message
                  : 'กรุณาลองใหม่อีกครั้ง'}
              </Text>
              <SectionAction
                label={team.isRefetching ? 'กำลังโหลด...' : 'ลองใหม่'}
                onPress={() => void team.refetch()}
              />
            </View>
          ) : data ? (
            <>
              {/*
                สรุปของวันเป็นวงแหวน ไม่ใช่ตัวเลขหกช่อง — หกช่องที่ขนาดเท่ากัน
                บอกแต่ยอดของแต่ละสถานะ แต่ไม่บอกสิ่งที่หัวหน้าดูจริงคือ
                "วันนี้ทีมมากันครบแค่ไหน" ซึ่งเป็นสัดส่วน ไม่ใช่ผลบวก
              */}
              <Reveal delay={70}>
                {/* ไม่มีพื้นสี — จอนี้เป็นผิวขาวผืนเดียว (กติกา "หนึ่งจอ หนึ่งผิว")
                    ฟ้าจางบนขาวอ่านออกมาเป็นเทาและทำให้จอถูกแบ่งเป็นสองโซน */}
                <View
                  style={{
                    gap: 12,
                    paddingHorizontal: gutter,
                    paddingTop: 18,
                  }}
                >
                  {data.holidayName ? (
                    <View
                      style={{
                        alignItems: 'center',
                        flexDirection: 'row',
                        gap: 8,
                      }}
                    >
                      <Icon color={AURORA.sky} name="sun" size={14} />
                      <Text
                        numberOfLines={1}
                        style={{
                          color: AURORA.sky,
                          flex: 1,
                          fontSize: 11.5,
                          fontWeight: '700',
                          lineHeight: 16,
                        }}
                      >
                        {`วันหยุด · ${data.holidayName}`}
                      </Text>
                    </View>
                  ) : null}

                  <View
                    style={{
                      alignItems: 'center',
                      flexDirection: 'row',
                      gap: 14,
                    }}
                  >
                    <DonutChart
                      center={`${attendanceRate}%`}
                      centerLabel="มาแล้ว"
                      size={96}
                      slices={slices}
                    />

                    <View style={{ flex: 1, minWidth: 0 }}>
                      {slices.map((slice, index) => (
                        <View
                          key={slice.label}
                          style={{
                            alignItems: 'center',
                            borderTopColor: AURORA.glassBorder,
                            borderTopWidth: index > 0 ? 1 : 0,
                            flexDirection: 'row',
                            gap: 8,
                            paddingVertical: 5,
                          }}
                        >
                          <View
                            style={{
                              backgroundColor: slice.color,
                              borderRadius: 999,
                              height: 8,
                              opacity: slice.value > 0 ? 1 : 0.35,
                              width: 8,
                            }}
                          />
                          <Text
                            numberOfLines={1}
                            style={{
                              color: AURORA.text,
                              flex: 1,
                              fontSize: 11.5,
                              lineHeight: 16,
                            }}
                          >
                            {slice.label}
                          </Text>
                          <Text
                            maxScale={1.1}
                            style={{
                              color:
                                slice.value > 0
                                  ? AURORA.text
                                  : AURORA.textFaint,
                              fontSize: 11.5,
                              fontVariant: ['tabular-nums'],
                              fontWeight: slice.value > 0 ? '700' : '500',
                              lineHeight: 16,
                            }}
                          >
                            {`${slice.value} คน`}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  {/*
                    โอทีไม่ใช่ชิ้นในวงแหวน เพราะคนทำโอทีก็คือคนที่มาทำงานอยู่แล้ว
                    ถ้าเอาไปเป็นชิ้นหนึ่งของวง ผลรวมจะเกินจำนวนคนจริง — วางเป็น
                    บรรทัดของตัวเองใต้วงแทน
                  */}
                  <View
                    style={{
                      alignItems: 'center',
                      borderTopColor: AURORA.glassBorder,
                      borderTopWidth: 1,
                      flexDirection: 'row',
                      gap: 8,
                      paddingTop: 10,
                    }}
                  >
                    <Icon color={AURORA.accent} name="moon" size={13} />
                    <Text
                      style={{
                        color: AURORA.text,
                        flex: 1,
                        fontSize: 11.5,
                        lineHeight: 16,
                      }}
                    >
                      ทำโอทีวันนี้
                    </Text>
                    <Text
                      maxScale={1.1}
                      style={{
                        color: otPeople > 0 ? AURORA.accent : AURORA.textFaint,
                        fontSize: 11.5,
                        fontVariant: ['tabular-nums'],
                        fontWeight: '700',
                        lineHeight: 16,
                      }}
                    >
                      {`${otPeople} คน`}
                    </Text>
                  </View>

                  <Text
                    style={{
                      color: AURORA.textMuted,
                      fontSize: 10.5,
                      lineHeight: 15,
                    }}
                  >
                    {`คิดจากคนที่ต้องมาทำงานวันนั้น ${expectedToday} คน (ไม่นับคนลา) · ทีมทั้งหมด ${counts?.teamTotal ?? 0} คน`}
                  </Text>
                </View>
              </Reveal>

              <View
                style={{ gap: 26, paddingHorizontal: gutter, paddingTop: 22 }}
              >
                <Reveal delay={100}>
                  <PageSection
                    title={
                      keyword
                        ? 'ผลการค้นหา'
                        : showAll
                          ? 'ลูกทีมทั้งหมด'
                          : 'ต้องตามเรื่อง'
                    }
                    trailing={
                      members.length > 0 ? (
                        <SectionAction
                          label={showAll ? 'เฉพาะที่ต้องตาม' : 'ดูทั้งทีม'}
                          onPress={() => setShowAll((current) => !current)}
                        />
                      ) : undefined
                    }
                  >
                    {/*
                      ช่องดูเวลาเข้างานรายคน — พิมพ์ชื่อหรือรหัสแล้วเห็นเวลา
                      เข้า-ออกของคนนั้นทันที โดยไม่ต้องสลับเป็น "ดูทั้งทีม"
                      แล้วเลื่อนหาเองในทีมยี่สิบคน
                    */}
                    <View style={{ paddingBottom: 4, paddingTop: 2 }}>
                      <Input
                        appearance="aurora"
                        autoCapitalize="none"
                        onChangeText={setSearch}
                        placeholder="ค้นหาชื่อหรือรหัสพนักงาน"
                        returnKeyType="search"
                        value={search}
                      />
                    </View>

                    {visible.length === 0 ? (
                      <View
                        style={{
                          alignItems: 'center',
                          gap: 7,
                          paddingVertical: 24,
                        }}
                      >
                        <View
                          style={{
                            alignItems: 'center',
                            backgroundColor: `${AURORA.emerald}1a`,
                            borderRadius: 999,
                            height: 52,
                            justifyContent: 'center',
                            marginBottom: 4,
                            width: 52,
                          }}
                        >
                          <Icon
                            color={AURORA.emerald}
                            name={members.length === 0 ? 'users' : 'check'}
                            size={23}
                          />
                        </View>
                        <Text
                          style={{ color: AURORA.text }}
                          variant="bodyStrong"
                        >
                          {members.length === 0
                            ? 'ยังไม่มีลูกทีมในระบบ'
                            : keyword
                              ? 'ไม่พบลูกทีมที่ตรงกับคำค้น'
                              : 'วันนี้ไม่มีใครต้องตามเรื่อง'}
                        </Text>
                        <Text
                          style={{
                            color: AURORA.textMuted,
                            textAlign: 'center',
                          }}
                          variant="caption"
                        >
                          {members.length === 0
                            ? 'ติดต่อฝ่ายบุคคลเพื่อผูกลูกทีมกับบัญชีของคุณ'
                            : keyword
                              ? 'ลองพิมพ์ชื่อให้สั้นลงหรือใช้รหัสพนักงาน'
                              : 'กด "ดูทั้งทีม" เพื่อดูเวลาเข้าออกของทุกคน'}
                        </Text>
                      </View>
                    ) : (
                      <View>
                        {visible.map((member, index) => (
                          <MemberRow
                            divider={index > 0}
                            key={member.employeeId ?? String(index)}
                            member={member}
                            onPress={() =>
                              member.employeeId
                                ? router.push(`/team/${member.employeeId}`)
                                : undefined
                            }
                          />
                        ))}
                      </View>
                    )}
                  </PageSection>
                </Reveal>

                {monthTotals ? (
                  <Reveal delay={130}>
                    <PageSection
                      title="สะสมทั้งเดือน"
                      trailing={
                        <Text
                          style={{
                            color: AURORA.accent,
                            fontSize: 11.5,
                            fontVariant: ['tabular-nums'],
                            fontWeight: '700',
                            lineHeight: 16,
                          }}
                        >
                          {`มาทำงาน ${monthTotals.attendanceRate}%`}
                        </Text>
                      }
                    >
                      <View>
                        <MonthLine
                          divider={false}
                          label="วันที่มาสาย"
                          value={`${monthTotals.lateDays} วัน`}
                        />
                        <MonthLine
                          divider
                          label="นาทีสายรวม"
                          value={formatMinutes(monthTotals.lateMinutes)}
                        />
                        <MonthLine
                          divider
                          label="วันขาดงาน"
                          value={`${monthTotals.absentDays} วัน`}
                        />
                        <MonthLine
                          divider
                          label="วันลงเวลาไม่ครบ"
                          value={`${monthTotals.missingDays} วัน`}
                        />
                        <MonthLine
                          divider
                          label="วันลา"
                          value={`${monthTotals.leaveDays} วัน`}
                        />
                        <MonthLine
                          divider
                          label="ชั่วโมงโอที"
                          value={`${monthTotals.otHours} ชม.`}
                        />
                      </View>
                    </PageSection>
                  </Reveal>
                ) : null}
              </View>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>

      <DayPickerSheet
        month={pickerMonth}
        onClose={() => setPickerOpen(false)}
        onMonthChange={setPickerMonth}
        onSelect={(next) => {
          setDate(next);
          setPickerOpen(false);
        }}
        selected={date}
        visible={pickerOpen}
      />
    </View>
  );
}
