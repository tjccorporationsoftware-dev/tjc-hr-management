import { useFocusEffect, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, Sheet, SkeletonList, Text } from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  PageHero,
  PageSection,
  PressableScale,
  PayslipMotif,
  Reveal,
} from '@/design/aurora';
import { useScreenCaptureGuard } from '@/features/auth/screen-privacy';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import {
  money,
  type PayslipDetail,
  type PayslipLine,
  type PayslipListItem,
} from '@/features/payroll/payslip.types';
import {
  usePayslipDetail,
  usePayslips,
} from '@/features/payroll/use-payslips';
import { ApiError } from '@/lib/api/api-error';
import { useRefetchOnFocus } from '@/lib/query/use-refetch-on-focus';
import { useAppTheme } from '@/theme/use-app-theme';
import { useVisibleStatusBarStyle } from '@/theme/use-status-bar-style';
import { thaiDate } from '@/lib/date/thai-date';

/**
 * จอเงินเดือน — ผิวขาวผืนเดียวชุดเดียวกับจอคำขอและจอลงเวลา
 *
 * ลำดับของจอเดินตามสลิปกระดาษ: งวดที่กำลังดู → รายได้ → รายการหัก → ยอดรับ
 * สุทธิปิดท้าย → รายการสลิป PDF ย้อนหลัง
 */

const periodText = (item: PayslipListItem) =>
  item.paymentDate
    ? `จ่ายเมื่อ ${thaiDate(item.paymentDate, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })}`
    : (item.periodCode ?? '');

/**
 * หนึ่งบรรทัดของรายได้หรือรายการหัก — ป้ายซ้าย ยอดขวา คั่นเส้นบาง
 *
 * ผังเดียวกับ `DataRow` ของจอรายละเอียดคำขอ เพื่อให้ "ตารางค่า" ทั้งแอปอ่าน
 * เหมือนกันหมด ยอดเงินใช้ `tabular-nums` เสมอ ไม่งั้นหลักของแต่ละแถวไม่ตรงกัน
 */
function AmountRow({
  divider,
  label,
  strong = false,
  value,
}: {
  divider: boolean;
  label: string;
  strong?: boolean;
  value: number;
}) {
  return (
    <View
      style={{
        alignItems: 'center',
        borderTopColor: AURORA.glassBorder,
        borderTopWidth: divider ? 1 : 0,
        flexDirection: 'row',
        gap: 14,
        paddingVertical: strong ? 12 : 9,
      }}
    >
      <Text
        maxScale={1.2}
        style={{
          color: strong ? AURORA.text : AURORA.textMuted,
          flex: 1,
          fontSize: strong ? 13.5 : 12.5,
          fontWeight: strong ? '700' : '400',
          lineHeight: 19,
        }}
      >
        {label}
      </Text>
      <Text
        maxScale={1.1}
        numberOfLines={1}
        style={{
          color: AURORA.text,
          fontSize: strong ? 14.5 : 13,
          fontVariant: ['tabular-nums'],
          fontWeight: strong ? '700' : '600',
          lineHeight: 19,
        }}
      >
        {money(value)} บาท
      </Text>
    </View>
  );
}

/** กลุ่มรายได้/รายการหัก พร้อมแถวรวมปิดท้าย */
function AmountGroup({
  accent,
  lines,
  title,
  total,
  totalLabel,
}: {
  accent?: string;
  lines: PayslipLine[];
  title: string;
  total: number;
  totalLabel: string;
}) {
  if (lines.length === 0) return null;

  return (
    <PageSection accent={accent} title={title}>
      <View>
        {lines.map((line, index) => (
          <AmountRow
            divider={index > 0}
            key={`${line.name}-${index}`}
            label={line.name}
            value={line.amount}
          />
        ))}
        <AmountRow divider label={totalLabel} strong value={total} />
      </View>
    </PageSection>
  );
}

/**
 * แถบบอกงวดที่กำลังดู พร้อมปุ่มเปลี่ยนงวด — อยู่บนสุดต่อจากหัวจอ
 *
 * แยกจากยอดสรุปเพราะสองอย่างนี้ตอบคนละคำถาม: อันนี้คือ "กำลังดูงวดไหน"
 * ซึ่งต้องอยู่ก่อนตัวเลขทั้งหมด ส่วนยอดสุทธิคือผลลัพธ์ จึงไปปิดท้ายรายการ
 */
