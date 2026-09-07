import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Icon, Input, Sheet, Text, useToast } from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  PageHero,
  PressableScale,
  RequestDetailMotif,
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
import { TABULAR } from '@/features/executive/royal';
import { ProfileAvatar } from '@/features/home/panels';
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
import { thaiDate, thaiTime } from '@/lib/date/thai-date';

/**
 * จอรายละเอียดคำขอของผู้บริหาร — ผิว `ROYAL` เดียวกับแท็บอนุมัติของผู้บริหาร
 *
 * แยกจากจอของหัวหน้างานด้วยเหตุผลเดียวกับแท็บรายการ: คนละผิว ยัดรวมกันแล้ว
 * ทุกบรรทัดสไตล์จะกลายเป็นเงื่อนไข สิ่งที่ **ไม่** แยกคือกติกาการอนุมัติ —
 * `approvalBlockReason` กับ `useApprovalAction` เป็นตัวเดียวกันทั้งสองจอ
 * ผู้บริหารจึงข้ามด่าน "ต้องเปิดไฟล์แนบก่อนกดอนุมัติ" ไม่ได้เหมือนกัน
 *
 * ต่างจากจอหัวหน้างานตรงที่ **ค่าที่อ่านได้จริง** — backend ส่ง `2026-09-07`
 * กับ `FULL_DAY` มาดิบ ๆ จอนี้แปลงเป็น "7 ก.ย. 2569" และ "เต็มวัน" ก่อนแสดง
 */

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
 * ป้ายไทยของค่าดิบที่ backend ส่งมาเป็นชื่อ enum
 *
 * ชุดเดียวกับที่หน้าเว็บใช้ (`approvals/_components`) — ที่นี่แปลงตอนแสดงผล
 * ไม่ได้แก้ที่ mapper เพราะจอของหัวหน้างานยังอ่านค่าเดิมอยู่ ถ้าเปลี่ยนที่ต้นทาง
 * ต้องไล่แก้ทั้งสองจอพร้อมกันในรอบเดียว
 */
