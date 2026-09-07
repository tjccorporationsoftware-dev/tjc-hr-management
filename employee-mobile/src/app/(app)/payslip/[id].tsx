import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { Icon, Text, useToast } from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  PageHero,
  PayslipMotif,
  PressableScale,
} from '@/design/aurora';
import { useScreenCaptureGuard } from '@/features/auth/screen-privacy';
import { PdfDocument } from '@/features/payroll/pdf-document';
import {
  loadPayslipPdfPreview,
  type PayslipPdfPreview,
} from '@/features/payroll/payslip.api';
import {
  usePayslipDetail,
  useSharePayslip,
} from '@/features/payroll/use-payslips';
import { ApiError } from '@/lib/api/api-error';
import { useAppTheme } from '@/theme/use-app-theme';
import { useVisibleStatusBarStyle } from '@/theme/use-status-bar-style';

export default function PayslipPreviewScreen() {
  const { gutter } = useResponsive();
  useScreenCaptureGuard();

  const router = useRouter();
  const toast = useToast();
  const { resolvedMode } = useAppTheme();
  const params = useLocalSearchParams<{ id: string; periodName?: string }>();
  const id = String(params.id ?? '');
  const passedPeriodName = String(params.periodName ?? '');
  const insets = useSafeAreaInsets();
  const detail = usePayslipDetail(id);
  const share = useSharePayslip();
  const [preview, setPreview] = useState<PayslipPdfPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);

  const periodName =
    detail.data?.periodName || passedPeriodName || 'สลิปเงินเดือน';
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

  useEffect(() => {
    let cancelled = false;
    let resource: PayslipPdfPreview | null = null;

    void loadPayslipPdfPreview(id)
      .then((loaded) => {
        resource = loaded;
        if (cancelled) {
          loaded.dispose();
          return;
        }
        setPreview(loaded);
      })
      .catch((error) => {
        if (cancelled) return;
        setPreviewError(
          error instanceof ApiError
            ? error.message
            : 'โหลดตัวอย่างสลิป PDF ไม่สำเร็จ',
        );
      });

    return () => {
      cancelled = true;
      resource?.dispose();
    };
  }, [id, retryKey]);

  async function handleShare() {
    try {
      await share.mutateAsync({ id, periodName });
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : 'บันทึกสลิป PDF ไม่สำเร็จ',
      );
    }
  }

  return (
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        {/*
          หัวจอชุดเดียวกับทุกจอ วงไอคอนขาวเป็นปุ่มย้อนกลับ ส่วนเลขหน้าเป็นป้าย
          ท้ายบรรทัด — เดิมเป็นตัวหนังสือเทาลอย ๆ ที่อ่านไม่ออกว่าเป็นของอะไร
        */}
        <View>
          <PageHero
            decoration={<PayslipMotif />}
            icon="arrow-left"
            iconLabel="ย้อนกลับ"
            onIconPress={() => router.back()}
            right={
              pageCount > 0 ? (
                <View
                  style={{
                    backgroundColor: AURORA.accentSoft,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  }}
                >
                  <Text
                    maxScale={1.1}
                    style={{
                      color: AURORA.accent,
                      fontSize: 11,
                      fontVariant: ['tabular-nums'],
                      fontWeight: '700',
                      lineHeight: 15,
                    }}
                  >
                    {page}/{pageCount}
                  </Text>
                </View>
              ) : null
            }
            subtitle="ตัวอย่างสลิป PDF"
            title={periodName}
          />
        </View>

        {/*
          พื้นที่เอกสารกินเต็มจอ ไม่มีการ์ดมนครอบอีกชั้น — กระดาษของสลิปเป็น
          สี่เหลี่ยมอยู่แล้ว กรอบมนที่ครอบไว้ทำให้มุมกระดาษโดนกินและเหลือที่
          ให้เนื้อเอกสารน้อยลงโดยไม่ได้อะไรกลับมา
        */}
        <View style={{ backgroundColor: '#e6ebf3', flex: 1 }}>
          {previewError ? (
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
                  backgroundColor: `${AURORA.rose}1a`,
                  borderRadius: 999,
                  height: 52,
                  justifyContent: 'center',
                  marginBottom: 2,
                  width: 52,
                }}
              >
                <Icon color={AURORA.rose} name="alert-circle" size={23} />
              </View>
              <Text style={{ color: AURORA.text }} variant="bodyStrong">
                ยังเปิดตัวอย่าง PDF ไม่ได้
              </Text>
              <Text
                style={{ color: AURORA.textMuted, textAlign: 'center' }}
                variant="caption"
              >
                {previewError}
              </Text>
              <PressableScale
                onPress={() => {
                  setPreview(null);
                  setPreviewError(null);
                  setPage(1);
                  setPageCount(0);
                  setRetryKey((current) => current + 1);
                }}
                style={{ paddingHorizontal: 12, paddingVertical: 7 }}
              >
                <Text
                  style={{ color: AURORA.accent, fontWeight: '700' }}
                  variant="caption"
                >
                  ลองใหม่
                </Text>
              </PressableScale>
            </View>
          ) : preview ? (
            <PdfDocument
              onError={(message) => setPreviewError(message)}
              onLoad={(count) => setPageCount(count)}
              onPageChange={(nextPage, count) => {
                setPage(nextPage);
                setPageCount(count);
              }}
              uri={preview.uri}
            />
          ) : (
            <View
              style={{
                alignItems: 'center',
                flex: 1,
                gap: 10,
                justifyContent: 'center',
              }}
            >
              <ActivityIndicator color={AURORA.accent} size="large" />
              <Text style={{ color: AURORA.textMuted }} variant="caption">
                กำลังเปิดตัวอย่าง PDF...
              </Text>
            </View>
          )}
        </View>
      </SafeAreaView>

      {/*
        แถบปุ่มติดขอบล่าง — เว้นระยะปลอดภัยด้วย `insets.bottom` เอง ไม่ใช้
        `edges` ของ SafeAreaView เพราะจอนี้มี SafeAreaView อีกใบครอบเนื้อหา
        อยู่แล้ว ตัวที่สองจึงได้ inset เป็นศูนย์ แล้วปุ่มไปนั่งทับแถบโฮมของเครื่อง
      */}
      <View
        style={{
          backgroundColor: AURORA.baseDeep,
          borderTopColor: AURORA.glassBorder,
          borderTopWidth: 1,
          paddingBottom: Math.max(insets.bottom, 14),
        }}
      >
        <View style={{ paddingHorizontal: gutter, paddingTop: 12 }}>
          <PressableScale
            accessibilityRole="button"
            disabled={share.isPending}
            onPress={() => void handleShare()}
            style={{
              alignItems: 'center',
              backgroundColor: AURORA.accent,
              borderRadius: 16,
              elevation: 3,
              flexDirection: 'row',
              gap: 8,
              justifyContent: 'center',
              minHeight: 52,
              opacity: share.isPending ? 0.65 : 1,
              paddingHorizontal: 16,
              shadowColor: AURORA.accent,
              shadowOffset: { height: 4, width: 0 },
              shadowOpacity: 0.22,
              shadowRadius: 9,
            }}
          >
            {share.isPending ? (
              <ActivityIndicator color={AURORA.baseDeep} size="small" />
            ) : (
              <Icon color={AURORA.baseDeep} name="download" size={18} />
            )}
            <Text
              maxScale={1.15}
              style={{
                color: AURORA.baseDeep,
                fontSize: 14,
                fontWeight: '700',
                lineHeight: 19,
              }}
            >
              {share.isPending ? 'กำลังเตรียมไฟล์...' : 'บันทึกหรือส่งต่อ PDF'}
            </Text>
          </PressableScale>
        </View>
      </View>
    </View>
  );
}