function PeriodBar({
  item,
  onChoosePeriod,
}: {
  item: PayslipListItem;
  onChoosePeriod: () => void;
}) {
  const { gutter } = useResponsive();
  return (
    <View
      style={{
        alignItems: 'center',
        borderBottomColor: AURORA.glassBorder,
        borderBottomWidth: 1,
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: gutter,
        paddingVertical: 12,
      }}
    >
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text style={{ color: AURORA.textMuted, fontSize: 11, lineHeight: 15 }}>
          งวดที่แสดง
        </Text>
        <Text
          maxScale={1.15}
          numberOfLines={1}
          style={{
            color: AURORA.text,
            fontSize: 15,
            fontWeight: '700',
            lineHeight: 21,
          }}
        >
          {item.periodName}
        </Text>
      </View>

      <PressableScale
        accessibilityRole="button"
        onPress={onChoosePeriod}
        style={{
          alignItems: 'center',
          backgroundColor: AURORA.accentSoft,
          borderRadius: 999,
          flexDirection: 'row',
          gap: 6,
          minHeight: 38,
          paddingHorizontal: 13,
        }}
      >
        <Icon color={AURORA.accent} name="calendar" size={15} />
        <Text
          maxScale={1.1}
          style={{
            color: AURORA.accent,
            fontSize: 12,
            fontWeight: '700',
            lineHeight: 16,
          }}
        >
          เลือกงวด
        </Text>
        <Icon color={AURORA.accent} name="chevron-down" size={14} />
      </PressableScale>
    </View>
  );
}

/**
 * ยอดรับสุทธิของงวด — ปิดท้ายรายได้กับรายการหัก
 *
 * วางไว้ล่างสุดของตัวเลขเหมือนสลิปกระดาษ: ไล่รายได้ ลบรายการหัก แล้วจึงได้
 * ยอดที่เข้าบัญชี — ตัวเลขที่เป็นผลลัพธ์ของบรรทัดข้างบนไม่ควรมาก่อนบรรทัด
 * ที่มันสรุป เต็มความกว้างจอเพื่อให้อ่านเป็น "บรรทัดสุดท้าย" ไม่ใช่อีกหมวดหนึ่ง
 */
function NetSummaryBand({
  detail,
  item,
}: {
  detail?: PayslipDetail;
  item: PayslipListItem;
}) {
  const { gutter } = useResponsive();
  const allocationTotal = Math.max(item.netPay + item.totalDeductions, 0);
  const netPercent =
    allocationTotal > 0 ? Math.round((item.netPay / allocationTotal) * 100) : 0;
  const deductionPercent = allocationTotal > 0 ? 100 - netPercent : 0;

  return (
    <View
      style={{
        backgroundColor: AURORA.accentSoft,
        borderBottomColor: AURORA.glassBorder,
        borderBottomWidth: 1,
        borderTopColor: AURORA.glassBorder,
        borderTopWidth: 1,
        gap: 14,
        marginHorizontal: -18,
        paddingBottom: 18,
        paddingHorizontal: gutter,
        paddingTop: 16,
      }}
    >
      <View style={{ gap: 2 }}>
        <Text style={{ color: AURORA.textMuted, fontSize: 11, lineHeight: 15 }}>
          รับสุทธิ
        </Text>
        <Text
          maxScale={1.15}
          numberOfLines={1}
          style={{
            color: AURORA.accent,
            fontSize: 30,
            fontVariant: ['tabular-nums'],
            fontWeight: '800',
            letterSpacing: -0.6,
            lineHeight: 38,
          }}
        >
          {money(item.netPay)} บาท
        </Text>
        {detail?.employeeName ? (
          <Text
            maxScale={1.15}
            numberOfLines={1}
            style={{ color: AURORA.textFaint, fontSize: 11, lineHeight: 16 }}
          >
            {detail.employeeName}
            {detail.employeeCode ? ` · ${detail.employeeCode}` : ''}
          </Text>
        ) : null}
      </View>

      {allocationTotal > 0 ? (
        <View style={{ gap: 8 }}>
          <View
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.75)',
              borderRadius: 999,
              flexDirection: 'row',
              height: 9,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                backgroundColor: AURORA.accent,
                flex: Math.max(item.netPay, 0),
              }}
            />
            <View
              style={{
                backgroundColor: AURORA.textFaint,
                flex: Math.max(item.totalDeductions, 0),
              }}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 16 }}>
            <LegendItem
              color={AURORA.accent}
              label="รับสุทธิ"
              percent={netPercent}
              value={item.netPay}
            />
            <LegendItem
              color={AURORA.textFaint}
              label="รายการหัก"
              percent={deductionPercent}
              value={item.totalDeductions}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** ขาหนึ่งของแถบสัดส่วน — จุดสี ป้าย เปอร์เซ็นต์ และยอด */