const VALUE_LABEL: Record<string, string> = {
  BREAK_END: 'กลับจากพัก',
  BREAK_START: 'เริ่มพัก',
  CHECK_IN: 'เวลาเข้า',
  CHECK_OUT: 'เวลาออก',
  DEVICE_ERROR: 'เครื่องขัดข้อง',
  FULL_DAY: 'เต็มวัน',
  HALF_DAY_AFTERNOON: 'ครึ่งวันบ่าย',
  HALF_DAY_MORNING: 'ครึ่งวันเช้า',
  HOLIDAY: 'วันหยุด',
  HOURLY: 'ลาเป็นชั่วโมง',
  MISSING_CHECK_IN: 'ลืมลงเวลาเข้า',
  MISSING_CHECK_OUT: 'ลืมลงเวลาออก',
  OTHER: 'อื่น ๆ',
  OUTSIDE_WORK: 'ทำงานนอกสถานที่',
  SPECIAL_HOLIDAY: 'วันหยุดพิเศษ',
  WORKDAY: 'วันทำงาน',
  WRONG_TIME: 'เวลาผิด',
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** "7 ก.ย. 2569" — ตัวช่วยเฉพาะไฟล์นี้ที่ล็อกรูปแบบไว้แบบเดียว */
function shortDate(value: Date): string {
  return thaiDate(value, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** ค่าดิบจาก backend → ค่าที่คนอ่านออก (วันที่ เวลา และชื่อ enum) */
function readable(value: string): string {
  const label = VALUE_LABEL[value];
  if (label) return label;

  if (DATE_ONLY.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year!, month! - 1, day!));

    return Number.isNaN(parsed.getTime())
      ? value
      : thaiDate(parsed, {
          day: 'numeric',
          month: 'short',
          timeZone: 'UTC',
          year: 'numeric',
        });
  }

  if (DATE_TIME.test(value)) {
    const parsed = new Date(value);

    return Number.isNaN(parsed.getTime())
      ? value
      : `${shortDate(parsed)} · ${thaiTime(parsed)} น.`;
  }

  return value;
}

/** แถวป้าย-ค่า ของหมวดข้อมูลคำขอ — ค่าอยู่ชิดขวา อ่านเป็นคอลัมน์ได้ */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'flex-start', flexDirection: 'row', gap: 14 }}>
      <Text style={{ color: AURORA.textMuted, flex: 1, fontSize: 12 }}>{label}</Text>
      <Text
        style={{
          color: AURORA.text,
          flex: 1.4,
          fontSize: 12,
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

/** ป้ายหมวด — ตัวเล็กเว้นระยะอักษร ไม่มีกล่องรองรับ (กติกาของผิวนี้) */
function GroupLabel({ label, trailing }: { label: string; trailing?: string }) {
  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', gap: 9 }}>
      <View
        style={{
          backgroundColor: AURORA.accent,
          borderRadius: 999,
          height: 15,
          width: 3,
        }}
      />
      <Text style={{ color: AURORA.text, flex: 1 }} variant="h3">
        {label}
      </Text>
      {trailing ? (
        <Text
          style={[
            TABULAR,
            { color: AURORA.textFaint, fontSize: 11.5, lineHeight: 16 },
          ]}
        >
          {trailing}
        </Text>
      ) : null}
    </View>
  );
}

export function ExecutiveApprovalDetail({
  id,
  type,
}: {
  id?: string;
  type?: ApprovalType;
}) {
  const { gutter } = useResponsive();
  const router = useRouter();
  const toast = useToast();
  const bootstrap = useBootstrap();
  const detail = useApprovalDetail(type, id);
  const act = useApprovalAction();
  const [openedAttachments, setOpenedAttachments] = useState<Set<string>>(
    () => new Set(),
  );
  const [sharingAttachmentId, setSharingAttachmentId] = useState<string | null>(null);
  const [viewerAttachment, setViewerAttachment] = useState<
    ApprovalDetail['attachments'][number] | null
  >(null);
  const [viewerHeight, setViewerHeight] = useState(0);
  const [pendingAction, setPendingAction] = useState<
    Exclude<ApprovalAction, 'approve'> | null
  >(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();

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
      toast.error(error instanceof ApiError ? error.message : 'เปิดไฟล์แนบไม่สำเร็จ');
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
        error instanceof ApiError ? error.message : `${ACTION_LABEL[action]}ไม่สำเร็จ`,
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
  const canAct =
    status === 'SUBMITTED' && (bootstrap.data?.featureFlags.approvals ?? false);
  const blockReason = detail.data
    ? approvalBlockReason({
        detail: detail.data,
        item: detail.data,
        openedAttachments,
      })
    : null;

  const submittedAt = detail.data?.submittedAt ?? detail.data?.createdAt ?? null;
  /*
   * สองบรรทัดอ้างอิงใต้ชื่อ — ชุดเดียวกับจอของหัวหน้างาน
   *   บรรทัดแรก   = ตัวคน (รหัส · สาขา)
   *   บรรทัดที่สอง = ตัวใบ (เลขที่ใบ · วันที่ยื่น)
   *
   * เลขที่ใบกับวันที่ยื่นเคยเป็นแถวในหมวด "ข้อมูลคำขอ" — ย้ายขึ้นมาไว้ใต้ชื่อ
   * เพราะเป็นของไว้อ้างอิงตอนคุยกันเรื่องใบนี้ ไม่ใช่เนื้อหาที่ต้องอ่านเพื่อ
   * ตัดสิน หมวดข้างล่างจึงเหลือเฉพาะรายละเอียดของคำขอจริง ๆ
   */
  const metaWho = [detail.data?.employeeCode, detail.data?.branch]
    .filter(Boolean)
    .join('  ·  ');
  const metaDoc = [
    detail.data?.requestNo,
    submittedAt
      ? `ยื่น ${shortDate(submittedAt)} · ${thaiTime(submittedAt)} น.`
      : null,
  ]
    .filter(Boolean)
    .join('  ·  ');
  /*
   * `summary` ที่ backend ส่งมาเป็นค่าดิบ (`2026-09-07 · 1 วัน`) — จอนี้แปลง
   * ทีละท่อนก่อนแสดง ให้เป็น พ.ศ. เหมือนวันที่อื่นทั้งจอ
   */
  const summaryText = detail.data?.summary
    ? detail.data.summary
        .split(' · ')
        .map((part) => readable(part))
        .join(' · ')
    : null;
  const infoRows = detail.data
    ? detail.data.details.map((row) => ({
        label: row.label,
        value: readable(row.value),
      }))
    : [];

  return (
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: canAct ? 150 : 40 }}
          showsVerticalScrollIndicator={false}
        >
          <Reveal>
            <PageHero
              decoration={<RequestDetailMotif />}
              icon="arrow-left"
              iconLabel="ย้อนกลับ"
              onIconPress={() => router.back()}
              right={
                /* สถานะอยู่บนหัวจอ ไม่ใช่ในเนื้อหา — เป็นคำตอบแรกที่ผู้บริหาร
                   มองหา และเป็นของที่มีสิทธิ์มีพื้นของตัวเองได้ในแถบนี้ */
                detail.data ? (
                  <View
                    style={{
                      backgroundColor: AURORA.accentSoft,
                      borderRadius: 999,
                      paddingHorizontal: 11,
                      paddingVertical: 5,
                    }}
                  >
                    <Text
                      maxScale={1.1}
                      style={{
                        color: AURORA.accent,
                        fontSize: 11,
                        fontWeight: '700',
                      }}
                    >
                      {REQUEST_STATUS_LABEL[status] ?? status}
                    </Text>
                  </View>
                ) : undefined
              }
              subtitle={type ? APPROVAL_TYPE_LABEL[type] : 'กำลังโหลดข้อมูล'}
              title="รายละเอียดคำขอ"
            />
          </Reveal>

          <View style={{ gap: 28, paddingHorizontal: gutter, paddingTop: 24 }}>

          {!type || !id ? (
            <View style={{ gap: 14 }}>
              <Text style={{ color: AURORA.text, fontSize: 14, fontWeight: '600' }}>
                ลิงก์รายละเอียดไม่ถูกต้อง
              </Text>
            </View>
          ) : detail.isPending ? (
            <View style={{ gap: 14 }}>
              <View style={{ gap: 14 }}>
                <View
                  style={{ backgroundColor: AURORA.glassBorder, borderRadius: 8, height: 74 }}
                />
                <View
                  style={{ backgroundColor: AURORA.glassBorder, borderRadius: 8, height: 120 }}
                />
              </View>
            </View>
          ) : detail.isError ? (
            <View style={{ gap: 14 }}>
              <Text style={{ color: AURORA.text, fontSize: 14, fontWeight: '600' }}>
                ยังดูรายละเอียดไม่ได้
              </Text>
              <Text style={{ color: AURORA.textMuted, fontSize: 12 }}>
                {detail.error instanceof ApiError
                  ? detail.error.message
                  : 'ลองใหม่อีกครั้ง'}
              </Text>
              <PressableScale
                onPress={() => void detail.refetch()}
                style={{ alignSelf: 'flex-start' }}
              >
                <Text style={{ color: AURORA.accent, fontSize: 13, fontWeight: '700' }}>
                  ลองใหม่
                </Text>
              </PressableScale>
            </View>
          ) : detail.data ? (
            <>
              {/*
                แถบตัวตนของคนยื่น — ชุดเดียวกับจอของหัวหน้างาน: รูปคนจริง
                ชื่อตัวโต ตำแหน่ง/แผนก แล้วปิดท้ายด้วยสองบรรทัดอ้างอิง

                เดิมเป็นข้อความสามบรรทัดเปล่า ๆ ขนาดไล่เลี่ยกันบนพื้นขาว หัวจอ
                จึงอ่านเป็นที่ว่างก้อนใหญ่ ไม่มีอะไรบอกว่าตรงไหนคือ "ใครยื่น"
                และไม่มีเส้นแบ่งกับเนื้อใบที่อยู่ถัดลงไป
              */}
              <Reveal delay={40}>
                <View
                  style={{
                    borderBottomColor: AURORA.glassBorder,
                    borderBottomWidth: 1,
                    gap: 2,
                    /* กินเต็มความกว้างจอ เส้นคั่นจะได้ลากสุดขอบเหมือนจอหัวหน้างาน */
                    marginHorizontal: -18,
                    marginTop: -24,
                    paddingBottom: 14,
                    paddingHorizontal: gutter,
                    paddingTop: 16,
                  }}
                >
                  <View
                    style={{ alignItems: 'center', flexDirection: 'row', gap: 13 }}
                  >
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
                          .join(' · ') || APPROVAL_TYPE_LABEL[type]}
                      </Text>
                    </View>
                  </View>

                  {/*
                    ค่าอ้างอิงเป็นบรรทัดข้อความคั่นจุด ไม่ใช่ชิปพื้นสีสี่ก้อน —
                    ทั้งหมดเป็นของอ่านประกอบ ใส่พื้นให้ทุกค่าแล้วมันจะแย่งสายตา
                    กับชื่อคนที่อยู่บรรทัดบน
                  */}
                  <View style={{ gap: 3, paddingLeft: IDENTITY_TEXT_INSET }}>
                    {metaWho ? (
                      <Text
                        numberOfLines={1}
                        style={[
                          TABULAR,
                          {
                            color: AURORA.textMuted,
                            fontSize: 11.5,
                            lineHeight: 16,
                          },
                        ]}
                      >
                        {metaWho}
                      </Text>
                    ) : null}
                    {metaDoc ? (
                      <Text
                        numberOfLines={1}
                        style={[
                          TABULAR,
                          {
                            color: AURORA.textFaint,
                            fontSize: 11,
                            lineHeight: 15,
                          },
                        ]}
                      >
                        {metaDoc}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </Reveal>

              {/* ------------------------------------------- ตัวใบ */}
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
                  {summaryText ? (
                    <Text
                      style={{
                        color: AURORA.textMuted,
                        fontSize: 13,
                        lineHeight: 19,
                      }}
                    >
                      {summaryText}
                    </Text>
                  ) : null}

                  {detail.data.reason ? (
                    /*
                      เหตุผลที่คนยื่นพิมพ์เอง — บล็อกพื้นฟ้าจางที่มีคำว่า
                      "เหตุผล" กำกับ แบบเดียวกับจอหัวหน้างาน
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
                        style={{ color: AURORA.text, fontSize: 13, lineHeight: 20 }}
                      >
                        {detail.data.reason}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Reveal>

              {/* --------------------------------------- ข้อมูลคำขอ */}
              {infoRows.length > 0 ? (
                <Reveal delay={120}>
                  <View style={{ gap: 14 }}>
                    <GroupLabel label="ข้อมูลคำขอ" />
                    <View style={{ gap: 10 }}>
                      {infoRows.map((row) => (
                        <DetailRow key={row.label} label={row.label} value={row.value} />
                      ))}
                    </View>
                  </View>
                </Reveal>
              ) : null}

              {/* ------------------------------------------ ไฟล์แนบ */}
              {detail.data.attachments.length > 0 ? (
                <Reveal delay={170}>
                  <View style={{ gap: 14 }}>
                    <GroupLabel
                      label="ไฟล์แนบ"
                      trailing={`${detail.data.attachments.length} ไฟล์`}
                    />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                      {detail.data.attachments.map((attachment) =>
                        attachment.downloadSupported && isImageAttachment(attachment) ? (
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
                              attachment.title ?? attachment.fileName ?? 'ไฟล์แนบ'
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
                              opacity: attachment.downloadSupported ? 1 : 0.55,
                              paddingHorizontal: 6,
                              width: ATTACHMENT_THUMB_SIZE,
                            }}
                          >
                            {sharingAttachmentId === attachment.id ? (
                              <ActivityIndicator color={AURORA.accent} size="small" />
                            ) : (
                              <>
                                <Icon
                                  color={AURORA.accent}
                                  name="file-text"
                                  size={19}
                                />
                                <Text
                                  numberOfLines={1}
                                  style={{ color: AURORA.textMuted, fontSize: 10.5 }}
                                >
                                  {attachment.downloadSupported ? 'เปิดไฟล์' : 'ดูบนเว็บ'}
                                </Text>
                              </>
                            )}
                          </PressableScale>
                        ),
                      )}
                    </View>
                  </View>
                </Reveal>
              ) : null}

            </>
          ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* ------------------------------------------------ แถบตัดสินใจ */}
      {canAct && detail.data ? (
        <View
          style={{
            backgroundColor: AURORA.baseDeep,
            borderTopColor: AURORA.glassBorder,
            borderTopWidth: 1,
            bottom: 0,
            left: 0,
            paddingHorizontal: 22,
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
                  gap: 7,
                  marginBottom: 8,
                }}
              >
                <Icon color={AURORA.amber} name="alert-circle" size={15} />
                <Text style={{ color: AURORA.textMuted, flex: 1, fontSize: 11.5 }}>
                  {blockReason}
                </Text>
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                accessibilityRole="button"
                disabled={act.isPending}
                onPress={() => openReason('reject')}
                style={({ pressed }) => ({
                  alignItems: 'center',
                  backgroundColor: pressed ? 'rgba(190, 18, 60, 0.08)' : 'transparent',
                  borderColor: 'rgba(190, 18, 60, 0.35)',
                  borderRadius: 14,
                  borderWidth: 1,
                  flex: 1,
                  flexDirection: 'row',
                  gap: 6,
                  justifyContent: 'center',
                  minHeight: 48,
                })}
              >
                <Icon color={AURORA.rose} name="x" size={17} />
                <Text style={{ color: AURORA.rose, fontSize: 13.5, fontWeight: '700' }}>
                  ไม่อนุมัติ
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={act.isPending || Boolean(blockReason)}
                onPress={() => void runAction('approve')}
                style={({ pressed }) => ({
                  alignItems: 'center',
                  backgroundColor: pressed ? AURORA.accentEnd : AURORA.accent,
                  borderRadius: 14,
                  flex: 1,
                  flexDirection: 'row',
                  gap: 6,
                  justifyContent: 'center',
                  minHeight: 48,
                  opacity: act.isPending || blockReason ? 0.48 : 1,
                })}
              >
                {act.isPending ? (
                  <ActivityIndicator color={'#ffffff'} size="small" />
                ) : (
                  <Icon color={'#ffffff'} name="check" size={17} />
                )}
                <Text
                  style={{ color: '#ffffff', fontSize: 13.5, fontWeight: '700' }}
                >
                  อนุมัติ
                </Text>
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={act.isPending}
              onPress={() => openReason('return')}
              style={{ alignItems: 'center', paddingVertical: 9 }}
            >
              <Text style={{ color: AURORA.accent, fontSize: 12, fontWeight: '600' }}>
                ส่งกลับให้แก้ไข
              </Text>
            </Pressable>
          </SafeAreaView>
        </View>
      ) : null}

      {/* --------------------------------------------- ดูรูปเต็มจอ */}
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
                    style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}
                  >
                    {viewerAttachment.title ?? viewerAttachment.fileName ?? 'รูปหลักฐาน'}
                  </Text>
                  {viewerAttachment.fileName ? (
                    <Text
                      numberOfLines={1}
                      style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 11 }}
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
                  <Icon color="#ffffff" name="x" size={18} />
                </PressableScale>
              </View>

              <View
                onLayout={(event) => {
                  const next = Math.round(event.nativeEvent.layout.height);
                  setViewerHeight((current) => (current === next ? current : next));
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
                    <ActivityIndicator color={'#ffffff'} size="small" />
                  ) : (
                    <Icon color={'#ffffff'} name="external-link" size={18} />
                  )}
                  <Text
                    style={{ color: '#ffffff', fontSize: 14, fontWeight: '800' }}
                  >
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
