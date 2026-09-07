import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Button,
  Icon,
  Select,
  Sheet,
  SkeletonList,
  Text,
  useToast,
} from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  PageHero,
  PageSection,
  ReportMotif,
  Reveal,
  SectionAction,
} from '@/design/aurora';
import {
  useCreateReport,
  useReportCatalog,
  useReportJobs,
  type ReportCatalogItem,
} from '@/features/executive/executive-views';
import { shareExecutiveReport } from '@/features/executive/report-file';
import { ApiError } from '@/lib/api/api-error';
import { thaiDate } from '@/lib/date/thai-date';

/**
 * รายงานผู้บริหาร
 *
 * ผิวขาวผืนเดียวชุดเดียวกับจอของพนักงาน (`PageHero` + `PageSection` + `AURORA`)
 *
 * บนเว็บการขอรายงานมีสองขั้น (สร้างงาน แล้วกดประมวลผล) เพราะผู้ใช้ตั้งค่าไว้
 * ก่อนแล้วสั่งทีหลังได้ บนมือถือรวมเป็นปุ่มเดียว — ผู้บริหารกด "ขอรายงาน"
 * แล้วต้องการไฟล์ ไม่ได้ต้องการงานที่ค้างอยู่ในคิว
 *
 * ไฟล์ที่ได้เปิดผ่านแผ่นแชร์ของระบบ ไม่เปิดในแอป เพราะรูปแบบไฟล์มีทั้ง Excel
 * CSV และ PDF — ให้ผู้ใช้เลือกแอปที่เขาใช้อ่านจริงดีกว่าฝืนแสดงในตัวเรา
 */

/** สีของสถานะงานรายงาน — เขียวคือได้ไฟล์แล้ว แดงคือต้องสั่งใหม่ */
const STATUS_COLOR: Record<string, string> = {
  CANCELLED: AURORA.textFaint,
  COMPLETED: AURORA.emerald,
  FAILED: AURORA.rose,
  PENDING: AURORA.amber,
  PROCESSING: AURORA.amber,
};

const STATUS_LABEL: Record<string, string> = {
  CANCELLED: 'ยกเลิกแล้ว',
  COMPLETED: 'เสร็จแล้ว',
  FAILED: 'ไม่สำเร็จ',
  PENDING: 'รอประมวลผล',
  PROCESSING: 'กำลังสร้าง',
};

const FORMAT_LABEL: Record<string, string> = {
  CSV: 'CSV',
  JSON: 'JSON',
  PDF: 'PDF',
  XLSX: 'Excel',
};

const dateTimeText = (value: Date | null | undefined) =>
  value
    ? thaiDate(value, {
        day: 'numeric',
        month: 'short',
        time: 'short',
      })
    : '—';