function LegendItem({
  color,
  label,
  percent,
  value,
}: {
  color: string;
  label: string;
  percent: number;
  value: number;
}) {
  return (
    <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 6 }}>
        <View
          style={{
            backgroundColor: color,
            borderRadius: 999,
            height: 7,
            width: 7,
          }}
        />
        <Text
          maxScale={1.1}
          numberOfLines={1}
          style={{
            color: AURORA.textMuted,
            flex: 1,
            fontSize: 11,
            lineHeight: 15,
          }}
        >
          {label} {percent}%
        </Text>
      </View>
      <Text
        maxScale={1.1}
        numberOfLines={1}
        style={{
          color: AURORA.text,
          fontSize: 12.5,
          fontVariant: ['tabular-nums'],
          fontWeight: '700',
          lineHeight: 17,
        }}
      >
        {money(value)} บาท
      </Text>
    </View>
  );
}

/** หนึ่งงวดในรายการสลิป PDF */
function SlipRow({
  divider,
  item,
}: {
  divider: boolean;
  item: PayslipListItem;
}) {
  const router = useRouter();

  return (
    <PressableScale
      accessibilityLabel={`ดูตัวอย่างสลิป PDF ${item.periodName}`}
      accessibilityRole="button"
      onPress={() =>
        router.push({
          params: { id: item.id, periodName: item.periodName },
          pathname: '/payslip/[id]',
        })
      }
      style={{
        alignItems: 'center',
        borderTopColor: AURORA.glassBorder,
        borderTopWidth: divider ? 1 : 0,
        flexDirection: 'row',
        gap: 12,
        paddingVertical: 12,
      }}
    >
      <View
        style={{
          alignItems: 'center',
          backgroundColor: `${AURORA.accent}1a`,
          borderRadius: 14,
          height: 42,
          justifyContent: 'center',
          width: 42,
        }}
      >
        <Icon color={AURORA.accent} name="file-text" size={19} />
      </View>

      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text
          maxScale={1.15}
          numberOfLines={1}
          style={{
            color: AURORA.text,
            fontSize: 14,
            fontWeight: '700',
            lineHeight: 19,
          }}
        >
          {item.periodName}
        </Text>
        <Text
          maxScale={1.15}
          numberOfLines={1}
          style={{
            color: AURORA.textMuted,
            fontSize: 11,
            fontVariant: ['tabular-nums'],
            lineHeight: 16,
          }}
        >
          {periodText(item)}
        </Text>
      </View>

      <Text
        maxScale={1.1}
        numberOfLines={1}
        style={{
          color: AURORA.text,
          fontSize: 13,
          fontVariant: ['tabular-nums'],
          fontWeight: '700',
          lineHeight: 18,
        }}
      >
        {money(item.netPay)} บาท
      </Text>

      <Icon color={AURORA.textFaint} name="chevron-right" size={17} />
    </PressableScale>
  );
}

