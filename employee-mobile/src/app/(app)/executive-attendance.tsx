import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, Select, SkeletonList, Text } from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  PageHero,
  PageSection,
  Reveal,
  SectionAction,
  WorkClockMotif,
} from '@/design/aurora';
import {
  useExecutiveAttendanceToday,
  type ExecutiveAttendanceFilters,
  type ExecutiveAttendanceRow,
} from '@/features/executive/executive-views';
import { ApiError } from '@/lib/api/api-error';
import { thaiTime } from '@/lib/date/thai-date';

/**
 * ใครมา ใครลา ใครขาด "วันนี้" รายคน
 *
 * ผิวขาวผืนเดียวชุดเดียวกับจอของพนักงาน (`PageHero` + `PageSection` + `AURORA`)
 * เดิมเป็น `<Screen>` + `<Card>` + สีจากธีม ซึ่งเป็นผิวรุ่นก่อนของแอป
 *
 * ปลายทางของการ drill-down จากจอภาพรวม — ผู้บริหารเห็นว่า "ขาดงาน 3 คน"
 * แล้วต้องกดดูได้ว่าเป็นใคร ไม่ใช่ต้องโทรถาม HR
 *
 * เรียงตามความเร่งด่วนที่ backend จัดมาให้ (ขาด → สาย → เวลาไม่ครบ → ลา →
 * ปกติ) **ห้ามเรียงใหม่ในแอป** เพราะจะทำให้ลำดับบนแอปกับบนเว็บไม่ตรงกัน
 */

/** สีของสถานะ — ชุดเดียวกับที่จอลงเวลาของพนักงานใช้ */
const STATUS_COLOR: Record<string, string> = {
  ABSENT: AURORA.rose,
  LEAVE: AURORA.sky,
  PRESENT: AURORA.emerald,
};

const STATUS_LABEL: Record<string, string> = {
  ABSENT: 'ยังไม่มา',
  LEAVE: 'ลา',
  PRESENT: 'มาแล้ว',
};

const STATUS_FILTERS = [
  { label: 'ทั้งหมด', value: '' },
  { label: 'ยังไม่มา', value: 'ABSENT' },
  { label: 'มาสาย', value: 'LATE' },
  { label: 'เวลาไม่ครบ', value: 'MISSING' },
  { label: 'ลา', value: 'LEAVE' },
  { label: 'มาแล้ว', value: 'PRESENT' },
];

const timeText = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return thaiTime(date);
};

/** ตัวเลขเด่นหนึ่งช่อง — ค่าที่เป็นศูนย์ให้จาง จะได้กวาดตาเจอตัวที่ไม่ศูนย์ */
function StatCell({
  color,
  label,
  value,
}: {
  color?: string;
  label: string;
  value: number;
}) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text
        maxScale={1.15}
        numberOfLines={1}
        style={{ color: AURORA.textFaint, fontSize: 10.5, lineHeight: 14 }}
      >
        {label}
      </Text>
      <Text
        maxScale={1.15}
        numberOfLines={1}
        style={{
          color: value > 0 ? (color ?? AURORA.text) : AURORA.textFaint,
          fontSize: 17,
          fontVariant: ['tabular-nums'],
          fontWeight: '800',
          lineHeight: 22,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

/** หนึ่งพนักงานในรายการ — แถวบนผิวขาว ไม่มีการ์ดครอบ */
function EmployeeRow({
  divider,
  row,
}: {
  divider: boolean;
  row: ExecutiveAttendanceRow;
}) {
  const statusColor = row.late
    ? AURORA.amber
    : (STATUS_COLOR[row.status] ?? AURORA.textFaint);
  const statusLabel = row.late
    ? 'มาสาย'
    : (STATUS_LABEL[row.status] ?? row.status);

  return (
    <View
      style={{
        borderTopColor: AURORA.glassBorder,
        borderTopWidth: divider ? 1 : 0,
        gap: 3,
        paddingVertical: 11,
      }}
    >
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
          {row.name}
        </Text>

        {/* ป้ายสถานะ = จุดกลม + ข้อความสีเดียวกัน ตามกติกาของแอป */}
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 6 }}>
          <View
            style={{
              backgroundColor: statusColor,
              borderRadius: 999,
              height: 5,
              width: 5,
            }}
          />
          <Text
            maxScale={1.1}
            numberOfLines={1}
            style={{
              color: statusColor,
              fontSize: 10.5,
              fontWeight: '700',
              lineHeight: 14,
            }}
          >
            {statusLabel}
          </Text>
        </View>
      </View>

      <Text
        numberOfLines={1}
        style={{ color: AURORA.textMuted, fontSize: 11, lineHeight: 16 }}
      >
        {[row.employeeCode, row.department, row.branch]
          .filter(Boolean)
          .join(' · ')}
      </Text>

      <Text
        style={{
          color: AURORA.textFaint,
          fontSize: 11,
          fontVariant: ['tabular-nums'],
          lineHeight: 16,
        }}
      >
        เข้า {timeText(row.morningInAt)} · ออก {timeText(row.checkOutAt)}
        {row.lateMinutes > 0 ? ` · สาย ${row.lateMinutes} น.` : ''}
        {row.leaveType ? ` · ${row.leaveType}` : ''}
      </Text>

      {row.hasMissingLog ? (
        <Text
          style={{ color: AURORA.amber, fontSize: 11, lineHeight: 16 }}
        >
          ลงเวลาไม่ครบคู่
        </Text>
      ) : null}
    </View>
  );
}

