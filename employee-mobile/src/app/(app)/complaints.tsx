import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
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
  Select,
  Sheet,
  SkeletonList,
  Text,
  type ToneName,
} from '@/design';
import {
  COMPLAINT_STATUS_LABEL,
  type ComplaintListFilters,
  type ComplaintListItem,
  type ComplaintStatus,
} from '@/features/complaints/complaints.types';
import { useComplaintList } from '@/features/complaints/use-complaints';
import { ApiError } from '@/lib/api/api-error';
import { useAppTheme } from '@/theme/use-app-theme';
import { thaiDate } from '@/lib/date/thai-date';

const STATUS_TONE: Record<ComplaintStatus, ToneName> = {
  SUBMITTED: 'warning',
  IN_PROGRESS: 'primary',
  RESOLVED: 'success',
  CLOSED: 'neutral',
  CANCELLED: 'neutral',
};

const statusOptions = [
  { label: 'ทุกสถานะ', value: '' },
  { label: 'ส่งเรื่องแล้ว', value: 'SUBMITTED' },
  { label: 'กำลังดำเนินการ', value: 'IN_PROGRESS' },
  { label: 'ดำเนินการแล้ว', value: 'RESOLVED' },
  { label: 'ปิดเรื่องแล้ว', value: 'CLOSED' },
  { label: 'ถอนเรื่องแล้ว', value: 'CANCELLED' },
];

const toDateKey = (value: Date | null) => {
  if (!value) return undefined;
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

function ComplaintRow({ item }: { item: ComplaintListItem }) {
  const router = useRouter();
  const { theme } = useAppTheme();

  return (
    <Pressable
      accessibilityLabel={item.title}
      accessibilityRole="button"
      onPress={() =>
        router.push({ pathname: '/complaint/[id]', params: { id: item.id } })
      }
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.colors.surfaceAlt : theme.colors.surface,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        flexDirection: 'row',
        gap: theme.spacing.sm,
        padding: theme.spacing.sm,
      })}
    >
      <View
        style={{
          alignItems: 'center',
          backgroundColor: theme.colors.primarySoft,
          borderRadius: theme.radius.sm,
          height: 40,
          justifyContent: 'center',
          width: 40,
        }}
      >
        <Ionicons
          color={theme.colors.primary}
          name="chatbox-ellipses-outline"
          size={20}
        />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View
          style={{
            alignItems: 'center',
            flexDirection: 'row',
            gap: theme.spacing.xs,
          }}
        >
          <Text numberOfLines={1} style={{ flex: 1 }} variant="bodyStrong">
            {item.title}
          </Text>
          <Badge
            label={COMPLAINT_STATUS_LABEL[item.status]}
            tone={STATUS_TONE[item.status]}
          />
        </View>
        <Text tone="muted" variant="caption">
          {item.complaintNo || 'ยังไม่มีเลขที่เรื่อง'}
          {item.category ? ` · ${item.category}` : ''}
        </Text>
        {item.submittedAt ? (
          <Text tone="subtle" variant="caption">
            ยื่นเมื่อ {thaiDate(item.submittedAt)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function ComplaintsScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const [filters, setFilters] = useState<ComplaintListFilters>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');
  const [category, setCategory] = useState('');
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const list = useComplaintList(filters);
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const total = list.data?.pages[0]?.meta.total ?? 0;

  function openFilters() {
    setSearch(filters.search ?? '');
    setStatus(filters.status ?? '');
    setCategory(filters.category ?? '');
    setFrom(filters.dateFrom ? new Date(`${filters.dateFrom}T12:00:00`) : null);
    setTo(filters.dateTo ? new Date(`${filters.dateTo}T12:00:00`) : null);
    setSheetOpen(true);
  }

  return (
    <Screen
      scroll
      scrollProps={{
        refreshControl: (
          <RefreshControl
            onRefresh={() => void list.refetch()}
            refreshing={list.isRefetching}
            tintColor={theme.colors.primary}
          />
        ),
      }}
    >
      <View style={{ gap: theme.spacing.lg }}>
        <View style={{ gap: 2 }}>
          <Text variant="h1">เรื่องร้องเรียน</Text>
          <Text tone="muted">ส่งเรื่องและติดตามสถานะเรื่องของคุณ</Text>
        </View>

        <Button
          icon="add"
          onPress={() => router.push('/complaint-new')}
          title="ส่งเรื่องร้องเรียน"
        />
        <Button
          icon="options-outline"
          onPress={openFilters}
          title="ค้นหาและตัวกรอง"
          variant="secondary"
        />

        {list.isPending ? (
          <SkeletonList rows={4} />
        ) : list.isError ? (
          <ErrorState
            description={
              list.error instanceof ApiError ? list.error.message : undefined
            }
            onRetry={() => void list.refetch()}
            retrying={list.isRefetching}
          />
        ) : items.length === 0 ? (
          <EmptyState
            description="ยังไม่มีเรื่องร้องเรียนตามเงื่อนไขที่เลือก"
            icon="chatbox-ellipses-outline"
            title="ไม่พบรายการ"
          />
        ) : (
          <View style={{ gap: theme.spacing.xs }}>
            {items.map((item) => (
              <ComplaintRow item={item} key={item.id} />
            ))}
            {list.hasNextPage ? (
              <Button
                loading={list.isFetchingNextPage}
                onPress={() => void list.fetchNextPage()}
                title={`โหลดเพิ่มเติม (${items.length}/${total})`}
                variant="secondary"
              />
            ) : null}
          </View>
        )}
      </View>

      <Sheet
        onClose={() => setSheetOpen(false)}
        title="ค้นหาและตัวกรอง"
        visible={sheetOpen}
      >
        <View style={{ gap: theme.spacing.md }}>
          <Input
            label="ค้นหา"
            onChangeText={setSearch}
            placeholder="เลขที่เรื่อง หัวข้อ หรือรายละเอียด"
            value={search}
          />
          <Input
            label="หมวดหมู่"
            onChangeText={setCategory}
            placeholder="เช่น สวัสดิการ หรือสภาพแวดล้อมการทำงาน"
            value={category}
          />
          <Select
            label="สถานะ"
            onChange={setStatus}
            options={statusOptions}
            value={status}
          />
          <DateField
            label="ตั้งแต่วันที่"
            maximumDate={to ?? undefined}
            onChange={setFrom}
            value={from}
          />
          <DateField
            label="ถึงวันที่"
            minimumDate={from ?? undefined}
            onChange={setTo}
            value={to}
          />
          <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
            <View style={{ flex: 1 }}>
              <Button
                onPress={() => {
                  setFilters({});
                  setSearch('');
                  setStatus('');
                  setCategory('');
                  setFrom(null);
                  setTo(null);
                  setSheetOpen(false);
                }}
                title="ล้าง"
                variant="secondary"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                onPress={() => {
                  setFilters({
                    category: category.trim() || undefined,
                    dateFrom: toDateKey(from),
                    dateTo: toDateKey(to),
                    search: search.trim() || undefined,
                    status: (status || undefined) as ComplaintStatus | undefined,
                  });
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
