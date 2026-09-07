import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, Sheet, SkeletonList, Text, hitSlop } from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  PageHero,
  PageSection,
  PayrollMotif,
  PressableScale,
  Reveal,
  SectionAction,
} from '@/design/aurora';
import { useScreenCaptureGuard } from '@/features/auth/screen-privacy';
import { useExecutivePayroll } from '@/features/executive/executive-views';
import { ApiError } from '@/lib/api/api-error';

/**
 * ค่าจ้างระดับองค์กร
 *
 * ผิวขาวผืนเดียวชุดเดียวกับจอของพนักงาน (`PageHero` + `PageSection` + `AURORA`)
 *
 * จอนี้ต้องมีสิทธิ์ `PAYROLL_READ` เพิ่มจากการเข้าห้องผู้บริหาร — ถ้าไม่มี
 * backend จะตอบ 403 และจอแสดงข้อความอธิบายแทนตัวเลขศูนย์
 *
 * ไม่มีข้อมูลรายบุคคลในจอนี้แม้แต่ช่องเดียว สิทธิ์ดูภาพรวมค่าจ้างไม่เท่ากับ
 * สิทธิ์ดูเงินเดือนของพนักงานคนใดคนหนึ่ง
 *
 * ## ลำดับของจอ = ลำดับคำถามของผู้บริหาร
 *
 * "งวดที่แล้วจ่ายไปเท่าไร" มาก่อน "ทั้งปีจ่ายไปเท่าไร" เสมอ — รอบก่อนหน้าเอา
 * ยอดสะสมทั้งปีขึ้นก่อนแล้วยัดยอดงวดล่าสุดไว้เป็นตัวเลขย่อในกราฟ ทั้งที่
 * `latest` (งวดล่าสุด) กับ `byBranch`/`byDepartment` (แยกรายหน่วยงาน) ถูกส่ง
 * มาจาก backend อยู่แล้วโดยไม่มีใครแสดง
 */

/** ยอดเงินเต็มจำนวน ไม่มีสตางค์ — งบระดับองค์กรไม่มีใครอ่านทศนิยม */
const baht = (value: number) =>
  Math.round(value).toLocaleString('th-TH');

/** ชื่อเดือนย่อ — โครงกราฟทั้งปีใช้ชุดนี้เป็นหลัก ไม่ได้ใช้เฉพาะเดือนที่มีงวด */
const THAI_MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

/**
 * รายการย่อยของเงินก้อนเดียว พร้อมสัดส่วนเป็นเปอร์เซ็นต์
 *
 * `bar` เปิดได้แค่ **หมวดเดียวต่อจอ** — ทั้งจอนี้คือเงินก้อนเดียวถูกซอยหลายชั้น
 * (ต้นทุนงวด → องค์ประกอบรายได้ → รายการหัก → รายหน่วยงาน) ถ้าทุกหมวดมีแท่ง
 * ของตัวเอง จอจะกลายเป็นหลอดเรียงกันสิบกว่าหลอดที่ไม่มีอันไหนเด่น และตัวเลข
 * ซึ่งเป็นของจริงที่ผู้บริหารต้องอ่านก็ถูกกลบไปด้วย
 *
 * เปอร์เซ็นต์ท้ายบรรทัดบอกสัดส่วนได้เท่ากับแท่ง โดยไม่กินความสูงเพิ่มสักพิกเซล
 */
