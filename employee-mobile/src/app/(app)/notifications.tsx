import { useFocusEffect, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, Sheet, SkeletonList, Text, type IconName } from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  NotificationMotif,
  PageHero,
  PressableScale,
  Reveal,
  SectionAction,
} from '@/design/aurora';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { ProfileAvatar } from '@/features/home/panels';
import { resolveNotificationDestination } from '@/features/notifications/notification-navigation';
import {
  useMarkNotificationsRead,
  useNotifications,
  type NotificationCategory,
  type NotificationItem,
  type NotificationStatus,
} from '@/features/notifications/notifications';
import { ApiError } from '@/lib/api/api-error';
import { useRefetchOnFocus } from '@/lib/query/use-refetch-on-focus';
import { useAppTheme } from '@/theme/use-app-theme';
import { useVisibleStatusBarStyle } from '@/theme/use-status-bar-style';
import { thaiDate, thaiTime } from '@/lib/date/thai-date';

/**
 * ศูนย์แจ้งเตือน
 *
 * ## จัดกลุ่มตามวัน ไม่ใช่รายการยาวรวด
 *
 * กล่องแจ้งเตือนต่างจากรายการอื่นตรงที่ผู้ใช้ไม่ได้มาหา "รายการหนึ่ง" แต่มาดู
 * ว่า **ตั้งแต่ครั้งที่แล้วมีอะไรเกิดขึ้นบ้าง** — คำถามนั้นตอบด้วยเวลา หัวข้อ
 * วัน (วันนี้ / เมื่อวาน / วันที่) จึงเป็นโครงหลักของจอ ไม่ใช่ของประดับ
 * และทำให้ทิ้ง "15 ชั่วโมงที่แล้ว" ที่ต้องคำนวณในหัวออกได้ เหลือแค่เวลานาฬิกา
 *
 * ## รูปคนเป็นตัวแยกชนิดของรายการ
 *
 * รายการที่คนทำ (อนุมัติ/ตีกลับ) ขึ้นรูปคนนั้นพร้อมจุดสถานะซ้อนมุม ส่วนรายการ
 * ที่ระบบสร้างเอง (มาสาย เวลาไม่ครบ) เป็นวงไอคอนสีสถานะล้วน — กวาดตาแล้ว
 * แยกออกทันทีว่าอันไหนมีคนอยู่เบื้องหลังโดยไม่ต้องอ่านข้อความ
 *
 * ตัวกรองอยู่ใน `<Sheet>` ทั้งหมดตามกติกาของแอป — เดิมเป็นชิปสองแถวเต็มจอ
 * ซึ่งกินพื้นที่ครึ่งบนไปกับของที่ผู้ใช้แตะนาน ๆ ครั้ง
 */

const SEVERITY_COLOR: Record<string, string> = {
  critical: AURORA.rose,
  error: AURORA.rose,
  info: AURORA.accent,
  success: '#059669',
  warning: AURORA.amber,
};

const SEVERITY_ICON: Record<string, IconName> = {
  critical: 'alert-octagon',
  error: 'alert-circle',
  info: 'info',
  success: 'check-circle',
  warning: 'alert-triangle',
};

const STATUS_FILTERS: { label: string; value: NotificationStatus }[] = [
  { label: 'ทั้งหมด', value: 'ALL' },
  { label: 'ยังไม่อ่าน', value: 'UNREAD' },
  { label: 'อ่านแล้ว', value: 'READ' },
];

const CATEGORY_FILTERS: { label: string; value: NotificationCategory }[] = [
  { label: 'ทุกประเภท', value: 'ALL' },
  { label: 'คำขอ', value: 'REQUEST' },
  { label: 'เอกสาร', value: 'DOCUMENT' },
  { label: 'เวลา', value: 'ATTENDANCE' },
  { label: 'HR', value: 'HR' },
  { label: 'อื่น ๆ', value: 'OTHER' },
];

/** ขนาดวงรูป/ไอคอนในแถว — เล็กกว่าหัวจอ แต่ยังใหญ่พอให้จำหน้าคนได้ */
const ROW_AVATAR_SIZE = 42;

