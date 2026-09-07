import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';

import {
  Card,
  EmptyState,
  ErrorState,
  ListRow,
  MonthSwitcher,
  Screen,
  SkeletonList,
  Text,
  hitSlop,
} from '@/design';
import {
  WEEKDAY_LABELS,
  formatMonthLabel,
  monthOf,
  shiftMonth,
  todayKey,
} from '@/features/attendance/calendar';
import {
  useTeamCalendar,
  type TeamCalendarDay,
} from '@/features/team/team-views';
import { ApiError } from '@/lib/api/api-error';
import { useAppTheme } from '@/theme/use-app-theme';

/**
 * ปฏิทินทีมรายเดือน
 *
 * ตอบคำถามเดียวคือ "วันไหนคนหายเยอะ" — จึงระบายสีตามจำนวนคนที่ไม่อยู่
 * ไม่ใช่แสดงชื่อทุกคนในช่อง ซึ่งบนจอมือถือจะเล็กจนอ่านไม่ออกอยู่ดี
 * รายชื่อจริงอยู่ในแผงด้านล่างเมื่อแตะเลือกวัน
 *
 * ใช้ days ที่ backend ส่งมาตรง ๆ (มีครบทุกวันของเดือน) แล้วเติมช่องว่าง
 * หน้าสัปดาห์แรกจาก weekday ของวันที่ 1 — ไม่คำนวณปฏิทินเองในแอป
 */

function DayCell({
  day,
  isSelected,
  isToday,
  onPress,
}: {
  day: TeamCalendarDay;
  isSelected: boolean;
  isToday: boolean;
  onPress: () => void;
}) {
  const { theme } = useAppTheme();
  const dayOfMonth = day.date ? Number(day.date.slice(8, 10)) : null;

  /*
   * ความเข้มบอกจำนวนคนที่ไม่อยู่ — หนึ่งคนกับห้าคนต้องแยกออกจากกันได้ตั้งแต่
   * มองผ่าน ๆ ไม่ต้องอ่านตัวเลข
   */
  const intensity =
    day.awayTotal === 0 ? 0 : day.awayTotal <= 1 ? 1 : day.awayTotal <= 3 ? 2 : 3;

  const background = day.isHoliday
    ? theme.colors.surfaceAlt
    : intensity === 0
      ? theme.colors.surface
      : intensity === 1
        ? theme.colors.primarySoft
        : intensity === 2
          ? theme.colors.warningSoft
          : theme.colors.dangerSoft;

  return (
    <Pressable
      accessibilityLabel={`วันที่ ${dayOfMonth ?? ''} ไม่อยู่ ${day.awayTotal} คน`}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      onPress={onPress}
      style={{
        alignItems: 'center',
        backgroundColor: background,
        borderColor: isSelected
          ? theme.colors.primary
          : isToday
            ? theme.colors.border
            : 'transparent',
        borderRadius: theme.radius.sm,
        borderWidth: isSelected ? 2 : isToday ? 1 : 0,
        flex: 1,
        gap: 1,
        paddingVertical: 6,
      }}
    >
      <Text maxScale={1} variant="caption">
        {dayOfMonth ?? ''}
      </Text>
      {day.awayTotal > 0 ? (
        <Text maxScale={1} style={{ fontSize: 10 }} tone="muted">
          {day.awayTotal}
        </Text>
      ) : (
        <Text maxScale={1} style={{ fontSize: 10 }} tone="subtle">
          {day.isHoliday ? 'หยุด' : '·'}
        </Text>
      )}
    </Pressable>
  );
}

