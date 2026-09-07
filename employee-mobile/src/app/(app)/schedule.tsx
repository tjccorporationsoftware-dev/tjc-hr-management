import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';

import {
  Badge,
  Card,
  ErrorState,
  InlineNotice,
  ListRow,
  MonthSwitcher,
  Screen,
  Sheet,
  SkeletonList,
  Text,
  type ToneName,
} from '@/design';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import type { RequestType } from '@/features/requests/requests.types';
import { useSchedule } from '@/features/schedule/use-schedule';
import type { ScheduleDay } from '@/features/schedule/schedule.types';
import { ApiError } from '@/lib/api/api-error';
import { useAppTheme } from '@/theme/use-app-theme';
import { thaiDate, thaiTime } from '@/lib/date/thai-date';

const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

const TYPE_DOT: Record<string, 'primary' | 'success' | 'warning' | 'danger'> = {
  ATTENDANCE: 'success',
  LEAVE: 'danger',
  OFFSITE: 'primary',
  OVERTIME: 'warning',
  TIME_ADJUST: 'primary',
};

const STATUS_TONE: Record<string, ToneName> = {
  APPROVED: 'success',
  CANCELLED: 'neutral',
  DRAFT: 'neutral',
  HR_APPROVED: 'success',
  HR_REJECTED: 'danger',
  MANAGER_APPROVED: 'primary',
  MANAGER_REJECTED: 'danger',
  REJECTED: 'danger',
  SUBMITTED: 'warning',
};

const STATUS_LABEL: Record<string, string> = {
  APPROVED: 'อนุมัติแล้ว',
  CANCELLED: 'ยกเลิก',
  DRAFT: 'ฉบับร่าง',
  HR_APPROVED: 'HR อนุมัติแล้ว',
  HR_REJECTED: 'HR ปฏิเสธ',
  MANAGER_APPROVED: 'หัวหน้าอนุมัติแล้ว',
  MANAGER_REJECTED: 'หัวหน้าปฏิเสธ',
  REJECTED: 'ปฏิเสธ',
  SUBMITTED: 'รออนุมัติ',
};

