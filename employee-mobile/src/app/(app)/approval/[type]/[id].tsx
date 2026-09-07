import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Button,
  ErrorState,
  Icon,
  Input,
  Sheet,
  SkeletonList,
  Text,
  useToast,
} from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  ApprovalMotif,
  PageHero,
  PageSection,
  PressableScale,
  Reveal,
} from '@/design/aurora';
import { approvalBlockReason } from '@/features/approvals/approval-gate';
import {
  useApprovalAction,
  useApprovalDetail,
  type ApprovalAction,
  type ApprovalDetail,
} from '@/features/approvals/approvals';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { ProfileAvatar } from '@/features/home/panels';
import { ExecutiveApprovalDetail } from '@/features/executive/executive-approval-detail';
import { shareApprovalAttachment } from '@/features/requests/attachment';
import {
  AttachmentImagePreview,
  isImageAttachment,
} from '@/features/requests/attachment-preview';
import {
  APPROVAL_TYPE_LABEL,
  REQUEST_STATUS_LABEL,
  type ApprovalType,
} from '@/features/requests/requests.types';
import { ApiError } from '@/lib/api/api-error';
import { useAppTheme } from '@/theme/use-app-theme';
import { useVisibleStatusBarStyle } from '@/theme/use-status-bar-style';
import { thaiDate } from '@/lib/date/thai-date';

/**
 * รูปคน 52 + ช่องไฟ 13 — บรรทัดอ้างอิงใต้ชื่อต้องเริ่มตรงกับชื่อ ไม่ใช่ไหลไป
 * ใต้รูป ไม่งั้นสองบรรทัดนั้นยื่นออกมาข้างหน้าชื่อจนอ่านเป็นคนละก้อนกัน
 */
const IDENTITY_TEXT_INSET = 65;

const ATTACHMENT_THUMB_SIZE = 76;

const ACTION_LABEL: Record<ApprovalAction, string> = {
  approve: 'อนุมัติ',
  reject: 'ไม่อนุมัติ',
  return: 'ส่งกลับแก้ไข',
};

/**
 * สีของสถานะ — อนุมัติแล้วเป็นเขียว ไม่ใช่ฟ้า
 *
 * ชุดเดียวกับใบของพนักงาน (`request/[type]/[id].tsx`) ใบเดียวกันต้องได้สี
 * เดียวกันไม่ว่าจะเปิดจากฝั่งคนยื่นหรือฝั่งคนอนุมัติ
 */
const STATUS_COLOR: Record<string, string> = {
  APPROVED: AURORA.emerald,
  CANCELLED: AURORA.textFaint,
  PENDING: AURORA.sky,
  REJECTED: AURORA.rose,
  RETURNED: AURORA.amber,
  SUBMITTED: AURORA.sky,
  WAITING: AURORA.textFaint,
};

/** วันที่ยื่น แบบสั้น — ใช้ในชิปอ้างอิงบนแถบตัวตน */
function submittedText(value: Date | null | undefined) {
  if (!value) return null;

  return thaiDate(value, {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  });
}

/**
 * หนึ่งค่าในหมวดข้อมูล — ป้ายซ้าย ค่าขวา คั่นเส้นบาง
 *
 * ผังเดียวกับตารางค่าในจอรายละเอียดคำขอ เงินเดือน และข้อมูลพนักงาน
 */
