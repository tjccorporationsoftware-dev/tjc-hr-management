import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  View,
  type DimensionValue,
} from 'react-native';

import { Text } from '@/design';
import { PressableScale } from '@/design/aurora';

import { captureException } from '@/lib/monitoring/monitoring';

import {
  cacheApprovalAttachmentPreview,
  cacheRequestAttachmentPreview,
  releaseAttachmentPreview,
} from './attachment';
import type {
  ApprovalType,
  RequestAttachment,
  RequestType,
} from './requests.types';

/**
 * เดาจาก mimeType ก่อน แล้วค่อยดูนามสกุล
 *
 * ไฟล์ที่อัปโหลดจาก build เก่าบางใบไม่มี mimeType ติดมา ถ้าเชื่อ mimeType
 * อย่างเดียวรูปเก่าจะกลายเป็น "ไฟล์แนบ" ที่เปิดดูในแอปไม่ได้
 */
export const isImageAttachment = (attachment: RequestAttachment) => {
  if (attachment.mimeType?.startsWith('image/')) return true;

  const name = attachment.fileName ?? attachment.title ?? '';
  return /\.(?:gif|heic|heif|jpe?g|png|webp)$/i.test(name);
};

/** ใบของตัวเอง กับ ใบที่เข้ามาอนุมัติ — คนละ endpoint คนละการตรวจสิทธิ์ */
export type AttachmentPreviewOrigin = 'approval' | 'request';

type AttachmentImagePreviewProps = {
  attachment: RequestAttachment;
  backgroundColor: string;
  borderRadius: number;
  /** รูปย่อเล็กเกินกว่าจะใส่ข้อความ ตอนพังจึงเหลือแค่ไอคอน */
  compact?: boolean;
  height: DimensionValue;
  /** สีของไอคอนและข้อความตอนโหลดรูปไม่สำเร็จ */
  mutedColor: string;
  onOpen: () => void;
  requestId: string;
  /** เต็มจอต้องเห็นทั้งใบ ใช้ contain ส่วนรูปย่อใช้ cover ให้เต็มกรอบ */
  resizeMode?: 'contain' | 'cover';
  /** สีของตัวหมุนระหว่างโหลด */
  tint: string;
  width?: DimensionValue;
} & (
  | { origin: 'approval'; type: ApprovalType }
  | { origin: 'request'; type: RequestType }
);

/**
 * รูปตัวอย่างของหลักฐานที่แนบมากับใบคำขอ
 *
 * ใช้ทั้งหน้ารายละเอียดใบของตัวเองและกล่องอนุมัติ ต่างกันแค่ endpoint ที่
 * backend ใช้ตรวจสิทธิ์ จึงเลือกด้วย `origin` แทนการมีคอมโพเนนต์คนละตัว
 *
 * โหลดไม่ขึ้นต้องบอกให้เห็น ห้ามซ่อนทิ้ง — ผู้อนุมัติที่เห็นแต่ช่องว่างจะเข้าใจว่า
 * ผู้ยื่นไม่ได้แนบหลักฐานมา ทั้งที่แนบมาแล้วแต่แอปโหลดรูปไม่สำเร็จ
 */
export function AttachmentImagePreview({
  attachment,
  backgroundColor,
  borderRadius,
  compact = false,
  height,
  mutedColor,
  onOpen,
  origin,
  requestId,
  resizeMode = 'cover',
  tint,
  type,
  width = '100%',
}: AttachmentImagePreviewProps) {
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const fileName =
    attachment.fileName ?? attachment.title ?? `attachment-${attachment.id}.jpg`;
  const mimeType = attachment.mimeType;
  const attachmentId = attachment.id;

  useEffect(() => {
    let active = true;
    let loaded: string | null = null;

    const target = { attachmentId, fileName, mimeType, requestId };
    const load =
      origin === 'approval'
        ? cacheApprovalAttachmentPreview({ ...target, type })
        : /* คำร้องเอกสารไม่มีในฟอร์มยื่นคำขอ จึงเป็น RequestType เสมอ */
          cacheRequestAttachmentPreview({
            ...target,
            type: type as RequestType,
          });

    void load
      .then((next) => {
        loaded = next;

        if (!active) {
          releaseAttachmentPreview(next);
          return;
        }

        setFailed(false);
        setUri(next);
      })
      .catch((error: unknown) => {
        captureException(error, {
          attachmentId,
          origin,
          scope: 'requests.attachment.preview',
        });

        if (active) setFailed(true);
      });

    return () => {
      active = false;
      releaseAttachmentPreview(loaded);
    };
  }, [attachmentId, fileName, mimeType, origin, requestId, type]);

  return (
    <PressableScale
      accessibilityLabel={failed ? 'เปิดไฟล์หลักฐาน' : 'เปิดรูปหลักฐาน'}
      accessibilityRole="button"
      onPress={onOpen}
      style={{
        alignItems: 'center',
        backgroundColor,
        borderRadius,
        height,
        justifyContent: 'center',
        overflow: 'hidden',
        width,
      }}
    >
      {uri ? (
        <Image
          accessibilityLabel={
            attachment.title ?? attachment.fileName ?? 'รูปหลักฐาน'
          }
          resizeMode={resizeMode}
          source={{ uri }}
          style={{ height: '100%', width: '100%' }}
        />
      ) : failed ? (
        <View style={{ alignItems: 'center', gap: 6, padding: 12 }}>
          <Ionicons color={mutedColor} name="image-outline" size={22} />
          {compact ? null : (
            <Text
              style={{ color: mutedColor, textAlign: 'center' }}
              variant="caption"
            >
              แสดงรูปตัวอย่างไม่ได้ · แตะเพื่อเปิดไฟล์
            </Text>
          )}
        </View>
      ) : (
        <ActivityIndicator color={tint} size="small" />
      )}
    </PressableScale>
  );
}
