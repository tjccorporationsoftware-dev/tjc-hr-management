import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  InlineNotice,
  Screen,
  Sheet,
  SkeletonList,
  Text,
  useToast,
  type ToneName,
} from '@/design';
import {
  prepareDocumentAttachment,
  shareDocumentFile,
  uploadDocumentAttachment,
  type AttachmentSource,
} from '@/features/documents/document-attachment';
import { deleteDocumentFile } from '@/features/documents/documents.api';
import {
  DOCUMENT_STATUS_LABEL,
  type DocumentFile,
} from '@/features/documents/documents.types';
import {
  useCancelDocument,
  useDeleteDocument,
  useDocumentDetail,
  useSubmitDocument,
} from '@/features/documents/use-documents';
import { ApiError } from '@/lib/api/api-error';
import { useAppTheme } from '@/theme/use-app-theme';
import { thaiDate } from '@/lib/date/thai-date';

const STATUS_TONE: Record<string, ToneName> = {
  APPROVED: 'success',
  CANCELLED: 'neutral',
  DRAFT: 'neutral',
  REJECTED: 'danger',
  SUBMITTED: 'warning',
};

const dateTimeText = (value?: Date | null) =>
  value
    ? thaiDate(value, {
        day: 'numeric',
        month: 'short',
        time: 'short',
        year: 'numeric',
      })
    : '-';

const sizeText = (value?: number | null) => {
  if (!value) return null;
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'ใช่' : 'ไม่ใช่';
  return String(value);
}

const FIELD_LABEL: Record<string, string> = {
  assetReturnNote: 'การคืนทรัพย์สิน',
  country: 'ประเทศ',
  effectiveDate: 'วันที่มีผลลาออก',
  embassyName: 'สถานทูต',
  handoverNote: 'การส่งมอบงาน',
  issueTo: 'เรียน / ใช้ยื่นต่อ',
  language: 'ภาษา',
  reason: 'เหตุผล',
  salaryDisplayMode: 'ข้อมูลรายได้ที่แสดง',
  travelDateFrom: 'วันเดินทางตั้งแต่',
  travelDateTo: 'ถึงวันที่',
};

