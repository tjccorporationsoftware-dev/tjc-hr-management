import { useFocusEffect, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Button,
  DateField,
  Icon,
  Input,
  Select,
  Sheet,
  SkeletonList,
  Text,
  type IconName,
} from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  PageHero,
  PressableScale,
  RequestsMotif,
  Reveal,
} from '@/design/aurora';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import {
  REQUEST_STATUS_LABEL,
  REQUEST_TYPE_LABEL,
  type RequestFilterStatus,
  type RequestItem,
  type RequestListFilters,
  type RequestType,
} from '@/features/requests/requests.types';
import { useRequestList } from '@/features/requests/use-requests';
import { ApiError } from '@/lib/api/api-error';
import { useRefetchOnFocus } from '@/lib/query/use-refetch-on-focus';
import { useAppTheme } from '@/theme/use-app-theme';
import { useVisibleStatusBarStyle } from '@/theme/use-status-bar-style';

/**
 * คำขอของฉัน — ทุกประเภทอยู่ในรายการเดียว
 *
 * การกรองทั้งหมดส่งไปที่ Server เพื่อให้ pagination โหลดข้อมูลจริงครบทุกหน้า
 * ไม่กรองเฉพาะ items ที่โหลดมาแล้วบนเครื่อง เพราะจะทำให้ผลลัพธ์แต่ละหน้าผิด
 *
 * ผิวของจอเป็นชุดเดียวกับหน้าหลักและจอลงเวลา: พื้นขาวล้วน หัวจอ `PageHero`
 * เต็มความกว้าง รายการเป็นแถวคั่นเส้นบาง ไม่มีการ์ดกระจกซ้อนกันอีกแล้ว
 */

/**
 * สีเดียวกับ `REQUEST_STATUS_COLOR` ใน `features/home/panels.tsx` (การ์ด
 * "คำขอล่าสุด" บนหน้าหลัก) — ใบเดียวกันต้องได้สีเดียวกันไม่ว่าจะไปโผล่จอไหน
 */
