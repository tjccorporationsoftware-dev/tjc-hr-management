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
  DOCUMENT_STATUS_LABEL,
  type DocumentListFilters,
  type DocumentListItem,
  type DocumentStatus,
} from '@/features/documents/documents.types';
import { useDocumentCatalog, useDocumentList } from '@/features/documents/use-documents';
import { ApiError } from '@/lib/api/api-error';
import { useAppTheme } from '@/theme/use-app-theme';

const STATUS_TONE: Record<string, ToneName> = {
  APPROVED: 'success',
  CANCELLED: 'neutral',
  DRAFT: 'neutral',
  REJECTED: 'danger',
  SUBMITTED: 'warning',
};

const statusOptions = [
  { label: 'ทุกสถานะ', value: '' },
  { label: 'ฉบับร่าง', value: 'DRAFT' },
  { label: 'รออนุมัติ', value: 'SUBMITTED' },
  { label: 'อนุมัติแล้ว', value: 'APPROVED' },
  { label: 'ไม่อนุมัติ', value: 'REJECTED' },
  { label: 'ยกเลิกแล้ว', value: 'CANCELLED' },
];

const toDateKey = (value: Date | null) => {
  if (!value) return undefined;
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

function DocumentRow({ item }: { item: DocumentListItem }) {
  const router = useRouter();
  const { theme } = useAppTheme();

  return (
    <Pressable
      accessibilityLabel={item.title}
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/document/[id]', params: { id: item.id } })}
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
        <Ionicons color={theme.colors.primary} name="document-text-outline" size={20} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.xs }}>
          <Text numberOfLines={1} style={{ flex: 1 }} variant="bodyStrong">
            {item.documentType.nameTh || item.title}
          </Text>
          <Badge
            label={item.returnedForReview ? 'ส่งกลับให้แก้ไข' : DOCUMENT_STATUS_LABEL[item.status]}
            tone={item.returnedForReview ? 'warning' : STATUS_TONE[item.status]}
          />
        </View>
        <Text tone="muted" variant="caption">
          {item.requestNo ?? 'ยังไม่มีเลขคำขอ'}
          {item.documentNo ? ` · เลขหนังสือ ${item.documentNo}` : ''}
        </Text>
        {item.purpose ? (
          <Text numberOfLines={1} tone="subtle" variant="caption">
            {item.purpose}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function DocumentsScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const catalog = useDocumentCatalog();
  const [filters, setFilters] = useState<DocumentListFilters>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');
  const [typeId, setTypeId] = useState<string>('');
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const list = useDocumentList(filters);
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const total = list.data?.pages[0]?.meta.total ?? 0;

  const typeOptions = [
    { label: 'ทุกประเภท', value: '' },
    ...(catalog.data?.items ?? []).map((item) => ({ label: item.nameTh, value: item.id })),
  ];

  function openFilters() {
    setSearch(filters.search ?? '');
    setStatus(filters.status ?? '');
    setTypeId(filters.documentTypeId ?? '');
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
          <Text variant="h1">คำร้องเอกสาร</Text>
          <Text tone="muted">ยื่น ติดตาม และดาวน์โหลดเอกสารของคุณ</Text>
        </View>

        <Button icon="add" onPress={() => router.push('/document-new')} title="ยื่นคำร้องเอกสาร" />
        <Button icon="options-outline" onPress={openFilters} title="ค้นหาและตัวกรอง" variant="secondary" />

        {list.isPending ? (
          <SkeletonList rows={4} />
        ) : list.isError ? (
          <ErrorState
            description={list.error instanceof ApiError ? list.error.message : undefined}
            onRetry={() => void list.refetch()}
            retrying={list.isRefetching}
          />
        ) : items.length === 0 ? (
          <EmptyState
            description="ยังไม่มีคำร้องเอกสารตามเงื่อนไขที่เลือก"
            icon="document-text-outline"
            title="ไม่พบรายการ"
          />
        ) : (
          <View style={{ gap: theme.spacing.xs }}>
            {items.map((item) => <DocumentRow item={item} key={item.id} />)}
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

      <Sheet onClose={() => setSheetOpen(false)} title="ค้นหาและตัวกรอง" visible={sheetOpen}>
        <View style={{ gap: theme.spacing.md }}>
          <Input label="ค้นหา" onChangeText={setSearch} placeholder="เลขที่คำขอ ชื่อเอกสาร หรือวัตถุประสงค์" value={search} />
          <Select label="ประเภทเอกสาร" onChange={setTypeId} options={typeOptions} value={typeId} />
          <Select label="สถานะ" onChange={setStatus} options={statusOptions} value={status} />
          <DateField label="ตั้งแต่วันที่" maximumDate={to ?? undefined} onChange={setFrom} value={from} />
          <DateField label="ถึงวันที่" minimumDate={from ?? undefined} onChange={setTo} value={to} />
          <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
            <View style={{ flex: 1 }}>
              <Button
                onPress={() => {
                  setFilters({});
                  setSearch('');
                  setStatus('');
                  setTypeId('');
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
                    dateFrom: toDateKey(from),
                    dateTo: toDateKey(to),
                    documentTypeId: typeId || undefined,
                    search: search.trim() || undefined,
                    status: (status || undefined) as DocumentStatus | undefined,
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
