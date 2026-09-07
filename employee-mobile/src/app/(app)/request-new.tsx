import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
/* ใช้ Image ของ RN แทน expo-image — แสดงรูปเดียวเล็ก ๆ ไม่คุ้มกับอีกหนึ่ง dependency */
import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  DateField,
  ErrorState,
  InlineNotice,
  Input,
  KeyboardAwareScroll,
  Select,
  Skeleton,
  Text,
  hitSlop,
  useToast,
} from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  PageHero,
  PageSection,
  PressableScale,
  RequestFormMotif,
  Reveal,
} from '@/design/aurora';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import {
  AttachmentImagePreview,
  isImageAttachment,
} from '@/features/requests/attachment-preview';
import {
  compressAttachment,
  deleteRequestAttachment,
  MAX_REQUEST_ATTACHMENTS,
  maxAttachmentsFor,
  pickAttachmentImages,
  requiresEvidence,
  sendsEvidenceInPayload,
  supportsAttachment,
  uploadAttachment,
  type AttachmentSource,
  type PreparedAttachment,
} from '@/features/requests/attachment';
import {
  buildRequestPayload,
  emptyRequestForm,
  hasErrors,
  requestFormFromEditable,
  toLocalDateString,
  validateRequestForm,
  type LeaveDayType,
  type RequestFormErrors,
  type RequestFormState,
} from '@/features/requests/request-form';
import {
  REQUEST_TYPE_LABEL,
  requestTypeSchema,
  type RequestAttachment,
  type RequestType,
} from '@/features/requests/requests.types';
import {
  useCreateRequest,
  useLeaveCatalog,
  useOvertimeDayType,
  useRequestDetail,
  useSubmitRequest,
  useUpdateRequest,
} from '@/features/requests/use-requests';
import { ApiError } from '@/lib/api/api-error';
import { captureException } from '@/lib/monitoring/monitoring';
import { useAppTheme } from '@/theme/use-app-theme';
import { useVisibleStatusBarStyle } from '@/theme/use-status-bar-style';

/**
 * ยื่นคำขอใหม่
 *
 * ฟอร์มเดียวสลับตามประเภท แทนที่จะแยกสี่จอ — ผู้ใช้มักตัดสินใจว่า
 * "จะลาหรือขอแก้เวลาดี" ตอนอยู่ในฟอร์มแล้ว การสลับได้โดยไม่ต้องย้อนกลับ
 * ทำให้ไม่ต้องกรอกเหตุผลใหม่
 */

const DAY_TYPES: { label: string; value: LeaveDayType }[] = [
  { label: 'เต็มวัน', value: 'FULL_DAY' },
  { label: 'ครึ่งวันเช้า', value: 'HALF_DAY_MORNING' },
  { label: 'ครึ่งวันบ่าย', value: 'HALF_DAY_AFTERNOON' },
  { label: 'ระบุเป็นชั่วโมง', value: 'HOURLY' },
];

const ADJUST_TYPES = [
  { label: 'ลืมลงเวลาเข้า', value: 'MISSING_CHECK_IN' },
  { label: 'ลืมลงเวลาออก', value: 'MISSING_CHECK_OUT' },
  { label: 'เวลาที่บันทึกไม่ถูกต้อง', value: 'WRONG_TIME' },
  { label: 'เครื่องบันทึกผิดพลาด', value: 'DEVICE_ERROR' },
  { label: 'ทำงานนอกสถานที่', value: 'OUTSIDE_WORK' },
  { label: 'อื่น ๆ', value: 'OTHER' },
];

const TARGET_LOG_TYPES = [
  { label: 'เวลาเข้างาน', value: 'CHECK_IN' },
  { label: 'เวลาออกงาน', value: 'CHECK_OUT' },
];

/**
 * โครงจอของฟอร์ม — หัวจอเดียวกับทุกสถานะ
 *
 * ใช้ทั้งตอนโหลดข้อมูลใบเดิม ตอนโหลดไม่สำเร็จ และตอนไม่มีสิทธิ์ยื่น เพื่อให้
 * ผู้ใช้เห็นหัวจอกับปุ่มปิดอยู่ที่เดิมเสมอ ไม่ใช่จอเปล่าที่ปิดไม่ได้
 */
function FormShell({
  children,
  onClose,
  subtitle,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  subtitle?: string;
  title: string;
}) {
  const { gutter } = useResponsive();
  return (
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <View>
          <PageHero
            decoration={<RequestFormMotif />}
            icon="x"
            iconLabel="ปิด"
            onIconPress={onClose}
            subtitle={subtitle}
            title={title}
          />
        </View>

        <View style={{ gap: 14, paddingHorizontal: gutter, paddingTop: 24 }}>
          {children}
        </View>
      </SafeAreaView>
    </View>
  );
}

function FieldPair({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: 9 }}>{children}</View>;
}

