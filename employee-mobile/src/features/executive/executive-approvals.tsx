import { useRouter } from 'expo-router';
import { useCallback, useState, type ComponentProps } from 'react';
import { FlatList, Platform, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Button,
  DateField,
  Icon,
  Input,
  Select,
  Sheet,
  Text,
  hitSlop,
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
import { TABULAR, UnderlineTabs } from '@/features/executive/royal';
import {
  APPROVAL_TYPE_LABEL,
  type ApprovalType,
} from '@/features/requests/requests.types';
import { ApiError } from '@/lib/api/api-error';
import { useRefetchOnFocus } from '@/lib/query/use-refetch-on-focus';
import { thaiDate } from '@/lib/date/thai-date';

/**
 * แท็บอนุมัติของผู้บริหาร — ผิวเดียวกับจอภาพรวมและจอลา/โอที
 *
 * เนื้อหาเป็นคิวอนุมัติชุดเดียวกับของหัวหน้างาน (`useApprovals`) แต่จอนี้
 * แยกออกมาเพราะเนื้อหาต่างกัน (คิวทั้งบริษัท ไม่ใช่คิวของทีมตัวเอง) ส่วนผิว
 * ตอนนี้เป็นชุดเดียวกับจอพนักงานแล้ว — ผิวขาว `PageHero` + `AURORA`
 * เดิมเป็นผิว `ROYAL` เฉพาะห้องผู้บริหาร ซึ่งสลับแท็บมาแล้วเหมือนคนละแอป
 *
 * สถานะย้ายขึ้นมาเป็นแท็บขีดใต้แทนที่จะซ่อนในแผ่นตัวกรอง เพราะเป็นสิ่งที่
 * ผู้บริหารสลับบ่อยที่สุด (ดูคิวค้าง ↔ ดูว่าตัวเองตัดสินอะไรไปแล้ว) ในแผ่น
 * ตัวกรองจึงเหลือเฉพาะของที่ตั้งนาน ๆ ครั้ง — คำค้น ประเภท และช่วงวันที่
 */

type IconName = ComponentProps<typeof Icon>['name'];

/** ไอคอน Feather ชุดเดียวกับทั้งแอป — เส้นหนาเท่ากันทุกตัว ไม่ผสมสองบุคลิก */
const TYPE_ICON: Record<ApprovalType, IconName> = {
  DOCUMENT: 'file-text',
  LEAVE: 'sun',
  OFFSITE: 'map-pin',
  OVERTIME: 'moon',
  TIME_ADJUST: 'clock',
};

const STATUS_TABS: { label: string; value: ApprovalStatus }[] = [
  { label: 'รออนุมัติ', value: 'SUBMITTED' },
  { label: 'อนุมัติแล้ว', value: 'APPROVED' },
  { label: 'ไม่อนุมัติ', value: 'REJECTED' },
  { label: 'ส่งกลับ', value: 'RETURNED' },
];

const TYPE_FILTERS: { label: string; value: ApprovalType | undefined }[] = [
  { label: 'ทั้งหมด', value: undefined },
  { label: 'ลา', value: 'LEAVE' },
  { label: 'โอที', value: 'OVERTIME' },
  { label: 'แก้เวลา', value: 'TIME_ADJUST' },
  { label: 'นอกสถานที่', value: 'OFFSITE' },
  { label: 'เอกสาร', value: 'DOCUMENT' },
];

const toDateKey = (value: Date | null) => {
  if (!value) return undefined;

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

/** "ยื่น 2 ก.ย." — ปีย่อสองหลักเฉพาะตอนไม่ใช่ปีปัจจุบัน จะได้ไม่กินที่เปล่า */
function submittedLabel(value: Date | null | undefined): string | undefined {
  if (!value) return undefined;

  const sameYear = value.getFullYear() === new Date().getFullYear();

  return `ยื่น ${thaiDate(value, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: '2-digit' }),
  })}`;
}

/**
 * หนึ่งใบในคิว — แถวบนพื้นขาว คั่นด้วยเส้นบาง ไม่ใช่การ์ดลอย
 *
 * คอลัมน์ขวาเป็นประเภทคำขอกับวันที่ยื่นซ้อนกันสองบรรทัด แทนที่จะต่อท้าย
 * ชื่อแผนก เพราะชื่อบริษัท/แผนกของลูกค้ายาวจนบรรทัดถูกตัดทิ้งทั้งท่อน
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
  const submitted = submittedLabel(item.submittedAt ?? item.createdAt);
  const meta =
    [item.employeeCode, item.department].filter(Boolean).join(' · ') || '—';

  return (
    <PressableScale
      accessibilityLabel={`ดูคำขอของ ${item.employeeName ?? 'พนักงาน'}`}
      onPress={onPress}
      style={{
        alignItems: 'center',
        borderTopColor: AURORA.glassBorder,
        borderTopWidth: divider ? 1 : 0,
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: gutter,
        paddingVertical: 12,
      }}
    >
      <View
        style={{
          alignItems: 'center',
          backgroundColor: AURORA.accentSoft,
          borderRadius: 999,
          height: 38,
          justifyContent: 'center',
          width: 38,
        }}
      >
        <Icon color={AURORA.accent} name={TYPE_ICON[item.type]} size={17} />
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Text
          numberOfLines={1}
          style={{ color: AURORA.text, fontSize: 13.5, fontWeight: '600' }}
        >
          {item.employeeName ?? 'ไม่ระบุชื่อ'}
        </Text>
        <Text numberOfLines={1} style={{ color: AURORA.text, fontSize: 11.5 }}>
          {item.title}
        </Text>
        <Text numberOfLines={1} style={{ color: AURORA.textMuted, fontSize: 10.5 }}>
          {meta}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text
          maxScale={1.1}
          numberOfLines={1}
          style={{ color: AURORA.accent, fontSize: 12, fontWeight: '700' }}
        >
          {APPROVAL_TYPE_LABEL[item.type]}
        </Text>
        {submitted ? (
          <Text
            maxScale={1.1}
            numberOfLines={1}
            style={[TABULAR, { color: AURORA.textMuted, fontSize: 10 }]}
          >
            {submitted}
          </Text>
        ) : null}
      </View>

      <Icon color={AURORA.textMuted} name="chevron-right" size={16} />
    </PressableScale>
  );
}

/** ป๊อปอัพตัวกรอง — เปิดจากไอคอนเล็กข้างหัวรายการ ไม่มีตัวเลือกคาอยู่บนจอ */
function FilterSheet({
  onApply,
  onClear,
  onClose,
  value,
  visible,
}: {
  onApply: (next: {
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    type?: ApprovalType;
  }) => void;
  onClear: () => void;
  onClose: () => void;
  value: ApprovalListFilters;
  visible: boolean;
}) {
  /* ค่าที่แตะอยู่เก็บแยกจากตัวกรองจริง ไม่งั้นทุกครั้งที่แตะจะยิง query ใหม่ */
  const [search, setSearch] = useState(value.search ?? '');
  const [type, setType] = useState<ApprovalType | undefined>(value.type);
  const [from, setFrom] = useState<Date | null>(
    value.dateFrom ? new Date(`${value.dateFrom}T12:00:00`) : null,
  );
  const [to, setTo] = useState<Date | null>(
    value.dateTo ? new Date(`${value.dateTo}T12:00:00`) : null,
  );

  return (
    <Sheet onClose={onClose} title="ค้นหาและตัวกรอง" visible={visible}>
      <View style={{ gap: 18 }}>
        <Input
          icon="search-outline"
          label="ค้นหา"
          onChangeText={setSearch}
          placeholder="ชื่อ รหัสพนักงาน เลขที่คำขอ หรือเหตุผล"
          value={search}
        />

        {/*
          `'ALL'` เป็นค่าแทน `undefined` เพราะ `Select` ต้องการค่าจริงเสมอ
          แล้วค่อยแปลงกลับตอนกดใช้ตัวกรอง
        */}
        <Select
          appearance="aurora"
          label="ประเภทคำขอ"
          mode="inline"
          onChange={(next) =>
            setType(next === 'ALL' ? undefined : (next as ApprovalType))
          }
          options={TYPE_FILTERS.map((option) => ({
            label: option.label,
            value: option.value ?? 'ALL',
          }))}
          value={type ?? 'ALL'}
        />

        <DateField
          label="ยื่นตั้งแต่วันที่"
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

        {from || to ? (
          <Button
            onPress={() => {
              setFrom(null);
              setTo(null);
            }}
            title="ล้างช่วงวันที่"
            variant="secondary"
          />
        ) : null}

        <Button
          onPress={() =>
            onApply({
              dateFrom: toDateKey(from),
              dateTo: toDateKey(to),
              search: search.trim() || undefined,
              type,
            })
          }
          title="ใช้ตัวกรอง"
        />
        <Button
          onPress={() => {
            setSearch('');
            setType(undefined);
            setFrom(null);
            setTo(null);
            onClear();
          }}
          title="ล้างตัวกรองทั้งหมด"
          variant="secondary"
        />
      </View>
    </Sheet>
  );
}

export function ExecutiveApprovals({ canApprove }: { canApprove: boolean }) {
  const { gutter } = useResponsive();
  const router = useRouter();
  const [filters, setFilters] = useState<ApprovalListFilters>({
    status: 'SUBMITTED',
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const approvals = useApprovals(filters, canApprove);
  const items = approvals.data?.pages.flatMap((page) => page.items) ?? [];
  const meta = approvals.data?.pages[0]?.meta;
  const total = meta?.total ?? 0;
  const totalExact = meta?.totalExact ?? true;
  const status = filters.status ?? 'SUBMITTED';
  const isQueue = status === 'SUBMITTED';
  const hasFilter = Boolean(
    filters.type || filters.search || filters.dateFrom || filters.dateTo,
  );

  /* คนอื่นอาจอนุมัติใบเดียวกันไปแล้วระหว่างที่จอนี้ค้างอยู่เบื้องหลัง */
  useRefetchOnFocus(approvals);

  const renderRow = useCallback(
    ({ index, item }: { index: number; item: ApprovalItem }) => (
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

  return (
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        {/*
         * FlatList เป็นตัวเลื่อนของทั้งจอ ไม่ใช่ ScrollView ครอบ `.map()` —
         * คิวยาวได้ไม่จำกัดเพราะโหลดเพิ่มได้เรื่อย ๆ หัวจอจึงไปอยู่ใน
         * ListHeaderComponent (กติกาเดียวกับแท็บอนุมัติของพนักงาน)
         */}
        <FlatList
          contentContainerStyle={{ paddingBottom: 40 }}
          data={canApprove ? items : []}
          initialNumToRender={10}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          ListEmptyComponent={
            !canApprove ? null : approvals.isPending ? (
              <View style={{ gap: 12, paddingHorizontal: gutter }}>
                <View
                  style={{ backgroundColor: AURORA.glassBorder, borderRadius: 8, height: 62 }}
                />
                <View
                  style={{ backgroundColor: AURORA.glassBorder, borderRadius: 8, height: 62 }}
                />
                <View
                  style={{ backgroundColor: AURORA.glassBorder, borderRadius: 8, height: 62 }}
                />
              </View>
            ) : approvals.isError ? (
              <View style={{ gap: 6, paddingHorizontal: gutter }}>
                <Text style={{ color: AURORA.text, fontSize: 14, fontWeight: '600' }}>
                  โหลดรายการไม่สำเร็จ
                </Text>
                <Text style={{ color: AURORA.textMuted, fontSize: 12 }}>
                  {approvals.error instanceof ApiError
                    ? approvals.error.message
                    : 'ลองใหม่อีกครั้ง'}
                </Text>
                <PressableScale
                  onPress={() => void approvals.refetch()}
                  style={{ alignSelf: 'flex-start' }}
                >
                  <Text style={{ color: AURORA.accent, fontSize: 13, fontWeight: '700' }}>
                    ลองใหม่
                  </Text>
                </PressableScale>
              </View>
            ) : (
              /* ไม่ซ่อนหมวดทิ้งเมื่อว่าง — ต้องแยกออกว่า "ไม่มีคำขอ" ไม่ใช่ "ระบบพัง" */
              <Text
                style={{
                  color: AURORA.textMuted,
                  fontSize: 12.5,
                  paddingHorizontal: gutter,
                }}
              >
                {isQueue
                  ? hasFilter
                    ? 'ไม่มีคำขอค้างตามตัวกรองที่เลือก'
                    : 'ไม่มีคำขอค้างในคิวของคุณ เมื่อมีใบใหม่จะขึ้นที่นี่'
                  : 'ไม่พบรายการตามตัวกรองที่เลือก'}
              </Text>
            )
          }
          ListFooterComponent={
            approvals.hasNextPage ? (
              <PressableScale
                disabled={approvals.isFetchingNextPage}
                onPress={() => void approvals.fetchNextPage()}
                style={{
                  alignItems: 'center',
                  borderTopColor: AURORA.glassBorder,
                  borderTopWidth: 1,
                  marginHorizontal: 18,
                  opacity: approvals.isFetchingNextPage ? 0.6 : 1,
                  paddingTop: 14,
                }}
              >
                <Text style={{ color: AURORA.accent, fontSize: 13, fontWeight: '700' }}>
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
            <View>
              <Reveal>
                <PageHero
                  decoration={<ApprovalMotif />}
                  icon="check-square"
                  subtitle="คำขอที่รอการตัดสินใจของคุณ และสิ่งที่ตัดสินไปแล้ว"
                  title="อนุมัติ"
                />
              </Reveal>

              {!canApprove ? (
                <Reveal delay={90}>
                  <View style={{ gap: 14, paddingHorizontal: gutter, paddingTop: 24 }}>
                    <View
                      style={{ alignItems: 'center', flexDirection: 'row', gap: 12 }}
                    >
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
                        <Icon color={AURORA.accent} name="lock" size={18} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text
                          style={{ color: AURORA.text, fontSize: 14, fontWeight: '600' }}
                        >
                          บัญชีนี้ไม่ได้รับสิทธิ์อนุมัติคำขอ
                        </Text>
                        <Text style={{ color: AURORA.textMuted, fontSize: 12 }}>
                          ติดต่อฝ่ายบุคคลเพื่อขอเปิดสิทธิ์
                        </Text>
                      </View>
                    </View>
                  </View>
                </Reveal>
              ) : (
                <Reveal delay={90}>
                  <View style={{ gap: 14, paddingHorizontal: gutter, paddingTop: 24 }}>
                    <UnderlineTabs<ApprovalStatus>
                      onChange={(next) =>
                        setFilters((current) => ({ ...current, status: next }))
                      }
                      options={STATUS_TABS}
                      value={status}
                    />

                    <View
                      style={{ alignItems: 'center', flexDirection: 'row', gap: 9 }}
                    >
                      {/* หัวข้อหมวดชุดเดียวกับ `PageSection` ของจอพนักงาน —
                          ขีดน้ำเงินสั้นนำหน้า ไม่ใช่ป้ายตัวเล็กเว้นวรรคกว้าง */}
                      <View
                        style={{
                          backgroundColor: AURORA.accent,
                          borderRadius: 999,
                          height: 15,
                          width: 3,
                        }}
                      />
                      <Text
                        numberOfLines={1}
                        style={{ color: AURORA.text, flex: 1 }}
                        variant="h3"
                      >
                        {isQueue ? 'คำขอรออนุมัติ' : 'รายการย้อนหลัง'}
                      </Text>

                      <Text
                        maxScale={1.1}
                        style={[
                          TABULAR,
                          { color: AURORA.textFaint, fontSize: 11.5 },
                        ]}
                      >
                        {`${totalExact ? total : `${items.length}+`} รายการ`}
                      </Text>

                      {/* ตัวกรองเป็นไอคอนเล็ก — เปลี่ยนเป็นพื้นฟ้าเมื่อกรองอยู่
                          ไม่งั้นผู้ใช้เห็นรายการสั้นผิดปกติแล้วนึกว่าข้อมูลหาย */}
                      <PressableScale
                        accessibilityLabel="ค้นหาและกรองรายการ"
                        hitSlop={hitSlop}
                        onPress={() => setFilterOpen(true)}
                        style={{
                          alignItems: 'center',
                          backgroundColor: hasFilter ? AURORA.accent : AURORA.accentSoft,
                          borderRadius: 999,
                          height: 30,
                          justifyContent: 'center',
                          width: 30,
                        }}
                      >
                        <Icon
                          color={hasFilter ? '#ffffff' : AURORA.accent}
                          name="sliders"
                          size={15}
                        />
                      </PressableScale>
                    </View>
                  </View>
                </Reveal>
              )}
            </View>
          }
          maxToRenderPerBatch={10}
          refreshControl={
            Platform.OS === 'web' ? undefined : (
              <RefreshControl
                onRefresh={() => void approvals.refetch()}
                refreshing={approvals.isRefetching}
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

      {/* คีย์ตามค่าที่ใช้อยู่ เพื่อให้แผ่นเริ่มจากค่าปัจจุบันทุกครั้งที่เปิด */}
      <FilterSheet
        key={`${filters.type ?? ''}|${filters.search ?? ''}|${filters.dateFrom ?? ''}|${filters.dateTo ?? ''}`}
        onApply={(next) => {
          setFilters((current) => ({ ...current, ...next }));
          setFilterOpen(false);
        }}
        onClear={() => {
          setFilters({ status });
          setFilterOpen(false);
        }}
        onClose={() => setFilterOpen(false)}
        value={filters}
        visible={filterOpen}
      />
    </View>
  );
}
