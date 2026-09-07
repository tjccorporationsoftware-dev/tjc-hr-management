import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Linking, Pressable, RefreshControl, View } from 'react-native';

import {
  Badge,
  Card,
  ErrorState,
  InlineNotice,
  ListRow,
  Screen,
  SkeletonList,
  Text,
  hitSlop,
  type ToneName,
} from '@/design';
import { formatMinutes } from '@/features/attendance/calendar';
import { TEAM_STATUS_LABEL, type TeamStatus } from '@/features/team/team';
import { useTeamMember } from '@/features/team/team-views';
import { ApiError } from '@/lib/api/api-error';
import { useAppTheme } from '@/theme/use-app-theme';
import { thaiDate, thaiTime } from '@/lib/date/thai-date';
import { formatNumber } from '@/lib/format/number';

/**
 * รายละเอียดลูกทีมรายคน
 *
 * จอนี้เปิดจากรายชื่อในหน้าทีม เมื่อหัวหน้าเห็นว่ามีบางอย่างผิดปกติ คำถาม
 * ถัดไปคือ "แล้วต้องทำอะไร" — ช่องทางติดต่อจึงอยู่บนสุดถัดจากสถานะ และกด
 * โทรออก/ส่งอีเมลได้ทันทีโดยไม่ต้องคัดลอกเบอร์ไปแอปอื่น
 *
 * ข้อมูลเงินเดือนไม่มีในจอนี้โดยตั้งใจ หัวหน้ามีสิทธิ์ดูแลเวลาทำงานและ
 * การลา ไม่ได้แปลว่ามีสิทธิ์เห็นค่าจ้างของลูกทีม
 */

const STATUS_TONE: Record<string, ToneName> = {
  ABSENT: 'danger',
  HOLIDAY: 'neutral',
  LATE: 'warning',
  LEAVE: 'primary',
  NOT_CHECKED_IN: 'warning',
  OFFSITE: 'primary',
  PRESENT: 'success',
};

const timeText = (value: Date | null | undefined) =>
  value
    ? thaiTime(value)
    : '—';

const dateText = (value: Date | null | undefined) =>
  value
    ? thaiDate(value, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

function Row({ label, value }: { label: string; value: string }) {
  const { theme } = useAppTheme();

  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
      <Text style={{ flex: 1 }} tone="muted" variant="caption">
        {label}
      </Text>
      <Text style={{ flex: 1.4, textAlign: 'right' }} variant="caption">
        {value}
      </Text>
    </View>
  );
}

/** เทียบเดือนนี้กับเดือนก่อน — บอกทิศทาง ไม่ใช่แค่เลขนิ่ง ๆ */
function Trend({ current, previous }: { current: number; previous: number }) {
  const { theme } = useAppTheme();
  const diff = current - previous;

  if (diff === 0) {
    return (
      <Text tone="subtle" variant="caption">
        เท่าเดือนก่อน
      </Text>
    );
  }

  /* น้อยลง = ดีขึ้น สำหรับทุกตัวเลขในจอนี้ (สาย ขาด เวลาไม่ครบ) */
  const better = diff < 0;

  return (
    <Text
      style={{
        color: better ? theme.colors.success : theme.colors.danger,
      }}
      variant="caption"
    >
      {better ? 'ลดลง' : 'เพิ่มขึ้น'} {Math.abs(Number(diff.toFixed(2)))}
    </Text>
  );
}