function SplitBar({
  bar = false,
  color,
  rows,
}: {
  bar?: boolean;
  color: string;
  rows: { amount: number; label: string }[];
}) {
  const total = rows.reduce((sum, row) => sum + Math.max(row.amount, 0), 0);
  const visible = rows.filter((row) => row.amount > 0);

  if (total <= 0) return null;

  return (
    <View style={{ gap: 10 }}>
      {bar ? (
        <View
          style={{
            backgroundColor: `${color}1f`,
            borderRadius: 999,
            flexDirection: 'row',
            gap: 2,
            height: 9,
            overflow: 'hidden',
          }}
        >
          {visible.map((row, index) => (
            <View
              key={row.label}
              style={{
                backgroundColor: color,
                flexGrow: row.amount,
                opacity: 1 - index * 0.22,
              }}
            />
          ))}
        </View>
      ) : null}

      <View>
        {visible.map((row, index) => (
          <View
            key={row.label}
            style={{
              alignItems: 'center',
              borderTopColor: AURORA.glassBorder,
              borderTopWidth: index > 0 ? 1 : 0,
              flexDirection: 'row',
              gap: 10,
              paddingVertical: 8,
            }}
          >
            {/* จุดสีมีไว้ผูกบรรทัดเข้ากับชิ้นในแท่ง — หมวดที่ไม่มีแท่งก็ไม่ต้องมีจุด */}
            {bar ? (
              <View
                style={{
                  backgroundColor: color,
                  borderRadius: 999,
                  height: 8,
                  opacity: 1 - index * 0.22,
                  width: 8,
                }}
              />
            ) : null}
            <Text
              numberOfLines={1}
              style={{
                color: AURORA.text,
                flex: 1,
                fontSize: 12.5,
                lineHeight: 18,
              }}
            >
              {row.label}
            </Text>
            <Text
              maxScale={1.1}
              style={{
                color: AURORA.text,
                fontSize: 12.5,
                fontVariant: ['tabular-nums'],
                fontWeight: '700',
                lineHeight: 18,
              }}
            >
              {`${baht(row.amount)} บาท`}
            </Text>
            <Text
              maxScale={1.1}
              style={{
                color: AURORA.textFaint,
                fontSize: 11,
                fontVariant: ['tabular-nums'],
                lineHeight: 16,
                minWidth: 32,
                textAlign: 'right',
              }}
            >
              {`${Math.round((row.amount / total) * 100)}%`}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * แถวของหนึ่งหน่วยงาน — ตัวเลขกับสัดส่วน ไม่มีแท่งประจำแถว
 *
 * เดิมทุกแถวมีแท่งของตัวเอง สิบหน่วยงานก็สิบแท่ง ซ้อนกับแท่งของหมวดอื่นอีก
 * สามหมวด — สัดส่วนอ่านจากเปอร์เซ็นต์ท้ายบรรทัดได้เท่ากัน และแถวเตี้ยลงเกือบครึ่ง
 */
function UnitRows({
  units,
}: {
  units: { id?: string | null; label: string; netPay: number; people: number }[];
}) {
  const total = units.reduce((sum, unit) => sum + unit.netPay, 0);

  return (
    <View>
      {units.map((unit, index) => (
        <View
          key={unit.id ?? unit.label}
          style={{
            alignItems: 'center',
            borderTopColor: AURORA.glassBorder,
            borderTopWidth: index > 0 ? 1 : 0,
            flexDirection: 'row',
            gap: 10,
            paddingVertical: 9,
          }}
        >
          <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{ color: AURORA.text, fontSize: 12.5, lineHeight: 18 }}
            >
              {unit.label}
            </Text>
            <Text
              style={{
                color: AURORA.textFaint,
                fontSize: 10.5,
                fontVariant: ['tabular-nums'],
                lineHeight: 15,
              }}
            >
              {`${unit.people} คน`}
            </Text>
          </View>

          <Text
            maxScale={1.1}
            style={{
              color: AURORA.text,
              fontSize: 12.5,
              fontVariant: ['tabular-nums'],
              fontWeight: '700',
              lineHeight: 18,
            }}
          >
            {`${baht(unit.netPay)} บาท`}
          </Text>

          <Text
            maxScale={1.1}
            style={{
              color: AURORA.textFaint,
              fontSize: 11,
              fontVariant: ['tabular-nums'],
              lineHeight: 16,
              minWidth: 32,
              textAlign: 'right',
            }}
          >
            {`${total > 0 ? Math.round((unit.netPay / total) * 100) : 0}%`}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * แท่งยอดจ่ายรายเดือน — **กางสิบสองเดือนเสมอ**
 *
 * `months` จาก backend มีเฉพาะเดือนที่ปิดงวดแล้ว ปีที่เพิ่งเริ่มใช้ระบบจึงได้
 * แท่งเดียวลอยอยู่กลางที่ว่าง ซึ่งอ่านไม่ออกว่าเป็นแนวโน้มอะไร โครงทั้งปีทำให้
 * เห็นว่าอีกกี่เดือนยังรออยู่ — เดือนที่ยังไม่ถึงรอบจ่ายวาดเป็นขีดฐานจาง ๆ
 * (กติกาเดียวกับกราฟค่าจ้างบนหน้าแรกของห้องผู้บริหาร)
 */
function MonthColumns({
  months,
}: {
  months: { employees: number; label: string; netPay: number }[];
}) {
  const slots = THAI_MONTHS.map((name) => {
    const row = months.find((month) => month.label.startsWith(name));

    return {
      employees: row?.employees ?? 0,
      hasRun: Boolean(row && row.netPay > 0),
      label: name,
      netPay: row?.netPay ?? 0,
    };
  });

  const peak = slots.reduce((max, slot) => Math.max(max, slot.netPay), 0);
  const latestIndex = slots.reduce(
    (found, slot, index) => (slot.hasRun ? index : found),
    -1,
  );

  return (
    <View style={{ gap: 6 }}>
      <View
        style={{
          alignItems: 'flex-end',
          flexDirection: 'row',
          gap: 3,
          height: 76,
        }}
      >
        {slots.map((slot, index) => (
          <View
            key={slot.label}
            style={{
              backgroundColor:
                index === latestIndex ? AURORA.accent : AURORA.accentSoft,
              borderRadius: 4,
              flex: 1,
              /* แท่งค่าศูนย์ยังต้องเห็นเป็นขีดบาง ๆ ไม่ใช่หายไปทั้งแท่ง */
              height: Math.max(peak > 0 ? (slot.netPay / peak) * 76 : 0, 3),
            }}
          />
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 3 }}>
        {slots.map((slot, index) => (
          <Text
            key={slot.label}
            maxScale={1}
            numberOfLines={1}
            style={{
              color: index === latestIndex ? AURORA.text : AURORA.textFaint,
              flex: 1,
              fontSize: 9,
              fontWeight: index === latestIndex ? '700' : '400',
              letterSpacing: -0.4,
              textAlign: 'center',
            }}
          >
            {slot.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** สถานะว่าง/ไม่มีสิทธิ์/ผิดพลาด — หน้าตาเดียวกับจอผู้บริหารจออื่น */
function Notice({
  color,
  description,
  icon,
  onRetry,
  retryLabel,
  title,
}: {
  color: string;
  description: string;
  icon: 'lock' | 'alert-circle' | 'credit-card';
  onRetry?: () => void;
  retryLabel?: string;
  title: string;
}) {
  const { gutter } = useResponsive();
  return (
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
          backgroundColor: `${color}1a`,
          borderRadius: 999,
          height: 52,
          justifyContent: 'center',
          marginBottom: 4,
          width: 52,
        }}
      >
        <Icon color={color} name={icon} size={23} />
      </View>
      <Text style={{ color: AURORA.text }} variant="bodyStrong">
        {title}
      </Text>
      <Text
        style={{ color: AURORA.textMuted, textAlign: 'center' }}
        variant="caption"
      >
        {description}
      </Text>
      {onRetry ? (
        <SectionAction label={retryLabel ?? 'ลองใหม่'} onPress={onRetry} />
      ) : null}
    </View>
  );
}

export default function ExecutivePayrollScreen() {
  const { gutter } = useResponsive();
  /*
   * จอนี้มีข้อมูลการเงิน/ข้อมูลส่วนบุคคล — ปิดการถ่ายภาพหน้าจอไว้ตลอดที่อยู่
   * บนจอ (ทำได้จริงบน Android ส่วน iOS ระบบไม่อนุญาตให้บล็อก)
   * ส่วนการบังภาพตอนสลับแอปมี PrivacyOverlay คุมให้ทั้งแอปอยู่แล้ว
   */
  useScreenCaptureGuard();

  const router = useRouter();
  const [year, setYear] = useState<number | undefined>();
  const [yearOpen, setYearOpen] = useState(false);

  const payroll = useExecutivePayroll(year);
  const data = payroll.data;
  const forbidden =
    payroll.error instanceof ApiError && payroll.error.status === 403;

  const latest = data?.latest ?? null;

  return (
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            Platform.OS === 'web' ? undefined : (
              <RefreshControl
                onRefresh={() => void payroll.refetch()}
                refreshing={payroll.isRefetching}
                tintColor={AURORA.textMuted}
              />
            )
          }
          showsVerticalScrollIndicator={false}
        >
          <Reveal>
            <PageHero
              decoration={<PayrollMotif />}
              icon="arrow-left"
              iconLabel="ย้อนกลับ"
              onIconPress={() => router.back()}
              right={
                /* ปีอยู่บนหัวจอ ไม่ใช่ช่องเลือกในเนื้อหา — เป็นตัวคุมทั้งจอ
                   ทุกตัวเลขข้างล่างเปลี่ยนตามมันหมด */
                data && data.availableYears.length > 1 ? (
                  <PressableScale
                    accessibilityLabel="เลือกปี"
                    accessibilityRole="button"
                    hitSlop={hitSlop}
                    onPress={() => setYearOpen(true)}
                    style={{
                      alignItems: 'center',
                      backgroundColor: AURORA.accentSoft,
                      borderRadius: 999,
                      flexDirection: 'row',
                      gap: 5,
                      height: 34,
                      paddingHorizontal: 12,
                    }}
                  >
                    <Text
                      maxScale={1.1}
                      style={{
                        color: AURORA.accent,
                        fontSize: 12,
                        fontVariant: ['tabular-nums'],
                        fontWeight: '700',
                      }}
                    >
                      {`ปี ${data.year ?? ''}`}
                    </Text>
                    <Icon
                      color={AURORA.accent}
                      name="chevron-down"
                      size={14}
                    />
                  </PressableScale>
                ) : undefined
              }
              subtitle="ยอดจากรอบเงินเดือนที่ปิดแล้ว"
              title="ค่าจ้างองค์กร"
            />
          </Reveal>

          {payroll.isPending ? (
            <View style={{ paddingHorizontal: gutter, paddingTop: 24 }}>
              <SkeletonList rows={5} />
            </View>
          ) : forbidden ? (
            <Notice
              color={AURORA.textMuted}
              description="บัญชีนี้เปิดห้องผู้บริหารได้ แต่ยังไม่มีสิทธิ์ดูข้อมูลค่าจ้าง กรุณาติดต่อผู้ดูแลระบบ"
              icon="lock"
              title="ไม่มีสิทธิ์ดูข้อมูลค่าจ้าง"
            />
          ) : payroll.isError ? (
            <Notice
              color={AURORA.rose}
              description={
                payroll.error instanceof ApiError
                  ? payroll.error.message
                  : 'กรุณาลองใหม่อีกครั้ง'
              }
              icon="alert-circle"
              onRetry={() => void payroll.refetch()}
              retryLabel={payroll.isRefetching ? 'กำลังโหลด...' : 'ลองใหม่'}
              title="ยังโหลดข้อมูลค่าจ้างไม่ได้"
            />
          ) : data && data.months.length === 0 ? (
            <Notice
              color={AURORA.accent}
              description="ปีนี้ยังไม่มีรอบเงินเดือนที่ประมวลผลแล้ว"
              icon="credit-card"
              title="ยังไม่มีข้อมูล"
            />
          ) : data ? (
            <>
              {/*
                งวดล่าสุดเป็นตัวเลขพระเอก ไม่ใช่ยอดสะสมทั้งปี — คำถามแรกของ
                ผู้บริหารคือ "งวดที่แล้วจ่ายไปเท่าไร" ส่วนยอดทั้งปีเป็นบริบท
                ที่อยู่ในแถวรองได้
              */}
              <Reveal delay={40}>
                <View
                  style={{ gap: 14, paddingHorizontal: gutter, paddingTop: 22 }}
                >
                  {/*
                    ยอดงวดล่าสุดวางบนพื้นขาวเปล่า ไม่ใช่ในแถบสีเต็มความกว้าง
                    — แถบสีดึงสายตาแรงกว่าตัวเลขที่อยู่ในแถบเอง และทำให้จอ
                    ถูกแบ่งเป็นสองโซนตั้งแต่บรรทัดแรก (กติกา "หนึ่งจอ หนึ่งผิว")
                  */}
                  <View style={{ gap: 2 }}>
                    <Text
                      maxScale={1.15}
                      style={{
                        color: AURORA.textMuted,
                        fontSize: 11.5,
                        lineHeight: 16,
                      }}
                    >
                      {latest?.label
                        ? `จ่ายสุทธิงวด${latest.label}`
                        : 'จ่ายสุทธิงวดล่าสุด'}
                    </Text>

                    <View
                      style={{
                        alignItems: 'flex-end',
                        flexDirection: 'row',
                        gap: 6,
                      }}
                    >
                      <Text
                        maxScale={1.05}
                        style={{
                          color: AURORA.accent,
                          fontSize: 34,
                          fontVariant: ['tabular-nums'],
                          fontWeight: '800',
                          letterSpacing: -1,
                          lineHeight: 43,
                        }}
                      >
                        {baht(latest?.netPay ?? 0)}
                      </Text>
                      <Text
                        style={{
                          color: AURORA.textMuted,
                          fontSize: 12.5,
                          paddingBottom: 7,
                        }}
                      >
                        บาท
                      </Text>
                    </View>

                    <Text
                      style={{
                        color: AURORA.textMuted,
                        fontSize: 11.5,
                        lineHeight: 16,
                      }}
                    >
                      {`พนักงาน ${latest?.employees ?? 0} คน · ทั้งปีจ่ายไปแล้ว ${data.totals.runCount} รอบ`}
                    </Text>
                  </View>

                  {/*
                    ยอดสะสมทั้งปีเป็นการ์ดฟ้าจางแยกออกมา และเรียงเป็น "บรรทัด"
                    ไม่ใช่สามคอลัมน์ — คอลัมน์บังคับให้ย่อเลขเป็น 218K/6K ซึ่ง
                    ผู้บริหารเอาไปใช้ต่อไม่ได้ พอเป็นบรรทัดก็ใส่ตัวเต็มได้ทั้งหมด
                  */}
                  <View
                    style={{
                      backgroundColor: AURORA.accentSoft,
                      borderRadius: 18,
                      gap: 2,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                    }}
                  >
                    <Text
                      maxScale={1.15}
                      style={{
                        color: AURORA.textMuted,
                        fontSize: 10.5,
                        lineHeight: 15,
                        paddingBottom: 2,
                      }}
                    >
                      {`ยอดสะสมทั้งปี ${data.year ?? ''}`}
                    </Text>

                    {[
                      { label: 'จ่ายสุทธิ', value: data.totals.netPay },
                      { label: 'เงินเดือนพื้นฐาน', value: data.totals.baseSalary },
                      { label: 'รายได้อื่น', value: data.totals.otherEarnings },
                      {
                        label: 'ต้นทุนนายจ้าง (สมทบ ปกส.)',
                        value: data.totals.employerCost,
                      },
                    ].map((row, index) => (
                      <View
                        key={row.label}
                        style={{
                          alignItems: 'center',
                          borderTopColor: 'rgba(29, 78, 216, 0.12)',
                          borderTopWidth: index > 0 ? 1 : 0,
                          flexDirection: 'row',
                          gap: 12,
                          paddingVertical: 7,
                        }}
                      >
                        <Text
                          numberOfLines={1}
                          style={{
                            color: AURORA.textMuted,
                            flex: 1,
                            fontSize: 12,
                            lineHeight: 17,
                          }}
                        >
                          {row.label}
                        </Text>
                        <Text
                          maxScale={1.1}
                          style={{
                            color: index === 0 ? AURORA.accent : AURORA.text,
                            fontSize: 13,
                            fontVariant: ['tabular-nums'],
                            fontWeight: index === 0 ? '800' : '700',
                            lineHeight: 18,
                          }}
                        >
                          {`${baht(row.value)} บาท`}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              </Reveal>

              <View style={{ gap: 28, paddingHorizontal: gutter, paddingTop: 24 }}>
                {latest ? (
                  <Reveal delay={70}>
                    <PageSection title="โครงสร้างต้นทุนงวดล่าสุด">
                      <View style={{ paddingTop: 2 }}>
                        <SplitBar
                          bar
                          color={AURORA.accent}
                          rows={[
                            {
                              amount: latest.baseSalary,
                              label: 'เงินเดือนพื้นฐาน',
                            },
                            { amount: latest.otherEarnings, label: 'รายได้อื่น' },
                            {
                              amount: latest.employerCost,
                              label: 'ต้นทุนนายจ้าง (สมทบ ปกส.)',
                            },
                          ]}
                        />
                      </View>
                    </PageSection>
                  </Reveal>
                ) : null}

                <Reveal delay={100}>
                  <PageSection
                    title="ยอดจ่ายรายเดือน"
                    trailing={
                      <Text
                        style={{
                          color: AURORA.textFaint,
                          fontSize: 11.5,
                          fontVariant: ['tabular-nums'],
                          lineHeight: 16,
                        }}
                      >
                        {`${data.months.length}/12 งวด`}
                      </Text>
                    }
                  >
                    <View style={{ paddingTop: 4 }}>
                      <MonthColumns months={data.months} />
                    </View>
                  </PageSection>
                </Reveal>

                {data.composition.earnings.length > 0 ? (
                  <Reveal delay={130}>
                    <PageSection title="องค์ประกอบรายได้ (งวดล่าสุด)">
                      <View style={{ paddingTop: 2 }}>
                        <SplitBar
                          color={AURORA.accent}
                          rows={data.composition.earnings}
                        />
                      </View>
                    </PageSection>
                  </Reveal>
                ) : null}

                {data.composition.deductions.length > 0 ? (
                  <Reveal delay={160}>
                    <PageSection
                      accent={AURORA.rose}
                      title="องค์ประกอบรายการหัก (งวดล่าสุด)"
                    >
                      <View style={{ paddingTop: 2 }}>
                        <SplitBar
                          color={AURORA.rose}
                          rows={data.composition.deductions}
                        />
                      </View>
                    </PageSection>
                  </Reveal>
                ) : null}

                {data.byBranch.length > 0 ? (
                  <Reveal delay={190}>
                    <PageSection title="แยกตามบริษัทในเครือ (งวดล่าสุด)">
                      <View style={{ paddingTop: 2 }}>
                        <UnitRows units={data.byBranch} />
                      </View>
                    </PageSection>
                  </Reveal>
                ) : null}

                {data.byDepartment.length > 0 ? (
                  <Reveal delay={220}>
                    <PageSection title="แยกตามแผนก (งวดล่าสุด)">
                      <View style={{ paddingTop: 2 }}>
                        <UnitRows units={data.byDepartment} />
                      </View>
                    </PageSection>
                  </Reveal>
                ) : null}

                {/*
                  ตารางรายเดือนแบบอ่านได้ — กราฟด้านบนบอกรูปทรง แต่ผู้บริหารที่ใช้
                  โปรแกรมอ่านหน้าจอหรือจะจดตัวเลขไปประชุมต้องอ่านค่าจริงได้ด้วย

                  แต่ละงวดมีสามชั้น: เม็ดเดือน · ยอดจ่ายสุทธิกับจำนวนคน ·
                  แล้วบรรทัดแจกแจงว่ายอดนั้นมาจากไหน — `baseSalary`
                  `otherEarnings` `deductions` ถูกส่งมาจาก backend รายเดือน
                  อยู่แล้ว แต่เดิมจอนี้ทิ้งไปหมดแล้วโชว์แค่ยอดสุทธิบรรทัดเดียว
                */}
                <Reveal delay={250}>
                  <PageSection
                    title="ตัวเลขรายเดือน"
                    trailing={
                      <Text
                        style={{
                          color: AURORA.textFaint,
                          fontSize: 11.5,
                          fontVariant: ['tabular-nums'],
                          lineHeight: 16,
                        }}
                      >
                        {`${data.months.length} งวด`}
                      </Text>
                    }
                  >
                    <View>
                      {data.months.map((month, index) => {
                        const isLatest = month.label === latest?.label;

                        return (
                          <View
                            key={month.label}
                            style={{
                              alignItems: 'center',
                              borderTopColor: AURORA.glassBorder,
                              borderTopWidth: index > 0 ? 1 : 0,
                              flexDirection: 'row',
                              gap: 12,
                              paddingVertical: 11,
                            }}
                          >
                            {/* ชื่อเดือนเป็นตัวหนังสือเปล่า ไม่ใช่เม็ดพื้นทึบ —
                                งวดล่าสุดบอกด้วยสีกับน้ำหนักตัวอักษรก็พอ */}
                            <Text
                              maxScale={1.1}
                              numberOfLines={1}
                              style={{
                                color: isLatest ? AURORA.accent : AURORA.textMuted,
                                fontSize: 12.5,
                                fontWeight: isLatest ? '800' : '600',
                                lineHeight: 18,
                                width: 40,
                              }}
                            >
                              {month.label}
                            </Text>

                            <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
                              <View
                                style={{
                                  alignItems: 'center',
                                  flexDirection: 'row',
                                  gap: 10,
                                }}
                              >
                                <Text
                                  maxScale={1.1}
                                  numberOfLines={1}
                                  style={{
                                    color: AURORA.text,
                                    flex: 1,
                                    fontSize: 14,
                                    fontVariant: ['tabular-nums'],
                                    fontWeight: '800',
                                    lineHeight: 19,
                                  }}
                                >
                                  {`${baht(month.netPay)} บาท`}
                                </Text>
                                <Text
                                  maxScale={1.1}
                                  style={{
                                    color: AURORA.textMuted,
                                    fontSize: 11,
                                    fontVariant: ['tabular-nums'],
                                    lineHeight: 16,
                                  }}
                                >
                                  {`${month.employees} คน`}
                                </Text>
                              </View>

                              {/* แจกแจงที่มาของยอด — หักขึ้นสีแดงเฉพาะตอนมีจริง */}
                              <View
                                style={{
                                  flexDirection: 'row',
                                  flexWrap: 'wrap',
                                  gap: 10,
                                }}
                              >
                                <Text
                                  style={{
                                    color: AURORA.textFaint,
                                    fontSize: 10.5,
                                    fontVariant: ['tabular-nums'],
                                    lineHeight: 15,
                                  }}
                                >
                                  {`พื้นฐาน ${baht(month.baseSalary)}`}
                                </Text>
                                {month.otherEarnings > 0 ? (
                                  <Text
                                    style={{
                                      color: AURORA.textFaint,
                                      fontSize: 10.5,
                                      fontVariant: ['tabular-nums'],
                                      lineHeight: 15,
                                    }}
                                  >
                                    {`รายได้อื่น ${baht(month.otherEarnings)}`}
                                  </Text>
                                ) : null}
                                {month.deductions > 0 ? (
                                  <Text
                                    style={{
                                      color: AURORA.rose,
                                      fontSize: 10.5,
                                      fontVariant: ['tabular-nums'],
                                      lineHeight: 15,
                                    }}
                                  >
                                    {`หัก ${baht(month.deductions)}`}
                                  </Text>
                                ) : null}
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </PageSection>
                </Reveal>
              </View>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>

      {/* ปีที่เลือกได้มาจาก backend ตามงวดที่มีจริง ไม่ใช่ไล่ปีปฏิทินให้เลือกลม ๆ */}
      <Sheet
        onClose={() => setYearOpen(false)}
        title="เลือกปี"
        visible={yearOpen}
      >
        <View style={{ paddingBottom: 8 }}>
          {(data?.availableYears ?? []).map((item, index) => {
            const active = item === data?.year;

            return (
              <PressableScale
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                key={item}
                onPress={() => {
                  setYear(item);
                  setYearOpen(false);
                }}
                style={{
                  alignItems: 'center',
                  borderTopColor: AURORA.glassBorder,
                  borderTopWidth: index > 0 ? 1 : 0,
                  flexDirection: 'row',
                  gap: 12,
                  paddingVertical: 13,
                }}
              >
                <Text
                  style={{
                    color: active ? AURORA.accent : AURORA.text,
                    flex: 1,
                    fontSize: 14,
                    fontVariant: ['tabular-nums'],
                    fontWeight: active ? '800' : '600',
                  }}
                >
                  {`ปี ${item}`}
                </Text>
                {active ? (
                  <Icon color={AURORA.accent} name="check" size={18} />
                ) : null}
              </PressableScale>
            );
          })}
        </View>
      </Sheet>
    </View>
  );
}