export default function ExecutiveAttendanceScreen() {
  const { gutter } = useResponsive();
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string }>();

  const [filters, setFilters] = useState<ExecutiveAttendanceFilters>({
    status: typeof params.status === 'string' ? params.status : undefined,
  });

  const attendance = useExecutiveAttendanceToday(filters);
  const data = attendance.data;
  const options = data?.filterOptions;

  const toOptions = (
    groups: { id?: string | null; label: string }[] | undefined,
  ) => [
    { label: 'ทั้งหมด', value: '' },
    ...(groups ?? [])
      .filter((group) => group.id)
      .map((group) => ({ label: group.label, value: group.id as string })),
  ];

  return (
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            Platform.OS === 'web' ? undefined : (
              <RefreshControl
                onRefresh={() => void attendance.refetch()}
                refreshing={attendance.isRefetching}
                tintColor={AURORA.textMuted}
              />
            )
          }
          showsVerticalScrollIndicator={false}
        >
          <Reveal>
            <PageHero
              decoration={<WorkClockMotif />}
              icon="arrow-left"
              iconLabel="ย้อนกลับ"
              onIconPress={() => router.back()}
              subtitle={data?.workDate ?? 'กำลังโหลด...'}
              title="เวลาทำงานวันนี้"
            />
          </Reveal>

          {attendance.isPending ? (
            <View style={{ paddingHorizontal: gutter, paddingTop: 24 }}>
              <SkeletonList rows={6} />
            </View>
          ) : attendance.isError ? (
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
                ยังโหลดข้อมูลวันนี้ไม่ได้
              </Text>
              <Text
                style={{ color: AURORA.textMuted, textAlign: 'center' }}
                variant="caption"
              >
                {attendance.error instanceof ApiError
                  ? attendance.error.message
                  : 'กรุณาลองใหม่อีกครั้ง'}
              </Text>
              <SectionAction
                label={attendance.isRefetching ? 'กำลังโหลด...' : 'ลองใหม่'}
                onPress={() => void attendance.refetch()}
              />
            </View>
          ) : data ? (
            <>
              {/* สรุปหกตัวเลขเป็นแถบเต็มความกว้างต่อจากหัวจอ ไม่ใช่การ์ด */}
              <Reveal delay={40}>
                <View
                  style={{
                    backgroundColor: AURORA.accentSoft,
                    borderBottomColor: AURORA.glassBorder,
                    borderBottomWidth: 1,
                    gap: 14,
                    paddingHorizontal: gutter,
                    paddingVertical: 14,
                  }}
                >
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <StatCell
                      color={AURORA.emerald}
                      label="มาแล้ว"
                      value={data.summary.present}
                    />
                    <StatCell
                      color={AURORA.amber}
                      label="มาสาย"
                      value={data.summary.late}
                    />
                    <StatCell
                      color={AURORA.rose}
                      label="ยังไม่มา"
                      value={data.summary.absent}
                    />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <StatCell
                      color={AURORA.sky}
                      label="ลา"
                      value={data.summary.leave}
                    />
                    <StatCell
                      color={AURORA.rose}
                      label="เวลาไม่ครบ"
                      value={data.summary.missingLog}
                    />
                    <StatCell label="ทั้งหมด" value={data.summary.total} />
                  </View>
                </View>
              </Reveal>

              <View style={{ gap: 28, paddingHorizontal: gutter, paddingTop: 24 }}>
                <Reveal delay={70}>
                  <PageSection title="ตัวกรอง">
                    <View style={{ gap: 12, paddingTop: 2 }}>
                      <Select
                        appearance="aurora"
                        label="สถานะ"
                        mode="inline"
                        onChange={(value) =>
                          setFilters((current) => ({
                            ...current,
                            status: value || undefined,
                          }))
                        }
                        options={STATUS_FILTERS}
                        value={filters.status ?? ''}
                      />
                      <Select
                        appearance="aurora"
                        label="บริษัทในเครือ"
                        mode="inline"
                        onChange={(value) =>
                          setFilters((current) => ({
                            ...current,
                            branchId: value || undefined,
                          }))
                        }
                        options={toOptions(options?.branches)}
                        value={filters.branchId ?? ''}
                      />
                      <Select
                        appearance="aurora"
                        label="แผนก"
                        mode="inline"
                        onChange={(value) =>
                          setFilters((current) => ({
                            ...current,
                            departmentId: value || undefined,
                          }))
                        }
                        options={toOptions(options?.departments)}
                        value={filters.departmentId ?? ''}
                      />
                    </View>
                  </PageSection>
                </Reveal>

                {data.byDepartment.length > 0 ? (
                  <Reveal delay={100}>
                    <PageSection title="แยกรายแผนก">
                      <View>
                        {data.byDepartment.map((row, index) => (
                          <Pressable
                            accessibilityRole="button"
                            key={row.id ?? row.label}
                            onPress={() =>
                              setFilters((current) => ({
                                ...current,
                                departmentId: row.id ?? undefined,
                              }))
                            }
                            style={({ pressed }) => ({
                              alignItems: 'center',
                              backgroundColor: pressed
                                ? 'rgba(37, 99, 235, 0.06)'
                                : 'transparent',
                              borderTopColor: AURORA.glassBorder,
                              borderTopWidth: index > 0 ? 1 : 0,
                              flexDirection: 'row',
                              gap: 12,
                              marginHorizontal: -4,
                              paddingHorizontal: 4,
                              paddingVertical: 10,
                            })}
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
                              {row.label}
                            </Text>
                            <Text
                              style={{
                                color: AURORA.textMuted,
                                fontSize: 11,
                                fontVariant: ['tabular-nums'],
                                lineHeight: 16,
                              }}
                            >
                              มา {row.present} · สาย {row.late} · ขาด{' '}
                              {row.absent}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </PageSection>
                  </Reveal>
                ) : null}

                <Reveal delay={130}>
                  <PageSection
                    title="รายคน"
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
                        {data.rows.length} คน
                      </Text>
                    }
                  >
                    {data.rows.length === 0 ? (
                      <View
                        style={{
                          alignItems: 'center',
                          gap: 7,
                          paddingVertical: 26,
                        }}
                      >
                        <View
                          style={{
                            alignItems: 'center',
                            backgroundColor: AURORA.accentSoft,
                            borderRadius: 999,
                            height: 52,
                            justifyContent: 'center',
                            marginBottom: 4,
                            width: 52,
                          }}
                        >
                          <Icon
                            color={AURORA.accent}
                            name="users"
                            size={23}
                          />
                        </View>
                        <Text
                          style={{ color: AURORA.text }}
                          variant="bodyStrong"
                        >
                          ไม่พบพนักงานตามเงื่อนไขนี้
                        </Text>
                        <Text
                          style={{
                            color: AURORA.textMuted,
                            textAlign: 'center',
                          }}
                          variant="caption"
                        >
                          ลองเปลี่ยนตัวกรองแล้วดูใหม่
                        </Text>
                      </View>
                    ) : (
                      <View>
                        {data.rows.map((row, index) => (
                          <EmployeeRow
                            divider={index > 0}
                            key={row.id}
                            row={row}
                          />
                        ))}
                      </View>
                    )}
                  </PageSection>
                </Reveal>
              </View>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
