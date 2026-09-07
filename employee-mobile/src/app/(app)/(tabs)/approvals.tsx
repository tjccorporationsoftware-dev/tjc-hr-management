import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Button,
  DateField,
  ErrorState,
  Icon,
  Select,
  Sheet,
  SkeletonList,
  Text,
  hitSlop,
  type IconName,
} from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  ApprovalMotif,
  PageHero,
  PressableScale,
  Reveal,
} from '@/design/aurora';
import {
  useApprovals,
  type ApprovalItem,
  type ApprovalListFilters,
  type ApprovalStatus,
} from '@/features/approvals/approvals';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { ExecutiveApprovals } from '@/features/executive/executive-approvals';
import {
  APPROVAL_TYPE_LABEL,
  type ApprovalType,
} from '@/features/requests/requests.types';
import { ApiError } from '@/lib/api/api-error';
import { useRefetchOnFocus } from '@/lib/query/use-refetch-on-focus';
import { fontFamily } from '@/theme/typography';
import { useAppTheme } from '@/theme/use-app-theme';
import { useVisibleStatusBarStyle } from '@/theme/use-status-bar-style';
import { thaiDate } from '@/lib/date/thai-date';

/** สีประจำประเภท — ชุดเดียวกับรายการคำขอของพนักงาน ใบเดียวกันต้องได้สีเดียวกัน */
const TYPE_COLOR: Record<ApprovalType, string> = {
  DOCUMENT: AURORA.textMuted,
  LEAVE: AURORA.sky,
  OFFSITE: AURORA.emerald,
  OVERTIME: AURORA.accent,
  TIME_ADJUST: AURORA.amber,
};

const TYPE_ICON: Record<ApprovalType, IconName> = {
  DOCUMENT: 'file-text',
  LEAVE: 'sun',
  OFFSITE: 'navigation',
  OVERTIME: 'moon',
  TIME_ADJUST: 'clock',
};

const FILTERS: { label: string; value: ApprovalType | undefined }[] = [
  { label: 'ทั้งหมด', value: undefined },
  { label: 'ลา', value: 'LEAVE' },
  { label: 'OT', value: 'OVERTIME' },
  { label: 'แก้เวลา', value: 'TIME_ADJUST' },
  { label: 'นอกสถานที่', value: 'OFFSITE' },
  { label: 'เอกสาร', value: 'DOCUMENT' },
];

const STATUS_FILTERS: { label: string; value: ApprovalStatus }[] = [
  { label: 'รออนุมัติ', value: 'SUBMITTED' },
  { label: 'อนุมัติแล้ว', value: 'APPROVED' },
  { label: 'ไม่อนุมัติ', value: 'REJECTED' },
  { label: 'ส่งกลับแล้ว', value: 'RETURNED' },
];