/** ข้อความสถานะกลางจอ — โหลด/ว่าง/ผิดพลาด ใช้หน้าตาเดียวกันหมด */
function StateBlock({
  action,
  icon,
  message,
  title,
  tone = AURORA.accent,
}: {
  action?: { label: string; onPress: () => void };
  icon: 'alert-circle' | 'lock' | 'file-text';
  message: string;
  title: string;
  tone?: string;
}) {
  return (
    <View style={{ alignItems: 'center', gap: 7, paddingVertical: 26 }}>
      <View
        style={{
          alignItems: 'center',
          backgroundColor: `${tone}1a`,
          borderRadius: 999,
          height: 52,
          justifyContent: 'center',
          marginBottom: 4,
          width: 52,
        }}
      >
        <Icon color={tone} name={icon} size={23} />
      </View>
      <Text style={{ color: AURORA.text }} variant="bodyStrong">
        {title}
      </Text>
      <Text
        style={{ color: AURORA.textMuted, textAlign: 'center' }}
        variant="caption"
      >
        {message}
      </Text>
      {action ? (
        <PressableScale
          onPress={action.onPress}
          style={{ paddingHorizontal: 6, paddingVertical: 6 }}
        >
          <Text
            style={{ color: AURORA.accent, fontWeight: '700' }}
            variant="caption"
          >
            {action.label}
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

/**
 * จอสลิปเงินเดือนของตัวเอง
 *
 * เดิมเป็นไฟล์แท็บโดยตรง ย้ายออกมาเพราะตอนนี้มีสองทางเข้า: แท็บของพนักงาน
 * กับเมนูเพิ่มเติมของผู้บริหาร (ที่ช่องแท็บถูกใช้เป็นจอต้นทุนพนักงานแทน)
 * ทางเข้าที่สองต้องมีปุ่มย้อนกลับ เพราะเป็นจอที่ถูก push ทับขึ้นมา
 */
export function MyPayslipsScreen({ showBack = false }: { showBack?: boolean }) {
  const { gutter } = useResponsive();
  useScreenCaptureGuard();

  const router = useRouter();
  const { resolvedMode } = useAppTheme();
  const [periodSheetOpen, setPeriodSheetOpen] = useState(false);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const bootstrap = useBootstrap();
  const canView = bootstrap.data?.featureFlags.payslip ?? false;
  const payslips = usePayslips(canView);

  useRefetchOnFocus(payslips);

  const slipItems = payslips.data?.items ?? [];
  const selectedSlip =
    slipItems.find((item) => item.id === selectedPeriodId) ??
    slipItems[0] ??
    null;
  const selectedDetail = usePayslipDetail(selectedSlip?.id ?? '');

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

  return (
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 36 }}
          refreshControl={
            Platform.OS === 'web' ? undefined : (
              <RefreshControl
                onRefresh={() => void payslips.refetch()}
                refreshing={payslips.isRefetching}
                tintColor={AURORA.textMuted}
              />
            )
          }
          showsVerticalScrollIndicator={false}
        >
          <Reveal>
            <View>
              <PageHero
                decoration={<PayslipMotif />}
                icon={showBack ? 'arrow-left' : 'credit-card'}
                iconLabel={showBack ? 'ย้อนกลับ' : undefined}
                onIconPress={showBack ? () => router.back() : undefined}
                subtitle="ตรวจสอบสรุปและสลิปเงินเดือนย้อนหลัง"
                title="เงินเดือน"
              />
            </View>
          </Reveal>

          {!canView ? (
            <Reveal delay={60}>
              <View style={{ paddingHorizontal: gutter }}>
                <StateBlock
                  icon="lock"
                  message="ติดต่อฝ่ายบุคคลหากต้องการดูสลิปเงินเดือนของบัญชีนี้"
                  title="ยังไม่เปิดสิทธิ์ดูเงินเดือน"
                />
              </View>
            </Reveal>
          ) : payslips.isPending ? (
            <View style={{ paddingHorizontal: gutter, paddingTop: 24 }}>
              <SkeletonList rows={4} />
            </View>
          ) : payslips.isError ? (
            <Reveal delay={60}>
              <View style={{ paddingHorizontal: gutter }}>
                <StateBlock
                  action={{
                    label: payslips.isRefetching ? 'กำลังโหลด...' : 'ลองใหม่',
                    onPress: () => void payslips.refetch(),
                  }}
                  icon="alert-circle"
                  message={
                    payslips.error instanceof ApiError
                      ? payslips.error.message
                      : 'กรุณาลองใหม่อีกครั้ง'
                  }
                  title="โหลดข้อมูลเงินเดือนไม่สำเร็จ"
                  tone={AURORA.rose}
                />
              </View>
            </Reveal>
          ) : slipItems.length === 0 ? (
            <Reveal delay={60}>
              <View style={{ paddingHorizontal: gutter }}>
                <StateBlock
                  icon="file-text"
                  message="สลิปจะแสดงที่นี่เมื่อฝ่ายบุคคลประกาศงวดเงินเดือนแล้ว"
                  title="ยังไม่มีสลิปเงินเดือน"
                />
              </View>
            </Reveal>
          ) : (
            <>
              {selectedSlip ? (
                <Reveal delay={40}>
                  <PeriodBar
                    item={selectedSlip}
                    onChoosePeriod={() => setPeriodSheetOpen(true)}
                  />
                </Reveal>
              ) : null}

              <View
                style={{ gap: 28, paddingHorizontal: gutter, paddingTop: 24 }}
              >
                {selectedDetail.isPending ? (
                  <SkeletonList rows={4} />
                ) : selectedDetail.isError ? (
                  <StateBlock
                    action={{
                      label: 'ลองใหม่',
                      onPress: () => void selectedDetail.refetch(),
                    }}
                    icon="alert-circle"
                    message={
                      selectedDetail.error instanceof ApiError
                        ? selectedDetail.error.message
                        : 'กรุณาลองใหม่อีกครั้ง'
                    }
                    title="โหลดรายละเอียดของงวดนี้ไม่สำเร็จ"
                    tone={AURORA.rose}
                  />
                ) : selectedDetail.data ? (
                  <>
                    <Reveal delay={80}>
                      <AmountGroup
                        lines={selectedDetail.data.earnings}
                        title="รายได้"
                        total={selectedDetail.data.totalEarnings}
                        totalLabel="รวมรายได้"
                      />
                    </Reveal>
                    <Reveal delay={110}>
                      <AmountGroup
                        accent={AURORA.rose}
                        lines={selectedDetail.data.deductions}
                        title="รายการหัก"
                        total={selectedDetail.data.totalDeductions}
                        totalLabel="รวมหัก"
                      />
                    </Reveal>
                  </>
                ) : null}

                {selectedSlip && selectedDetail.data ? (
                  <Reveal delay={130}>
                    <NetSummaryBand
                      detail={selectedDetail.data}
                      item={selectedSlip}
                    />
                  </Reveal>
                ) : null}

                <Reveal delay={150}>
                  <PageSection
                    title="สลิปเงินเดือน PDF"
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
                          {slipItems.length} งวด
                        </Text>
                      </View>
                    }
                  >
                    <View>
                      {slipItems.map((item, index) => (
                        <SlipRow
                          divider={index > 0}
                          item={item}
                          key={item.id}
                        />
                      ))}
                    </View>
                  </PageSection>
                </Reveal>
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <Sheet
        onClose={() => setPeriodSheetOpen(false)}
        title="เลือกงวดเงินเดือน"
        visible={periodSheetOpen}
      >
        {/* รายการเดียวคั่นเส้นบาง ชุดเดียวกับแผ่นเลือกอื่น ๆ ของแอป */}
        <View style={{ marginHorizontal: -4 }}>
          {slipItems.map((item, index) => {
            const selected = item.id === selectedSlip?.id;

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={item.id}
                onPress={() => {
                  setSelectedPeriodId(item.id);
                  setPeriodSheetOpen(false);
                }}
                style={({ pressed }) => ({
                  alignItems: 'center',
                  backgroundColor: selected
                    ? AURORA.accentSoft
                    : pressed
                      ? 'rgba(37, 99, 235, 0.06)'
                      : 'transparent',
                  borderTopColor: AURORA.glassBorder,
                  borderTopWidth: index === 0 ? 0 : 1,
                  flexDirection: 'row',
                  gap: 10,
                  minHeight: 56,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                })}
              >
                <View
                  style={{
                    backgroundColor: selected ? AURORA.accent : 'transparent',
                    borderRadius: 999,
                    height: 18,
                    width: 3,
                  }}
                />
                <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                  <Text
                    maxScale={1.15}
                    numberOfLines={1}
                    style={{
                      color: selected ? AURORA.accent : AURORA.text,
                      fontSize: 14,
                      fontWeight: '700',
                      lineHeight: 19,
                    }}
                  >
                    {item.periodName}
                  </Text>
                  <Text
                    maxScale={1.15}
                    numberOfLines={1}
                    style={{
                      color: AURORA.textMuted,
                      fontSize: 11.5,
                      fontVariant: ['tabular-nums'],
                      lineHeight: 16,
                    }}
                  >
                    {periodText(item)} · รับสุทธิ {money(item.netPay)} บาท
                  </Text>
                </View>
                <Icon
                  color={selected ? AURORA.accent : AURORA.textFaint}
                  name={selected ? 'check-circle' : 'chevron-right'}
                  size={18}
                />
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </View>
  );
}
