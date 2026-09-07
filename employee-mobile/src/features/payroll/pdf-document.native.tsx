import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentType } from 'react';
import { View } from 'react-native';

import { Text } from '@/design';
import { AURORA } from '@/design/aurora';

import type { PdfDocumentProps } from './pdf-document';

type NativePdfViewProps = {
  autoScale?: boolean;
  contentPadding?: {
    bottom?: number;
    left?: number;
    right?: number;
    top?: number;
  };
  doubleTapToZoom?: boolean;
  fitMode?: 'both' | 'height' | 'width';
  onError?: (event: { message: string }) => void;
  onLoadComplete?: (event: { pageCount: number }) => void;
  onPageChanged?: (event: { pageCount: number; pageIndex: number }) => void;
  pageGap?: number;
  style?: object;
  uri: string;
};

let NativePdfView: ComponentType<NativePdfViewProps> | null = null;

try {
  /*
   * require ตอนใช้งานแทน import บนสุด เพื่อให้ development build รุ่นเก่า
   * แสดงคำแนะนำได้ แทนที่จะ crash ทั้ง route ด้วย Cannot find native module.
   */
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- ต้องจับ native module ที่ยังไม่ถูกฝังใน binary เก่า
  const pdfModule = require('@kishannareshpal/expo-pdf') as {
    PdfView: ComponentType<NativePdfViewProps>;
  };
  NativePdfView = pdfModule.PdfView;
} catch {
  NativePdfView = null;
}

export function PdfDocument({
  onError,
  onLoad,
  onPageChange,
  uri,
}: PdfDocumentProps) {
  if (!NativePdfView) {
    return (
      <View
        style={{
          alignItems: 'center',
          flex: 1,
          gap: 8,
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <View
          style={{
            alignItems: 'center',
            backgroundColor: AURORA.accentSoft,
            borderRadius: 999,
            height: 48,
            justifyContent: 'center',
            width: 48,
          }}
        >
          <Ionicons color={AURORA.accent} name="build-outline" size={23} />
        </View>
        <Text style={{ color: AURORA.text }} variant="bodyStrong">
          ต้องติดตั้ง development build รุ่นใหม่
        </Text>
        <Text
          style={{ color: AURORA.textMuted, textAlign: 'center' }}
          variant="caption"
        >
          แอปที่เปิดอยู่ถูกสร้างก่อนเพิ่มตัวอ่าน PDF กรุณาสร้างและติดตั้งแอปใหม่หนึ่งครั้ง
        </Text>
      </View>
    );
  }

  return (
    <NativePdfView
      autoScale
      contentPadding={{ bottom: 12, left: 8, right: 8, top: 12 }}
      doubleTapToZoom
      fitMode="width"
      onError={({ message }) => onError(message)}
      onLoadComplete={({ pageCount }) => onLoad(pageCount)}
      onPageChanged={({ pageCount, pageIndex }) =>
        onPageChange(pageIndex + 1, pageCount)
      }
      pageGap={12}
      style={{ flex: 1 }}
      uri={uri}
    />
  );
}