function dayKey(value: Date) {
  return `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
}

/** หัวข้อกลุ่มวัน — วันนี้/เมื่อวานใช้คำ ที่เหลือใช้วันที่จริง */
function dayLabel(value: Date | null) {
  if (!value) return 'ไม่ระบุวันที่';

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (dayKey(value) === dayKey(today)) return 'วันนี้';
  if (dayKey(value) === dayKey(yesterday)) return 'เมื่อวาน';

  return thaiDate(value, {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  });
}

function timeText(value: Date | null | undefined) {
  if (!value) return '';

  return thaiTime(value);
}

/**
 * จัดรายการเป็นกลุ่มตามวัน โดยคงลำดับเดิมที่ backend ส่งมา
 *
 * ไม่เรียงใหม่เองเพราะลำดับของกล่องแจ้งเตือนคือ "อัปเดตล่าสุดก่อน" ซึ่งไม่ใช่
 * เวลาสร้างเสมอไป (รายการที่ถูกรวมนับเพิ่มจะเด้งขึ้นบนโดยที่ createdAt ไม่ขยับ)
 */
function groupByDay(items: NotificationItem[]) {
  const groups: { items: NotificationItem[]; key: string; label: string }[] = [];

  for (const item of items) {
    const label = dayLabel(item.createdAt ?? null);
    const last = groups[groups.length - 1];

    if (last && last.label === label) {
      last.items.push(item);
      continue;
    }

    groups.push({ items: [item], key: `${label}-${item.id}`, label });
  }

  return groups;
}

function NotificationRow({
  divider,
  item,
  onPress,
}: {
  divider: boolean;
  item: NotificationItem;
  onPress: () => void;
}) {
  const { gutter } = useResponsive();
  const severity = (item.severity ?? 'info').toLowerCase();
  const color = SEVERITY_COLOR[severity] ?? AURORA.accent;
  const icon = SEVERITY_ICON[severity] ?? 'info';
  const unread = !item.readAt;

  return (
    <PressableScale
      accessibilityLabel={`${item.title}${unread ? ' ยังไม่ได้อ่าน' : ''}`}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: 'flex-start',
        /* แถวที่ยังไม่อ่านมีพื้นฟ้าจาง ๆ — เห็นเป็นก้อนได้โดยไม่ต้องอ่านทีละจุด */
        backgroundColor: unread ? 'rgba(37, 99, 235, 0.05)' : 'transparent',
        borderTopColor: AURORA.glassBorder,
        borderTopWidth: divider ? 1 : 0,
        flexDirection: 'row',
        gap: 12,
        /* แถวเต็มความกว้างจอ พื้นของแถวที่ยังไม่อ่านจึงลากถึงขอบทั้งสองข้าง */
        marginHorizontal: -18,
        paddingHorizontal: gutter,
        paddingVertical: 12,
      }}
    >
      {item.actor ? (
        <View style={{ height: ROW_AVATAR_SIZE, width: ROW_AVATAR_SIZE }}>
          <ProfileAvatar
            name={item.actor.displayName}
            size={ROW_AVATAR_SIZE}
            url={item.actor.avatarUrl ?? null}
          />
          <View
            style={{
              alignItems: 'center',
              backgroundColor: '#ffffff',
              borderRadius: 999,
              bottom: -2,
              justifyContent: 'center',
              padding: 1,
              position: 'absolute',
              right: -2,
            }}
          >
            <Icon color={color} name={icon} size={13} />
          </View>
        </View>
      ) : (
        <View
          style={{
            alignItems: 'center',
            backgroundColor: `${color}1a`,
            borderRadius: 15,
            height: ROW_AVATAR_SIZE,
            justifyContent: 'center',
            width: ROW_AVATAR_SIZE,
          }}
        >
          <Icon color={color} name={icon} size={19} />
        </View>
      )}

      <View style={{ flex: 1, gap: 3 }}>
        <Text
          numberOfLines={2}
          style={{
            color: AURORA.text,
            fontWeight: unread ? '800' : '600',
            lineHeight: 20,
          }}
        >
          {item.title}
        </Text>
        <Text
          numberOfLines={2}
          style={{ color: AURORA.textMuted, lineHeight: 17 }}
          variant="caption"
        >
          {item.message}
        </Text>
        {item.actor?.displayName || item.createdAt ? (
          <Text
            numberOfLines={1}
            style={{ color: AURORA.textFaint }}
            variant="caption"
          >
            {[item.actor?.displayName || null, timeText(item.createdAt)]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ) : null}
      </View>

      {unread ? (
        <View
          style={{
            backgroundColor: AURORA.accent,
            borderRadius: 999,
            height: 9,
            marginTop: 6,
            width: 9,
          }}
        />
      ) : null}
    </PressableScale>
  );
}
/**
 * แถวหนึ่งของ FlatList — หัวข้อวันกับแจ้งเตือนอยู่ในชุดเดียวกัน
 *
 * ต้องแบนเป็นชุดเดียวเพราะ FlatList virtualize ได้ทีละ item ถ้าเก็บเป็น
 * "กลุ่มที่มีลูกข้างใน" ทั้งกลุ่มจะถูกเรนเดอร์พร้อมกันอยู่ดี เท่ากับไม่ได้
 * virtualize อะไรเลยสำหรับวันที่มีแจ้งเตือนเยอะ
 */
type ListRow =
  | {
      groupIndex: number;
      key: string;
      kind: 'header';
      label: string;
      total: number;
    }
  | {
      groupSize: number;
      indexInGroup: number;
      item: NotificationItem;
      key: string;
      kind: 'row';
    };

export default function NotificationsScreen() {
  const { gutter } = useResponsive();
  const { resolvedMode } = useAppTheme();
  const router = useRouter();
  const bootstrap = useBootstrap();

  const [status, setStatus] = useState<NotificationStatus>('ALL');
  const [category, setCategory] = useState<NotificationCategory>('ALL');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<NotificationStatus>('ALL');
  const [draftCategory, setDraftCategory] = useState<NotificationCategory>('ALL');

  const inbox = useNotifications({ category, status });
  const { markAll, markOne } = useMarkNotificationsRead();

  useRefetchOnFocus(inbox);

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

  const items = inbox.data?.pages.flatMap((page) => page.items) ?? [];
  const firstPage = inbox.data?.pages[0];
  const lastPage = inbox.data?.pages[inbox.data.pages.length - 1];
  const unreadCount = firstPage?.unreadCount ?? 0;
  const total = firstPage?.meta.total ?? 0;
  const groups = groupByDay(items);

  const activeFilterCount = [status !== 'ALL', category !== 'ALL'].filter(
    Boolean,
  ).length;

  /*
   * เขียนเฉพาะตัวกรองที่ "เลือกไว้จริง" — เดิมเขียนครบทุกช่องเสมอจนกลายเป็น
   * "ทั้งหมด · ทุกประเภท" ซึ่งกินสองบรรทัดเพื่อบอกว่าไม่ได้กรองอะไรเลย
   */
  const filterSummary = [
    status === 'ALL'
      ? null
      : STATUS_FILTERS.find((option) => option.value === status)?.label,
    category === 'ALL'
      ? null
      : CATEGORY_FILTERS.find((option) => option.value === category)?.label,
  ]
    .filter(Boolean)
    .join(' · ');

  function clearFilters() {
    setDraftStatus('ALL');
    setDraftCategory('ALL');
    setStatus('ALL');
    setCategory('ALL');
    setFilterSheetOpen(false);
  }

  function openFilters() {
    setDraftStatus(status);
    setDraftCategory(category);
    setFilterSheetOpen(true);
  }

  function applyFilters() {
    setStatus(draftStatus);
    setCategory(draftCategory);
    setFilterSheetOpen(false);
  }

  const openNotification = useCallback(
    async (item: NotificationItem) => {
      if (!item.readAt) {
        try {
          await markOne.mutateAsync(item.id);
        } catch {
          /* การ mark read ล้มเหลวไม่ควรขวางการเปิดข้อมูลที่ผู้ใช้แตะ */
        }
      }

      const destination = resolveNotificationDestination(
        {
          entityId: item.entityId,
          entityType: item.entityType,
          notificationType: item.type,
        },
        bootstrap.data?.featureFlags,
      );

      if (destination) {
        router.push(destination as never);
      }
      /* ไม่มี Mobile entity screen = อยู่ Inbox เดิม ไม่พาไปหน้าผิด */
    },
    [bootstrap.data?.featureFlags, markOne, router],
  );

  const rows: ListRow[] = [];

  groups.forEach((group, groupIndex) => {
    rows.push({
      groupIndex,
      key: `day-${group.key}`,
      kind: 'header',
      label: group.label,
      total: group.items.length,
    });

    group.items.forEach((item, indexInGroup) => {
      rows.push({
        groupSize: group.items.length,
        indexInGroup,
        item,
        key: item.id,
        kind: 'row',
      });
    });
  });

  const renderRow = useCallback(
    ({ item: row }: { item: ListRow }) =>
      row.kind === 'header' ? (
        /*
          หัวข้อวันเป็นแถบพื้นเทาจางเต็มความกว้าง ไม่ใช่ตัวหนังสือลอย ๆ —
          จอนี้อ่านเป็น "ช่วงเวลา" มากกว่า "รายการ" แถบจึงต้องแยกวันออกจาก
          กันให้ชัดตอนเลื่อนผ่านเร็ว ๆ
        */
        <View
          style={{
            alignItems: 'center',
            backgroundColor: 'rgba(148, 163, 184, 0.08)',
            borderBottomColor: AURORA.glassBorder,
            borderBottomWidth: 1,
            borderTopColor: AURORA.glassBorder,
            borderTopWidth: row.groupIndex === 0 ? 0 : 1,
            flexDirection: 'row',
            gap: 8,
            marginHorizontal: -18,
            marginTop: row.groupIndex === 0 ? 0 : 18,
            paddingHorizontal: gutter,
            paddingVertical: 7,
          }}
        >
          <Text
            maxScale={1.2}
            numberOfLines={1}
            style={{
              color: AURORA.textMuted,
              flex: 1,
              fontSize: 10.5,
              fontWeight: '800',
              letterSpacing: 1.1,
              lineHeight: 15,
            }}
          >
            {row.label}
          </Text>
          <Text
            maxScale={1.1}
            style={{
              color: AURORA.textFaint,
              fontSize: 10.5,
              fontVariant: ['tabular-nums'],
              lineHeight: 15,
            }}
          >
            {row.total}
          </Text>
        </View>
      ) : (
        /* แถวอยู่บนผิวขาวตรง ๆ เส้นบนของแถวถัดไปทำหน้าที่เป็นเส้นคั่น */
        <NotificationRow
          divider={row.indexInGroup > 0}
          item={row.item}
          onPress={() => void openNotification(row.item)}
        />
      ),
    /* gutter อยู่ใน deps เพราะหัวข้อกลุ่มในรายการใช้ระยะขอบตามขนาดจอ —
       ลากแบ่งจอบนแท็บเล็ตแล้วต้องวาดใหม่ ไม่ใช่ค้างระยะเดิมไว้ */
    [gutter, openNotification],
  );

  return (
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <FlatList
          contentContainerStyle={{
            paddingBottom: 40,
            paddingHorizontal: gutter,
          }}
          data={rows}
          /*
           * ค่าปรับ virtualization — รายการนี้ยาวได้ไม่จำกัดเพราะกดโหลดเพิ่ม
           * ไปเรื่อย ๆ เรนเดอร์ล่วงหน้าพอให้เลื่อนลื่นแต่ไม่กินแรมเกินจำเป็น
           */
          initialNumToRender={12}
          keyExtractor={(row) => row.key}
          ListEmptyComponent={
            inbox.isPending ? (
              <View style={{ paddingTop: 24 }}>
                <SkeletonList rows={5} />
              </View>
            ) : inbox.isError ? (
              <View style={{ alignItems: 'center', gap: 7, paddingVertical: 26 }}>
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
                  โหลดการแจ้งเตือนไม่สำเร็จ
                </Text>
                <Text
                  style={{ color: AURORA.textMuted, textAlign: 'center' }}
                  variant="caption"
                >
                  {inbox.error instanceof ApiError
                    ? inbox.error.message
                    : 'กรุณาลองใหม่อีกครั้ง'}
                </Text>
                <SectionAction
                  label={inbox.isRefetching ? 'กำลังโหลด...' : 'ลองใหม่'}
                  onPress={() => void inbox.refetch()}
                />
              </View>
            ) : (
              <View style={{ alignItems: 'center', gap: 7, paddingVertical: 26 }}>
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
                  <Icon color={AURORA.accent} name="bell" size={23} />
                </View>
                <Text style={{ color: AURORA.text }} variant="bodyStrong">
                  {activeFilterCount > 0
                    ? 'ไม่พบรายการ'
                    : 'ยังไม่มีการแจ้งเตือน'}
                </Text>
                <Text
                  style={{ color: AURORA.textMuted, textAlign: 'center' }}
                  variant="caption"
                >
                  {activeFilterCount > 0
                    ? 'ลองเปลี่ยนตัวกรองที่เลือกไว้'
                    : 'เมื่อมีคนดำเนินการกับคำขอของคุณ รายการจะมาแสดงที่นี่'}
                </Text>
              </View>
            )
          }
          ListFooterComponent={
            lastPage?.meta.hasMore ? (
              <PressableScale
                accessibilityRole="button"
                disabled={inbox.isFetchingNextPage}
                onPress={() => void inbox.fetchNextPage()}
                style={{
                  alignItems: 'center',
                  backgroundColor: AURORA.accentSoft,
                  borderRadius: 16,
                  justifyContent: 'center',
                  marginTop: 20,
                  minHeight: 48,
                  opacity: inbox.isFetchingNextPage ? 0.62 : 1,
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
                  {inbox.isFetchingNextPage
                    ? 'กำลังโหลด...'
                    : `โหลดเพิ่มเติม (${items.length}/${total})`}
                </Text>
              </PressableScale>
            ) : null
          }
          ListHeaderComponent={
            <View style={{ paddingBottom: 6 }}>
              {/* หัวจอชุดเดียวกับทุกจอ วงไอคอนขาวเป็นปุ่มย้อนกลับ */}
              <Reveal>
                <View
                  style={{
                    borderBottomColor: AURORA.glassBorder,
                    borderBottomWidth: 1,
                    marginHorizontal: -18,
                  }}
                >
                  <PageHero
                    decoration={<NotificationMotif />}
                    icon="arrow-left"
                    iconLabel="ย้อนกลับ"
                    onIconPress={() => router.back()}
                    right={
                      unreadCount > 0 ? (
                        <PressableScale
                          accessibilityLabel="ทำเครื่องหมายว่าอ่านทั้งหมด"
                          accessibilityRole="button"
                          disabled={markAll.isPending}
                          onPress={() => markAll.mutate()}
                          style={{
                            alignItems: 'center',
                            backgroundColor: AURORA.accent,
                            borderRadius: 999,
                            height: 42,
                            justifyContent: 'center',
                            opacity: markAll.isPending ? 0.6 : 1,
                            shadowColor: AURORA.accent,
                            shadowOffset: { height: 4, width: 0 },
                            shadowOpacity: 0.22,
                            shadowRadius: 9,
                            width: 42,
                          }}
                        >
                          {markAll.isPending ? (
                            <ActivityIndicator
                              color={AURORA.baseDeep}
                              size="small"
                            />
                          ) : (
                            <Icon
                              color={AURORA.baseDeep}
                              name="check-circle"
                              size={19}
                            />
                          )}
                        </PressableScale>
                      ) : null
                    }
                    subtitle={
                      unreadCount > 0
                        ? `ยังไม่ได้อ่าน ${unreadCount} จาก ${total} รายการ`
                        : `อ่านครบแล้ว · ทั้งหมด ${total} รายการ`
                    }
                    title="การแจ้งเตือน"
                  />
                </View>
              </Reveal>

              {/*
                แถบตัวกรองเต็มความกว้างต่อจากหัวจอ — บอก "ตอนนี้เห็นอะไรอยู่"
                ไม่ใช่ท่องชื่อช่องตัวกรอง ตอนกรองอยู่จะเป็นสีฟ้าพร้อมปุ่มล้าง
                ในตัว เพราะการเลิกกรองคือสิ่งที่คนกดต่อบ่อยที่สุด
              */}
              <Reveal delay={40}>
                <Pressable
                  accessibilityLabel="ตัวกรองการแจ้งเตือน"
                  accessibilityRole="button"
                  onPress={openFilters}
                  style={({ pressed }) => ({
                    alignItems: 'center',
                    backgroundColor: pressed
                      ? 'rgba(37, 99, 235, 0.06)'
                      : activeFilterCount > 0
                        ? AURORA.accentSoft
                        : 'transparent',
                    borderBottomColor: AURORA.glassBorder,
                    borderBottomWidth: 1,
                    flexDirection: 'row',
                    gap: 12,
                    marginHorizontal: -18,
                    paddingHorizontal: gutter,
                    paddingVertical: 11,
                  })}
                >
                  <View
                    style={{
                      alignItems: 'center',
                      backgroundColor:
                        activeFilterCount > 0
                          ? AURORA.accent
                          : AURORA.accentSoft,
                      borderRadius: 13,
                      height: 38,
                      justifyContent: 'center',
                      width: 38,
                    }}
                  >
                    <Icon
                      color={
                        activeFilterCount > 0 ? AURORA.baseDeep : AURORA.accent
                      }
                      name="sliders"
                      size={17}
                    />
                  </View>

                  <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        color: AURORA.textMuted,
                        fontSize: 11,
                        lineHeight: 15,
                      }}
                    >
                      {activeFilterCount > 0 ? 'กรองอยู่' : 'ตัวกรอง'}
                    </Text>
                    <Text
                      maxScale={1.15}
                      numberOfLines={1}
                      style={{
                        color:
                          activeFilterCount > 0 ? AURORA.accent : AURORA.text,
                        fontSize: 14,
                        fontWeight: '700',
                        lineHeight: 19,
                      }}
                    >
                      {activeFilterCount > 0
                        ? filterSummary
                        : `แจ้งเตือนทั้งหมด ${total} รายการ`}
                    </Text>
                  </View>

                  {activeFilterCount > 0 ? (
                    <PressableScale
                      accessibilityLabel="ล้างตัวกรอง"
                      accessibilityRole="button"
                      onPress={clearFilters}
                      style={{
                        alignItems: 'center',
                        backgroundColor: AURORA.baseDeep,
                        borderRadius: 999,
                        height: 32,
                        justifyContent: 'center',
                        width: 32,
                      }}
                    >
                      <Icon color={AURORA.accent} name="x" size={16} />
                    </PressableScale>
                  ) : (
                    <Icon
                      color={AURORA.textFaint}
                      name="chevron-right"
                      size={17}
                    />
                  )}
                </Pressable>
              </Reveal>
            </View>
          }
          maxToRenderPerBatch={10}
          /*
           * ดึงเพื่อรีเฟรชมีเฉพาะบนมือถือ — react-native-web ไม่ได้ทำ
           * RefreshControl ให้ครบ มันส่ง prop อย่าง refreshing ลงไปเป็น
           * attribute ของ DOM ตรง ๆ แล้วขึ้น error แดงคาจอตอน dev
           */
          refreshControl={
            Platform.OS === 'web' ? undefined : (
              <RefreshControl
                onRefresh={() => void inbox.refetch()}
                refreshing={inbox.isRefetching && !inbox.isFetchingNextPage}
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
        onClose={() => setFilterSheetOpen(false)}
        title="ตัวกรองการแจ้งเตือน"
        visible={filterSheetOpen}
      >
        <View style={{ gap: 18 }}>
          <FilterGroup
            onSelect={setDraftStatus}
            options={STATUS_FILTERS}
            title="สถานะ"
            value={draftStatus}
          />
          <FilterGroup
            onSelect={setDraftCategory}
            options={CATEGORY_FILTERS}
            title="ประเภท"
            value={draftCategory}
          />

          <PressableScale
            accessibilityRole="button"
            onPress={applyFilters}
            style={{
              alignItems: 'center',
              backgroundColor: AURORA.accent,
              borderRadius: 18,
              justifyContent: 'center',
              minHeight: 50,
            }}
          >
            <Text style={{ color: '#ffffff', fontWeight: '700' }}>
              แสดงผลลัพธ์
            </Text>
          </PressableScale>

          {activeFilterCount > 0 ? (
            <PressableScale
              accessibilityRole="button"
              onPress={clearFilters}
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 44,
              }}
            >
              <Text style={{ color: AURORA.textMuted, fontWeight: '700' }}>
                ล้างตัวกรองทั้งหมด
              </Text>
            </PressableScale>
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}

/** กลุ่มตัวเลือกในแผ่นตัวกรอง — ปุ่มมนเรียงพับบรรทัดตามกติกาของแอป */
function FilterGroup<T extends string>({
  onSelect,
  options,
  title,
  value,
}: {
  onSelect: (next: T) => void;
  options: { label: string; value: T }[];
  title: string;
  value: T;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text variant="label">{title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((option) => {
          const active = option.value === value;

          return (
            <PressableScale
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={option.value}
              onPress={() => onSelect(option.value)}
              style={{
                backgroundColor: active ? AURORA.accent : 'transparent',
                borderColor: active ? AURORA.accent : AURORA.glassBorder,
                borderRadius: 999,
                borderWidth: 1,
                justifyContent: 'center',
                minHeight: 38,
                paddingHorizontal: 13,
              }}
            >
              <Text
                style={{ color: active ? '#ffffff' : AURORA.textMuted }}
                variant="caption"
              >
                {option.label}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}
