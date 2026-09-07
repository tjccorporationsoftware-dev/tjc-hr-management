import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ConfirmDialog,
  Icon,
  Skeleton,
  Text,
  hitSlop,
  useToast,
  type IconName,
} from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  PageHero,
  PageSection,
  PressableScale,
  RequestDetailMotif,
  Reveal,
} from '@/design/aurora';
import {
  AttachmentImagePreview,
  isImageAttachment,
} from '@/features/requests/attachment-preview';
import {
  REQUEST_STATUS_LABEL,
  REQUEST_TYPE_LABEL,
  requestTypeSchema,
  type RequestAttachment,
  type RequestType,
} from '@/features/requests/requests.types';
import {
  useCancelRequest,
  useDeleteDraftRequest,
  useRequestDetail,
  useSubmitRequest,
} from '@/features/requests/use-requests';
import { ApiError } from '@/lib/api/api-error';
import { useAppTheme } from '@/theme/use-app-theme';
import { useVisibleStatusBarStyle } from '@/theme/use-status-bar-style';
import { thaiDate } from '@/lib/date/thai-date';
import {
  deleteRequestAttachment,
  shareRequestAttachment,
} from '@/features/requests/attachment';

/*
 * สีของสถานะ — ชุดเดียวกับรายการคำขอ () และการ์ด
 * "คำขอล่าสุด" บนหน้าหลัก ใบเดียวกันต้องได้สีเดียวกันทุกที่ที่มันไปโผล่
 *
 * อนุมัติแล้ว = เขียว ไม่ใช่น้ำเงิน — น้ำเงินเป็นสีของ "ของทั่วไป" ในแอปนี้
 * (ปุ่ม ลิงก์ ไอคอน) ผลลัพธ์ที่จบแล้วต้องแยกออกจากสีพื้นฐานถึงจะอ่านออก
 * ตั้งแต่เหลือบตาว่าใบนี้ผ่านแล้ว
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

/** แปลงวันที่แบบ API ภายในข้อความให้เป็นวัน–เดือน–ปีไทย โดยไม่แตะเลขที่คำขอ */
const displayText = (value: string) =>
  value.replace(
    /\b(\d{4})-(\d{2})-(\d{2})\b/g,
    (_match, year: string, month: string, day: string) =>
      thaiDate(new Date(Number(year), Number(month) - 1, Number(day)), {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
  );

/**
 * หนึ่งค่าในหมวด — ป้ายซ้าย ค่าขวา คั่นด้วยเส้นบาง
 *
 * เดิมเป็นตารางสองคอลัมน์ (`InfoCell`) ที่ค่ายาว ๆ ถูกตัดเหลือสองบรรทัดจน
 * อ่านไม่จบ แบบแถวยาวเต็มความกว้างให้ที่กับค่ามากกว่า และเรียงตากวาดลงล่าง
 * ได้ต่อเนื่องกว่าตารางที่ตาต้องเด้งซ้ายขวา
 */
function DataRow({
  divider,
  label,
  value,
}: {
  divider: boolean;
  label: string;
  value: string;
}) {
  return (
    <View
      style={{
        borderTopColor: AURORA.glassBorder,
        borderTopWidth: divider ? 1 : 0,
        flexDirection: 'row',
        gap: 16,
        paddingVertical: 10,
      }}
    >
      <Text
        maxScale={1.2}
        style={{
          color: AURORA.textMuted,
          flex: 1,
          fontSize: 12.5,
          lineHeight: 18,
        }}
      >
        {label}
      </Text>
      <Text
        maxScale={1.2}
        style={{
          color: AURORA.text,
          flexShrink: 1,
          fontSize: 13,
          fontVariant: ['tabular-nums'],
          fontWeight: '600',
          lineHeight: 18,
          textAlign: 'right',
        }}
      >
        {displayText(value)}
      </Text>
    </View>
  );
}

/**
 * ขั้นที่มีคนลงมือทำจริงแล้ว — มีแค่กลุ่มนี้ที่ขึ้นชื่อผู้ตรวจได้
 *
 * ชื่อที่ backend ส่งมาพร้อมขั้นที่ยังรออยู่คือ "ผู้ที่มีสิทธิ์ตรวจ" ไม่ใช่
 * "ผู้ที่ตรวจแล้ว" — ฝ่ายบุคคลมีหลายคนและใครก็หยิบไปทำได้ การขึ้นชื่อคนใด
 * คนหนึ่งไว้ก่อนทำให้ผู้ยื่นเข้าใจว่าใบนี้ถูกส่งถึงคนนั้นโดยเฉพาะ แล้วไปตาม
 * ผิดคน
 *
 * เป็นรายชื่อของ "สถานะที่ลงมือแล้ว" ไม่ใช่รายชื่อของสถานะที่ยังรอ เพราะ
 * ใบที่ถูก **ยกเลิกเอง** ก็จบกระบวนการเหมือนกันแต่ไม่มีใครอนุมัติให้ ถ้าเขียน
 * เป็นบัญชีดำ ขั้นที่ยกเลิกจะหลุดมาขึ้นชื่อผู้อนุมัติทั้งที่เขาไม่เคยแตะใบนี้
 */
const ACTED_STEP_STATUSES = new Set([
  'APPROVED',
  'HR_APPROVED',
  'HR_REJECTED',
  'MANAGER_APPROVED',
  'MANAGER_REJECTED',
  'REJECTED',
  'RETURNED',
]);

/**
 * ข้อความที่ระบบเติมให้เอง ไม่ใช่สิ่งที่ผู้อนุมัติพิมพ์
 *
 * ศูนย์อนุมัติบนเว็บใส่ค่านี้ลงช่องเหตุผลแทนตอนผู้อนุมัติไม่ได้พิมพ์อะไร
 * (frontend/app/(protected)/approvals/_components/queue-panel.tsx) ผลคือ
 * ใบที่อนุมัติแบบไม่มีความเห็นจะมีบรรทัด "อนุมัติผ่านศูนย์อนุมัติ" ห้อยอยู่
 * ทุกใบ ซึ่งไม่ได้บอกอะไรที่ป้ายสถานะไม่ได้บอกไปแล้ว
 *
 * กรองที่ฝั่งแสดงผลเพราะข้อมูลเก่าในฐานข้อมูลก็มีข้อความนี้ติดมาแล้วเช่นกัน
 * — แก้ที่ต้นทางอย่างเดียวไม่ช่วยใบที่อนุมัติไปก่อนหน้านี้
 */
const SYSTEM_FILLED_NOTES = new Set([
  'อนุมัติผ่านศูนย์อนุมัติ',
  'ไม่อนุมัติผ่านศูนย์อนุมัติ',
]);

/** เหลือเฉพาะความเห็นที่คนเขียนจริง */
function humanNote(...values: (string | null | undefined)[]) {
  return values
    .filter(
      (value): value is string =>
        Boolean(value) && !SYSTEM_FILLED_NOTES.has(value!.trim()),
    )
    .join(' · ');
}

function hasActed(status: string) {
  return ACTED_STEP_STATUSES.has(status.toUpperCase());
}

const dateTimeText = (value: Date | null | undefined) =>
  value
    ? thaiDate(value, {
        day: 'numeric',
        month: 'short',
        time: 'short',
        year: 'numeric',
      })
    : '—';

/** ไอคอนของแต่ละขั้นในสายอนุมัติ — ชุด Feather เหมือนทั้งแอป */
const STEP_ICON: Record<string, IconName> = {
  APPROVED: 'check',
  CANCELLED: 'slash',
  PENDING: 'clock',
  REJECTED: 'x',
  RETURNED: 'corner-up-left',
  WAITING: 'clock',
};

const TIMELINE_COLOR: Record<string, string> = {
  APPROVED: AURORA.emerald,
  CANCELLED: AURORA.textFaint,
  PENDING: AURORA.sky,
  REJECTED: AURORA.rose,
  RETURNED: AURORA.amber,
  WAITING: AURORA.textFaint,
};

function StatusPill({ color, label }: { color: string; label: string }) {
  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: `${color}18`,
        borderRadius: 999,
        flexDirection: 'row',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      <View
        style={{
          backgroundColor: color,
          borderRadius: 999,
          height: 6,
          width: 6,
        }}
      />
      <Text
        maxScale={1.1}
        numberOfLines={1}
        style={{ color, fontSize: 10.5, fontWeight: '700' }}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * ปุ่มจัดการใบคำขอ
 *
 * ปุ่มรองใช้ "พื้นจางสีของตัวเอง" ไม่ใช่กรอบบาง ๆ บนพื้นขาว — บนจอผิวขาว
 * ปุ่มกรอบบางอ่านเป็นช่องกรอกข้อมูลว่าง ๆ มากกว่าเป็นของที่กดได้
 */
function DetailAction({
  danger = false,
  disabled,
  icon,
  label,
  loading,
  onPress,
  primary = false,
}: {
  danger?: boolean;
  disabled?: boolean;
  icon: IconName;
  label: string;
  loading?: boolean;
  onPress: () => void;
  primary?: boolean;
}) {
  const color = danger ? AURORA.rose : AURORA.accent;
  const foreground = primary ? AURORA.baseDeep : color;
  const inactive = Boolean(disabled || loading);

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      style={{
        alignItems: 'center',
        backgroundColor: primary ? color : `${color}14`,
        borderRadius: 16,
        elevation: primary ? 3 : 0,
        flexDirection: 'row',
        gap: 8,
        height: 52,
        justifyContent: 'center',
        opacity: inactive ? 0.5 : 1,
        paddingHorizontal: 14,
        shadowColor: color,
        shadowOffset: { height: 4, width: 0 },
        shadowOpacity: primary ? 0.22 : 0,
        shadowRadius: 9,
      }}
    >
      {loading ? (
        <ActivityIndicator color={foreground} size="small" />
      ) : (
        <>
          <Icon color={foreground} name={icon} size={17} />
          <Text
            maxScale={1.15}
            numberOfLines={1}
            style={{
              color: foreground,
              fontSize: 13,
              fontWeight: '700',
              lineHeight: 18,
            }}
          >
            {label}
          </Text>
        </>
      )}
    </PressableScale>
  );
}

const fileSizeText = (value: number | null | undefined) => {
  if (!value || value <= 0) return null;
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

/** พอเห็นว่าแนบอะไรไว้ และวางเรียงในการ์ดได้สองแถวโดยไม่ดันเนื้อหาอื่นตกจอ */
const ATTACHMENT_THUMB_SIZE = 76;

/**
 * แผ่นแทนไฟล์ที่ไม่ใช่รูป
 *
 * ขนาดเท่ารูปย่อเพื่อให้เรียงในแถวเดียวกันได้ ส่วนของงานนอกสถานที่เปิดในแอป
 * ไม่ได้ (เก็บเป็น attachmentUrl คนละกลไก) จึงบอกตรง ๆ ว่าให้ไปดูบนเว็บ
 */
function AttachmentFileTile({
  attachment,
  busy,
  onOpen,
}: {
  attachment: RequestAttachment;
  busy: boolean;
  onOpen: () => void;
}) {
  return (
    <PressableScale
      accessibilityLabel={attachment.title ?? attachment.fileName ?? 'ไฟล์แนบ'}
      accessibilityRole="button"
      disabled={busy || !attachment.downloadSupported}
      onPress={onOpen}
      style={{
        alignItems: 'center',
        backgroundColor: AURORA.accentSoft,
        borderRadius: 14,
        gap: 4,
        height: ATTACHMENT_THUMB_SIZE,
        justifyContent: 'center',
        opacity: attachment.downloadSupported ? 1 : 0.55,
        paddingHorizontal: 6,
        width: ATTACHMENT_THUMB_SIZE,
      }}
    >
      {busy ? (
        <ActivityIndicator color={AURORA.accent} size="small" />
      ) : (
        <>
          <Ionicons color={AURORA.accent} name="document-outline" size={20} />
          <Text
            numberOfLines={1}
            style={{ color: AURORA.textFaint }}
            variant="caption"
          >
            {attachment.downloadSupported ? 'เปิดไฟล์' : 'ดูบนเว็บ'}
          </Text>
        </>
      )}
    </PressableScale>
  );
}

export default function RequestDetailScreen() {
  const { gutter } = useResponsive();
  const { resolvedMode } = useAppTheme();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ id: string; type: string }>();

  const parsedType = requestTypeSchema.safeParse(params.type);
  const type = (parsedType.success ? parsedType.data : 'LEAVE') as RequestType;
  const id = String(params.id ?? '');

  const detail = useRequestDetail(type, id);
  const cancel = useCancelRequest();
  const deleteDraft = useDeleteDraftRequest();
  const submitDraft = useSubmitRequest();
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
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [deleteDraftVisible, setDeleteDraftVisible] = useState(false);
  const [submitVisible, setSubmitVisible] = useState(false);
  const [sharingAttachmentId, setSharingAttachmentId] = useState<string | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<RequestAttachment | null>(
    null,
  );
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<
    string | null
  >(null);
  const [viewerAttachment, setViewerAttachment] =
    useState<RequestAttachment | null>(null);
  /*
   * ความสูงของรูปเต็มจอต้องเป็นตัวเลข ไม่ใช่ '100%'
   *
   * PressableScale ห่อเนื้อหาด้วย Animated.View ที่ไม่มี flex ความสูงของมัน
   * จึงเป็น auto และเปอร์เซ็นต์ข้างในยุบเหลือศูนย์จนรูปหายทั้งใบ
   */
  const [viewerHeight, setViewerHeight] = useState(0);

  async function handleCancel() {
    const isDraft = detail.data?.status === 'DRAFT';

    try {
      await cancel.mutateAsync({ id, type });
      toast.success(
        isDraft ? 'ยกเลิกฉบับร่างเรียบร้อยแล้ว' : 'ถอนคำขอกลับมาแก้ไขแล้ว',
      );
      setConfirmVisible(false);

      if (isDraft) {
        router.back();
      } else {
        await detail.refetch();
      }
    } catch (error) {
      setConfirmVisible(false);
      toast.error(
        error instanceof ApiError ? error.message : 'ยกเลิกไม่สำเร็จ',
      );
    }
  }

  async function handleSubmitDraft() {
    try {
      await submitDraft.mutateAsync({ id, type });
      toast.success('ส่งคำขอเข้ารออนุมัติเรียบร้อย');
      setSubmitVisible(false);
      await detail.refetch();
    } catch (error) {
      setSubmitVisible(false);
      toast.error(
        error instanceof ApiError ? error.message : 'ส่งคำขอไม่สำเร็จ',
      );
    }
  }

  async function handleDeleteDraft() {
    try {
      await deleteDraft.mutateAsync({ id, type });
      toast.success('ลบฉบับร่างเรียบร้อย');
      setDeleteDraftVisible(false);
      router.back();
    } catch (error) {
      setDeleteDraftVisible(false);
      toast.error(
        error instanceof ApiError ? error.message : 'ลบฉบับร่างไม่สำเร็จ',
      );
    }
  }

  async function handleShareAttachment(attachment: {
    fileName?: string | null;
    id: string;
    mimeType?: string | null;
    title?: string | null;
  }) {
    setSharingAttachmentId(attachment.id);

    try {
      await shareRequestAttachment({
        attachmentId: attachment.id,
        fileName:
          attachment.fileName ??
          attachment.title ??
          `attachment-${attachment.id}`,
        mimeType: attachment.mimeType,
        requestId: id,
        type,
      });
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'เปิดไฟล์แนบไม่สำเร็จ',
      );
    } finally {
      setSharingAttachmentId(null);
    }
  }

  async function handleDeleteAttachment() {
    if (!deleteTarget) return;

    setDeletingAttachmentId(deleteTarget.id);

    try {
      await deleteRequestAttachment({
        attachmentId: deleteTarget.id,
        requestId: id,
        type,
      });
      toast.success('ลบไฟล์แนบเรียบร้อย');
      setDeleteTarget(null);
      setViewerAttachment(null);
      await detail.refetch();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'ลบไฟล์แนบไม่สำเร็จ',
      );
    } finally {
      setDeletingAttachmentId(null);
    }
  }

  const item = detail.data;
  const statusColor = item
    ? (STATUS_COLOR[item.status] ?? AURORA.textFaint)
    : AURORA.textFaint;
  const canRevise = Boolean(item?.canEdit);

  /*
   * บรรทัดรองของหัวจอ — ชนิดคำขอกับเลขที่ใบ
   *
   * เดิมสองอย่างนี้อยู่ในแถบสถานะเต็มความกว้างใต้หัวจอ ซึ่งสูงเกือบเท่าหัวจอ
   * เองทั้งที่บอกอยู่คำเดียวว่าใบนี้อยู่ขั้นไหน — สถานะย้ายไปเป็นป้ายเล็ก
   * ท้ายบรรทัดหัวจอแทน แล้วเนื้อหาจริงก็ขยับขึ้นมาเต็มจอ
   */
  const heroSubtitle = [REQUEST_TYPE_LABEL[type], item?.requestNo]
    .filter(Boolean)
    .join(' · ');

  /*
   * ข้อมูลของใบคำขอ — ชุดเดียว ไม่แยก "สรุปคำขอ" กับ "ข้อมูลคำขอ"
   *
   * สองหมวดนั้นพูดเรื่องเดียวกันคนละสำนวน: `rangeLabel` คือ "7 ก.ย. 2569 ·
   * เต็มวัน" ซึ่งก็คือวันที่เริ่ม + วันที่สิ้นสุด + รูปแบบการลาที่อยู่ใน
   * `details` อยู่แล้ว ส่วน `amountLabel` ก็คือจำนวนวัน — ผู้ใช้จึงเห็นค่า
   * เดียวกันสองรอบห่างกันไม่ถึงหน้าจอเดียว
   *
   * ยึด `details` เป็นหลักเพราะละเอียดกว่าและแยกเป็นช่อง ๆ ตามชนิดของคำขอ
   * ป้ายรวบยอดจะขึ้นก็ต่อเมื่อ backend ไม่ได้ส่ง `details` มาเลย
   */
  const infoRows = item
    ? [
        ...(item.details.length > 0
          ? item.details.map((row) => ({ label: row.label, value: row.value }))
          : [
              item.rangeLabel
                ? { label: 'ช่วงเวลา', value: item.rangeLabel }
                : null,
              item.amountLabel
                ? { label: 'รวม', value: item.amountLabel }
                : null,
            ].filter((row) => row !== null)),
        { label: 'ยื่นเมื่อ', value: dateTimeText(item.submittedAt) },
      ]
    : [];

  return (
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/*
            หัวจอตัวเดียวกับแท็บอื่น — วงไอคอนทำหน้าที่เป็นปุ่มย้อนกลับ จึงไม่มี
            ปุ่มกลมใบที่สองมาเบียด และแถบน้ำเงินโค้งริมซ้ายก็ยังอยู่ครบ
          */}
          <Reveal>
            {/*
              ไม่มีเส้นคั่นใต้หัวจอแล้ว — หัวจอเป็นแคปซูลที่มีเส้นขอบรอบตัวเอง
              เส้นตรงพาดใต้ปลายมนจะขัดกับรูปทรงทันที
            */}
            <View>
              <PageHero
                decoration={<RequestDetailMotif />}
                icon="arrow-left"
                iconLabel="ย้อนกลับ"
                onIconPress={() => router.back()}
                right={
                  item ? (
                    <StatusPill
                      color={statusColor}
                      label={REQUEST_STATUS_LABEL[item.status] ?? item.status}
                    />
                  ) : null
                }
                subtitle={heroSubtitle}
                title={item?.title ?? 'รายละเอียดคำขอ'}
              />
            </View>
          </Reveal>

          {detail.isPending ? (
            <View
              style={{ gap: 12, paddingHorizontal: gutter, paddingTop: 26 }}
            >
              <Skeleton height={18} width="40%" />
              <Skeleton height={14} width="70%" />
              <Skeleton height={14} width="55%" />
            </View>
          ) : detail.isError ? (
            <View style={{ gap: 7, paddingHorizontal: gutter, paddingTop: 30 }}>
              <Icon color={AURORA.rose} name="alert-circle" size={26} />
              <Text style={{ color: AURORA.text }} variant="bodyStrong">
                ยังดูรายละเอียดไม่ได้
              </Text>
              <Text style={{ color: AURORA.textMuted }} variant="caption">
                {detail.error instanceof ApiError
                  ? detail.error.message
                  : 'กรุณาลองใหม่อีกครั้ง'}
              </Text>
              <PressableScale
                onPress={() => void detail.refetch()}
                style={{ alignSelf: 'flex-start', paddingVertical: 5 }}
              >
                <Text style={{ color: AURORA.accent }} variant="bodyStrong">
                  {detail.isRefetching ? 'กำลังโหลด...' : 'ลองใหม่'}
                </Text>
              </PressableScale>
            </View>
          ) : item ? (
            <>
              <View
                style={{
                  gap: 28,
                  paddingHorizontal: gutter,
                  paddingTop: 24,
                }}
              >
                <Reveal delay={80}>
                  <PageSection title="ข้อมูลคำขอ">
                    <View>
                      {infoRows.map((row, index) => (
                        <DataRow
                          divider={index > 0}
                          key={row.label}
                          label={row.label}
                          value={row.value}
                        />
                      ))}
                    </View>
                  </PageSection>
                </Reveal>

                {item.reason ? (
                  <Reveal delay={110}>
                    <PageSection title="เหตุผล">
                      {/*
                        ข้อความที่คนพิมพ์เอง — ไม่ใช่ค่าที่ระบบเติมให้ จึงวางบน
                        พื้นฟ้าจาง ไม่ใช่กล่องขอบซ้ายบาง ๆ ที่แทบไม่ต่างจาก
                        พื้นขาวของจอ และใช้คำว่า "เหตุผล" กำกับแทนไอคอนคำพูด —
                        ไอคอนบอกได้แค่ว่าเป็นข้อความ ไม่ได้บอกว่าข้อความของอะไร
                      */}
                      <View
                        style={{
                          backgroundColor: AURORA.accentSoft,
                          borderRadius: 16,
                          gap: 4,
                          padding: 14,
                        }}
                      >
                        <Text
                          style={{
                            color: AURORA.accent,
                            fontSize: 11,
                            fontWeight: '700',
                            lineHeight: 15,
                          }}
                        >
                          เหตุผล
                        </Text>
                        <Text
                          style={{
                            color: AURORA.text,
                            fontSize: 13.5,
                            lineHeight: 21,
                          }}
                        >
                          {item.reason}
                        </Text>
                      </View>
                    </PageSection>
                  </Reveal>
                ) : null}

                {item.attachments.length > 0 ? (
                  <Reveal delay={170}>
                    <PageSection
                      title="ไฟล์แนบ"
                      trailing={
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
                              fontWeight: '700',
                              lineHeight: 14,
                            }}
                          >
                            {item.attachments.length} ไฟล์
                          </Text>
                        </View>
                      }
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          flexWrap: 'wrap',
                          gap: 9,
                        }}
                      >
                        {item.attachments.map((attachment) =>
                          attachment.downloadSupported &&
                          isImageAttachment(attachment) ? (
                            <AttachmentImagePreview
                              attachment={attachment}
                              backgroundColor={AURORA.accentSoft}
                              borderRadius={14}
                              compact
                              height={ATTACHMENT_THUMB_SIZE}
                              key={attachment.id}
                              mutedColor={AURORA.textFaint}
                              onOpen={() => setViewerAttachment(attachment)}
                              origin="request"
                              requestId={id}
                              tint={AURORA.accent}
                              type={type}
                              width={ATTACHMENT_THUMB_SIZE}
                            />
                          ) : (
                            <AttachmentFileTile
                              attachment={attachment}
                              busy={sharingAttachmentId === attachment.id}
                              key={attachment.id}
                              onOpen={() =>
                                void handleShareAttachment(attachment)
                              }
                            />
                          ),
                        )}
                      </View>
                    </PageSection>
                  </Reveal>
                ) : null}

                {item.timeline.length > 0 ? (
                  <Reveal delay={200}>
                    <PageSection title="ลำดับการอนุมัติ">
                      <View style={{ paddingTop: 2 }}>
                        {item.timeline.map((step, index) => {
                          const stepColor =
                            TIMELINE_COLOR[step.status] ?? AURORA.textFaint;
                          const last = index === item.timeline.length - 1;
                          const done = hasActed(step.status);

                          return (
                            <View
                              key={step.id}
                              style={{ flexDirection: 'row', gap: 12 }}
                            >
                              {/*
                                เม็ดของแต่ละขั้นเป็นวงไอคอน ไม่ใช่จุดกลมเปล่า —
                                ผ่าน/ไม่ผ่าน/รออยู่ ต้องแยกออกจากกันได้โดยไม่ต้อง
                                ไปอ่านป้ายท้ายบรรทัด และวงที่ลงมือแล้วจะทึบ
                                ส่วนวงที่ยังรอเป็นพื้นจาง
                              */}
                              <View style={{ alignItems: 'center', width: 32 }}>
                                <View
                                  style={{
                                    alignItems: 'center',
                                    backgroundColor: done
                                      ? stepColor
                                      : `${stepColor}14`,
                                    borderColor: stepColor,
                                    borderRadius: 999,
                                    borderWidth: done ? 0 : 1.5,
                                    height: 32,
                                    justifyContent: 'center',
                                    width: 32,
                                  }}
                                >
                                  <Icon
                                    color={done ? AURORA.baseDeep : stepColor}
                                    name={STEP_ICON[step.status] ?? 'clock'}
                                    size={15}
                                  />
                                </View>
                                {last ? null : (
                                  <View
                                    style={{
                                      backgroundColor: AURORA.glassBorder,
                                      flex: 1,
                                      marginVertical: 5,
                                      minHeight: 26,
                                      width: 2,
                                    }}
                                  />
                                )}
                              </View>

                              <View
                                style={{
                                  flex: 1,
                                  gap: 4,
                                  paddingBottom: last ? 0 : 18,
                                  paddingTop: 4,
                                }}
                              >
                                <View
                                  style={{
                                    alignItems: 'center',
                                    flexDirection: 'row',
                                    gap: 8,
                                  }}
                                >
                                  <Text
                                    style={{
                                      color: AURORA.text,
                                      flex: 1,
                                      fontSize: 13.5,
                                      fontWeight: '700',
                                      lineHeight: 19,
                                    }}
                                  >
                                    {step.title}
                                  </Text>
                                  <StatusPill
                                    color={stepColor}
                                    label={
                                      REQUEST_STATUS_LABEL[step.status] ??
                                      step.status
                                    }
                                  />
                                </View>

                                {[
                                  step.actorName && hasActed(step.status)
                                    ? step.actorName
                                    : null,
                                  step.actedAt
                                    ? dateTimeText(step.actedAt)
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ') ? (
                                  <Text
                                    style={{
                                      color: AURORA.textMuted,
                                      fontSize: 11.5,
                                      lineHeight: 16,
                                    }}
                                  >
                                    {[
                                      step.actorName && hasActed(step.status)
                                        ? step.actorName
                                        : null,
                                      step.actedAt
                                        ? dateTimeText(step.actedAt)
                                        : null,
                                    ]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </Text>
                                ) : null}

                                {humanNote(step.reason, step.note) ? (
                                  <Text
                                    style={{
                                      color: AURORA.textFaint,
                                      fontSize: 11.5,
                                      lineHeight: 16,
                                    }}
                                  >
                                    “{humanNote(step.reason, step.note)}”
                                  </Text>
                                ) : null}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    </PageSection>
                  </Reveal>
                ) : null}

                {canRevise ||
                item.canSubmit ||
                item.canDelete ||
                item.canCancel ? (
                  <Reveal delay={230}>
                    <PageSection title="จัดการคำขอ">
                      <View
                        style={{
                          flexDirection: 'row',
                          flexWrap: 'wrap',
                          gap: 9,
                        }}
                      >
                        {canRevise ? (
                          <View style={{ flexBasis: '47%', flexGrow: 1 }}>
                            <DetailAction
                              icon="edit-3"
                              label="แก้ไขและส่งใหม่"
                              onPress={() => {
                                router.push({
                                  params: { id, type },
                                  pathname: '/request-new',
                                });
                              }}
                            />
                          </View>
                        ) : null}
                        {item.canSubmit ? (
                          <View style={{ flexBasis: '47%', flexGrow: 1 }}>
                            <DetailAction
                              icon="send"
                              label="ส่งขออนุมัติ"
                              onPress={() => setSubmitVisible(true)}
                              primary
                            />
                          </View>
                        ) : null}
                        {item.canDelete ? (
                          <View style={{ flexBasis: '47%', flexGrow: 1 }}>
                            <DetailAction
                              danger
                              icon="trash-2"
                              label="ลบฉบับร่าง"
                              onPress={() => setDeleteDraftVisible(true)}
                            />
                          </View>
                        ) : null}
                        {item.canCancel ? (
                          <View style={{ flexBasis: '47%', flexGrow: 1 }}>
                            <DetailAction
                              danger={item.status === 'DRAFT'}
                              icon="corner-up-left"
                              label={
                                item.status === 'DRAFT'
                                  ? 'ยกเลิกฉบับร่าง'
                                  : 'ถอนกลับมาแก้ไข'
                              }
                              onPress={() => setConfirmVisible(true)}
                            />
                          </View>
                        ) : null}
                      </View>
                    </PageSection>
                  </Reveal>
                ) : null}

                {!item.canCancel && !canRevise ? (
                  <Text
                    style={{ color: AURORA.textFaint, textAlign: 'center' }}
                    variant="caption"
                  >
                    คำขอที่จบกระบวนการแล้วยกเลิกเองไม่ได้
                    ติดต่อฝ่ายบุคคลหากต้องการแก้ไข
                  </Text>
                ) : null}
              </View>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>

      <ConfirmDialog
        confirmLabel="ส่งขออนุมัติ"
        loading={submitDraft.isPending}
        message="เมื่อส่งแล้วคำขอจะเข้าคิวผู้อนุมัติ หากถูกส่งกลับจึงจะแก้ไขและส่งใหม่ได้"
        onCancel={() => setSubmitVisible(false)}
        onConfirm={() => void handleSubmitDraft()}
        title="ยืนยันการส่งคำขอ"
        visible={submitVisible}
      />

      <ConfirmDialog
        confirmLabel="ลบฉบับร่าง"
        destructive
        loading={deleteDraft.isPending}
        message="ฉบับร่างจะถูกลบและไม่สามารถเปิดกลับมาแก้ไขได้"
        onCancel={() => setDeleteDraftVisible(false)}
        onConfirm={() => void handleDeleteDraft()}
        title="ยืนยันการลบฉบับร่าง"
        visible={deleteDraftVisible}
      />

      <ConfirmDialog
        confirmLabel={item?.status === 'DRAFT' ? 'ยกเลิกฉบับร่าง' : 'ถอนคำขอ'}
        destructive={item?.status === 'DRAFT'}
        loading={cancel.isPending}
        message={
          item?.status === 'DRAFT'
            ? 'ฉบับร่างนี้จะถูกยกเลิกและย้ายไปอยู่ในประวัติ'
            : 'คำขอจะออกจากสายอนุมัติและกลับเป็นฉบับร่าง คุณสามารถแก้ไขแล้วส่งใบเดิมได้โดยไม่สร้างรายการเพิ่ม'
        }
        onCancel={() => setConfirmVisible(false)}
        onConfirm={() => void handleCancel()}
        title={item?.status === 'DRAFT' ? 'ยกเลิกฉบับร่าง' : 'ถอนกลับมาแก้ไข'}
        visible={confirmVisible}
      />

      {/*
        ดูภาพใหญ่
        รูปย่อในการ์ดเล็กเกินกว่าจะอ่านใบรับรองแพทย์ออก แต่ถ้าโชว์ใหญ่ในการ์ด
        เลยก็ดันลำดับการอนุมัติตกจอไปหมด จึงแยกมาเป็นจอเต็มตอนกด
      */}
      <Modal
        animationType="fade"
        onRequestClose={() => setViewerAttachment(null)}
        transparent
        visible={viewerAttachment !== null}
      >
        {viewerAttachment ? (
          <View style={{ backgroundColor: 'rgba(6, 12, 26, 0.96)', flex: 1 }}>
            <SafeAreaView style={{ flex: 1 }}>
              <View
                style={{
                  alignItems: 'center',
                  flexDirection: 'row',
                  gap: 10,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    numberOfLines={1}
                    style={{ color: '#ffffff' }}
                    variant="bodyStrong"
                  >
                    {viewerAttachment.title ??
                      viewerAttachment.fileName ??
                      'รูปหลักฐาน'}
                  </Text>
                  {viewerAttachment.fileName || viewerAttachment.fileSize ? (
                    <Text
                      numberOfLines={1}
                      style={{ color: 'rgba(255, 255, 255, 0.6)' }}
                      variant="caption"
                    >
                      {[
                        viewerAttachment.fileName,
                        fileSizeText(viewerAttachment.fileSize),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  ) : null}
                </View>

                <PressableScale
                  accessibilityLabel="ปิด"
                  accessibilityRole="button"
                  hitSlop={hitSlop}
                  onPress={() => setViewerAttachment(null)}
                  style={{
                    alignItems: 'center',
                    backgroundColor: 'rgba(255, 255, 255, 0.12)',
                    borderRadius: 999,
                    height: 38,
                    justifyContent: 'center',
                    width: 38,
                  }}
                >
                  <Ionicons color="#ffffff" name="close" size={20} />
                </PressableScale>
              </View>

              <View
                onLayout={(event) => {
                  const next = Math.round(event.nativeEvent.layout.height);

                  setViewerHeight((current) =>
                    current === next ? current : next,
                  );
                }}
                style={{ flex: 1, paddingHorizontal: 12 }}
              >
                {viewerHeight > 0 ? (
                  <AttachmentImagePreview
                    attachment={viewerAttachment}
                    backgroundColor="transparent"
                    borderRadius={0}
                    height={viewerHeight}
                    mutedColor="rgba(255, 255, 255, 0.6)"
                    onOpen={() => setViewerAttachment(null)}
                    origin="request"
                    requestId={id}
                    resizeMode="contain"
                    tint="#ffffff"
                    type={type}
                  />
                ) : null}
              </View>

              <View style={{ flexDirection: 'row', gap: 10, padding: 16 }}>
                <View style={{ flex: 1 }}>
                  <DetailAction
                    icon="external-link"
                    label="เปิดไฟล์"
                    loading={sharingAttachmentId === viewerAttachment.id}
                    onPress={() => void handleShareAttachment(viewerAttachment)}
                    primary
                  />
                </View>
                {item?.canDeleteAttachments ? (
                  <View style={{ flex: 1 }}>
                    <DetailAction
                      danger
                      icon="trash-2"
                      label="ลบไฟล์"
                      onPress={() => {
                        /* ปิดจอเต็มก่อน ไม่งั้นกล่องยืนยันจะไปอยู่ใต้ Modal */
                        setViewerAttachment(null);
                        setDeleteTarget(viewerAttachment);
                      }}
                    />
                  </View>
                ) : null}
              </View>
            </SafeAreaView>
          </View>
        ) : null}
      </Modal>

      <ConfirmDialog
        confirmLabel="ลบไฟล์"
        destructive
        loading={deletingAttachmentId !== null}
        message={`ไฟล์ ${
          deleteTarget?.title ?? deleteTarget?.fileName ?? 'ที่เลือก'
        } จะถูกลบออกจากคำขอนี้`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeleteAttachment()}
        title="ยืนยันการลบไฟล์แนบ"
        visible={deleteTarget !== null}
      />
    </View>
  );
}