const STATUS_COLOR: Record<string, string> = {
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

/** ไอคอน Feather ชุดเดียวกับทั้งแอป — ห้ามใช้ Ionicons ในจอที่ย้ายผิวแล้ว */
const TYPE_ICON: Record<RequestType, IconName> = {
  LEAVE: 'sun',
  OFFSITE: 'navigation',
  OVERTIME: 'moon',
  TIME_ADJUST: 'clock',
};

const CREATE_OPTIONS: {
  description: string;
  flag: 'leave' | 'offsite' | 'overtime' | 'timeAdjust';
  type: RequestType;
}[] = [
  {
    description: 'ลาป่วย ลากิจ และวันลาอื่น ๆ',
    flag: 'leave',
    type: 'LEAVE',
  },
  {
    description: 'ขอทำงานล่วงเวลาตามช่วงเวลาที่กำหนด',
    flag: 'overtime',
    type: 'OVERTIME',
  },
  {
    description: 'แก้ไขเวลาเข้าหรือออกงานที่ไม่ถูกต้อง',
    flag: 'timeAdjust',
    type: 'TIME_ADJUST',
  },
  {
    description: 'แจ้งการทำงานนอกสถานที่',
    flag: 'offsite',
    type: 'OFFSITE',
  },
];

const TERMINAL_STATUSES = new Set([
  'APPROVED',
  'CANCELLED',
  'HR_APPROVED',
  'HR_REJECTED',
  'MANAGER_REJECTED',
  'REJECTED',
]);

const TYPE_FILTERS: {
  icon: IconName;
  label: string;
  value: RequestType | undefined;
}[] = [
  { icon: 'grid', label: 'ทั้งหมด', value: undefined },
  { icon: 'sun', label: 'ลา', value: 'LEAVE' },
  { icon: 'moon', label: 'OT', value: 'OVERTIME' },
  { icon: 'clock', label: 'แก้เวลา', value: 'TIME_ADJUST' },
  { icon: 'navigation', label: 'นอกสถานที่', value: 'OFFSITE' },
];

const STATUS_FILTERS: {
  label: string;
  value: RequestFilterStatus | undefined;
}[] = [
  { label: 'ทุกสถานะ', value: undefined },
  { label: 'ฉบับร่าง', value: 'DRAFT' },
  { label: 'รออนุมัติ', value: 'SUBMITTED' },
  { label: 'อนุมัติแล้ว', value: 'APPROVED' },
  { label: 'ไม่อนุมัติ', value: 'REJECTED' },
  { label: 'ยกเลิกแล้ว', value: 'CANCELLED' },
];

const toDateKey = (value: Date | null) => {
  if (!value) return undefined;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * สีประจำประเภทคำขอ — ใบลา/OT/แก้เวลา/นอกสถานที่ต้องแยกออกจากกันตั้งแต่
 * เหลือบตาแรก ไม่ใช่ต้องอ่านหัวเรื่องก่อนถึงจะรู้ว่าใบไหนเป็นใบอะไร
 *
 * ใช้กับกระเบื้องไอคอนเท่านั้น (พื้นจาง + เส้นไอคอน) ตัวหนังสือในแถวยังเป็น
 * ดำ/เทาตามกติกา "หนึ่งแถวให้สีได้ตัวเดียว"
 */
const TYPE_COLOR: Record<RequestType, string> = {
  LEAVE: AURORA.sky,
  OFFSITE: AURORA.emerald,
  OVERTIME: AURORA.accent,
  TIME_ADJUST: AURORA.amber,
};

/**
 * หนึ่งใบคำขอ = หนึ่งแถวบนผิวของจอ **ไม่มีการ์ดครอบ**
 *
 * เดิมแต่ละกลุ่มถูกวาดเป็นการ์ดกระจกใบหนึ่ง (ดู `listCardEdge`) ทำให้จอเป็น
 * กล่องซ้อนกล่องเหมือนจอลงเวลาก่อนรื้อ ตอนนี้แถววางบนพื้นขาวตรง ๆ แบ่งด้วย
 * เส้นคั่นบาง ๆ เส้นเดียว
 *
 * ผังของแถว — สามชั้น อ่านจากบนลงล่างได้เรื่องเดียวจบ:
 *   [ กระเบื้องไอคอนสีประจำประเภท ]  หัวเรื่อง .............. [ ป้ายสถานะ ]
 *                                     ช่วงเวลา · ปริมาณ
 *                                     เลขที่ใบ                        ›
 *
 * สถานะย้ายจาก "จุด + ข้อความ" ใต้หัวเรื่อง มาเป็นป้ายพื้นจางท้ายบรรทัดแรก
 * เพราะของสามอย่างที่เคยเรียงต่อกันบรรทัดเดียว (สถานะ · เลขที่) ทำให้บรรทัด
 * ล่างสุดยาวจนตาไม่รู้จะจับตรงไหน
 */
function RequestRow({ divider, item }: { divider: boolean; item: RequestItem }) {
  const router = useRouter();
  const statusColor = STATUS_COLOR[item.status] ?? AURORA.textFaint;
  const typeColor = TYPE_COLOR[item.type];

  const metaLine = [item.rangeLabel, item.amountLabel]
    .filter(Boolean)
    .join(' · ');

  return (
    <PressableScale
      accessibilityRole="button"
      onPress={() =>
        router.push({
          params: { id: item.id, type: item.type },
          pathname: '/request/[type]/[id]',
        })
      }
      style={{
        borderTopColor: AURORA.glassBorder,
        borderTopWidth: divider ? 1 : 0,
        flexDirection: 'row',
        gap: 13,
        paddingHorizontal: 4,
        paddingVertical: 15,
      }}
    >
      {/*
        กระเบื้องไอคอน — สี่เหลี่ยมมนหนา ๆ ไม่ใช่วงกลมจาง ให้มันเป็นจุดยึด
        สายตาของทั้งแถว และเป็นตัวเดียวที่มีสีเข้มพอจะแยกประเภทได้จากระยะไกล
      */}
      <View
        style={{
          alignItems: 'center',
          backgroundColor: `${typeColor}1a`,
          borderRadius: 14,
          height: 42,
          justifyContent: 'center',
          width: 42,
        }}
      >
        <Icon color={typeColor} name={TYPE_ICON[item.type]} size={19} />
      </View>

      <View style={{ flex: 1, gap: 5, minWidth: 0 }}>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}>
          <Text
            maxScale={1.15}
            numberOfLines={1}
            style={{
              color: AURORA.text,
              flex: 1,
              fontSize: 14.5,
              fontWeight: '700',
              letterSpacing: -0.1,
              lineHeight: 19,
            }}
          >
            {item.title}
          </Text>

          {/* ป้ายสถานะพื้นจาง — สีเดียวกับที่หน้าหลักใช้กับใบเดียวกัน */}
          <View
            style={{
              backgroundColor: `${statusColor}16`,
              borderRadius: 999,
              paddingHorizontal: 9,
              paddingVertical: 3,
            }}
          >
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
              {REQUEST_STATUS_LABEL[item.status] ?? item.status}
            </Text>
          </View>
        </View>

        {metaLine ? (
          <Text
            maxScale={1.15}
            numberOfLines={1}
            style={{
              color: AURORA.textMuted,
              fontSize: 11.5,
              fontVariant: ['tabular-nums'],
              lineHeight: 16,
            }}
          >
            {metaLine}
          </Text>
        ) : null}

        {item.requestNo ? (
          <Text
            maxScale={1.1}
            numberOfLines={1}
            style={{
              color: AURORA.textFaint,
              fontSize: 10,
              fontVariant: ['tabular-nums'],
              letterSpacing: 0.4,
              lineHeight: 13,
            }}
          >
            {item.requestNo}
          </Text>
        ) : null}
      </View>

      {/*
        chevron เป็นพี่น้องของคอลัมน์เนื้อหา ไม่ใช่ลูกในนั้น — ตอนอยู่ข้างในมัน
        ไหลไปต่อท้ายบรรทัดสุดท้าย ใบที่ไม่มีเลขที่ก็เลยได้ chevron ลอยอยู่คนละที่
        กับใบที่มี ตอนนี้มันอยู่ขวาสุดกึ่งกลางแถวเสมอไม่ว่าแถวจะสูงเท่าไร
      */}
      <View style={{ alignSelf: 'center' }}>
        <Icon color={AURORA.textFaint} name="chevron-right" size={17} />
      </View>

    </PressableScale>
  );
}


/** แถวหนึ่งใน FlatList — หัวข้อกลุ่มกับใบคำขออยู่ในชุดเดียวกัน */
type RequestListRow =
  | {
      accent: string;
      /** กลุ่มแรกไม่ต้องเว้นระยะบน — ระยะนั้นมาจาก ListHeaderComponent แล้ว */
      first: boolean;
      key: string;
      kind: 'header';
      title: string;
      total: number;
    }
  | {
      groupSize: number;
      indexInGroup: number;
      item: RequestItem;
      key: string;
      kind: 'row';
    };

export default function RequestsScreen() {
  const { gutter } = useResponsive();
  const { resolvedMode } = useAppTheme();
  const router = useRouter();
  const bootstrap = useBootstrap();
  const [filters, setFilters] = useState<RequestListFilters>({});
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [draftType, setDraftType] = useState<RequestType | undefined>();
  const [draftSearch, setDraftSearch] = useState('');
  const [draftStatus, setDraftStatus] = useState<
    RequestFilterStatus | undefined
  >();
  const [draftDateFrom, setDraftDateFrom] = useState<Date | null>(null);
  const [draftDateTo, setDraftDateTo] = useState<Date | null>(null);

  const list = useRequestList(filters);

  /* แท็บไม่ unmount ตอนสลับ — ต้องบอกให้ดึงใหม่เองเมื่อข้อมูลเก่าแล้ว */
  useRefetchOnFocus(list);
  const flags = bootstrap.data?.featureFlags;
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const activeItems = items.filter((item) => !TERMINAL_STATUSES.has(item.status));
  const historyItems = items.filter((item) => TERMINAL_STATUSES.has(item.status));
  const total = list.data?.pages[0]?.meta.total ?? 0;
  const advancedFilterCount = [
    filters.type,
    filters.search,
    filters.status,
    filters.dateFrom || filters.dateTo,
  ].filter(Boolean).length;

  const availableCreateTypes = flags
    ? CREATE_OPTIONS.filter((option) => flags[option.flag])
    : [];
  const canCreateAny = availableCreateTypes.length > 0;
  const auroraStatusBarStyle = useVisibleStatusBarStyle('dark');
  const themeStatusBarStyle = useVisibleStatusBarStyle(
    resolvedMode === 'dark' ? 'light' : 'dark',
  );

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(auroraStatusBarStyle);

      return () => setStatusBarStyle(themeStatusBarStyle);
    }, [auroraStatusBarStyle, themeStatusBarStyle]),
  );

  function openFilters() {
    setDraftType(filters.type);
    setDraftSearch(filters.search ?? '');
    setDraftStatus(filters.status);
    setDraftDateFrom(filters.dateFrom ? new Date(`${filters.dateFrom}T12:00:00`) : null);
    setDraftDateTo(filters.dateTo ? new Date(`${filters.dateTo}T12:00:00`) : null);
    setFilterSheetOpen(true);
  }

  function applyFilters() {
    setFilters((current) => ({
      ...current,
      dateFrom: toDateKey(draftDateFrom),
      dateTo: toDateKey(draftDateTo),
      search: draftSearch.trim() || undefined,
      status: draftStatus,
      type: draftType,
    }));
    setFilterSheetOpen(false);
  }

  function clearAdvancedFilters() {
    setDraftType(undefined);
    setDraftSearch('');
    setDraftStatus(undefined);
    setDraftDateFrom(null);
    setDraftDateTo(null);
    setFilters({});
    setFilterSheetOpen(false);
  }

  /*
   * แบนสองกลุ่ม (กำลังดำเนินการ / ประวัติ) เป็นรายการเดียวให้ FlatList
   *
   * เก็บเป็นกลุ่มที่มีลูกข้างในไม่ได้ เพราะ FlatList virtualize ได้ทีละ item
   * กลุ่ม "ประวัติ" ที่มีเป็นร้อยใบจะถูกเรนเดอร์พร้อมกันทั้งก้อนอยู่ดี
   */
  const rows = useMemo(() => {
    const built: RequestListRow[] = [];

    [
      { accent: AURORA.accent, items: activeItems, title: 'กำลังดำเนินการ' },
      { accent: AURORA.textFaint, items: historyItems, title: 'ประวัติ' },
    ].forEach((group) => {
      if (group.items.length === 0) return;

      built.push({
        accent: group.accent,
        first: built.length === 0,
        key: `group-${group.title}`,
        kind: 'header',
        title: group.title,
        total: group.items.length,
      });

      group.items.forEach((item, indexInGroup) => {
        built.push({
          groupSize: group.items.length,
          indexInGroup,
          item,
          key: `${item.type}-${item.id}`,
          kind: 'row',
        });
      });
    });

    return built;
  }, [activeItems, historyItems]);

  const renderRow = useCallback(
    ({ item: row }: { item: RequestListRow }) =>
      row.kind === 'header' ? (
        <View
          style={{
            alignItems: 'center',
            flexDirection: 'row',
            gap: 7,
            paddingBottom: 8,
            paddingHorizontal: 4,
            paddingTop: row.first ? 0 : 20,
          }}
        >
          <View
            style={{
              backgroundColor: row.accent,
              borderRadius: 999,
              height: 8,
              width: 8,
            }}
          />
          <Text style={{ color: AURORA.text, flex: 1 }} variant="h3">
            {row.title}
          </Text>
          <Text style={{ color: AURORA.textFaint }} variant="caption">
            {row.total}
          </Text>
        </View>
      ) : (
        /* เส้นคั่นเป็นของแถวถัดไป แถวแรกของกลุ่มจึงไม่มีเส้นบน */
        <RequestRow divider={row.indexInGroup > 0} item={row.item} />
      ),
    [],
  );

  return (
    /* พื้นขาวเรียบทั้งจอ ไม่มีฉากหลังฟ้า — ผิวเดียวกับหน้าหลักและจอลงเวลา */
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <FlatList
          contentContainerStyle={{
            paddingBottom: 36,
            paddingHorizontal: gutter,
            paddingTop: 30,
          }}
          data={rows}
          /*
           * ค่าปรับ virtualization — รายการคำขอยาวได้ไม่จำกัดเพราะโหลดเพิ่มได้
           * เรื่อย ๆ เรนเดอร์ล่วงหน้าพอให้เลื่อนลื่นแต่ไม่กินแรมเกินจำเป็น
           */
          initialNumToRender={10}
          keyExtractor={(row) => row.key}
          ListEmptyComponent={
            list.isPending ? (
              <SkeletonList rows={4} />
            ) : list.isError ? (
              <View style={{ gap: 6, paddingHorizontal: 4 }}>
                <Text style={{ color: AURORA.text }} variant="bodyStrong">
                  โหลดรายการไม่สำเร็จ
                </Text>
                <Text style={{ color: AURORA.textMuted }} variant="caption">
                  {list.error instanceof ApiError
                    ? list.error.message
                    : 'กรุณาลองใหม่อีกครั้ง'}
                </Text>
                <PressableScale
                  onPress={() => void list.refetch()}
                  style={{ alignSelf: 'flex-start', paddingVertical: 5 }}
                >
                  <Text
                    style={{ color: AURORA.accent, fontWeight: '700' }}
                    variant="caption"
                  >
                    {list.isRefetching ? 'กำลังโหลด...' : 'ลองใหม่'}
                  </Text>
                </PressableScale>
              </View>
            ) : (
              <View
                style={{
                  alignItems: 'center',
                  gap: 8,
                  paddingHorizontal: gutter,
                  paddingVertical: 32,
                }}
              >
                <Icon color={AURORA.accent} name="file-text" size={30} />
                <Text style={{ color: AURORA.text }} variant="bodyStrong">
                  ยังไม่พบรายการ
                </Text>
                <Text
                  style={{ color: AURORA.textMuted, textAlign: 'center' }}
                  variant="caption"
                >
                  {advancedFilterCount > 0
                    ? 'ลองเปลี่ยนคำค้นหาหรือตัวกรองที่เลือก'
                    : 'คำขอที่ยื่นไว้จะแสดงที่นี่'}
                </Text>
              </View>
            )
          }
          ListFooterComponent={
            list.hasNextPage ? (
              <PressableScale
                disabled={list.isFetchingNextPage}
                onPress={() => void list.fetchNextPage()}
                style={{ alignItems: 'center', paddingVertical: 16 }}
              >
                <Text
                  style={{ color: AURORA.accent, fontWeight: '700' }}
                  variant="caption"
                >
                  {list.isFetchingNextPage
                    ? 'กำลังโหลด...'
                    : `โหลดเพิ่มเติม (${items.length}/${total})`}
                </Text>
              </PressableScale>
            ) : null
          }
          ListHeaderComponent={            <View style={{ gap: 22, paddingBottom: 14 }}>
              <Reveal>
                {/*
                  หักระยะขอบของ FlatList ออกด้วย margin ติดลบ หัวข้อหน้าจึงกิน
                  เต็มความกว้างจอและไปติดขอบบนสุด เหมือนจอลงเวลา
                */}
                <View
                  style={{
                    marginHorizontal: -18,
                    marginTop: -34,
                  }}
                >
                  <PageHero
                    decoration={<RequestsMotif />}
                    icon="file-text"
                    right={
                      canCreateAny ? (
                        <PressableScale
                          accessibilityLabel="ยื่นคำขอใหม่"
                          accessibilityRole="button"
                          onPress={() => setCreateSheetOpen(true)}
                          style={{
                            alignItems: 'center',
                            backgroundColor: AURORA.accent,
                            borderRadius: 999,
                            elevation: 3,
                            height: 40,
                            justifyContent: 'center',
                            shadowColor: AURORA.accent,
                            shadowOffset: { height: 3, width: 0 },
                            shadowOpacity: 0.22,
                            shadowRadius: 6,
                            width: 40,
                          }}
                        >
                          <Icon color="#ffffff" name="plus" size={21} />
                        </PressableScale>
                      ) : (
                        /* สิทธิ์ยังไม่เปิด — แสดงปุ่มล็อกไว้ ห้ามซ่อนทิ้ง */
                        <View
                          style={{
                            alignItems: 'center',
                            backgroundColor: AURORA.accentSoft,
                            borderRadius: 999,
                            height: 40,
                            justifyContent: 'center',
                            width: 40,
                          }}
                        >
                          <Icon color={AURORA.textFaint} name="lock" size={18} />
                        </View>
                      )
                    }
                    subtitle="ยื่นคำขอและติดตามสถานะได้ในที่เดียว"
                    title="คำขอของฉัน"
                  />
                </View>
              </Reveal>

              <Reveal delay={60}>
                {/*
                  แถบค้นหาเป็นกรอบเส้นบางบนพื้นขาว ไม่ใช่การ์ดกระจก — ทั้งจอ
                  เหลือผิวเดียว ตัวควบคุมจึงบอกตัวเองด้วยขอบ ไม่ใช่ด้วยพื้น
                */}
                <PressableScale
                  accessibilityLabel="ค้นหาและกรองคำขอ"
                  accessibilityRole="button"
                  onPress={openFilters}
                  style={{
                    alignItems: 'center',
                    borderColor: AURORA.glassBorder,
                    borderRadius: 16,
                    borderWidth: 1,
                    flexDirection: 'row',
                    gap: 10,
                    minHeight: 52,
                    paddingHorizontal: 14,
                  }}
                >
                  <Icon color={AURORA.accent} name="search" size={18} />

                  <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
                    <Text style={{ color: AURORA.textMuted }}>
                      {filters.search || 'ค้นหาและกรองคำขอ'}
                    </Text>
                    {filters.type ||
                    filters.status ||
                    filters.dateFrom ||
                    filters.dateTo ? (
                      <Text
                        numberOfLines={1}
                        style={{ color: AURORA.textFaint }}
                        variant="caption"
                      >
                        {[
                          filters.type ? REQUEST_TYPE_LABEL[filters.type] : null,
                          filters.status
                            ? REQUEST_STATUS_LABEL[filters.status]
                            : null,
                          filters.dateFrom || filters.dateTo
                            ? 'ระบุช่วงวันที่'
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    ) : null}
                  </View>

                  <View
                    style={{
                      alignItems: 'center',
                      backgroundColor:
                        advancedFilterCount > 0
                          ? AURORA.accent
                          : AURORA.accentSoft,
                      borderRadius: 999,
                      height: 30,
                      justifyContent: 'center',
                      width: 30,
                    }}
                  >
                    {advancedFilterCount > 0 ? (
                      <Text
                        style={{
                          color: '#ffffff',
                          fontSize: 11,
                          fontWeight: '700',
                        }}
                      >
                        {advancedFilterCount}
                      </Text>
                    ) : (
                      <Icon color={AURORA.accent} name="sliders" size={15} />
                    )}
                  </View>
                </PressableScale>
              </Reveal>

              <View
                style={{
                  alignItems: 'flex-end',
                  flexDirection: 'row',
                  gap: 12,
                  paddingHorizontal: 4,
                }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: AURORA.text }} variant="h2">
                    คำขอทั้งหมด
                  </Text>
                  <Text style={{ color: AURORA.textMuted }} variant="caption">
                    ล่าสุดก่อน
                    {filters.type ? ` · ${REQUEST_TYPE_LABEL[filters.type]}` : ''}
                  </Text>
                </View>
                {!list.isPending ? (
                  <Text style={{ color: AURORA.accent }} variant="bodyStrong">
                    {total} รายการ
                  </Text>
                ) : null}
              </View>
            </View>
          }
          maxToRenderPerBatch={10}
          refreshControl={
            Platform.OS === 'web' ? undefined : (
              <RefreshControl
                onRefresh={() => void list.refetch()}
                refreshing={list.isRefetching}
                tintColor={AURORA.textMuted}
              />
            )
          }
          removeClippedSubviews
          renderItem={renderRow}
          showsVerticalScrollIndicator={false}
          windowSize={7}
        />
      </SafeAreaView>

      <Sheet
        onClose={() => setCreateSheetOpen(false)}
        title="เลือกประเภทคำขอ"
        visible={createSheetOpen}
      >
        {/*
          รายการเดียวคั่นเส้นบาง ไม่ใช่การ์ดใบละประเภท — สี่กล่องมนเรียงกันใน
          แผ่นเดียวอ่านเป็นของสี่ชิ้นที่ไม่เกี่ยวกัน ทั้งที่มันคือ "เลือกหนึ่ง
          อย่างจากสี่อย่าง" และกินความสูงจนปุ่มสุดท้ายเกือบตกขอบจอ
        */}
        <View style={{ marginHorizontal: -4 }}>
          {availableCreateTypes.map((option, index) => (
            <Pressable
              accessibilityRole="button"
              key={option.type}
              onPress={() => {
                setCreateSheetOpen(false);
                router.push({
                  params: { type: option.type },
                  pathname: '/request-new',
                });
              }}
              style={({ pressed }) => ({
                alignItems: 'center',
                backgroundColor: pressed
                  ? 'rgba(37, 99, 235, 0.06)'
                  : 'transparent',
                borderTopColor: AURORA.glassBorder,
                borderTopWidth: index === 0 ? 0 : 1,
                flexDirection: 'row',
                gap: 12,
                paddingHorizontal: 12,
                paddingVertical: 12,
              })}
            >
              {/* กระเบื้องสีประจำประเภท ชุดเดียวกับแถวในรายการคำขอ */}
              <View
                style={{
                  alignItems: 'center',
                  backgroundColor: `${TYPE_COLOR[option.type]}1a`,
                  borderRadius: 14,
                  height: 42,
                  justifyContent: 'center',
                  width: 42,
                }}
              >
                <Icon
                  color={TYPE_COLOR[option.type]}
                  name={TYPE_ICON[option.type]}
                  size={19}
                />
              </View>

              <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    color: AURORA.text,
                    fontSize: 14.5,
                    fontWeight: '700',
                    lineHeight: 19,
                  }}
                >
                  {REQUEST_TYPE_LABEL[option.type]}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    color: AURORA.textMuted,
                    fontSize: 11.5,
                    lineHeight: 16,
                  }}
                >
                  {option.description}
                </Text>
              </View>

              <Icon color={AURORA.textFaint} name="chevron-right" size={17} />
            </Pressable>
          ))}
        </View>
      </Sheet>

      <Sheet
        footer={
          <View style={{ gap: 10 }}>
            <Button onPress={applyFilters} title="แสดงผลลัพธ์" />
            {advancedFilterCount > 0 ? (
              <Button
                onPress={clearAdvancedFilters}
                title="ล้างตัวกรองทั้งหมด"
                variant="ghost"
              />
            ) : null}
          </View>
        }
        onClose={() => setFilterSheetOpen(false)}
        title="ค้นหาและตัวกรอง"
        visible={filterSheetOpen}
      >
        <View style={{ gap: 20 }}>
          <Input
            icon="search-outline"
            label="ค้นหา"
            onChangeText={setDraftSearch}
            placeholder="เลขที่คำขอหรือเหตุผล"
            value={draftSearch}
          />

          {/*
            ประเภทกับสถานะเป็นดรอปดาวน์ ไม่ใช่ปุ่มมนเรียงพับบรรทัด

            ตัวเลือกสองชุดรวมกันสิบเอ็ดปุ่ม กินความสูงเกินครึ่งแผ่นจนช่องวันที่
            ข้างล่างต้องเลื่อนหา ดรอปดาวน์ยุบให้เหลือสองบรรทัด แล้วเปิดรายการ
            เต็มตอนแตะ — ตัวกรองที่คนแตะนาน ๆ ครั้งไม่ควรกินที่ถาวร

            `'ALL'` เป็นค่าแทน `undefined` เพราะ `Select` ต้องการค่าจริงเสมอ
            แล้วค่อยแปลงกลับตอนส่งเข้า `filters`
          */}
          <Select
            appearance="aurora"
            label="ประเภทคำขอ"
            onChange={(next) =>
              setDraftType(next === 'ALL' ? undefined : (next as RequestType))
            }
            options={TYPE_FILTERS.map((option) => ({
              label: option.label,
              value: option.value ?? 'ALL',
            }))}
            mode="inline"
            value={draftType ?? 'ALL'}
          />

          <Select
            appearance="aurora"
            label="สถานะ"
            onChange={(next) =>
              setDraftStatus(
                next === 'ALL' ? undefined : (next as RequestFilterStatus),
              )
            }
            options={STATUS_FILTERS.map((option) => ({
              label: option.label,
              value: option.value ?? 'ALL',
            }))}
            mode="inline"
            value={draftStatus ?? 'ALL'}
          />

          <DateField
            label="ตั้งแต่วันที่"
            maximumDate={draftDateTo ?? undefined}
            onChange={setDraftDateFrom}
            value={draftDateFrom}
          />
          <DateField
            label="ถึงวันที่"
            minimumDate={draftDateFrom ?? undefined}
            onChange={setDraftDateTo}
            value={draftDateTo}
          />

          {draftDateFrom || draftDateTo ? (
            <Button
              onPress={() => {
                setDraftDateFrom(null);
                setDraftDateTo(null);
              }}
              title="ล้างช่วงวันที่"
              variant="ghost"
            />
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}