export default function ExecutiveReportsScreen() {
  const { gutter } = useResponsive();
  const router = useRouter();
  const toast = useToast();

  const catalog = useReportCatalog();
  const jobs = useReportJobs();
  const create = useCreateReport();

  const [selected, setSelected] = useState<ReportCatalogItem | null>(null);
  const [format, setFormat] = useState('XLSX');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const forbidden =
    catalog.error instanceof ApiError && catalog.error.status === 403;

  async function requestReport() {
    if (!selected) return;

    try {
      const result = await create.mutateAsync({
        format,
        reportCode: selected.code,
      });

      setSelected(null);

      if (result.exportFileId) {
        toast.success('สร้างรายงานเสร็จแล้ว กดที่รายการเพื่อเปิดไฟล์');
      } else {
        toast.warn('สั่งสร้างรายงานแล้ว กำลังประมวลผล');
      }
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'ขอรายงานไม่สำเร็จ',
      );
    }
  }

  async function openReport(exportFileId: string, fileName: string) {
    setDownloadingId(exportFileId);

    try {
      await shareExecutiveReport(exportFileId, fileName);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'เปิดไฟล์รายงานไม่สำเร็จ',
      );
    } finally {
      setDownloadingId(null);
    }
  }

  const jobItems = jobs.data?.items ?? [];

  return (
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            Platform.OS === 'web' ? undefined : (
              <RefreshControl
                onRefresh={() => {
                  void catalog.refetch();
                  void jobs.refetch();
                }}
                refreshing={catalog.isRefetching || jobs.isRefetching}
                tintColor={AURORA.textMuted}
              />
            )
          }
          showsVerticalScrollIndicator={false}
        >
          <Reveal>
            <PageHero
              decoration={<ReportMotif />}
              icon="arrow-left"
              iconLabel="ย้อนกลับ"
              onIconPress={() => router.back()}
              subtitle="ขอไฟล์รายงานและติดตามสถานะ"
              title="รายงาน"
            />
          </Reveal>

          {catalog.isPending ? (
            <View style={{ paddingHorizontal: gutter, paddingTop: 24 }}>
              <SkeletonList rows={5} />
            </View>
          ) : forbidden ? (
            <View
              style={{
                alignItems: 'center',
                gap: 7,
                paddingHorizontal: gutter,
                paddingVertical: 30,
              }}
            >
              <View
                style={{
                  alignItems: 'center',
                  backgroundColor: 'rgba(148, 163, 184, 0.16)',
                  borderRadius: 999,
                  height: 52,
                  justifyContent: 'center',
                  marginBottom: 4,
                  width: 52,
                }}
              >
                <Icon color={AURORA.textMuted} name="lock" size={23} />
              </View>
              <Text style={{ color: AURORA.text }} variant="bodyStrong">
                ไม่มีสิทธิ์ดูรายงาน
              </Text>
              <Text
                style={{ color: AURORA.textMuted, textAlign: 'center' }}
                variant="caption"
              >
                บัญชีนี้ยังไม่มีสิทธิ์ดูรายงาน กรุณาติดต่อผู้ดูแลระบบ
              </Text>
            </View>
          ) : catalog.isError ? (
            <View
              style={{
                alignItems: 'center',
                gap: 7,
                paddingHorizontal: gutter,
                paddingVertical: 30,
              }}
            >
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
                ยังโหลดรายการรายงานไม่ได้
              </Text>
              <Text
                style={{ color: AURORA.textMuted, textAlign: 'center' }}
                variant="caption"
              >
                {catalog.error instanceof ApiError
                  ? catalog.error.message
                  : 'กรุณาลองใหม่อีกครั้ง'}
              </Text>
              <SectionAction
                label={catalog.isRefetching ? 'กำลังโหลด...' : 'ลองใหม่'}
                onPress={() => void catalog.refetch()}
              />
            </View>
          ) : catalog.data ? (
            <View style={{ gap: 28, paddingHorizontal: gutter, paddingTop: 24 }}>
              <Reveal delay={40}>
                <PageSection title="เลือกรายงาน">
                  <View>
                    {catalog.data.items.map((item, index) => (
                      <Pressable
                        accessibilityRole="button"
                        key={item.code}
                        onPress={() => {
                          setSelected(item);
                          setFormat(item.supportedFormats[0] ?? 'CSV');
                        }}
                        style={({ pressed }) => ({
                          alignItems: 'center',
                          backgroundColor: pressed
                            ? 'rgba(37, 99, 235, 0.06)'
                            : 'transparent',
                          borderTopColor: AURORA.glassBorder,
                          borderTopWidth: index > 0 ? 1 : 0,
                          flexDirection: 'row',
                          gap: 11,
                          marginHorizontal: -4,
                          paddingHorizontal: 4,
                          paddingVertical: 11,
                        })}
                      >
                        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                          <Text
                            numberOfLines={1}
                            style={{
                              color: AURORA.text,
                              fontSize: 13.5,
                              fontWeight: '700',
                              lineHeight: 19,
                            }}
                          >
                            {item.name}
                          </Text>
                          {item.description ? (
                            <Text
                              style={{
                                color: AURORA.textMuted,
                                fontSize: 11,
                                lineHeight: 16,
                              }}
                            >
                              {item.description}
                            </Text>
                          ) : null}
                        </View>

                        <Icon
                          color={AURORA.textFaint}
                          name="chevron-right"
                          size={17}
                        />
                      </Pressable>
                    ))}
                  </View>
                </PageSection>
              </Reveal>

              <Reveal delay={80}>
                <PageSection title="รายงานที่ขอไว้">
                  {jobs.isPending ? (
                    <SkeletonList rows={3} />
                  ) : jobItems.length === 0 ? (
                    <Text
                      style={{
                        color: AURORA.textMuted,
                        fontSize: 12.5,
                        lineHeight: 18,
                        paddingVertical: 10,
                      }}
                    >
                      ยังไม่เคยขอรายงานจากแอปนี้
                    </Text>
                  ) : (
                    <View>
                      {jobItems.map((job, index) => {
                        const statusColor =
                          STATUS_COLOR[job.status] ?? AURORA.textFaint;
                        const downloading = downloadingId === job.exportFileId;

                        return (
                          <Pressable
                            accessibilityRole="button"
                            disabled={!job.exportFileId}
                            key={job.id}
                            onPress={() =>
                              job.exportFileId
                                ? void openReport(
                                    job.exportFileId,
                                    job.name ?? 'report',
                                  )
                                : undefined
                            }
                            style={({ pressed }) => ({
                              backgroundColor:
                                pressed && job.exportFileId
                                  ? 'rgba(37, 99, 235, 0.06)'
                                  : 'transparent',
                              borderTopColor: AURORA.glassBorder,
                              borderTopWidth: index > 0 ? 1 : 0,
                              gap: 3,
                              marginHorizontal: -4,
                              paddingHorizontal: 4,
                              paddingVertical: 11,
                            })}
                          >
                            <View
                              style={{
                                alignItems: 'center',
                                flexDirection: 'row',
                                gap: 10,
                              }}
                            >
                              <Text
                                numberOfLines={1}
                                style={{
                                  color: AURORA.text,
                                  flex: 1,
                                  fontSize: 13.5,
                                  fontWeight: '700',
                                  lineHeight: 19,
                                }}
                              >
                                {job.name ?? job.reportCode}
                              </Text>

                              {/* ป้ายสถานะ = จุดกลม + ข้อความสีเดียวกัน */}
                              <View
                                style={{
                                  alignItems: 'center',
                                  flexDirection: 'row',
                                  gap: 6,
                                }}
                              >
                                <View
                                  style={{
                                    backgroundColor: downloading
                                      ? AURORA.accent
                                      : statusColor,
                                    borderRadius: 999,
                                    height: 5,
                                    width: 5,
                                  }}
                                />
                                <Text
                                  maxScale={1.1}
                                  numberOfLines={1}
                                  style={{
                                    color: downloading
                                      ? AURORA.accent
                                      : statusColor,
                                    fontSize: 10.5,
                                    fontWeight: '700',
                                    lineHeight: 14,
                                  }}
                                >
                                  {downloading
                                    ? 'กำลังเปิด...'
                                    : (STATUS_LABEL[job.status] ?? job.status)}
                                </Text>
                              </View>
                            </View>

                            <Text
                              style={{
                                color: job.errorMessage
                                  ? AURORA.rose
                                  : AURORA.textMuted,
                                fontSize: 11,
                                lineHeight: 16,
                              }}
                            >
                              {job.errorMessage ??
                                `ขอเมื่อ ${dateTimeText(job.createdAt)}`}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </PageSection>
              </Reveal>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>

      <Sheet
        onClose={() => setSelected(null)}
        title={selected?.name ?? 'ขอรายงาน'}
        visible={Boolean(selected)}
      >
        <View style={{ gap: 14 }}>
          {selected?.description ? (
            <Text
              style={{
                color: AURORA.textMuted,
                fontSize: 12.5,
                lineHeight: 18,
              }}
            >
              {selected.description}
            </Text>
          ) : null}

          <Select
            appearance="aurora"
            label="รูปแบบไฟล์"
            onChange={setFormat}
            options={(selected?.supportedFormats ?? []).map((value) => ({
              label: FORMAT_LABEL[value] ?? value,
              value,
            }))}
            value={format}
          />

          <Text
            style={{ color: AURORA.textFaint, fontSize: 11.5, lineHeight: 17 }}
          >
            รายงานใช้ช่วงเวลามาตรฐานของระบบ หากต้องการกำหนดช่วงเองให้ใช้หน้าเว็บ
          </Text>

          <Button
            loading={create.isPending}
            onPress={() => void requestReport()}
            title="ขอรายงาน"
          />
        </View>
      </Sheet>
    </View>
  );
}