const toDateKey = (value: Date | null) => {
  if (!value) return undefined;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function submittedText(value: Date | null | undefined) {
  if (!value) return null;
  return thaiDate(value, {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  });
}

/**
 * หนึ่งใบในคิวอนุมัติ — แถวบนผิวขาว ไม่มีการ์ดครอบ
 *
 * ผังเดียวกับแถวคำขอของพนักงาน (`(tabs)/requests.tsx`) ต่างกันแค่บรรทัดแรก
 * เป็น "ชื่อคนยื่น" แทน "หัวเรื่อง" เพราะคนอนุมัติมองหาว่า *ใคร* ขออะไรมา
 */
function ApprovalRow({
  divider,
  item,
  onPress,
}: {
  divider: boolean;
  item: ApprovalItem;
  onPress: () => void;
}) {
  const { gutter } = useResponsive();
  const submitted = submittedText(item.submittedAt ?? item.createdAt);
  const typeColor = TYPE_COLOR[item.type];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? 'rgba(37, 99, 235, 0.06)' : 'transparent',
        borderTopColor: AURORA.glassBorder,
        borderTopWidth: divider ? 1 : 0,
        flexDirection: 'row',
        gap: 12,
        marginHorizontal: -18,
        paddingHorizontal: gutter,
        paddingVertical: 13,
      })}
    >
      <View
        style={{
          alignItems: 'center',
          backgroundColor: `${typeColor}1a`,
          borderRadius: 14,
          height: 42,
          justifyContent: 'center',
          marginTop: 1,
          width: 42,
        }}
      >
        <Icon color={typeColor} name={TYPE_ICON[item.type]} size={19} />
      </View>

      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}>
          <Text
            numberOfLines={1}
            style={{
              color: AURORA.text,
              flex: 1,
              fontSize: 14.5,
              fontWeight: '700',
              lineHeight: 19,
            }}
          >
            {item.employeeName ?? 'ไม่ระบุชื่อ'}
          </Text>
          <View
            style={{
              backgroundColor: `${typeColor}16`,
              borderRadius: 999,
              paddingHorizontal: 9,
              paddingVertical: 3,
            }}
          >
            <Text
              maxScale={1.1}
              numberOfLines={1}
              style={{
                color: typeColor,
                fontSize: 10.5,
                fontWeight: '700',
                lineHeight: 14,
              }}
            >
              {APPROVAL_TYPE_LABEL[item.type]}
            </Text>
          </View>
        </View>

        <Text
          numberOfLines={1}
          style={{
            color: AURORA.textMuted,
            fontSize: 11.5,
            lineHeight: 16,
          }}
        >
          {[item.employeeCode, item.department].filter(Boolean).join(' · ') ||
            '—'}
        </Text>

        <Text
          numberOfLines={2}
          style={{
            color: AURORA.text,
            fontSize: 12.5,
            lineHeight: 18,
          }}
        >
          {[item.title, item.summary].filter(Boolean).join(' · ')}
        </Text>

        {submitted || item.requestNo ? (
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}>
            <Text
              numberOfLines={1}
              style={{
                color: AURORA.textFaint,
                flex: 1,
                fontSize: 10.5,
                fontVariant: ['tabular-nums'],
                letterSpacing: 0.3,
                lineHeight: 14,
              }}
            >
              {[submitted, item.requestNo].filter(Boolean).join(' · ')}
            </Text>
            <Icon color={AURORA.textFaint} name="chevron-right" size={16} />
          </View>
        ) : (
          <Icon color={AURORA.textFaint} name="chevron-right" size={16} />
        )}
      </View>
    </Pressable>
  );
}