/**
 * ประเภทวันของใบ OT — อ่านอย่างเดียว
 *
 * เมื่อก่อนเป็นช่องให้เลือกเอง เลือกผิดทีอัตราค่า OT ผิดทั้งใบ ตอนนี้หลังบ้าน
 * จับจากปฏิทินวันหยุดให้ ช่องนี้จึงมีหน้าที่เดียวคือบอกผู้ใช้ล่วงหน้าว่า
 * วันที่เลือกไว้จะถูกคิดเป็นวันอะไร ก่อนกดส่ง
 */
function OvertimeDayTypeField({ workDate }: { workDate: Date | null }) {
  const { theme } = useAppTheme();
  const dateKey = workDate ? toLocalDateString(workDate) : null;
  const { data, isError, isPending } = useOvertimeDayType(dateKey);

  const caption = !dateKey
    ? 'เลือกวันที่ก่อน'
    : isError
      ? 'ตรวจปฏิทินไม่สำเร็จ ระบบจะคิดให้ตอนบันทึก'
      : (data?.reason ?? 'ระบบตรวจให้จากปฏิทินวันหยุด');

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: AURORA.textMuted }} tone="muted" variant="label">
        ประเภทวัน
      </Text>

      <View
        style={{
          alignItems: 'center',
          backgroundColor: AURORA.accentSoft,
          borderColor: AURORA.glassBorder,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          flexDirection: 'row',
          gap: theme.spacing.xs,
          minHeight: 48,
          paddingHorizontal: theme.spacing.sm,
        }}
      >
        {dateKey && isPending ? (
          <ActivityIndicator color={AURORA.accent} size="small" />
        ) : (
          <Ionicons
            color={
              data && data.workType !== 'WORKDAY' ? AURORA.sky : AURORA.accent
            }
            name={
              data && data.workType !== 'WORKDAY'
                ? 'sunny-outline'
                : 'briefcase-outline'
            }
            size={16}
          />
        )}
        <Text
          numberOfLines={1}
          style={{
            color:
              data && data.workType !== 'WORKDAY' ? AURORA.sky : AURORA.text,
            flex: 1,
          }}
        >
          {dateKey && isPending ? 'กำลังตรวจปฏิทิน…' : (data?.label ?? '-')}
        </Text>
      </View>

      <Text
        style={{ color: AURORA.textFaint }}
        tone="subtle"
        variant="caption"
      >
        {data?.holidayName ? `${data.holidayName} · ${caption}` : caption}
      </Text>
    </View>
  );
}

function AttachmentAction({
  icon,
  label,
  loading,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={loading}
      onPress={onPress}
      style={{
        alignItems: 'center',
        backgroundColor: AURORA.accentSoft,
        borderRadius: 999,
        height: 38,
        justifyContent: 'center',
        opacity: loading ? 0.55 : 1,
        width: 38,
      }}
    >
      {loading ? (
        <ActivityIndicator color={AURORA.accent} size="small" />
      ) : (
        <Ionicons color={AURORA.accent} name={icon} size={18} />
      )}
    </PressableScale>
  );
}

function FormAction({
  disabled,
  icon,
  label,
  loading,
  onPress,
  primary = false,
}: {
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  loading?: boolean;
  onPress: () => void;
  primary?: boolean;
}) {
  const inactive = Boolean(disabled || loading);
  const foreground = primary ? '#ffffff' : AURORA.accent;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      style={{
        alignItems: 'center',
        backgroundColor: primary ? AURORA.accent : AURORA.glassStrong,
        borderColor: primary ? AURORA.accent : AURORA.glassBorder,
        borderRadius: 18,
        borderWidth: 1,
        elevation: primary ? 3 : 0,
        flexDirection: 'row',
        gap: 8,
        height: 54,
        justifyContent: 'center',
        opacity: inactive ? 0.5 : 1,
        paddingHorizontal: 16,
        shadowColor: primary ? AURORA.accent : AURORA.glowBlue,
        shadowOffset: { height: 5, width: 0 },
        shadowOpacity: primary ? 0.2 : 0,
        shadowRadius: 9,
      }}
    >
      {loading ? (
        <ActivityIndicator color={foreground} size="small" />
      ) : (
        <>
          {icon ? <Ionicons color={foreground} name={icon} size={19} /> : null}
          <Text style={{ color: foreground, fontWeight: '700' }}>{label}</Text>
        </>
      )}
    </PressableScale>
  );
}