function changeMonth(year: number, month: number, delta: number) {
  const date = new Date(year, month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function monthTitle(year: number, month: number) {
  return thaiDate(new Date(year, month - 1, 1), {
    month: 'long',
    year: 'numeric',
  });
}

function timeText(value: Date) {
  return thaiTime(value);
}

function RequestStatus({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  return (
    <Badge
      label={STATUS_LABEL[status] ?? status}
      tone={STATUS_TONE[status] ?? 'neutral'}
    />
  );
}

export default function ScheduleScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const bootstrap = useBootstrap();
  const canView = bootstrap.data?.featureFlags.schedule ?? false;
  const now = new Date();
  const [cursor, setCursor] = useState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });
  const [selectedDay, setSelectedDay] = useState<ScheduleDay | null>(null);
  const schedule = useSchedule(canView, cursor.year, cursor.month);

  const leading = useMemo(
    () => new Date(cursor.year, cursor.month - 1, 1).getDay(),
    [cursor.month, cursor.year],
  );

  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  function openRequest(type: RequestType, id: string) {
    setSelectedDay(null);
    router.push({
      params: { id, type },
      pathname: '/request/[type]/[id]',
    });
  }

  return (
    <Screen
      scroll
      scrollProps={{
        refreshControl: (
          <RefreshControl
            onRefresh={() => void schedule.refetch()}
            refreshing={schedule.isRefetching}
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
            onPress={() => router.back()}
            style={{
              alignItems: 'center',
              borderColor: theme.colors.border,
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              height: 44,
              justifyContent: 'center',
              width: 44,
            }}
          >
            <Ionicons color={theme.colors.text} name="arrow-back" size={20} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text variant="h1">ตารางงาน</Text>
            <Text tone="muted">กะ วันหยุด การลงเวลา และคำขอของคุณ</Text>
          </View>
        </View>

        {!canView ? (
          <InlineNotice
            icon="lock-closed-outline"
            message="บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งานตารางงาน"
          />
        ) : (
          <>
            {/*
              แถบเลือกเดือนชุดเดียวกับทั้งแอป ไม่ใช่ลูกศรสองอันในการ์ดที่ถูกดัน
              ไปติดขอบซ้าย-ขวาสุด ซึ่งอ่านเป็นของสามชิ้นบนบรรทัดเดียวกัน

              ตารางงานยังไม่จำกัดเดือนข้างหน้า (ดูล่วงหน้าได้) `canGoNext` จึง
              เปิดไว้เสมอ ต่างจากจอที่อ่านข้อมูลย้อนหลังอย่างเดียว
            */}
            <MonthSwitcher
              canGoNext
              label={monthTitle(cursor.year, cursor.month)}
              onShiftMonth={(delta) =>
                setCursor(changeMonth(cursor.year, cursor.month, delta))
              }
            />

            {schedule.isPending ? (
              <SkeletonList rows={5} />
            ) : schedule.isError ? (
              <ErrorState
                description={
                  schedule.error instanceof ApiError
                    ? schedule.error.message
                    : undefined
                }
                onRetry={() => void schedule.refetch()}
                retrying={schedule.isRefetching}
              />
            ) : schedule.data ? (
              <>
                <Card>
                  <View style={{ flexDirection: 'row' }}>
                    {WEEKDAYS.map((weekday) => (
                      <View key={weekday} style={{ alignItems: 'center', width: '14.2857%' }}>
                        <Text tone="subtle" variant="caption">
                          {weekday}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {Array.from({ length: leading }, (_, index) => (
                      <View key={`blank-${index}`} style={{ width: '14.2857%', aspectRatio: 0.9 }} />
                    ))}

                    {schedule.data.days.map((day) => {
                      const isToday = day.date === todayKey;
                      const dots = Object.keys(TYPE_DOT).filter((type) =>
                        day.types.includes(type),
                      );

                      return (
                        <Pressable
                          accessibilityLabel={`${day.dayName} ${day.dayOfMonth}${day.holidayName ? ` ${day.holidayName}` : ''}`}
                          accessibilityRole="button"
                          key={day.date}
                          onPress={() => setSelectedDay(day)}
                          style={({ pressed }) => ({
                            alignItems: 'center',
                            aspectRatio: 0.9,
                            backgroundColor: pressed
                              ? theme.colors.surfaceAlt
                              : isToday
                                ? theme.colors.primarySoft
                                : day.isHoliday || day.isWeekend
                                  ? theme.colors.surfaceAlt
                                  : theme.colors.surface,
                            borderColor: isToday
                              ? theme.colors.primary
                              : theme.colors.border,
                            borderRadius: theme.radius.sm,
                            borderWidth: isToday ? 1.5 : 0,
                            justifyContent: 'center',
                            padding: 2,
                            width: '14.2857%',
                          })}
                        >
                          <Text
                            tone={day.isHoliday ? 'danger' : day.isWeekend ? 'muted' : 'default'}
                            variant={isToday ? 'bodyStrong' : 'body'}
                          >
                            {day.dayOfMonth}
                          </Text>
                          <View
                            style={{
                              flexDirection: 'row',
                              gap: 2,
                              height: 6,
                              marginTop: 3,
                            }}
                          >
                            {dots.slice(0, 4).map((type) => {
                              const tone = TYPE_DOT[type];
                              const color =
                                tone === 'success'
                                  ? theme.colors.success
                                  : tone === 'warning'
                                    ? theme.colors.warning
                                    : tone === 'danger'
                                      ? theme.colors.danger
                                      : theme.colors.primary;
                              return (
                                <View
                                  key={type}
                                  style={{
                                    backgroundColor: color,
                                    borderRadius: theme.radius.pill,
                                    height: 5,
                                    width: 5,
                                  }}
                                />
                              );
                            })}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </Card>

                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: theme.spacing.xs,
                  }}
                >
                  <Badge label={`มาทำงาน ${schedule.data.summary.attendanceDays} วัน`} tone="success" />
                  <Badge label={`ลา ${schedule.data.summary.leaveDays} วัน`} tone="danger" />
                  <Badge label={`OT ${schedule.data.summary.overtimeDays} วัน`} tone="warning" />
                  <Badge label={`นอกสถานที่ ${schedule.data.summary.offsiteDays} วัน`} tone="primary" />
                </View>

                {schedule.data.warning ? (
                  <InlineNotice message={schedule.data.warning} tone="neutral" />
                ) : null}
              </>
            ) : null}
          </>
        )}
      </View>

      <Sheet
        onClose={() => setSelectedDay(null)}
        title={
          selectedDay
            ? `${selectedDay.dayName} ${selectedDay.dayOfMonth} ${monthTitle(cursor.year, cursor.month)}`
            : 'รายละเอียด'
        }
        visible={Boolean(selectedDay)}
      >
        {selectedDay ? (
          <View style={{ gap: theme.spacing.sm }}>
            {selectedDay.isHoliday ? (
              <InlineNotice
                icon="calendar-outline"
                message={selectedDay.holidayName || 'วันหยุดบริษัท'}
                tone="warning"
              />
            ) : null}

            <Card title="กะการทำงาน">
              <Text variant="bodyStrong">
                {selectedDay.shift?.name || 'กะมาตรฐานระบบ'}
              </Text>
              <Text tone="muted" variant="caption">
                เข้า {selectedDay.shift?.morningCheckInDeadline ?? '—'} · รอบบ่าย{' '}
                {selectedDay.shift?.afternoonCheckInDeadline ?? '—'} · ออกได้ตั้งแต่{' '}
                {selectedDay.shift?.checkoutAllowedFrom ?? '—'}
              </Text>
            </Card>

            {selectedDay.attendanceLogs.length > 0 ? (
              <Card flush title="การลงเวลา">
                {selectedDay.attendanceLogs.map((log, index) => (
                  <ListRow
                    divider={index < selectedDay.attendanceLogs.length - 1}
                    icon={log.logType === 'CHECK_OUT' ? 'log-out-outline' : 'log-in-outline'}
                    key={log.id}
                    subtitle={log.locationName || log.deviceName || undefined}
                    title={`${log.logType === 'CHECK_OUT' ? 'ออกงาน' : 'เข้างาน'} ${timeText(log.logTime)}`}
                    value={log.status ?? undefined}
                  />
                ))}
              </Card>
            ) : null}

            {selectedDay.leaveRequests.length > 0 ? (
              <Card flush title="การลา">
                {selectedDay.leaveRequests.map((item, index) => (
                  <ListRow
                    divider={index < selectedDay.leaveRequests.length - 1}
                    icon="calendar-outline"
                    key={item.id}
                    onPress={() => openRequest('LEAVE', item.id)}
                    subtitle={item.reason ?? undefined}
                    title={item.leaveTypeName || 'คำขอลา'}
                    right={<RequestStatus status={item.status} />}
                  />
                ))}
              </Card>
            ) : null}

            {selectedDay.overtimeRequests.length > 0 ? (
              <Card flush title="ล่วงเวลา">
                {selectedDay.overtimeRequests.map((item, index) => (
                  <ListRow
                    divider={index < selectedDay.overtimeRequests.length - 1}
                    icon="flash-outline"
                    key={item.id}
                    onPress={() => openRequest('OVERTIME', item.id)}
                    subtitle={item.requestedHours > 0 ? `${item.requestedHours} ชั่วโมง` : undefined}
                    title={item.requestNo || 'คำขอ OT'}
                    right={<RequestStatus status={item.status} />}
                  />
                ))}
              </Card>
            ) : null}

            {selectedDay.offsiteRequests.length > 0 ? (
              <Card flush title="นอกสถานที่">
                {selectedDay.offsiteRequests.map((item, index) => (
                  <ListRow
                    divider={index < selectedDay.offsiteRequests.length - 1}
                    icon="navigate-outline"
                    key={item.id}
                    onPress={() => openRequest('OFFSITE', item.id)}
                    subtitle={item.reason ?? undefined}
                    title={item.locationName || item.requestNo || 'ทำงานนอกสถานที่'}
                    right={<RequestStatus status={item.status} />}
                  />
                ))}
              </Card>
            ) : null}

            {selectedDay.timeAdjustRequests.length > 0 ? (
              <Card flush title="ปรับเวลา">
                {selectedDay.timeAdjustRequests.map((item, index) => (
                  <ListRow
                    divider={index < selectedDay.timeAdjustRequests.length - 1}
                    icon="time-outline"
                    key={item.id}
                    onPress={() => openRequest('TIME_ADJUST', item.id)}
                    subtitle={item.reason ?? undefined}
                    title={item.requestNo || 'คำขอปรับเวลา'}
                    right={<RequestStatus status={item.status} />}
                  />
                ))}
              </Card>
            ) : null}

            {selectedDay.attendanceLogs.length === 0 &&
            selectedDay.leaveRequests.length === 0 &&
            selectedDay.overtimeRequests.length === 0 &&
            selectedDay.offsiteRequests.length === 0 &&
            selectedDay.timeAdjustRequests.length === 0 ? (
              <InlineNotice message="วันนี้ไม่มีรายการอื่น" tone="neutral" />
            ) : null}
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}