export default function ApprovalsScreen() {
  const { gutter } = useResponsive();
  const { resolvedMode } = useAppTheme();
  const router = useRouter();
  const routeParams = useLocalSearchParams<{
    openId?: string;
    status?: string;
    type?: string;
  }>();
  const bootstrap = useBootstrap();
  const [filters, setFilters] = useState<ApprovalListFilters>({
    status: 'SUBMITTED',
  });
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [searchText, setSearchText] = useState('');

  /*
   * หน่วงคำค้นก่อนยิง query — พิมพ์ชื่อคนหนึ่งชื่อคือสิบกว่าตัวอักษร ถ้ายิงทุก
   * ตัวอักษรจะเป็นสิบ request ที่ถูกทิ้งทั้งหมดยกเว้นอันสุดท้าย
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((current) => ({
        ...current,
        search: searchText.trim() || undefined,
      }));
    }, 350);

    return () => clearTimeout(timer);
  }, [searchText]);
  const [draftType, setDraftType] = useState<ApprovalType | undefined>();
  const [draftStatus, setDraftStatus] = useState<ApprovalStatus>('SUBMITTED');
  const [draftDateFrom, setDraftDateFrom] = useState<Date | null>(null);
  const [draftDateTo, setDraftDateTo] = useState<Date | null>(null);
  const handledOpenId = useRef<string | null>(null);
  /*
   * ผู้บริหารได้จอเดียวกันแต่คนละขอบเขต (คิวทั้งบริษัท ไม่ใช่คิวของทีมตัวเอง)
   * ผิวเป็นชุดเดียวกันทั้งสองฝั่งแล้ว — ขาวผืนเดียว หัวจอ `PageHero`
   * คิวที่ไม่ได้แสดงถูกปิดไว้ ไม่ใช่ยิงทิ้งแล้วไม่ได้ใช้
   */
  const isExecutive = bootstrap.data?.featureFlags.executive ?? false;
  const approvals = useApprovals(filters, !isExecutive);
  const items = approvals.data?.pages.flatMap((page) => page.items) ?? [];
  const firstMeta = approvals.data?.pages[0]?.meta;
  const total = firstMeta?.total ?? 0;
  const totalExact = firstMeta?.totalExact ?? true;
  const canApprove = bootstrap.data?.featureFlags.approvals ?? false;
  const canViewTeam = bootstrap.data?.featureFlags.team ?? false;
  const advancedFilterCount = [
    filters.type,
    filters.search,
    filters.status && filters.status !== 'SUBMITTED',
    filters.dateFrom || filters.dateTo,
  ].filter(Boolean).length;
  /* แถบหัวจอของผู้บริหารเป็นสีฟ้าเข้มทะลุไปหลังแถบสถานะ ต้องใช้ตัวหนังสือสีอ่อน */
  const auroraStatusBarStyle = useVisibleStatusBarStyle(
    'dark',
  );
  const themeStatusBarStyle = useVisibleStatusBarStyle(
    resolvedMode === 'dark' ? 'light' : 'dark',
  );

  useRefetchOnFocus({
    isStale: approvals.isStale && !isExecutive,
    refetch: approvals.refetch,
  });

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(auroraStatusBarStyle);

      return () => setStatusBarStyle(themeStatusBarStyle);
    }, [auroraStatusBarStyle, themeStatusBarStyle]),
  );

  const routeOpenId =
    typeof routeParams.openId === 'string' ? routeParams.openId : null;
  const routeApprovalType =
    routeParams.type === 'LEAVE' ||
    routeParams.type === 'OVERTIME' ||
    routeParams.type === 'TIME_ADJUST' ||
    routeParams.type === 'OFFSITE' ||
    routeParams.type === 'DOCUMENT'
      ? routeParams.type
      : null;

  useEffect(() => {
    if (
      !routeOpenId ||
      !routeApprovalType ||
      !canApprove ||
      routeOpenId === handledOpenId.current
    ) {
      return;
    }

    handledOpenId.current = routeOpenId;
    router.push({
      params: { id: routeOpenId, type: routeApprovalType },
      pathname: '/approval/[type]/[id]',
    });
  }, [canApprove, routeApprovalType, routeOpenId, router]);

  function openFilters() {
    setDraftType(filters.type);
    setDraftStatus(filters.status ?? 'SUBMITTED');
    setDraftDateFrom(
      filters.dateFrom ? new Date(`${filters.dateFrom}T12:00:00`) : null,
    );
    setDraftDateTo(
      filters.dateTo ? new Date(`${filters.dateTo}T12:00:00`) : null,
    );
    setFilterSheetOpen(true);
  }

  function applyFilters() {
    setFilters((current) => ({
      ...current,
      dateFrom: toDateKey(draftDateFrom),
      dateTo: toDateKey(draftDateTo),
      search: searchText.trim() || undefined,
      status: draftStatus,
      type: draftType,
    }));
    setFilterSheetOpen(false);
  }

  function clearAdvancedFilters() {
    setDraftType(undefined);
    setDraftStatus('SUBMITTED');
    setSearchText('');
    setDraftDateFrom(null);
    setDraftDateTo(null);
    setFilters({ status: 'SUBMITTED' });
    setFilterSheetOpen(false);
  }

  const isQueue = filters.status === 'SUBMITTED';

  const renderRow = useCallback(
    ({ index, item }: { index: number; item: ApprovalItem }) => (
      /* แถวอยู่บนผิวขาวตรง ๆ เส้นบนของแถวถัดไปทำหน้าที่เป็นเส้นคั่น */
      <ApprovalRow
        divider={index > 0}
        item={item}
        onPress={() =>
          router.push({
            params: { id: item.id, type: item.type },
            pathname: '/approval/[type]/[id]',
          })
        }
      />
    ),
    [router],
  );

  /*
   * สลับไปจอผู้บริหาร — วางไว้หลัง hook ทุกตัว ลำดับ hook จึงไม่เปลี่ยน
   * ระหว่างเรนเดอร์ไม่ว่าจะเป็นบทบาทไหน (ลิงก์เปิดใบตรง ๆ ข้างบนยังทำงาน
   * ให้ทั้งสองบทบาทเพราะ effect อยู่ก่อนบรรทัดนี้)
   */
  if (isExecutive) {
    return <ExecutiveApprovals canApprove={canApprove} />;
  }

  return (
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <FlatList
          contentContainerStyle={{
            paddingBottom: 116,
            paddingHorizontal: gutter,
          }}
          data={canApprove ? items : []}
          /*
           * ค่าปรับ virtualization — คิวอนุมัติยาวได้ไม่จำกัดเพราะโหลดเพิ่มได้
           * เรื่อย ๆ เรนเดอร์ล่วงหน้าพอให้เลื่อนลื่นแต่ไม่กินแรมเกินจำเป็น
           */
          initialNumToRender={10}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          ListEmptyComponent={
            !canApprove ? null : approvals.isPending ? (
              <View style={{ paddingTop: 20 }}>
                <SkeletonList rows={4} />
              </View>
            ) : approvals.isError ? (
              <View style={{ paddingTop: 20 }}>
                <ErrorState
                  description={
                    approvals.error instanceof ApiError
                      ? approvals.error.message
                      : undefined
                  }
                  onRetry={() => void approvals.refetch()}
                  retrying={approvals.isRefetching}
                />
              </View>
            ) : (
              <View
                style={{ alignItems: 'center', gap: 7, paddingVertical: 30 }}
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
                  <Icon color={AURORA.emerald} name="check-circle" size={23} />
                </View>
                <Text style={{ color: AURORA.text }} variant="bodyStrong">
                  {isQueue ? 'ไม่มีคำขอค้าง' : 'ไม่พบรายการ'}
                </Text>
                <Text
                  style={{ color: AURORA.textMuted, textAlign: 'center' }}
                  variant="caption"
                >
                  {isQueue
                    ? 'เมื่อมีคำขอถึงคิวของคุณ รายการจะแสดงที่นี่'
                    : 'ไม่พบประวัติตามตัวกรองที่เลือก'}
                </Text>
              </View>
            )
          }
          ListFooterComponent={
            approvals.hasNextPage ? (
              <PressableScale
                accessibilityRole="button"
                disabled={approvals.isFetchingNextPage}
                onPress={() => void approvals.fetchNextPage()}
                style={{
                  alignItems: 'center',
                  backgroundColor: AURORA.accentSoft,
                  borderRadius: 16,
                  justifyContent: 'center',
                  marginTop: 20,
                  minHeight: 48,
                  opacity: approvals.isFetchingNextPage ? 0.62 : 1,
                }}
              >
                <Text
                  style={{
                    color: AURORA.accent,
                    fontSize: 13.5,
                    fontWeight: '700',
                    lineHeight: 18,
                  }}
                >
                  {approvals.isFetchingNextPage
                    ? 'กำลังโหลด...'
                    : totalExact
                      ? `โหลดเพิ่มเติม (${items.length}/${total})`
                      : 'โหลดเพิ่มเติม'}
                </Text>
              </PressableScale>
            ) : null
          }
          ListHeaderComponent={
            <View style={{ paddingBottom: 4 }}>
              <Reveal>
                <View
                  style={{
                    borderBottomColor: AURORA.glassBorder,
                    borderBottomWidth: 1,
                    marginHorizontal: -18,
                  }}
                >
                  <PageHero
                    decoration={<ApprovalMotif />}
                    icon="check-square"
                    right={
                      canViewTeam ? (
                        <PressableScale
                          accessibilityLabel="ดูทีมของฉันวันนี้"
                          accessibilityRole="button"
                          onPress={() => router.push('/team')}
                          style={{
                            alignItems: 'center',
                            backgroundColor: AURORA.accent,
                            borderRadius: 999,
                            height: 42,
                            justifyContent: 'center',
                            shadowColor: AURORA.accent,
                            shadowOffset: { height: 4, width: 0 },
                            shadowOpacity: 0.22,
                            shadowRadius: 9,
                            width: 42,
                          }}
                        >
                          <Icon
                            color={AURORA.baseDeep}
                            name="users"
                            size={19}
                          />
                        </PressableScale>
                      ) : null
                    }
                    subtitle={
                      isQueue
                        ? 'ตรวจสอบและดำเนินการคำขอของทีม'
                        : 'รายการที่คุณเคยดำเนินการ'
                    }
                    title={isQueue ? 'รออนุมัติ' : 'ประวัติการอนุมัติ'}
                  />
                </View>
              </Reveal>

              {!canApprove ? (
                <View
                  style={{ alignItems: 'center', gap: 7, paddingVertical: 30 }}
                >
                  <View
                    style={{
                      alignItems: 'center',
                      backgroundColor: 'rgba(148, 163, 184, 0.16)',
                      borderRadius: 999,
                      height: 52,
                      justifyContent: 'center',
                      marginBottom: 4,
                      width: 52,
                    }}
                  >
                    <Icon color={AURORA.textMuted} name="lock" size={23} />
                  </View>
                  <Text style={{ color: AURORA.text }} variant="bodyStrong">
                    บัญชีนี้ไม่ได้รับสิทธิ์อนุมัติคำขอ
                  </Text>
                  <Text
                    style={{ color: AURORA.textMuted, textAlign: 'center' }}
                    variant="caption"
                  >
                    ติดต่อฝ่ายบุคคลหากต้องเป็นผู้อนุมัติของทีม
                  </Text>
                </View>
              ) : (
                <>
                  {/*
                    ช่องค้นหาเป็นช่องพิมพ์จริง ไม่ใช่แถบที่กดแล้วเปิดแผ่น —
                    การค้นหาคือสิ่งที่คนอนุมัติทำบ่อยที่สุด (หาใบของคนใดคนหนึ่ง)
                    ให้พิมพ์ได้ทันทีในจอ ส่วนตัวกรองที่เหลืออยู่ในปุ่มข้าง ๆ
                  */}
                  <Reveal delay={40}>
                    <View
                      style={{
                        alignItems: 'center',
                        flexDirection: 'row',
                        gap: 9,
                        paddingTop: 14,
                      }}
                    >
                      <View
                        style={{
                          alignItems: 'center',
                          backgroundColor: AURORA.glassStrong,
                          borderColor: AURORA.glassBorder,
                          borderRadius: 14,
                          borderWidth: 1,
                          flex: 1,
                          flexDirection: 'row',
                          gap: 9,
                          minHeight: 46,
                          paddingHorizontal: 13,
                        }}
                      >
                        <Icon
                          color={AURORA.textFaint}
                          name="search"
                          size={17}
                        />
                        <TextInput
                          accessibilityLabel="ค้นหารายการอนุมัติ"
                          onChangeText={setSearchText}
                          placeholder="ชื่อ รหัสพนักงาน หรือเลขที่คำขอ"
                          placeholderTextColor={AURORA.textFaint}
                          returnKeyType="search"
                          style={{
                            color: AURORA.text,
                            flex: 1,
                            fontFamily: fontFamily.regular,
                            fontSize: 14,
                            padding: 0,
                          }}
                          value={searchText}
                        />
                        {searchText ? (
                          <Pressable
                            accessibilityLabel="ล้างคำค้นหา"
                            accessibilityRole="button"
                            hitSlop={hitSlop}
                            onPress={() => setSearchText('')}
                          >
                            <Icon
                              color={AURORA.textFaint}
                              name="x-circle"
                              size={17}
                            />
                          </Pressable>
                        ) : null}
                      </View>

                      <Pressable
                        accessibilityLabel="ตัวกรองรายการ"
                        accessibilityRole="button"
                        onPress={openFilters}
                        style={({ pressed }) => ({
                          alignItems: 'center',
                          backgroundColor:
                            advancedFilterCount > 0
                              ? AURORA.accent
                              : pressed
                                ? 'rgba(37, 99, 235, 0.12)'
                                : AURORA.accentSoft,
                          borderRadius: 14,
                          height: 46,
                          justifyContent: 'center',
                          width: 46,
                        })}
                      >
                        <Icon
                          color={
                            advancedFilterCount > 0
                              ? AURORA.baseDeep
                              : AURORA.accent
                          }
                          name="sliders"
                          size={18}
                        />
                        {advancedFilterCount > 0 ? (
                          <View
                            style={{
                              alignItems: 'center',
                              backgroundColor: AURORA.baseDeep,
                              borderRadius: 999,
                              justifyContent: 'center',
                              minWidth: 18,
                              paddingHorizontal: 4,
                              position: 'absolute',
                              right: -4,
                              top: -4,
                            }}
                          >
                            <Text
                              maxScale={1}
                              style={{
                                color: AURORA.accent,
                                fontSize: 10,
                                fontVariant: ['tabular-nums'],
                                fontWeight: '800',
                                lineHeight: 15,
                              }}
                            >
                              {advancedFilterCount}
                            </Text>
                          </View>
                        ) : null}
                      </Pressable>
                    </View>
                  </Reveal>

                  {/* หัวข้อของรายการ ขีดน้ำเงินชุดเดียวกับหมวดในจออื่น */}
                  <Reveal delay={70}>
                    <View
                      style={{
                        alignItems: 'center',
                        flexDirection: 'row',
                        gap: 9,
                        paddingBottom: 4,
                        paddingTop: 20,
                      }}
                    >
                      <View
                        style={{
                          backgroundColor: AURORA.accent,
                          borderRadius: 999,
                          height: 15,
                          width: 3,
                        }}
                      />
                      <Text
                        style={{ color: AURORA.text, flex: 1 }}
                        variant="h3"
                      >
                        {isQueue ? 'คำขอรออนุมัติ' : 'รายการย้อนหลัง'}
                      </Text>
                      <View
                        style={{
                          backgroundColor: AURORA.accentSoft,
                          borderRadius: 999,
                          paddingHorizontal: 9,
                          paddingVertical: 3,
                        }}
                      >
                        <Text
                          style={{
                            color: AURORA.accent,
                            fontSize: 10.5,
                            fontVariant: ['tabular-nums'],
                            fontWeight: '700',
                            lineHeight: 14,
                          }}
                        >
                          {totalExact ? total : `${items.length}+`} รายการ
                        </Text>
                      </View>
                    </View>
                  </Reveal>
                </>
              )}
            </View>
          }
          maxToRenderPerBatch={10}
          refreshControl={
            <RefreshControl
              onRefresh={() => void approvals.refetch()}
              refreshing={approvals.isRefetching}
              tintColor={AURORA.textMuted}
            />
          }
          removeClippedSubviews
          renderItem={renderRow}
          showsVerticalScrollIndicator={false}
          windowSize={7}
        />
      </SafeAreaView>

      <Sheet
        onClose={() => setFilterSheetOpen(false)}
        title="ค้นหาและตัวกรอง"
        visible={filterSheetOpen}
      >
        <View style={{ gap: 18 }}>
          {/*
            ประเภทกับสถานะเป็นดรอปดาวน์ ไม่ใช่ปุ่มมนเรียงพับบรรทัด — สองชุด
            รวมกันสิบปุ่มกินความสูงเกินครึ่งแผ่นจนช่วงวันที่ข้างล่างต้องเลื่อนหา

            `'ALL'` เป็นค่าแทน `undefined` เพราะ `Select` ต้องการค่าจริงเสมอ
            แล้วค่อยแปลงกลับตอนส่งเข้า `filters`
          */}
          <Select
            appearance="aurora"
            label="ประเภทคำขอ"
            mode="inline"
            onChange={(next) =>
              setDraftType(
                next === 'ALL' ? undefined : (next as ApprovalType),
              )
            }
            options={FILTERS.map((option) => ({
              label: option.label,
              value: option.value ?? 'ALL',
            }))}
            value={draftType ?? 'ALL'}
          />

          <Select
            appearance="aurora"
            label="สถานะ"
            mode="inline"
            onChange={(next) => setDraftStatus(next as ApprovalStatus)}
            options={STATUS_FILTERS.map((option) => ({
              label: option.label,
              value: option.value,
            }))}
            value={draftStatus}
          />

          <DateField
            label="ยื่นตั้งแต่วันที่"
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
              variant="secondary"
            />
          ) : null}

          <Button onPress={applyFilters} title="ใช้ตัวกรอง" />
          <Button
            onPress={clearAdvancedFilters}
            title="ล้างตัวกรองทั้งหมด"
            variant="secondary"
          />
        </View>
      </Sheet>
    </View>
  );
}