export default function NewRequestScreen() {
  const { gutter } = useResponsive();
  const { resolvedMode } = useAppTheme();
  const router = useRouter();
  const toast = useToast();
  const bootstrap = useBootstrap();
  const create = useCreateRequest();
  const update = useUpdateRequest();
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

  const flags = bootstrap.data?.featureFlags;

  /* โชว์เฉพาะประเภทที่ยื่นได้จริง ไม่งั้นกรอกเสร็จแล้วเจอ 403 */
  const available = useMemo(() => {
    const all: { enabled: boolean; type: RequestType }[] = [
      { enabled: Boolean(flags?.leave), type: 'LEAVE' },
      { enabled: Boolean(flags?.overtime), type: 'OVERTIME' },
      { enabled: Boolean(flags?.timeAdjust), type: 'TIME_ADJUST' },
      { enabled: Boolean(flags?.offsite), type: 'OFFSITE' },
    ];

    return all.filter((item) => item.enabled).map((item) => item.type);
  }, [flags]);

  /*
   * ทางลัดบนหน้าหลักส่งประเภทมาให้ — กด "ยื่นลา" แล้วต้องได้ฟอร์มลาทันที
   * แต่ยังต้องกรองด้วยสิทธิ์อีกชั้น ค่าที่ส่งมาจาก deep link เชื่อไม่ได้
   */
  const params = useLocalSearchParams<{
    id?: string;
    type?: string;
  }>();
  const editId = params.id ? String(params.id) : null;
  const sourceId = editId;
  const parsedRequestedType = requestTypeSchema.safeParse(params.type);
  const requestedType = parsedRequestedType.success ? parsedRequestedType.data : null;
  const requested = available.find((item) => item === requestedType) ?? null;
  const activeType = requested ?? available[0] ?? null;

  const [form, setForm] = useState<RequestFormState>({ ...emptyRequestForm });
  const [errors, setErrors] = useState<RequestFormErrors>({});
  const [attachments, setAttachments] = useState<PreparedAttachment[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [removingAttachmentId, setRemovingAttachmentId] = useState<
    string | null
  >(null);
  const [initializedSourceId, setInitializedSourceId] = useState<string | null>(
    null,
  );

  const editDetail = useRequestDetail(
    activeType ?? 'LEAVE',
    activeType ? sourceId ?? '' : '',
  );
  const catalog = useLeaveCatalog(activeType === 'LEAVE');

  /*
   * เติมฟอร์มจากฉบับร่างที่กำลังแก้ — ปรับ state ระหว่าง render ไม่ใช้ effect
   * เพื่อไม่ให้เห็นฟอร์มเปล่าแวบหนึ่งก่อนค่าจริงจะเข้ามาทับ
   * `initializedSourceId` กันไม่ให้ refetch เขียนทับสิ่งที่ผู้ใช้พิมพ์ค้างไว้
   */
  if (
    sourceId &&
    activeType &&
    editDetail.data &&
    initializedSourceId !== sourceId
  ) {
    setForm(requestFormFromEditable(activeType, editDetail.data.editable));
    setInitializedSourceId(sourceId);
  }

  const patch = (next: Partial<RequestFormState>) => {
    setForm((current) => ({ ...current, ...next }));
    /* ล้าง error ของช่องที่เพิ่งแก้ ผู้ใช้จะได้ไม่เห็นข้อความแดงค้าง */
    setErrors((current) => {
      const cleaned = { ...current };

      for (const key of Object.keys(next)) {
        delete cleaned[key as keyof RequestFormState];
      }

      return cleaned;
    });
  };

  const selectedLeaveType = catalog.data?.leaveTypes.find(
    (item) => item.leaveTypeId === form.leaveTypeId,
  );
  const leaveTypeOptions = useMemo(
    () =>
      [...(catalog.data?.leaveTypes ?? [])]
        .sort(
          (left, right) =>
            Number(right.remainingDays > 0) - Number(left.remainingDays > 0),
        )
        .map((item) => ({
          description: `คงเหลือ ${item.remainingDays} วัน${
            item.isPaid ? '' : ' · ไม่ได้รับค่าจ้าง'
          }`,
          label: item.name,
          value: item.leaveTypeId,
        })),
    [catalog.data?.leaveTypes],
  );

  /* งานนอกสถานที่ส่งรูปไปกับ payload ได้ใบละรูปเดียว ประเภทอื่นอัปโหลดแยกได้หลายรูป */
  const evidenceInPayload = activeType
    ? sendsEvidenceInPayload(activeType)
    : false;
  const maxAttachments = activeType
    ? maxAttachmentsFor(activeType)
    : MAX_REQUEST_ATTACHMENTS;


  /*
   * ไฟล์แนบที่มีอยู่แล้วในใบที่กำลังแก้
   *
   * นับรวมกับรูปที่เพิ่งเลือกในรอบนี้ตอนคิดโควตา ไม่งั้นผู้ใช้แนบจนครบเพดาน
   * แล้ว backend จะปฏิเสธตอนกดบันทึก ทั้งที่แอปบอกว่ายังแนบได้อยู่
   */
  const existingAttachments = sourceId
    ? (editDetail.data?.attachments ?? [])
    : [];
  const canDeleteExisting = Boolean(editDetail.data?.canDeleteAttachments);
  const attachedTotal = attachments.length + existingAttachments.length;

  async function removeExisting(attachment: RequestAttachment) {
    if (!activeType || !sourceId) return;

    setRemovingAttachmentId(attachment.id);

    try {
      await deleteRequestAttachment({
        attachmentId: attachment.id,
        requestId: sourceId,
        type: activeType,
      });
      toast.success('ลบรูปที่แนบไว้เรียบร้อย');
      await editDetail.refetch();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'ลบรูปที่แนบไว้ไม่สำเร็จ',
      );
    } finally {
      setRemovingAttachmentId(null);
    }
  }

  async function attach(source: AttachmentSource) {
    const remaining = maxAttachments - attachedTotal;
    if (remaining <= 0) {
      toast.warn(`แนบรูปได้สูงสุด ${maxAttachments} รูป`);
      return;
    }

    setPreparing(true);

    try {
      const picked = await pickAttachmentImages(source, remaining);

      /* ผู้ใช้กดยกเลิกไม่ใช่ความผิดพลาด ไม่ต้องขึ้นข้อความอะไร */
      if (picked.length === 0) return;

      const prepared: PreparedAttachment[] = [];
      for (const uri of picked) {
        prepared.push(
          await compressAttachment(uri, { withDataUrl: evidenceInPayload }),
        );
      }

      setAttachments((current) =>
        [...current, ...prepared].slice(0, maxAttachments),
      );
    } catch (error) {
      captureException(error, { scope: 'requests.attachment.pick', source });

      toast.error(
        error instanceof ApiError ? error.message : 'เตรียมรูปไม่สำเร็จ',
      );
    } finally {
      setPreparing(false);
    }
  }

  async function save(action: 'draft' | 'submit') {
    if (!activeType) return;

    const found = validateRequestForm(activeType, form);
    setErrors(found);

    if (hasErrors(found)) {
      toast.warn(
        action === 'draft'
          ? 'กรุณากรอกข้อมูลหลักให้ครบก่อนบันทึกร่าง'
          : 'กรุณากรอกข้อมูลให้ครบก่อนยื่น',
      );
      return;
    }

    /* รูปที่แนบไว้ในใบเดิมนับด้วย ไม่ต้องถ่ายซ้ำทุกครั้งที่แก้ไขร่าง */
    const existingEvidence = editDetail.data?.attachments.length ?? 0;

    if (
      action === 'submit' &&
      requiresEvidence(activeType) &&
      attachments.length + existingEvidence === 0
    ) {
      toast.warn('ต้องแนบรูปหลักฐานอย่างน้อย 1 รูปก่อนส่งอนุมัติ');
      return;
    }

    const body = buildRequestPayload(activeType, form);

    /* งานนอกสถานที่ไม่มี endpoint อัปโหลด รูปจึงเดินทางไปกับตัวใบเลย */
    if (evidenceInPayload && attachments[0]) {
      if (!attachments[0].dataUrl) {
        /*
         * เตรียมรูปไม่สำเร็จตั้งแต่ตอนเลือก บอกตรงนี้ดีกว่าปล่อยให้ยิงไปแล้ว
         * โดนหลังบ้านตีกลับว่าไม่มีหลักฐาน ซึ่งผู้ใช้จะไม่รู้ว่าต้องแก้ที่รูป
         */
        toast.error('เตรียมรูปหลักฐานไม่สำเร็จ กรุณาเลือกรูปใหม่อีกครั้ง');
        return;
      }

      body.attachmentUrl = attachments[0].dataUrl;
    }

    let requestId = editId;

    try {
      if (editId) {
        await update.mutateAsync({ body, id: editId, type: activeType });
      } else {
        /*
         * ถ้ามีไฟล์ ให้สร้างเป็น DRAFT ก่อนเพื่ออัปโหลดหลักฐานให้เสร็จ แล้วค่อย submit
         * ป้องกันหัวหน้าเห็นใบก่อนหลักฐานและทำให้ retry แล้วเกิดใบซ้ำ
         */
        const created = await create.mutateAsync({
          body,
          submit:
            action === 'submit' &&
            (evidenceInPayload || attachments.length === 0),
          type: activeType,
        });
        requestId = created.id;
      }
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : editId
            ? 'บันทึกการแก้ไขไม่สำเร็จ'
            : 'บันทึกคำขอไม่สำเร็จ',
      );
      return;
    }

    if (attachments.length > 0 && !evidenceInPayload) {
      if (!requestId) {
        toast.warn('บันทึกคำขอแล้ว แต่แนบรูปไม่ได้ กรุณาแนบใหม่ภายหลัง');
        router.back();
        return;
      }

      try {
        for (const [index, file] of attachments.entries()) {
          await uploadAttachment({
            file,
            requestId,
            title: `หลักฐานประกอบคำขอ ${index + 1}`,
            type: activeType,
          });
        }
      } catch (error) {
        /*
         * ต้องบอกสาเหตุจริงเสมอ
         *
         * ข้อความลอย ๆ ว่า "แนบรูปไม่สำเร็จ" ทำให้ผู้ใช้เข้าใจว่าแนบไปแล้ว
         * และไม่มีใครรู้ว่าพังตรงไหน — เคสจริงที่ไล่กันอยู่คือหลักฐานหายเงียบ
         * ทั้งที่ผู้ใช้กดแนบแล้ว จึงต้องส่งเข้า telemetry ให้เห็นฝั่ง server ด้วย
         */
        captureException(error, { scope: 'requests.attachment.upload' });

        toast.warn(
          `${
            action === 'submit'
              ? 'บันทึกเป็นฉบับร่างแล้ว แต่แนบรูปไม่สำเร็จ จึงยังไม่ได้ส่งอนุมัติ'
              : 'บันทึกฉบับร่างแล้ว แต่แนบรูปไม่สำเร็จ ลองแนบใหม่ภายหลัง'
          }${error instanceof ApiError ? `: ${error.message}` : ''}`,
        );
        router.back();
        return;
      }
    }

    /* create ใหม่แบบไม่มีไฟล์และ submit=true ถูกส่งเข้าคิวจาก create แล้ว */
    const needsSeparateSubmit =
      action === 'submit' &&
      Boolean(requestId) &&
      (Boolean(editId) || (attachments.length > 0 && !evidenceInPayload));

    if (needsSeparateSubmit && requestId) {
      try {
        await submitDraft.mutateAsync({ id: requestId, type: activeType });
      } catch (error) {
        toast.warn(
          error instanceof ApiError
            ? `บันทึกฉบับร่างแล้ว แต่ยังส่งอนุมัติไม่ได้: ${error.message}`
            : 'บันทึกฉบับร่างแล้ว แต่ยังส่งอนุมัติไม่ได้',
        );
        router.back();
        return;
      }
    }

    toast.success(
      action === 'draft'
        ? 'บันทึกฉบับร่างเรียบร้อย'
        : editId
          ? 'แก้ไขและส่งคำขอใหม่เรียบร้อย'
          : 'ยื่นคำขอเรียบร้อย รอหัวหน้าอนุมัติ',
    );
    router.back();
  }

  /*
   * สถานะก่อนฟอร์มจะพร้อม — ยังต้องอยู่บนผิวขาวของจอนี้
   *
   * เดิมทั้งสี่กรณีคืน `<Screen>` ซึ่งใช้สีจากธีม พอเปิดจอแก้ไขคำขอทีไร
   * จะเห็นจอสีธีมแวบหนึ่งก่อนสลับเป็นผิวขาวเสมอ (โหมดมืดคือจอดำแวบเลย)
   * ตอนนี้ทุกสถานะใช้หัวจอกับพื้นเดียวกับฟอร์มจริง เปลี่ยนแค่เนื้อข้างใน
   */
  if (!activeType || (sourceId && editDetail.isPending)) {
    return (
      <FormShell onClose={() => router.back()} title={sourceId ? 'แก้ไขคำขอ' : 'ยื่นคำขอ'}>
        {activeType ? (
          <View style={{ gap: 12 }}>
            <Skeleton height={16} width="35%" />
            <Skeleton height={48} radius={14} />
            <Skeleton height={48} radius={14} />
            <Skeleton height={80} radius={14} />
          </View>
        ) : (
          <InlineNotice
            icon="lock-closed-outline"
            message="บัญชีนี้ยังไม่ได้รับสิทธิ์ยื่นคำขอประเภทใดเลย"
          />
        )}
      </FormShell>
    );
  }

  if (sourceId && editDetail.isError) {
    return (
      <FormShell onClose={() => router.back()} title="แก้ไขคำขอ">
        <ErrorState
          description={
            editDetail.error instanceof ApiError
              ? editDetail.error.message
              : undefined
          }
          onRetry={() => void editDetail.refetch()}
          retrying={editDetail.isRefetching}
          title="ยังโหลดข้อมูลคำขอไม่ได้"
        />
      </FormShell>
    );
  }

  if (editId && editDetail.data && !editDetail.data.canEdit) {
    return (
      <FormShell onClose={() => router.back()} title="แก้ไขคำขอ">
        <InlineNotice
          icon="lock-closed-outline"
          message="คำขอนี้ไม่ได้อยู่ในสถานะร่าง จึงแก้ไขผ่านแอปไม่ได้"
          tone="warning"
        />
      </FormShell>
    );
  }

  const needsWorkDate = activeType === 'OVERTIME' || activeType === 'OFFSITE';
  const isSaving = create.isPending || update.isPending || submitDraft.isPending;

  return (
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        {/*
          หัวจอตรึงไว้ ไม่ต้องเลื่อนย้อนขึ้นไปเพื่อปิด — โครงเดียวกับหัวจอของ
          แท็บอื่นและจอรายละเอียดคำขอ วงไอคอนขาวทำหน้าที่เป็นปุ่มปิด
        */}
        <Reveal>
          <View>
            <PageHero
              decoration={<RequestFormMotif />}
              icon="x"
              iconLabel="ปิด"
              onIconPress={() => router.back()}
              subtitle={REQUEST_TYPE_LABEL[activeType]}
              title={sourceId ? 'แก้ไขคำขอ' : 'ยื่นคำขอ'}
            />
          </View>
        </Reveal>

        {/*
          ตัวเลื่อนของฟอร์ม — เลื่อนช่องที่กำลังพิมพ์ให้พ้นแป้นพิมพ์ให้เอง
          ฟอร์มนี้ยาวกว่าหนึ่งจอ ช่องล่าง ๆ (เหตุผล) จึงโดนแป้นพิมพ์บังเสมอ
        */}
        <KeyboardAwareScroll
          contentContainerStyle={{
            gap: 28,
            paddingBottom: 22,
            paddingHorizontal: gutter,
            paddingTop: 22,
          }}
          style={{ flex: 1 }}
        >
          <Reveal delay={80}>
            <PageSection
              title={`รายละเอียด${REQUEST_TYPE_LABEL[activeType]}`}
              trailing={
                <Text style={{ color: AURORA.rose }} variant="caption">
                  * จำเป็น
                </Text>
              }
            >
              <View style={{ gap: 14, paddingTop: 2 }}>
              {activeType === 'LEAVE' ? (
                <>
                  <Select
                    appearance="aurora"
                    error={errors.leaveTypeId}
                    label="ประเภทการลา"
                    onChange={(value) => patch({ leaveTypeId: value })}
                    options={leaveTypeOptions}
                    placeholder={
                      catalog.isPending ? 'กำลังโหลด...' : 'เลือกประเภทการลา'
                    }
                    required
                    value={form.leaveTypeId}
                  />

                  <Select
                    appearance="aurora"
                    label="ลักษณะการลา"
                    onChange={(value) =>
                      patch({ dayType: value as LeaveDayType })
                    }
                    options={DAY_TYPES}
                    value={form.dayType}
                  />

                  <FieldPair>
                    <View style={{ flex: 1 }}>
                      <DateField
                        appearance="aurora"
                        error={errors.startDate}
                        label="เริ่มลา"
                        onChange={(value) => patch({ startDate: value })}
                        required
                        value={form.startDate}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <DateField
                        appearance="aurora"
                        error={errors.endDate}
                        label="สิ้นสุด"
                        minimumDate={form.startDate ?? undefined}
                        onChange={(value) => patch({ endDate: value })}
                        required
                        value={form.endDate}
                      />
                    </View>
                  </FieldPair>

                  {form.dayType === 'HOURLY' ? (
                    <FieldPair>
                      <View style={{ flex: 1 }}>
                        <DateField
                          appearance="aurora"
                          error={errors.startAt}
                          label="เวลาเริ่ม"
                          mode="time"
                          onChange={(value) => patch({ startAt: value })}
                          required
                          value={form.startAt}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <DateField
                          appearance="aurora"
                          error={errors.endAt}
                          label="เวลาสิ้นสุด"
                          mode="time"
                          onChange={(value) => patch({ endAt: value })}
                          required
                          value={form.endAt}
                        />
                      </View>
                    </FieldPair>
                  ) : null}

                  {selectedLeaveType && selectedLeaveType.remainingDays <= 0 ? (
                    <View
                      style={{
                        alignItems: 'center',
                        backgroundColor: 'rgba(217, 119, 6, 0.08)',
                        borderRadius: 14,
                        flexDirection: 'row',
                        gap: 8,
                        padding: 10,
                      }}
                    >
                      <Ionicons
                        color={AURORA.amber}
                        name="alert-circle-outline"
                        size={18}
                      />
                      <Text
                        style={{ color: AURORA.amber, flex: 1 }}
                        variant="caption"
                      >
                        วันลาคงเหลือไม่พอ คำขอนี้อาจไม่ได้รับค่าจ้าง
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : null}

              {activeType === 'TIME_ADJUST' ? (
                <>
                  <Select
                    appearance="aurora"
                    label="สาเหตุ"
                    onChange={(value) => patch({ adjustType: value })}
                    options={ADJUST_TYPES}
                    required
                    value={form.adjustType}
                  />
                  <Select
                    appearance="aurora"
                    label="รายการเวลาที่ต้องการแก้"
                    onChange={(value) => patch({ targetLogType: value })}
                    options={TARGET_LOG_TYPES}
                    required
                    value={form.targetLogType}
                  />
                  <DateField
                    appearance="aurora"
                    error={errors.startAt}
                    hint="กรอกเวลาที่ควรจะเป็น"
                    label="วันและเวลาที่ถูกต้อง"
                    mode="datetime"
                    onChange={(value) => patch({ startAt: value })}
                    required
                    value={form.startAt}
                  />
                </>
              ) : null}

              {needsWorkDate ? (
                <>
                  {activeType === 'OVERTIME' ? (
                    <FieldPair>
                      <View style={{ flex: 1 }}>
                        <DateField
                          appearance="aurora"
                          error={errors.workDate}
                          label="วันที่"
                          onChange={(value) => patch({ workDate: value })}
                          required
                          value={form.workDate}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <OvertimeDayTypeField workDate={form.workDate} />
                      </View>
                    </FieldPair>
                  ) : (
                    <DateField
                      appearance="aurora"
                      error={errors.workDate}
                      label="วันที่"
                      onChange={(value) => patch({ workDate: value })}
                      required
                      value={form.workDate}
                    />
                  )}

                  <FieldPair>
                    <View style={{ flex: 1 }}>
                      <DateField
                        appearance="aurora"
                        error={errors.startAt}
                        label="เวลาเริ่ม"
                        mode="time"
                        onChange={(value) => patch({ startAt: value })}
                        required
                        value={form.startAt}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <DateField
                        appearance="aurora"
                        error={errors.endAt}
                        label="เวลาสิ้นสุด"
                        mode="time"
                        onChange={(value) => patch({ endAt: value })}
                        required
                        value={form.endAt}
                      />
                    </View>
                  </FieldPair>
                  {activeType === 'OVERTIME' ? (
                    <Text style={{ color: AURORA.textFaint }} variant="caption">
                      เลิกหลังเที่ยงคืนสามารถใส่เวลาของวันถัดไปได้
                    </Text>
                  ) : null}
                </>
              ) : null}

              <Input
                appearance="aurora"
                error={errors.reason}
                label="เหตุผล"
                multiline
                numberOfLines={2}
                onChangeText={(value) => patch({ reason: value })}
                placeholder="อธิบายสั้น ๆ ให้หัวหน้าเข้าใจ"
                required
                value={form.reason}
              />
              </View>
            </PageSection>
          </Reveal>

          {supportsAttachment(activeType) || evidenceInPayload ? (
            <Reveal delay={120}>
              <PageSection
                title="หลักฐานประกอบ"
                trailing={
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <AttachmentAction
                      icon="camera-outline"
                      label="ถ่ายรูป"
                      loading={preparing}
                      onPress={() => void attach('camera')}
                    />
                    <AttachmentAction
                      icon="images-outline"
                      label="เลือกจากคลัง"
                      loading={preparing}
                      onPress={() => void attach('library')}
                    />
                  </View>
                }
              >
                <Text
                  style={{ color: AURORA.textMuted }}
                  variant="caption"
                >
                  {requiresEvidence(activeType)
                    ? `ต้องแนบก่อนส่งอนุมัติ · สูงสุด ${maxAttachments} รูป`
                    : selectedLeaveType?.requiresAttachment
                      ? `จำเป็นสำหรับการลาประเภทนี้ · สูงสุด ${maxAttachments} รูป`
                      : `ไม่บังคับ · สูงสุด ${maxAttachments} รูป`}
                </Text>

                {/*
                  รูปที่เคยแนบไว้ในใบนี้ — ต้องเห็นตอนแก้ไข ไม่ใช่เห็นแต่ช่องเปล่า
                  จนนึกว่าหลักฐานหาย แล้วแนบซ้ำเข้าไปอีกใบ
                  ลบได้เฉพาะเมื่อ backend ยืนยันว่าใบนี้ยังลบไฟล์แนบได้อยู่
                */}
                {existingAttachments.length > 0 ? (
                  <View style={{ gap: 8 }}>
                    <Text
                      style={{ color: AURORA.textFaint }}
                      variant="caption"
                    >
                      แนบไว้แล้ว {existingAttachments.length} รูป
                      {canDeleteExisting ? ' · แตะกากบาทเพื่อลบ' : ''}
                    </Text>
                    <ScrollView
                      contentContainerStyle={{ gap: 10, paddingRight: 4 }}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                    >
                      {existingAttachments.map((attachment, index) => (
                        <View
                          key={attachment.id}
                          style={{ paddingRight: 4, paddingTop: 4 }}
                        >
                          {attachment.downloadSupported &&
                          isImageAttachment(attachment) ? (
                            <AttachmentImagePreview
                              attachment={attachment}
                              backgroundColor={AURORA.accentSoft}
                              borderRadius={12}
                              compact
                              height={68}
                              mutedColor={AURORA.textFaint}
                              /* จอนี้ไม่มีตัวดูรูปเต็มจอ — ของที่ต้องทำตรงนี้คือลบ ไม่ใช่ดู */
                              onOpen={() => undefined}
                              origin="request"
                              requestId={sourceId ?? ''}
                              tint={AURORA.accent}
                              type={activeType}
                              width={68}
                            />
                          ) : (
                            <View
                              style={{
                                alignItems: 'center',
                                backgroundColor: AURORA.accentSoft,
                                borderRadius: 12,
                                height: 68,
                                justifyContent: 'center',
                                width: 68,
                              }}
                            >
                              <Ionicons
                                color={AURORA.accent}
                                name="document-outline"
                                size={20}
                              />
                            </View>
                          )}

                          {canDeleteExisting ? (
                            <Pressable
                              accessibilityLabel={`ลบรูปที่แนบไว้ลำดับที่ ${index + 1}`}
                              accessibilityRole="button"
                              disabled={removingAttachmentId !== null}
                              hitSlop={hitSlop}
                              onPress={() => void removeExisting(attachment)}
                              style={{
                                alignItems: 'center',
                                backgroundColor: AURORA.rose,
                                borderColor: '#FFFFFF',
                                borderRadius: 999,
                                borderWidth: 2,
                                height: 24,
                                justifyContent: 'center',
                                position: 'absolute',
                                right: -2,
                                top: -2,
                                width: 24,
                              }}
                            >
                              {removingAttachmentId === attachment.id ? (
                                <ActivityIndicator color="#FFFFFF" size="small" />
                              ) : (
                                <Ionicons
                                  color="#FFFFFF"
                                  name="close"
                                  size={14}
                                />
                              )}
                            </Pressable>
                          ) : null}
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}

                {attachments.length > 0 ? (
                  <View
                    style={{
                      borderTopColor: AURORA.glassBorder,
                      borderTopWidth: 1,
                      gap: 8,
                      paddingTop: 10,
                    }}
                  >
                    <Text style={{ color: AURORA.textFaint }} variant="caption">
                      เพิ่มใหม่รอบนี้ {attachments.length} รูป · รวม{' '}
                      {attachedTotal}/{maxAttachments}
                    </Text>
                    <ScrollView
                      contentContainerStyle={{ gap: 10, paddingRight: 4 }}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                    >
                      {attachments.map((item, index) => (
                        <View key={item.uri} style={{ paddingRight: 4, paddingTop: 4 }}>
                          <Image
                            accessibilityLabel={`รูปหลักฐานลำดับที่ ${index + 1}`}
                            source={{ uri: item.uri }}
                            style={{ borderRadius: 12, height: 68, width: 68 }}
                          />
                          <Pressable
                            accessibilityLabel={`เอารูปหลักฐานลำดับที่ ${index + 1} ออก`}
                            accessibilityRole="button"
                            hitSlop={hitSlop}
                            onPress={() =>
                              setAttachments((current) =>
                                current.filter((_, itemIndex) => itemIndex !== index),
                              )
                            }
                            style={{
                              alignItems: 'center',
                              backgroundColor: AURORA.rose,
                              borderColor: '#FFFFFF',
                              borderRadius: 999,
                              borderWidth: 2,
                              height: 24,
                              justifyContent: 'center',
                              position: 'absolute',
                              right: -2,
                              top: -2,
                              width: 24,
                            }}
                          >
                            <Ionicons color="#FFFFFF" name="close" size={14} />
                          </Pressable>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}
              </PageSection>
            </Reveal>
          ) : null}
        </KeyboardAwareScroll>

        {/* การกระทำหลักอยู่คงที่ ไม่ต้องเลื่อนถึงท้ายฟอร์ม */}
        <SafeAreaView
          edges={['bottom']}
          style={{
            backgroundColor: AURORA.baseDeep,
            borderTopColor: AURORA.glassBorder,
            borderTopWidth: 1,
          }}
        >
          <View
            style={{
            flexDirection: 'row',
            gap: 9,
            paddingBottom: 10,
            paddingHorizontal: gutter,
            paddingTop: 10,
          }}
        >
          <View style={{ flex: 0.9 }}>
            <FormAction
              disabled={isSaving}
              label={editId ? 'บันทึก' : 'บันทึกร่าง'}
              loading={
                (create.isPending || update.isPending) &&
                !submitDraft.isPending
              }
              onPress={() => void save('draft')}
            />
          </View>
          <View style={{ flex: 1.1 }}>
            <FormAction
              disabled={isSaving}
              icon="paper-plane-outline"
              label={editId ? 'บันทึกและส่ง' : 'ส่งอนุมัติ'}
              loading={isSaving}
              onPress={() => void save('submit')}
              primary
            />
          </View>
          </View>
        </SafeAreaView>
      </SafeAreaView>
    </View>
  );
}