export default function TeamCalendarScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ month?: string }>();

  const currentMonth = monthOf(todayKey());
  const [month, setMonth] = useState(
    typeof params.month === 'string' ? params.month : currentMonth,
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const calendar = useTeamCalendar(month);
  const days = calendar.data?.days ?? [];
  const selected = days.find((day) => day.date === selectedDate) ?? null;

  /* ช่องว่างก่อนวันที่ 1 ให้คอลัมน์ตรงกับหัวข้อวันในสัปดาห์ */
  const leadingBlanks = days[0]?.weekday ?? 0;
  const cells: (TeamCalendarDay | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...days,
  ];

  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (TeamCalendarDay | null)[][] = [];

  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  const busiest = [...days]
    .filter((day) => day.awayTotal > 0)
    .sort((left, right) => right.awayTotal - left.awayTotal)
    .slice(0, 3);

  return (
    <Screen
      scroll
      scrollProps={{
        refreshControl: (
          <RefreshControl
            onRefresh={() => void calendar.refetch()}
            refreshing={calendar.isRefetching}
            tintColor={theme.colors.primary}
          />
        ),
      }}
    >
      <View style={{ gap: theme.spacing.lg }}>
        <View
          style={{
            alignItems: 'center',
            flexDirection: 'row',
            gap: theme.spacing.sm,
          }}
        >
          <Pressable
            accessibilityLabel="ย้อนกลับ"
            accessibilityRole="button"
            hitSlop={hitSlop}
            onPress={() => router.back()}
            style={{
              alignItems: 'center',
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              height: 44,
              justifyContent: 'center',
              width: 44,
            }}
          >
            <Ionicons color={theme.colors.text} name="chevron-back" size={22} />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text variant="h1">ปฏิทินทีม</Text>
            <Text tone="muted" variant="caption">
              ทีม {calendar.data?.teamTotal ?? 0} คน
            </Text>
          </View>
        </View>

        <MonthSwitcher
          canGoNext={shiftMonth(month, 1) <= currentMonth}
          label={formatMonthLabel(month)}
          onShiftMonth={(delta) => {
            setMonth(shiftMonth(month, delta));
            setSelectedDate(null);
          }}
        />

        {calendar.isPending ? (
          <SkeletonList rows={6} />
        ) : calendar.isError ? (
          <ErrorState
            description={
              calendar.error instanceof ApiError
                ? calendar.error.message
                : undefined
            }
            onRetry={() => void calendar.refetch()}
            retrying={calendar.isRefetching}
            title="ยังเปิดปฏิทินทีมไม่ได้"
          />
        ) : days.length === 0 ? (
          <EmptyState
            description="หัวหน้าคนนี้ยังไม่มีลูกทีมในระบบ"
            icon="people-outline"
            title="ไม่มีลูกทีม"
          />
        ) : (
          <>
            <Card title="ภาพรวมทั้งเดือน">
              <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                {WEEKDAY_LABELS.map((label) => (
                  <Text
                    key={label}
                    maxScale={1}
                    style={{ flex: 1, textAlign: 'center' }}
                    tone="muted"
                    variant="caption"
                  >
                    {label}
                  </Text>
                ))}
              </View>

              <View style={{ gap: 4 }}>
                {weeks.map((week, weekIndex) => (
                  <View
                    key={`week-${weekIndex}`}
                    style={{ flexDirection: 'row', gap: 4 }}
                  >
                    {week.map((day, dayIndex) =>
                      day ? (
                        <DayCell
                          day={day}
                          isSelected={day.date === selectedDate}
                          isToday={day.date === todayKey()}
                          key={day.date ?? `cell-${dayIndex}`}
                          onPress={() =>
                            setSelectedDate(
                              day.date === selectedDate
                                ? null
                                : (day.date ?? null),
                            )
                          }
                        />
                      ) : (
                        <View
                          key={`blank-${weekIndex}-${dayIndex}`}
                          style={{ flex: 1 }}
                        />
                      ),
                    )}
                  </View>
                ))}
              </View>

              <Text
                style={{ marginTop: theme.spacing.sm }}
                tone="subtle"
                variant="caption"
              >
                ตัวเลขในช่องคือจำนวนคนที่ลาหรืออยู่นอกสถานที่วันนั้น
              </Text>
            </Card>

            {selected ? (
              <Card
                title={`วันที่ ${selected.date} · ไม่อยู่ ${selected.awayTotal} คน`}
              >
                {selected.isHoliday ? (
                  <Text tone="muted" variant="caption">
                    {selected.holidayName || 'วันหยุดบริษัท'}
                  </Text>
                ) : null}

                {selected.leaves.length === 0 &&
                selected.offsites.length === 0 ? (
                  <Text tone="muted" variant="caption">
                    วันนี้ทีมอยู่ครบ
                  </Text>
                ) : (
                  <View>
                    {selected.leaves.map((leave, index) => (
                      <ListRow
                        divider={
                          index < selected.leaves.length - 1 ||
                          selected.offsites.length > 0
                        }
                        icon="sunny-outline"
                        key={`leave-${leave.employeeId}-${index}`}
                        onPress={
                          leave.employeeId
                            ? () =>
                                router.push({
                                  params: { id: leave.employeeId as string },
                                  pathname: '/team/[id]',
                                })
                            : undefined
                        }
                        subtitle={
                          leave.status === 'SUBMITTED'
                            ? `${leave.leaveType ?? 'ลา'} · รออนุมัติ`
                            : (leave.leaveType ?? 'ลา')
                        }
                        title={leave.name ?? 'ไม่ระบุชื่อ'}
                      />
                    ))}

                    {selected.offsites.map((offsite, index) => (
                      <ListRow
                        divider={index < selected.offsites.length - 1}
                        icon="navigate-outline"
                        key={`offsite-${offsite.employeeId}-${index}`}
                        onPress={
                          offsite.employeeId
                            ? () =>
                                router.push({
                                  params: { id: offsite.employeeId as string },
                                  pathname: '/team/[id]',
                                })
                            : undefined
                        }
                        subtitle={offsite.locationName ?? 'ทำงานนอกสถานที่'}
                        title={offsite.name ?? 'ไม่ระบุชื่อ'}
                      />
                    ))}
                  </View>
                )}
              </Card>
            ) : busiest.length > 0 ? (
              <Card title="วันที่คนหายมากที่สุด">
                {busiest.map((day, index) => (
                  <ListRow
                    divider={index < busiest.length - 1}
                    icon="calendar-outline"
                    key={day.date ?? index}
                    onPress={() => setSelectedDate(day.date ?? null)}
                    title={day.date ?? '—'}
                    value={`${day.awayTotal} คน`}
                  />
                ))}
              </Card>
            ) : null}
          </>
        )}
      </View>
    </Screen>
  );
}