export default function TeamMemberScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; month?: string }>();
  const employeeId = typeof params.id === 'string' ? params.id : null;
  const month = typeof params.month === 'string' ? params.month : undefined;

  const member = useTeamMember(employeeId, month);

  return (
    <Screen
      scroll
      scrollProps={{
        refreshControl: (
          <RefreshControl
            onRefresh={() => void member.refetch()}
            refreshing={member.isRefetching}
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
            <Text numberOfLines={1} variant="h1">
              {member.data?.profile.name ?? 'สมาชิกทีม'}
            </Text>
            <Text tone="muted" variant="caption">
              {[
                member.data?.profile.employeeCode,
                member.data?.profile.position,
              ]
                .filter(Boolean)
                .join(' · ') || 'กำลังโหลด...'}
            </Text>
          </View>
        </View>

        {member.isPending ? (
          <SkeletonList rows={6} />
        ) : member.isError ? (
          <ErrorState
            description={
              member.error instanceof ApiError
                ? member.error.message
                : undefined
            }
            onRetry={() => void member.refetch()}
            retrying={member.isRefetching}
            title="ยังเปิดข้อมูลสมาชิกไม่ได้"
          />
        ) : (
          <>
            {member.data.holidayName ? (
              <InlineNotice
                icon="sunny-outline"
                message={`วันนี้เป็นวันหยุด: ${member.data.holidayName}`}
                tone="neutral"
              />
            ) : null}

            {/* ------------------------------------------ วันนี้ */}
            <Card
              action={
                <Badge
                  label={
                    TEAM_STATUS_LABEL[
                      member.data.today.status as TeamStatus
                    ] ?? member.data.today.status
                  }
                  tone={STATUS_TONE[member.data.today.status] ?? 'neutral'}
                />
              }
              title={`สถานะวันนี้ · ${member.data.date ?? ''}`}
            >
              <View style={{ gap: theme.spacing.xs }}>
                <Row
                  label="เข้างาน"
                  value={timeText(
                    member.data.today.morningInAt ??
                      member.data.today.afternoonInAt,
                  )}
                />
                <Row
                  label="ออกงาน"
                  value={timeText(member.data.today.checkOutAt)}
                />
                {member.data.today.lateMinutes > 0 ? (
                  <Row
                    label="สาย"
                    value={formatMinutes(member.data.today.lateMinutes)}
                  />
                ) : null}
                {member.data.today.otMinutes > 0 ? (
                  <Row
                    label="OT ที่อนุมัติแล้ว"
                    value={formatMinutes(member.data.today.otMinutes)}
                  />
                ) : null}
                {member.data.shift ? (
                  <Row
                    label="กะที่มีผล"
                    value={member.data.shift.name ?? 'กะมาตรฐาน'}
                  />
                ) : null}
              </View>

              {member.data.today.isOverdue ? (
                <View style={{ marginTop: theme.spacing.sm }}>
                  <InlineNotice
                    icon="alert-circle-outline"
                    message="เลยเวลาเข้างานตามกะแล้วแต่ยังไม่มีการลงเวลา"
                    tone="warning"
                  />
                </View>
              ) : null}

              {member.data.today.hasMissingLog ? (
                <View style={{ marginTop: theme.spacing.sm }}>
                  <InlineNotice
                    icon="help-circle-outline"
                    message="วันนี้มีเวลาไม่ครบคู่ อาจต้องให้ยื่นขอแก้เวลา"
                    tone="warning"
                  />
                </View>
              ) : null}
            </Card>

            {/* ---------------------------------------- ติดต่อ */}
            <Card title="ติดต่อ">
              {member.data.profile.phone ? (
                <ListRow
                  icon="call-outline"
                  onPress={() =>
                    void Linking.openURL(`tel:${member.data.profile.phone}`)
                  }
                  title={member.data.profile.phone}
                  subtitle="โทรออก"
                />
              ) : null}
              {member.data.profile.email ? (
                <ListRow
                  divider={false}
                  icon="mail-outline"
                  onPress={() =>
                    void Linking.openURL(`mailto:${member.data.profile.email}`)
                  }
                  subtitle="ส่งอีเมล"
                  title={member.data.profile.email}
                />
              ) : null}
              {!member.data.profile.phone && !member.data.profile.email ? (
                <Text tone="muted" variant="caption">
                  ยังไม่มีช่องทางติดต่อในระบบ
                </Text>
              ) : null}
            </Card>

            {/* -------------------------------------- ข้อมูลงาน */}
            <Card title="ข้อมูลงาน">
              <View style={{ gap: theme.spacing.xs }}>
                <Row
                  label="หน่วยงาน"
                  value={member.data.profile.department ?? '—'}
                />
                <Row label="สาขา" value={member.data.profile.branch ?? '—'} />
                <Row
                  label="ประเภทพนักงาน"
                  value={member.data.profile.employeeType ?? '—'}
                />
                <Row
                  label="ผู้บังคับบัญชา"
                  value={member.data.profile.supervisor ?? '—'}
                />
                <Row
                  label="เริ่มงาน"
                  value={dateText(member.data.profile.startDate)}
                />
              </View>
            </Card>

            {/* ------------------------------------ สรุปรายเดือน */}
            <Card title={`สรุปเดือน ${member.data.month ?? ''}`}>
              <View style={{ gap: theme.spacing.sm }}>
                {(
                  [
                    ['มาสาย', 'lateDays', 'วัน'],
                    ['ขาดงาน', 'absentDays', 'วัน'],
                    ['เวลาไม่ครบ', 'missingDays', 'วัน'],
                    ['OT', 'otHours', 'ชม.'],
                  ] as const
                ).map(([label, key, unit]) => (
                  <View
                    key={key}
                    style={{
                      alignItems: 'center',
                      flexDirection: 'row',
                      gap: theme.spacing.sm,
                    }}
                  >
                    <Text style={{ flex: 1 }} tone="muted" variant="caption">
                      {label}
                    </Text>
                    <Text variant="caption">
                      {member.data.monthTotals[key]} {unit}
                    </Text>
                    <View style={{ minWidth: 92, alignItems: 'flex-end' }}>
                      <Trend
                        current={member.data.monthTotals[key]}
                        previous={member.data.previousMonthTotals[key]}
                      />
                    </View>
                  </View>
                ))}

                <Row
                  label="เวลาสายรวม"
                  value={formatMinutes(member.data.monthTotals.lateMinutes)}
                />
                <Row
                  label="วันลาในเดือนนี้"
                  value={`${member.data.monthTotals.leaveDays} วัน`}
                />
              </View>
            </Card>

            {/* -------------------------------- วันลาคงเหลือ */}
            <Card title="วันลาคงเหลือปีนี้">
              {member.data.leaveBalances.length === 0 ? (
                <Text tone="muted" variant="caption">
                  ยังไม่มีการตั้งโควตาวันลาให้พนักงานคนนี้
                </Text>
              ) : (
                <View style={{ gap: theme.spacing.xs }}>
                  {member.data.leaveBalances.map((balance) => (
                    <Row
                      key={balance.leaveTypeId ?? balance.code ?? balance.name}
                      label={balance.name ?? balance.code ?? 'ไม่ระบุประเภท'}
                      value={`เหลือ ${formatNumber(balance.remainingDays)} / ${formatNumber(balance.entitlementDays)} วัน`}
                    />
                  ))}
                </View>
              )}
            </Card>

            {/* ------------------------------------- ทางเข้าต่อ */}
            <Card title="ดูย้อนหลังของคนนี้">
              <ListRow
                icon="time-outline"
                onPress={() =>
                  router.push({
                    params: { employeeId: employeeId ?? '' },
                    pathname: '/team-attendance',
                  })
                }
                subtitle="รายการเข้าออกทั้งหมด"
                title="ประวัติการลงเวลา"
              />
              <ListRow
                divider={false}
                icon="document-text-outline"
                onPress={() =>
                  router.push({
                    params: { employeeId: employeeId ?? '' },
                    pathname: '/team-requests',
                  })
                }
                subtitle={
                  member.data.pendingRequests > 0
                    ? `มี ${member.data.pendingRequests} รายการรออนุมัติ`
                    : 'ใบลา OT แก้เวลา และงานนอกสถานที่'
                }
                title="คำขอที่ยื่นไว้"
              />
            </Card>
          </>
        )}
      </View>
    </Screen>
  );
}