function DetailRow({
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
          flex: 1.4,
          fontSize: 13,
          fontWeight: '600',
          lineHeight: 18,
          textAlign: 'right',
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export default function ApprovalDetailScreen() {
  const { gutter } = useResponsive();
  const params = useLocalSearchParams<{ id?: string; type?: string }>();
  const router = useRouter();
  const toast = useToast();
  const bootstrap = useBootstrap();
  const { resolvedMode } = useAppTheme();
  const type: ApprovalType | undefined =
    params.type === 'LEAVE' ||
    params.type === 'OVERTIME' ||
    params.type === 'TIME_ADJUST' ||
    params.type === 'OFFSITE' ||
    params.type === 'DOCUMENT'
      ? params.type
      : undefined;
  const id = typeof params.id === 'string' ? params.id : undefined;
  const detail = useApprovalDetail(type, id);
  const act = useApprovalAction();
  const [openedAttachments, setOpenedAttachments] = useState<Set<string>>(
    () => new Set(),
  );
  const [sharingAttachmentId, setSharingAttachmentId] = useState<string | null>(
    null,
  );
  const [viewerAttachment, setViewerAttachment] = useState<
    ApprovalDetail['attachments'][number] | null
  >(null);
  const [viewerHeight, setViewerHeight] = useState(0);
  const [pendingAction, setPendingAction] = useState<
    Exclude<ApprovalAction, 'approve'> | null
  >(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  /*
   * ผู้บริหารได้จอนี้คนละไฟล์กัน แต่ผิวเดียวกันแล้ว — ขาวผืนเดียวทั้งสองฝั่ง
   * ตัวหนังสือบนแถบสถานะจึงเป็นสีเข้มเหมือนกันหมด ไม่ต้องแยกตามบทบาท
   */
  const isExecutive = bootstrap.data?.featureFlags.executive ?? false;
  const auroraStatusBarStyle = useVisibleStatusBarStyle(
    'dark',
  );
  const themeStatusBarStyle = useVisibleStatusBarStyle(
    resolvedMode === 'dark' ? 'light' : 'dark',
  );

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(auroraStatusBarStyle);

      return () => setStatusBarStyle(themeStatusBarStyle);
    }, [auroraStatusBarStyle, themeStatusBarStyle]),
  );

  async function handleShareAttachment(
    item: ApprovalDetail,
    attachment: ApprovalDetail['attachments'][number],
  ) {
    setSharingAttachmentId(attachment.id);

    try {
      await shareApprovalAttachment({
        attachmentId: attachment.id,
        fileName:
          attachment.fileName ?? attachment.title ?? `attachment-${attachment.id}`,
        mimeType: attachment.mimeType,
        requestId: item.id,
        type: item.type,
      });

      setOpenedAttachments((current) =>
        new Set(current).add(`${item.id}:${attachment.id}`),
      );
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'เปิดไฟล์แนบไม่สำเร็จ',
      );
    } finally {
      setSharingAttachmentId(null);
    }
  }

  function openImageAttachment(
    item: ApprovalDetail,
    attachment: ApprovalDetail['attachments'][number],
  ) {
    setOpenedAttachments((current) =>
      new Set(current).add(`${item.id}:${attachment.id}`),
    );
    setViewerAttachment(attachment);
  }

  function closeImageViewer() {
    setViewerAttachment(null);
    setViewerHeight(0);
  }

  async function runAction(action: ApprovalAction, withReason?: string) {
    if (!detail.data) return;

    try {
      await act.mutateAsync({
        action,
        id: detail.data.id,
        reason: withReason,
        type: detail.data.type,
      });
      toast.success(`${ACTION_LABEL[action]}เรียบร้อย`);
      setPendingAction(null);
      setReason('');
      router.back();
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : `${ACTION_LABEL[action]}ไม่สำเร็จ`,
      );
    }
  }

  function openReason(action: Exclude<ApprovalAction, 'approve'>) {
    setReason('');
    setReasonError(undefined);
    setPendingAction(action);
  }

  function submitReason() {
    if (!pendingAction) return;
    if (reason.trim().length < 3) {
      setReasonError('กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร');
      return;
    }
    void runAction(pendingAction, reason.trim());
  }

  const status = detail.data?.requestStatus ?? detail.data?.status ?? 'SUBMITTED';

  /* บรรทัดข้อมูลอ้างอิงใต้ชื่อคนยื่น — รหัส · สาขา · เลขที่ใบ · วันที่ยื่น */
  const submittedOn = submittedText(
    detail.data?.submittedAt ?? detail.data?.createdAt,
  );
  /*
   * แยกเป็นสองบรรทัดตายตัว ไม่ปล่อยให้บรรทัดเดียวยาวแล้วตัดเอง — ชื่อบริษัท
   * ยาวจนบรรทัดที่สองขึ้นต้นด้วยจุดคั่นลอย ๆ อ่านเหมือนข้อความค้าง
   *   บรรทัดแรก   = ตัวคน (รหัส · สาขา)
   *   บรรทัดที่สอง = ตัวใบ (เลขที่ใบ · วันที่ยื่น)
   */
  const metaWho = [detail.data?.employeeCode, detail.data?.branch]
    .filter(Boolean)
    .join('  ·  ');
  const metaDoc = [
    detail.data?.requestNo,
    submittedOn ? `ยื่น ${submittedOn}` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');
  const isSubmitted = status === 'SUBMITTED';
  const canAct =
    isSubmitted && (bootstrap.data?.featureFlags.approvals ?? false);
  const blockReason = detail.data
    ? approvalBlockReason({
        detail: detail.data,
        item: detail.data,
        openedAttachments,
      })
    : null;

  /* วางไว้หลัง hook ทุกตัว ลำดับ hook จึงเท่ากันทุกบทบาท */
  if (isExecutive) {
    return <ExecutiveApprovalDetail id={id} type={type} />;
  }

  return (
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: canAct ? 160 : 44 }}
          showsVerticalScrollIndicator={false}
        >
          <Reveal>
            <View
              style={{
                borderBottomColor: AURORA.glassBorder,
                borderBottomWidth: 1,
              }}
            >
              <PageHero
                decoration={<ApprovalMotif />}
                icon="arrow-left"
                iconLabel="ย้อนกลับ"
                onIconPress={() => router.back()}
                right={
                  detail.data ? (
                    <View
                      style={{
                        backgroundColor: `${STATUS_COLOR[status] ?? AURORA.textFaint}16`,
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                      }}
                    >
                      <Text
                        maxScale={1.1}
                        numberOfLines={1}
                        style={{
                          color: STATUS_COLOR[status] ?? AURORA.textMuted,
                          fontSize: 10.5,
                          fontWeight: '700',
                          lineHeight: 14,
                        }}
                      >
                        {REQUEST_STATUS_LABEL[status] ?? status}
                      </Text>
                    </View>
                  ) : null
                }
                subtitle={type ? APPROVAL_TYPE_LABEL[type] : 'กำลังโหลดข้อมูล'}
                title="รายละเอียดคำขอ"
              />
            </View>
          </Reveal>

          {!type || !id ? (
            <View style={{ paddingHorizontal: gutter, paddingTop: 24 }}>
              <ErrorState title="ลิงก์รายละเอียดไม่ถูกต้อง" />
            </View>
          ) : detail.isPending ? (
            <View style={{ paddingHorizontal: gutter, paddingTop: 24 }}>
              <SkeletonList rows={5} />
            </View>
          ) : detail.isError ? (
            <View style={{ paddingHorizontal: gutter, paddingTop: 24 }}>
              <ErrorState
                description={
                  detail.error instanceof ApiError
                    ? detail.error.message
                    : undefined
                }
                onRetry={() => void detail.refetch()}
                retrying={detail.isRefetching}
                title="ยังดูรายละเอียดไม่ได้"
              />
            </View>
          ) : detail.data ? (
            <>
              {/*
                แถบตัวตนของคนยื่น — รูปคนพร้อมป้ายประเภทเกาะมุม ไม่ใช่กระเบื้อง
                ไอคอนเฉย ๆ คนอนุมัติมองหา "ใครขออะไร" ก่อนเสมอ วงรูปจึงต้องอ่าน
                เป็น *คน* แล้วค่อยบอกว่าเป็นใบประเภทไหนด้วยป้ายเล็กที่เกาะอยู่
              */}
              <Reveal delay={40}>
                <View
                  style={{
                    borderBottomColor: AURORA.glassBorder,
                    borderBottomWidth: 1,
                    gap: 2,
                    paddingHorizontal: gutter,
                    paddingVertical: 14,
                  }}
                >
                  <View
                    style={{
                      alignItems: 'center',
                      flexDirection: 'row',
                      gap: 13,
                    }}
                  >
                    {/*
                      รูปจริงของคนยื่น — `avatarUrl` เพิ่งถูกส่งมาจาก backend
                      (mobile-approval.mapper) ก่อนหน้านี้ส่ง null ตายตัว วงรูป
                      จึงขึ้นเป็นตัวอักษรย่อทุกคน
                    */}
                    <ProfileAvatar
                      name={detail.data.employeeName ?? ''}
                      size={52}
                      url={detail.data.avatarUrl ?? null}
                    />

                    <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: AURORA.text,
                          fontSize: 16.5,
                          fontWeight: '800',
                          lineHeight: 22,
                        }}
                      >
                        {detail.data.employeeName ?? 'ไม่ระบุชื่อ'}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: AURORA.textMuted,
                          fontSize: 12,
                          lineHeight: 17,
                        }}
                      >
                        {[detail.data.position, detail.data.department]
                          .filter(Boolean)
                          .join(' · ') || APPROVAL_TYPE_LABEL[detail.data.type]}
                      </Text>
                    </View>
                  </View>

                  {/*
                    ข้อมูลอ้างอิงเป็นบรรทัดข้อความคั่นจุด ไม่ใช่ชิปพื้นเทาสี่ก้อน
                    — ทั้งสี่ค่าเป็นของอ่านประกอบ ไม่ใช่ของที่กดได้หรือของที่ต้อง
                    เด่น การใส่พื้นให้ทุกค่าเลยกลายเป็นสี่ก้อนแย่งสายตากับชื่อคน
                    ที่อยู่บรรทัดบน
                  */}
                  <View style={{ gap: 3, paddingLeft: IDENTITY_TEXT_INSET }}>
                    {metaWho ? (
                      <Text
                        numberOfLines={1}
                        style={{
                          color: AURORA.textMuted,
                          fontSize: 11.5,
                          fontVariant: ['tabular-nums'],
                          lineHeight: 16,
                        }}
                      >
                        {metaWho}
                      </Text>
                    ) : null}
                    {metaDoc ? (
                      <Text
                        numberOfLines={1}
                        style={{
                          color: AURORA.textFaint,
                          fontSize: 11,
                          fontVariant: ['tabular-nums'],
                          lineHeight: 15,
                        }}
                      >
                        {metaDoc}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </Reveal>


              <View
                style={{ gap: 26, paddingHorizontal: gutter, paddingTop: 22 }}
              >
                <Reveal delay={70}>
                  <View style={{ gap: 8 }}>
                    <Text
                      style={{
                        color: AURORA.text,
                        fontSize: 16,
                        fontWeight: '800',
                        lineHeight: 22,
                      }}
                    >
                      {detail.data.title}
                    </Text>
                    {detail.data.summary ? (
                      <Text
                        style={{
                          color: AURORA.textMuted,
                          fontSize: 13,
                          lineHeight: 19,
                        }}
                      >
                        {detail.data.summary}
                      </Text>
                    ) : null}

                    {detail.data.reason ? (
                      /*
                        เหตุผลที่คนยื่นพิมพ์เอง — บล็อกพื้นฟ้าจางที่มีคำว่า
                        "เหตุผล" กำกับ ไม่ใช่ไอคอนคำพูด ไอคอนบอกได้แค่ว่า
                        "เป็นข้อความ" ส่วนคำกำกับบอกว่าเป็นข้อความของอะไร
                      */
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
                            fontSize: 13,
                            lineHeight: 20,
                          }}
                        >
                          {detail.data.reason}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </Reveal>

                {detail.data.details.length > 0 ? (
                  <Reveal delay={100}>
                    <PageSection title="ข้อมูลคำขอ">
                      <View>
                        {detail.data.details.map((row, index) => (
                          <DetailRow
                            divider={index > 0}
                            key={row.label}
                            label={row.label}
                            value={row.value}
                          />
                        ))}
                      </View>
                    </PageSection>
                  </Reveal>
                ) : null}

                {detail.data.attachments.length > 0 ? (
                  <Reveal delay={130}>
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
                            {detail.data.attachments.length} ไฟล์
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
                        {detail.data.attachments.map((attachment) =>
                          attachment.downloadSupported &&
                          isImageAttachment(attachment) ? (
                            <AttachmentImagePreview
                              attachment={attachment}
                              backgroundColor={AURORA.accentSoft}
                              borderRadius={14}
                              compact
                              height={ATTACHMENT_THUMB_SIZE}
                              key={attachment.id}
                              mutedColor={AURORA.textMuted}
                              onOpen={() =>
                                openImageAttachment(
                                  detail.data as ApprovalDetail,
                                  attachment,
                                )
                              }
                              origin="approval"
                              requestId={detail.data.id}
                              tint={AURORA.accent}
                              type={detail.data.type}
                              width={ATTACHMENT_THUMB_SIZE}
                            />
                          ) : (
                            <PressableScale
                              accessibilityLabel={
                                attachment.title ??
                                attachment.fileName ??
                                'ไฟล์แนบ'
                              }
                              accessibilityRole="button"
                              disabled={
                                sharingAttachmentId === attachment.id ||
                                !attachment.downloadSupported
                              }
                              key={attachment.id}
                              onPress={() =>
                                void handleShareAttachment(
                                  detail.data as ApprovalDetail,
                                  attachment,
                                )
                              }
                              style={{
                                alignItems: 'center',
                                backgroundColor: AURORA.accentSoft,
                                borderRadius: 14,
                                gap: 4,
                                height: ATTACHMENT_THUMB_SIZE,
                                justifyContent: 'center',
                                opacity: attachment.downloadSupported
                                  ? 1
                                  : 0.55,
                                paddingHorizontal: 6,
                                width: ATTACHMENT_THUMB_SIZE,
                              }}
                            >
                              {sharingAttachmentId === attachment.id ? (
                                <ActivityIndicator
                                  color={AURORA.accent}
                                  size="small"
                                />
                              ) : (
                                <>
                                  <Icon
                                    color={AURORA.accent}
                                    name="file"
                                    size={19}
                                  />
                                  <Text
                                    numberOfLines={1}
                                    style={{
                                      color: AURORA.textFaint,
                                      fontSize: 10.5,
                                      lineHeight: 14,
                                    }}
                                  >
                                    {attachment.downloadSupported
                                      ? 'เปิดไฟล์'
                                      : 'ดูบนเว็บ'}
                                  </Text>
                                </>
                              )}
                            </PressableScale>
                          ),
                        )}
                      </View>
                    </PageSection>
                  </Reveal>
                ) : null}
              </View>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>

      {canAct && detail.data ? (
        <View
          style={{
            backgroundColor: AURORA.baseDeep,
            borderTopColor: AURORA.glassBorder,
            borderTopWidth: 1,
            bottom: 0,
            left: 0,
            paddingHorizontal: gutter,
            paddingTop: 10,
            position: 'absolute',
            right: 0,
          }}
        >
          <SafeAreaView edges={['bottom']}>
            {blockReason ? (
              <View
                style={{
                  alignItems: 'center',
                  flexDirection: 'row',
                  gap: 8,
                  marginBottom: 9,
                }}
              >
                <Icon color={AURORA.amber} name="alert-triangle" size={15} />
                <Text
                  style={{
                    color: AURORA.textMuted,
                    flex: 1,
                    fontSize: 11.5,
                    lineHeight: 16,
                  }}
                >
                  {blockReason}
                </Text>
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 9 }}>
              {/*
                ปุ่มรองใช้พื้นจางสีของตัวเอง ไม่ใช่กรอบบางบนพื้นขาว — บนผิวขาว
                ปุ่มกรอบบางอ่านเป็นช่องกรอกว่าง ๆ มากกว่าเป็นของที่กดได้
              */}
              <Pressable
                accessibilityRole="button"
                disabled={act.isPending}
                onPress={() => openReason('reject')}
                style={({ pressed }) => ({
                  alignItems: 'center',
                  backgroundColor: pressed
                    ? 'rgba(225, 29, 72, 0.2)'
                    : `${AURORA.rose}14`,
                  borderRadius: 16,
                  flex: 1,
                  flexDirection: 'row',
                  gap: 7,
                  justifyContent: 'center',
                  minHeight: 52,
                  opacity: act.isPending ? 0.5 : 1,
                })}
              >
                <Icon color={AURORA.rose} name="x" size={17} />
                <Text
                  style={{
                    color: AURORA.rose,
                    fontSize: 14,
                    fontWeight: '700',
                    lineHeight: 19,
                  }}
                >
                  ไม่อนุมัติ
                </Text>
              </Pressable>

              {/* อนุมัติเป็นเขียว สีเดียวกับป้ายสถานะ "อนุมัติแล้ว" ทั้งแอป */}
              <Pressable
                accessibilityRole="button"
                disabled={act.isPending || Boolean(blockReason)}
                onPress={() => void runAction('approve')}
                style={({ pressed }) => ({
                  alignItems: 'center',
                  backgroundColor: pressed ? '#036c4f' : AURORA.emerald,
                  borderRadius: 16,
                  elevation: 3,
                  flex: 1.15,
                  flexDirection: 'row',
                  gap: 7,
                  justifyContent: 'center',
                  minHeight: 52,
                  opacity: act.isPending || blockReason ? 0.48 : 1,
                  shadowColor: AURORA.emerald,
                  shadowOffset: { height: 4, width: 0 },
                  shadowOpacity: 0.22,
                  shadowRadius: 9,
                })}
              >
                {act.isPending ? (
                  <ActivityIndicator color={AURORA.baseDeep} size="small" />
                ) : (
                  <Icon color={AURORA.baseDeep} name="check" size={17} />
                )}
                <Text
                  style={{
                    color: AURORA.baseDeep,
                    fontSize: 14,
                    fontWeight: '700',
                    lineHeight: 19,
                  }}
                >
                  อนุมัติ
                </Text>
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={act.isPending}
              onPress={() => openReason('return')}
              style={{ alignItems: 'center', paddingVertical: 10 }}
            >
              <Text
                style={{
                  color: AURORA.accent,
                  fontSize: 12.5,
                  fontWeight: '700',
                  lineHeight: 17,
                }}
              >
                ส่งกลับให้แก้ไข
              </Text>
            </Pressable>
          </SafeAreaView>
        </View>
      ) : null}

      <Modal
        animationType="fade"
        onRequestClose={closeImageViewer}
        transparent
        visible={viewerAttachment !== null}
      >
        {viewerAttachment && detail.data ? (
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
                  {viewerAttachment.fileName ? (
                    <Text
                      numberOfLines={1}
                      style={{ color: 'rgba(255, 255, 255, 0.6)' }}
                      variant="caption"
                    >
                      {viewerAttachment.fileName}
                    </Text>
                  ) : null}
                </View>

                <PressableScale
                  accessibilityLabel="ปิดรูป"
                  accessibilityRole="button"
                  onPress={closeImageViewer}
                  style={{
                    alignItems: 'center',
                    backgroundColor: 'rgba(255, 255, 255, 0.12)',
                    borderRadius: 999,
                    height: 38,
                    justifyContent: 'center',
                    width: 38,
                  }}
                >
                  <Icon color="#ffffff" name="x" size={19} />
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
                    onOpen={closeImageViewer}
                    origin="approval"
                    requestId={detail.data.id}
                    resizeMode="contain"
                    tint="#ffffff"
                    type={detail.data.type}
                  />
                ) : null}
              </View>

              <View style={{ padding: 16 }}>
                <PressableScale
                  accessibilityRole="button"
                  disabled={sharingAttachmentId === viewerAttachment.id}
                  onPress={() =>
                    void handleShareAttachment(detail.data, viewerAttachment)
                  }
                  style={{
                    alignItems: 'center',
                    backgroundColor: AURORA.accent,
                    borderRadius: 15,
                    flexDirection: 'row',
                    gap: 8,
                    justifyContent: 'center',
                    minHeight: 50,
                  }}
                >
                  {sharingAttachmentId === viewerAttachment.id ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Icon color="#ffffff" name="external-link" size={19} />
                  )}
                  <Text style={{ color: '#ffffff', fontWeight: '800' }}>
                    เปิดหรือบันทึกไฟล์
                  </Text>
                </PressableScale>
              </View>
            </SafeAreaView>
          </View>
        ) : null}
      </Modal>

      <Sheet
        onClose={() => setPendingAction(null)}
        title={pendingAction ? ACTION_LABEL[pendingAction] : ''}
        visible={pendingAction !== null}
      >
        <View style={{ gap: 16 }}>
          <Text variant="caption">
            {pendingAction === 'reject'
              ? 'ผู้ยื่นจะเห็นเหตุผลนี้ และคำขอจะถูกปิด'
              : 'ผู้ยื่นจะเห็นข้อความนี้ และแก้ไขแล้วยื่นใหม่ได้'}
          </Text>
          <Input
            autoFocus
            error={reasonError}
            label="เหตุผล"
            multiline
            numberOfLines={3}
            onChangeText={(value) => {
              setReason(value);
              setReasonError(undefined);
            }}
            placeholder="อธิบายให้ผู้ยื่นเข้าใจว่าเพราะอะไร"
            required
            value={reason}
          />
          <Button
            loading={act.isPending}
            onPress={submitReason}
            title={pendingAction ? ACTION_LABEL[pendingAction] : ''}
            variant={pendingAction === 'reject' ? 'danger' : 'primary'}
          />
        </View>
      </Sheet>
    </View>
  );
}
