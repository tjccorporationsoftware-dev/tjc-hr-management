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
  REQUEST_STATUS_LABEL,
  REQUEST_TYPE_LABEL,
  type RequestType,
} from '@/features/requests/requests.types';
import {
  useTeamRequests,
  type TeamRequestFilters,
  type TeamRequestItem,
} from '@/features/team/team-views';
import { ApiError } from '@/lib/api/api-error';
import { useAppTheme } from '@/theme/use-app-theme';

/**
 * คำขอของทีมทุกประเภทในรายการเดียว
 *
 * ต่างจากกล่อง "รออนุมัติ" ตรงที่จอนี้เห็นทุกสถานะ รวมถึงใบที่อนุมัติไปแล้ว
 * และใบที่ยังเป็นฉบับร่างของลูกทีม — ใช้ตอบคำถามย้อนหลังแบบ "เดือนที่แล้ว
 * คนนี้ลาไปกี่ครั้ง" ซึ่งกล่องรออนุมัติตอบไม่ได้เพราะใบหายไปหลังกดอนุมัติ
 *
 * จอนี้ **ดูอย่างเดียว ไม่มีปุ่มอนุมัติ** การอนุมัติมีที่ทางของมันอยู่แล้วและ
 * ต้องผ่านจอที่แสดงไฟล์แนบกับ timeline ครบก่อนตัดสินใจ
 */

const TYPE_ICON: Record<RequestType, keyof typeof Ionicons.glyphMap> = {
  LEAVE: 'sunny-outline',
  OFFSITE: 'navigate-outline',
  OVERTIME: 'moon-outline',
  TIME_ADJUST: 'time-outline',
};

const STATUS_TONE: Record<string, ToneName> = {
  APPROVED: 'success',
  CANCELLED: 'neutral',
  DRAFT: 'neutral',
  MANAGER_APPROVED: 'success',
  REJECTED: 'danger',
  RETURNED: 'warning',
  SUBMITTED: 'warning',
};

const TYPE_FILTERS: { label: string; value: RequestType | undefined }[] = [
  { label: 'ทั้งหมด', value: undefined },
  { label: 'ลา', value: 'LEAVE' },
  { label: 'OT', value: 'OVERTIME' },
  { label: 'แก้เวลา', value: 'TIME_ADJUST' },
  { label: 'นอกสถานที่', value: 'OFFSITE' },
];

const STATUS_FILTERS: { label: string; value: string | undefined }[] = [
  { label: 'ทุกสถานะ', value: undefined },
  { label: 'รออนุมัติ', value: 'SUBMITTED' },
  { label: 'อนุมัติแล้ว', value: 'APPROVED' },
  { label: 'ไม่อนุมัติ', value: 'REJECTED' },
];

const toDateKey = (value: Date | null) => {
  if (!value) return undefined;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function Chip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  const { theme } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        backgroundColor: active ? theme.colors.primarySoft : theme.colors.surface,
        borderColor: active
          ? theme.colors.primarySoftBorder
          : theme.colors.border,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 6,
      }}
    >
      <Text variant="caption">{label}</Text>
    </Pressable>
  );
}

