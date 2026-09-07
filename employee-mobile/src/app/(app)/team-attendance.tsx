import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';

import {
  Badge,
  Button,
  DateField,
  EmptyState,
  ErrorState,
  Input,
  Screen,
  Sheet,
  SkeletonList,
  Text,
  hitSlop,
  type ToneName,
} from '@/design';
import {
  useTeamAttendance,
  type TeamAttendanceFilters,
  type TeamAttendanceLog,
} from '@/features/team/team-views';
import { ApiError } from '@/lib/api/api-error';
import { useAppTheme } from '@/theme/use-app-theme';
import { thaiTime } from '@/lib/date/thai-date';

/**
 * ประวัติการลงเวลาของทีม
 *
 * เปิดได้สองทาง: จากหน้าทีม (เห็นทั้งทีม) และจากหน้าสมาชิกรายคน (เห็นเฉพาะ
 * คนนั้น ผ่าน employeeId ใน route) — backend เป็นคนกรองขอบเขต ไม่ใช่แอป
 *
 * แสดงเป็น "รายการลงเวลา" ไม่ใช่ "สรุปรายวัน" เพราะสิ่งที่หัวหน้าต้องตรวจคือ
 * รายการที่ผิดปกติ เช่น ลงเวลาจากนอกพื้นที่หรือเวลาที่ดูไม่สมเหตุสมผล
 * ส่วนยอดรวมรายเดือนดูได้จากหน้าทีมอยู่แล้ว
 */

const STATUS_TONE: Record<string, ToneName> = {
  ABSENT: 'danger',
  CANCELLED: 'neutral',
  EARLY_LEAVE: 'warning',
  LATE: 'warning',
  NORMAL: 'success',
};

const STATUS_LABEL: Record<string, string> = {
  ABSENT: 'ขาด',
  CANCELLED: 'ยกเลิก',
  EARLY_LEAVE: 'ออกก่อน',
  LATE: 'สาย',
  NORMAL: 'ปกติ',
};

const LOG_TYPE_LABEL: Record<string, string> = {
  CHECK_IN: 'เข้างาน',
  CHECK_OUT: 'ออกงาน',
};

const CHANNEL_LABEL: Record<string, string> = {
  MOBILE: 'แอปมือถือ',
  MOBILE_APP: 'แอปมือถือ',
  SCANNER: 'เครื่องสแกน',
  WEB: 'เว็บ',
};

const STATUS_FILTERS: { label: string; value: string | undefined }[] = [
  { label: 'ทั้งหมด', value: undefined },
  { label: 'สาย', value: 'LATE' },
  { label: 'ออกก่อน', value: 'EARLY_LEAVE' },
  { label: 'ปกติ', value: 'NORMAL' },
];