export default function DocumentDetailScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id ?? '');
  const detail = useDocumentDetail(id);
  const submit = useSubmitDocument();
  const cancel = useCancelDocument();
  const remove = useDeleteDocument();
  const [confirmAction, setConfirmAction] = useState<'cancel' | 'delete' | 'submit' | null>(null);
  const [attachmentSheet, setAttachmentSheet] = useState(false);
  const [workingFileId, setWorkingFileId] = useState<string | null>(null);

  async function runAction() {
    try {
      if (confirmAction === 'submit') {
        await submit.mutateAsync(id);
        toast.success('ส่งคำร้องเพื่ออนุมัติแล้ว');
        await detail.refetch();
      } else if (confirmAction === 'cancel') {
        await cancel.mutateAsync({ id });
        toast.success('ยกเลิกคำร้องแล้ว');
        await detail.refetch();
      } else if (confirmAction === 'delete') {
        await remove.mutateAsync(id);
        toast.success('ลบฉบับร่างแล้ว');
        router.back();
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'ดำเนินการไม่สำเร็จ');
    } finally {
      setConfirmAction(null);
    }
  }

  async function addAttachment(source: AttachmentSource) {
    setAttachmentSheet(false);
    try {
      const prepared = await prepareDocumentAttachment(source);
      if (!prepared) return;
      await uploadDocumentAttachment({
        name: prepared.name,
        requestId: id,
        title: 'เอกสารประกอบคำร้อง',
        uri: prepared.uri,
      });
      toast.success('แนบไฟล์เรียบร้อย');
      await detail.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'แนบไฟล์ไม่สำเร็จ');
    }
  }

  async function openFile(file: DocumentFile) {
    setWorkingFileId(file.id);
    try {
      await shareDocumentFile({
        fileId: file.id,
        fileName: file.fileName ?? file.title,
        mimeType: file.mimeType,
        requestId: id,
      });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'เปิดไฟล์ไม่สำเร็จ');
    } finally {
      setWorkingFileId(null);
    }
  }

  async function removeFile(file: DocumentFile) {
    setWorkingFileId(file.id);
    try {
      await deleteDocumentFile(id, file.id);
      toast.success('ลบไฟล์แนบแล้ว');
      await detail.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'ลบไฟล์ไม่สำเร็จ');
    } finally {
      setWorkingFileId(null);
    }
  }

  const item = detail.data;
  const canAttach = item?.status === 'DRAFT' || item?.status === 'SUBMITTED';

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.lg }}>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
          <Pressable
            accessibilityLabel="ย้อนกลับ"
            accessibilityRole="button"
            onPress={() => router.back()}
            style={{
              alignItems: 'center',
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              height: 44,
              justifyContent: 'center',
              width: 44,
            }}
          >
            <Ionicons color={theme.colors.text} name="chevron-back" size={22} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text tone="muted" variant="caption">คำร้องเอกสาร</Text>
            <Text numberOfLines={1} variant="h2">{item?.documentType.nameTh ?? 'รายละเอียดคำร้อง'}</Text>
          </View>
        </View>

        {detail.isPending ? (
          <SkeletonList rows={5} />
        ) : detail.isError ? (
          <ErrorState
            description={detail.error instanceof ApiError ? detail.error.message : undefined}
            onRetry={() => void detail.refetch()}
            title="ยังดูรายละเอียดไม่ได้"
          />
        ) : item ? (
          <>
            {item.returnedForReview ? (
              <InlineNotice
                message="คำร้องถูกส่งกลับให้ตรวจสอบหรือแก้ไข คุณสามารถแก้ไขแล้วส่งใหม่ได้"
                tone="warning"
              />
            ) : null}

            <Card
              action={
                <Badge
                  label={item.returnedForReview ? 'ส่งกลับให้แก้ไข' : DOCUMENT_STATUS_LABEL[item.status]}
                  tone={item.returnedForReview ? 'warning' : STATUS_TONE[item.status]}
                />
              }
              title="สถานะ"
            >
              <View style={{ gap: theme.spacing.xs }}>
                <Text tone="muted" variant="caption">เลขที่คำขอ: {item.requestNo ?? '-'}</Text>
                {item.documentNo ? <Text tone="muted" variant="caption">เลขที่หนังสือ: {item.documentNo}</Text> : null}
                <Text tone="muted" variant="caption">ยื่นเมื่อ: {dateTimeText(item.submittedAt)}</Text>
              </View>
            </Card>

            {item.purpose || item.note ? (
              <Card title="รายละเอียด">
                <View style={{ gap: theme.spacing.xs }}>
                  {item.purpose ? <Text>วัตถุประสงค์: {item.purpose}</Text> : null}
                  {item.note ? <Text>หมายเหตุ: {item.note}</Text> : null}
                  {Object.entries(item.requestData)
                    .filter(([key]) => key !== 'documentKind')
                    .map(([key, value]) => (
                      <Text key={key} tone="muted" variant="caption">
                        {FIELD_LABEL[key] ?? key}: {displayValue(value)}
                      </Text>
                    ))}
                </View>
              </Card>
            ) : null}

            <Card title={`ไฟล์ (${item.files.length})`}>
              <View style={{ gap: theme.spacing.sm }}>
                {item.files.length === 0 ? (
                  <Text tone="muted" variant="caption">ยังไม่มีไฟล์แนบหรือเอกสารที่ออกให้</Text>
                ) : item.files.map((file) => (
                  <View key={file.id} style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
                    <Ionicons color={theme.colors.textMuted} name="attach-outline" size={20} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} variant="caption">{file.title}</Text>
                      <Text numberOfLines={1} tone="subtle" variant="caption">
                        {[file.fileName, sizeText(file.fileSize)].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <Button loading={workingFileId === file.id} onPress={() => void openFile(file)} title="เปิด" variant="secondary" />
                    {canAttach && file.fileType === 'ATTACHMENT' ? (
                      <Button disabled={workingFileId !== null} onPress={() => void removeFile(file)} title="ลบ" variant="danger" />
                    ) : null}
                  </View>
                ))}
                {canAttach ? (
                  <Button icon="attach-outline" onPress={() => setAttachmentSheet(true)} title="แนบรูปเอกสาร" variant="secondary" />
                ) : null}
              </View>
            </Card>

            {item.timeline.length > 0 ? (
              <Card title="ประวัติการดำเนินการ">
                <View style={{ gap: theme.spacing.md }}>
                  {item.timeline.map((step) => (
                    <View key={step.id} style={{ borderLeftColor: theme.colors.border, borderLeftWidth: 2, paddingLeft: theme.spacing.sm }}>
                      <Text variant="bodyStrong">{step.title}</Text>
                      <Text tone="muted" variant="caption">{dateTimeText(step.actedAt)}{step.actorName ? ` · ${step.actorName}` : ''}</Text>
                      {step.reason ? <Text tone="danger" variant="caption">{step.reason}</Text> : null}
                      {step.note ? <Text tone="subtle" variant="caption">{step.note}</Text> : null}
                    </View>
                  ))}
                </View>
              </Card>
            ) : null}

            <View style={{ gap: theme.spacing.xs }}>
              {item.capabilities.canEdit ? (
                <Button
                  icon="create-outline"
                  onPress={() => router.push({ pathname: '/document-new', params: { id } })}
                  title="แก้ไขคำร้อง"
                  variant="secondary"
                />
              ) : null}
              {item.capabilities.canSubmit ? (
                <Button onPress={() => setConfirmAction('submit')} title="ส่งเพื่อขออนุมัติ" />
              ) : null}
              {item.capabilities.canCancel ? (
                <Button onPress={() => setConfirmAction('cancel')} title="ยกเลิกคำร้อง" variant="secondary" />
              ) : null}
              {item.capabilities.canDelete ? (
                <Button onPress={() => setConfirmAction('delete')} title="ลบฉบับร่าง" variant="danger" />
              ) : null}
            </View>
          </>
        ) : null}
      </View>

      <Sheet onClose={() => setAttachmentSheet(false)} title="แนบรูปเอกสาร" visible={attachmentSheet}>
        <View style={{ gap: theme.spacing.sm }}>
          <Button icon="camera-outline" onPress={() => void addAttachment('camera')} title="ถ่ายรูป" />
          <Button icon="images-outline" onPress={() => void addAttachment('library')} title="เลือกจากคลังรูป" variant="secondary" />
        </View>
      </Sheet>

      <ConfirmDialog
        destructive={confirmAction === 'cancel' || confirmAction === 'delete'}
        loading={submit.isPending || cancel.isPending || remove.isPending}
        message={
          confirmAction === 'delete'
            ? 'ฉบับร่างนี้จะถูกลบและไม่แสดงในรายการอีก'
            : confirmAction === 'cancel'
              ? 'คำร้องนี้จะถูกยกเลิกและไม่สามารถส่งต่อได้'
              : 'ส่งคำร้องเข้าสู่ workflow อนุมัติหรือไม่'
        }
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => void runAction()}
        title={confirmAction === 'delete' ? 'ลบฉบับร่าง?' : confirmAction === 'cancel' ? 'ยกเลิกคำร้อง?' : 'ส่งคำร้อง?'}
        visible={confirmAction !== null}
      />
    </Screen>
  );
}