function RequestRow({
  item,
  onPress,
}: {
  item: TeamRequestItem;
  onPress?: () => void;
}) {
  const { theme } = useAppTheme();

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        flexDirection: 'row',
        gap: theme.spacing.sm,
        opacity: pressed ? 0.7 : 1,
        padding: theme.spacing.sm,
      })}
    >
      <View
        style={{
          alignItems: 'center',
          backgroundColor: theme.colors.primarySoft,
          borderRadius: theme.radius.sm,
          height: 36,
          justifyContent: 'center',
          width: 36,
        }}
      >
        <Ionicons
          color={theme.colors.primary}
          name={TYPE_ICON[item.type]}
          size={18}
        />
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <View
          style={{
            alignItems: 'center',
            flexDirection: 'row',
            gap: theme.spacing.xs,
          }}
        >
          <Text numberOfLines={1} style={{ flex: 1 }} variant="bodyStrong">
            {item.employeeName ?? 'ไม่ระบุชื่อ'}
          </Text>
          <Badge
            label={REQUEST_STATUS_LABEL[item.status] ?? item.status}
            tone={STATUS_TONE[item.status] ?? 'neutral'}
          />
        </View>

        <Text tone="muted" variant="caption">
          {REQUEST_TYPE_LABEL[item.type]} · {item.title}
          {item.amountLabel ? ` · ${item.amountLabel}` : ''}
        </Text>

        {item.rangeLabel ? (
          <Text tone="subtle" variant="caption">
            {item.rangeLabel}
          </Text>
        ) : null}

        {item.reason ? (
          <Text numberOfLines={2} tone="subtle" variant="caption">
            {item.reason}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function TeamRequestsScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ employeeId?: string }>();
  const employeeId =
    typeof params.employeeId === 'string' && params.employeeId
      ? params.employeeId
      : undefined;

  const [filters, setFilters] = useState<TeamRequestFilters>({ employeeId });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draftSearch, setDraftSearch] = useState('');
  const [draftStatus, setDraftStatus] = useState<string | undefined>();
  const [draftFrom, setDraftFrom] = useState<Date | null>(null);
  const [draftTo, setDraftTo] = useState<Date | null>(null);

  const requests = useTeamRequests(filters);
  const items = requests.data?.pages.flatMap((page) => page.items) ?? [];

  const advancedFilterCount = [
    filters.search,
    filters.status,
    filters.dateFrom || filters.dateTo,
  ].filter(Boolean).length;

  function openFilters() {
    setDraftSearch(filters.search ?? '');
    setDraftStatus(filters.status);
    setDraftFrom(
      filters.dateFrom ? new Date(`${filters.dateFrom}T12:00:00`) : null,
    );
    setDraftTo(filters.dateTo ? new Date(`${filters.dateTo}T12:00:00`) : null);
    setSheetOpen(true);
  }

  return (
    <Screen
      scroll
      scrollProps={{
        onMomentumScrollEnd: () => {
          if (requests.hasNextPage && !requests.isFetchingNextPage) {
            void requests.fetchNextPage();
          }
        },
        refreshControl: (
          <RefreshControl
            onRefresh={() => void requests.refetch()}
            refreshing={requests.isRefetching}
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
            <Text variant="h1">คำขอของทีม</Text>
            <Text tone="muted" variant="caption">
              {employeeId ? 'เฉพาะสมาชิกที่เลือก' : 'ทั้งทีม'} · ดูอย่างเดียว
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
                advancedFilterCount > 0
                  ? theme.colors.primarySoft
                  : theme.colors.surface,
              borderColor:
                advancedFilterCount > 0
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
                advancedFilterCount > 0
                  ? theme.colors.primary
                  : theme.colors.text
              }
              name="options-outline"
              size={20}
            />
          </Pressable>
        </View>

        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}
        >
          {TYPE_FILTERS.map((option) => (
            <Chip
              active={filters.type === option.value}
              key={option.label}
              label={option.label}
              onPress={() =>
                setFilters((current) => ({ ...current, type: option.value }))
              }
            />
          ))}
        </View>

        {requests.isPending ? (
          <SkeletonList rows={6} />
        ) : requests.isError ? (
          <ErrorState
            description={
              requests.error instanceof ApiError
                ? requests.error.message
                : undefined
            }
            onRetry={() => void requests.refetch()}
            retrying={requests.isRefetching}
            title="ยังโหลดคำขอของทีมไม่ได้"
          />
        ) : items.length === 0 ? (
          <EmptyState
            description={
              advancedFilterCount > 0 || filters.type
                ? 'ลองล้างตัวกรองหรือเลือกช่วงวันที่ให้กว้างขึ้น'
                : 'ทีมยังไม่ได้ยื่นคำขอในช่วงนี้'
            }
            icon="document-text-outline"
            title="ไม่พบคำขอ"
          />
        ) : (
          <View style={{ gap: theme.spacing.xs }}>
            {items.map((item) => (
              <RequestRow
                item={item}
                key={`${item.type}-${item.id}`}
                onPress={
                  item.employeeId
                    ? () =>
                        router.push({
                          params: { id: item.employeeId as string },
                          pathname: '/team/[id]',
                        })
                    : undefined
                }
              />
            ))}

            {requests.hasNextPage ? (
              <Button
                loading={requests.isFetchingNextPage}
                onPress={() => void requests.fetchNextPage()}
                title="โหลดเพิ่ม"
                variant="secondary"
              />
            ) : null}
          </View>
        )}
      </View>

      <Sheet
        onClose={() => setSheetOpen(false)}
        title="ตัวกรอง"
        visible={sheetOpen}
      >
        <View style={{ gap: theme.spacing.md }}>
          <Input
            label="ค้นหา"
            onChangeText={setDraftSearch}
            placeholder="ชื่อ รหัสพนักงาน หรือเหตุผล"
            value={draftSearch}
          />

          <View style={{ gap: theme.spacing.xs }}>
            <Text tone="muted" variant="label">
              สถานะ
            </Text>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: theme.spacing.xs,
              }}
            >
              {STATUS_FILTERS.map((option) => (
                <Chip
                  active={draftStatus === option.value}
                  key={option.label}
                  label={option.label}
                  onPress={() => setDraftStatus(option.value)}
                />
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
                  /* type กับ employeeId ไม่ได้อยู่ในแผ่นนี้ จึงต้องคงไว้ */
                  setFilters((current) => ({
                    employeeId,
                    type: current.type,
                  }));
                  setSheetOpen(false);
                }}
                title="ล้างตัวกรอง"
                variant="secondary"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                onPress={() => {
                  setFilters((current) => ({
                    ...current,
                    dateFrom: toDateKey(draftFrom),
                    dateTo: toDateKey(draftTo),
                    search: draftSearch.trim() || undefined,
                    status: draftStatus,
                  }));
                  setSheetOpen(false);
                }}
                title="ใช้ตัวกรอง"
              />
            </View>
          </View>
        </View>
      </Sheet>
    </Screen>
  );
}