const toDateKey = (value: Date | null) => {
  if (!value) return undefined;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const timeText = (value: Date | null | undefined) =>
  value
    ? thaiTime(value)
    : '—';

function LogRow({ log }: { log: TeamAttendanceLog }) {
  const { theme } = useAppTheme();

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        gap: 4,
        padding: theme.spacing.sm,
      }}
    >
      <View
        style={{
          alignItems: 'center',
          flexDirection: 'row',
          gap: theme.spacing.sm,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={1} variant="bodyStrong">
            {log.employeeName ?? 'ไม่ระบุชื่อ'}
          </Text>
          <Text tone="muted" variant="caption">
            {log.workDate} ·{' '}
            {LOG_TYPE_LABEL[log.logType ?? ''] ?? log.logType ?? '—'}{' '}
            {timeText(log.logTime)}
          </Text>
        </View>

        <Badge
          label={STATUS_LABEL[log.status ?? ''] ?? log.status ?? '—'}
          tone={STATUS_TONE[log.status ?? ''] ?? 'neutral'}
        />
      </View>

      <Text tone="subtle" variant="caption">
        {[
          CHANNEL_LABEL[log.channel ?? ''] ?? log.channel,
          log.locationName,
          log.isOffsite ? 'นอกสถานที่' : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>

      {log.note ? (
        <Text tone="subtle" variant="caption">
          หมายเหตุ: {log.note}
        </Text>
      ) : null}
    </View>
  );
}

export default function TeamAttendanceScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ employeeId?: string }>();
  const employeeId =
    typeof params.employeeId === 'string' && params.employeeId
      ? params.employeeId
      : undefined;

  const [filters, setFilters] = useState<TeamAttendanceFilters>({ employeeId });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draftSearch, setDraftSearch] = useState('');
  const [draftStatus, setDraftStatus] = useState<string | undefined>();
  const [draftFrom, setDraftFrom] = useState<Date | null>(null);
  const [draftTo, setDraftTo] = useState<Date | null>(null);

  const history = useTeamAttendance(filters);
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];
  const total = history.data?.pages[0]?.meta.total;

  const activeFilterCount = [
    filters.search,
    filters.status,
    filters.dateFrom || filters.dateTo,
  ].filter(Boolean).length;

  function openFilters() {
    setDraftSearch(filters.search ?? '');
    setDraftStatus(filters.status);
    setDraftFrom(filters.dateFrom ? new Date(`${filters.dateFrom}T12:00:00`) : null);
    setDraftTo(filters.dateTo ? new Date(`${filters.dateTo}T12:00:00`) : null);
    setSheetOpen(true);
  }

  function applyFilters() {
    setFilters((current) => ({
      ...current,
      dateFrom: toDateKey(draftFrom),
      dateTo: toDateKey(draftTo),
      search: draftSearch.trim() || undefined,
      status: draftStatus,
    }));
    setSheetOpen(false);
  }

  return (
    <Screen
      scroll
      scrollProps={{
        onMomentumScrollEnd: () => {
          if (history.hasNextPage && !history.isFetchingNextPage) {
            void history.fetchNextPage();
          }
        },
        refreshControl: (
          <RefreshControl
            onRefresh={() => void history.refetch()}
            refreshing={history.isRefetching}
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
            <Text variant="h1">ประวัติการลงเวลา</Text>
            <Text tone="muted" variant="caption">
              {employeeId ? 'เฉพาะสมาชิกที่เลือก' : 'ทั้งทีม'}
              {typeof total === 'number' ? ` · ${total} รายการ` : ''}
            </Text>
          </View>

          <Pressable
            accessibilityLabel="ตัวกรอง"
            accessibilityRole="button"
            hitSlop={hitSlop}
            onPress={openFilters}
            style={{
              alignItems: 'center',
              backgroundColor:
                activeFilterCount > 0
                  ? theme.colors.primarySoft
                  : theme.colors.surface,
              borderColor:
                activeFilterCount > 0
                  ? theme.colors.primarySoftBorder
                  : theme.colors.border,
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              height: 44,
              justifyContent: 'center',
              width: 44,
            }}
          >
            <Ionicons
              color={
                activeFilterCount > 0 ? theme.colors.primary : theme.colors.text
              }
              name="options-outline"
              size={20}
            />
          </Pressable>
        </View>

        {history.isPending ? (
          <SkeletonList rows={6} />
        ) : history.isError ? (
          <ErrorState
            description={
              history.error instanceof ApiError
                ? history.error.message
                : undefined
            }
            onRetry={() => void history.refetch()}
            retrying={history.isRefetching}
            title="ยังโหลดประวัติไม่ได้"
          />
        ) : items.length === 0 ? (
          <EmptyState
            description={
              activeFilterCount > 0
                ? 'ลองล้างตัวกรองหรือเลือกช่วงวันที่ให้กว้างขึ้น'
                : 'ยังไม่มีรายการลงเวลาของทีมในช่วงนี้'
            }
            icon="time-outline"
            title="ไม่พบรายการ"
          />
        ) : (
          <View style={{ gap: theme.spacing.xs }}>
            {items.map((log) => (
              <LogRow key={log.id} log={log} />
            ))}

            {history.hasNextPage ? (
              <Button
                loading={history.isFetchingNextPage}
                onPress={() => void history.fetchNextPage()}
                title="โหลดเพิ่ม"
                variant="secondary"
              />
            ) : null}
          </View>
        )}
      </View>

      <Sheet onClose={() => setSheetOpen(false)} title="ตัวกรอง" visible={sheetOpen}>
        <View style={{ gap: theme.spacing.md }}>
          <Input
            label="ค้นหา"
            onChangeText={setDraftSearch}
            placeholder="ชื่อหรือรหัสพนักงาน"
            value={draftSearch}
          />

          <View style={{ gap: theme.spacing.xs }}>
            <Text tone="muted" variant="label">
              สถานะ
            </Text>
            <View
              style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}
            >
              {STATUS_FILTERS.map((option) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: draftStatus === option.value }}
                  key={option.label}
                  onPress={() => setDraftStatus(option.value)}
                  style={{
                    backgroundColor:
                      draftStatus === option.value
                        ? theme.colors.primarySoft
                        : theme.colors.surface,
                    borderColor:
                      draftStatus === option.value
                        ? theme.colors.primarySoftBorder
                        : theme.colors.border,
                    borderRadius: theme.radius.pill,
                    borderWidth: 1,
                    paddingHorizontal: theme.spacing.sm,
                    paddingVertical: 6,
                  }}
                >
                  <Text variant="caption">{option.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <DateField
            label="ตั้งแต่วันที่"
            maximumDate={draftTo ?? undefined}
            onChange={setDraftFrom}
            value={draftFrom}
          />
          <DateField
            label="ถึงวันที่"
            minimumDate={draftFrom ?? undefined}
            onChange={setDraftTo}
            value={draftTo}
          />

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button
                onPress={() => {
                  setDraftSearch('');
                  setDraftStatus(undefined);
                  setDraftFrom(null);
                  setDraftTo(null);
                  /* employeeId มาจาก route ไม่ใช่ตัวกรอง จึงต้องคงไว้ */
                  setFilters({ employeeId });
                  setSheetOpen(false);
                }}
                title="ล้างตัวกรอง"
                variant="secondary"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button onPress={applyFilters} title="ใช้ตัวกรอง" />
            </View>
          </View>
        </View>
      </Sheet>
    </Screen>
  );
}
