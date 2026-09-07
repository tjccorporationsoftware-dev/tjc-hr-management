import { useRouter } from 'expo-router';
import { Platform, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, SkeletonList, Text } from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  InsightsMotif,
  PageHero,
  PageSection,
  Reveal,
  SectionAction,
} from '@/design/aurora';
import { ColumnChart } from '@/design/chart';
import { useExecutiveInsights } from '@/features/executive/executive-views';
import { ApiError } from '@/lib/api/api-error';
import { formatNumber } from '@/lib/format/number';

/**
 * ตัวชี้วัดเชิงบริหาร
 *
 * ผิวขาวผืนเดียวชุดเดียวกับจอของพนักงาน — เดิมจอนี้ใช้ `<Screen>` กับ `<Card>`
 * และสีจากธีม ซึ่งเป็นผิวรุ่นก่อนหน้าของแอป สลับจากแท็บพนักงานมาแล้วเหมือน
 * คนละแอป ตอนนี้ใช้ `PageHero` + `PageSection` + สีจาก `AURORA` เหมือนกันหมด
 *
 * ทุกตัวเลขจับคู่กับเดือนก่อนหน้าเสมอ — "อัตราขาดงาน 2.1%" ไม่บอกอะไรเลย
 * ถ้าไม่รู้ว่าเดือนก่อน 1.2% หรือ 4.5% ผู้บริหารต้องตัดสินใจได้จากการมอง
 * ครั้งเดียว ไม่ใช่ต้องจำเลขเดือนก่อนมาเอง
 *
 * หมวดต้นทุนถูกซ่อนทั้งหมวดเมื่อผู้ใช้ไม่มีสิทธิ์ดูเงินเดือน (backend ส่ง
 * `costVisible: false` มาให้) — ไม่ใช่โชว์ศูนย์ ซึ่งอ่านผิดได้ว่าไม่มีค่าใช้จ่าย
 */

const baht = (value: number) =>
  value.toLocaleString('th-TH', { maximumFractionDigits: 0 });

/**
 * ตัวจัดรูปของแต่ละหน่วย — ส่งเข้า `MetricRow` เพื่อให้ค่าปัจจุบัน ค่าเดือนก่อน
 * และส่วนต่าง ใช้รูปแบบเดียวกันเสมอ
 *
 * ทศนิยมของอัตราเก็บไว้หนึ่งตำแหน่ง (0.9% ไม่ใช่ 1%) เพราะการขยับระดับ
 * จุดทศนิยมของอัตราลาออกคือเรื่องที่ต้องเห็น ส่วนยอดเงินกับจำนวนคนปัดเต็มหน่วย
 */
const fmt = {
  days: (value: number) => `${value.toFixed(1)} วัน`,
  minutes: (value: number) => `${value.toFixed(1)} น.`,
  money: (value: number) => `${baht(value)} บาท`,
  people: (value: number) => `${baht(value)} คน`,
  percent: (value: number) => `${value.toFixed(1)}%`,
  hours: (value: number) => `${value.toFixed(1)} ชม.`,
};

/** ตัวเลขเด่นสามช่องในหมวด — ค่าเดียวกับ `StatCell` ของจอประวัติลงเวลา */
function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text
        maxScale={1.15}
        numberOfLines={1}
        style={{ color: AURORA.textFaint, fontSize: 10.5, lineHeight: 14 }}
      >
        {label}
      </Text>
      <Text
        maxScale={1.15}
        numberOfLines={1}
        style={{
          color: AURORA.text,
          fontSize: 16,
          fontVariant: ['tabular-nums'],
          fontWeight: '800',
          lineHeight: 21,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * หนึ่งตัวชี้วัด — ป้ายซ้าย ค่าขวา และบรรทัดเทียบเดือนก่อนใต้ป้าย
 *
 * น้อยลง = ดีขึ้น สำหรับฝั่งวินัยและการลาออก ส่วนคนเข้าใหม่กลับด้าน
 * สีเขียว/แดงจึงมาจาก "ดีขึ้นไหม" ไม่ใช่ "เพิ่มหรือลด"
 *
 * ตัวเลขทุกตัวผ่าน `format` ตัวเดียวกันทั้งค่าปัจจุบันและส่วนต่าง — เดิมส่วนต่าง
 * พิมพ์ `Math.abs(diff)` ดิบ ๆ ยอดเงินจึงโผล่มาเป็น "16778.02" ขณะที่ค่าจริง
 * ข้างบนเป็น "10,109 บาท" คนละรูปแบบกันคนละบรรทัด
 */
function MetricRow({
  current,
  divider,
  format,
  label,
  lowerIsBetter = true,
  previous,
}: {
  current: number;
  divider: boolean;
  /** แปลงตัวเลขเป็นข้อความ ใช้ร่วมกันทั้งค่าปัจจุบันและส่วนต่าง */
  format: (value: number) => string;
  label: string;
  lowerIsBetter?: boolean;
  previous: number;
}) {
  const diff = Number((current - previous).toFixed(2));
  const better = lowerIsBetter ? diff < 0 : diff > 0;

  return (
    <View
      style={{
        alignItems: 'center',
        borderTopColor: AURORA.glassBorder,
        borderTopWidth: divider ? 1 : 0,
        flexDirection: 'row',
        gap: 14,
        paddingVertical: 10,
      }}
    >
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text
          maxScale={1.2}
          style={{ color: AURORA.text, fontSize: 12.5, lineHeight: 18 }}
        >
          {label}
        </Text>
        <Text
          maxScale={1.1}
          numberOfLines={1}
          style={{
            color:
              diff === 0
                ? AURORA.textFaint
                : better
                  ? AURORA.emerald
                  : AURORA.rose,
            fontSize: 11,
            fontVariant: ['tabular-nums'],
            lineHeight: 15,
          }}
        >
          {diff === 0
            ? 'เท่าเดือนก่อน'
            : `${diff > 0 ? '▲' : '▼'} ${format(Math.abs(diff))} จากเดือนก่อน`}
        </Text>
      </View>
      <Text
        maxScale={1.1}
        numberOfLines={1}
        style={{
          color: AURORA.text,
          fontSize: 14,
          fontVariant: ['tabular-nums'],
          fontWeight: '700',
          lineHeight: 19,
        }}
      >
        {format(current)}
      </Text>
    </View>
  );
}

export default function ExecutiveInsightsScreen() {
  const { gutter } = useResponsive();
  const router = useRouter();
  const insights = useExecutiveInsights();
  const data = insights.data;

  return (
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            Platform.OS === 'web' ? undefined : (
              <RefreshControl
                onRefresh={() => void insights.refetch()}
                refreshing={insights.isRefetching}
                tintColor={AURORA.textMuted}
              />
            )
          }
          showsVerticalScrollIndicator={false}
        >
          <Reveal>
            <PageHero
              decoration={<InsightsMotif />}
              icon="arrow-left"
              iconLabel="ย้อนกลับ"
              onIconPress={() => router.back()}
              subtitle={data?.periodLabel ?? 'เทียบกับเดือนก่อนหน้า'}
              title="ตัวชี้วัดบริหาร"
            />
          </Reveal>

          {insights.isPending ? (
            <View style={{ paddingHorizontal: gutter, paddingTop: 24 }}>
              <SkeletonList rows={6} />
            </View>
          ) : insights.isError ? (
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
                ยังโหลดตัวชี้วัดไม่ได้
              </Text>
              <Text
                style={{ color: AURORA.textMuted, textAlign: 'center' }}
                variant="caption"
              >
                {insights.error instanceof ApiError
                  ? insights.error.message
                  : 'กรุณาลองใหม่อีกครั้ง'}
              </Text>
              <SectionAction
                label={insights.isRefetching ? 'กำลังโหลด...' : 'ลองใหม่'}
                onPress={() => void insights.refetch()}
              />
            </View>
          ) : data ? (
            <View style={{ gap: 28, paddingHorizontal: gutter, paddingTop: 24 }}>
              <Reveal delay={60}>
                <PageSection title="กำลังคนและการรักษาคน">
                  <View style={{ gap: 14 }}>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <StatCell
                        label="พนักงานทั้งหมด"
                        value={String(data.workforce.headcount)}
                      />
                      <StatCell
                        label="อายุงานเฉลี่ย"
                        value={`${data.workforce.avgTenureMonths} ด.`}
                      />
                      <StatCell
                        label="ผ่านทดลองงาน"
                        value={`${formatNumber(data.workforce.probationPassRate)}%`}
                      />
                    </View>

                    <View>
                      <MetricRow
                        current={data.workforce.turnoverRate}
                        divider={false}
                        format={fmt.percent}
                        label="อัตราลาออก"
                        previous={data.workforce.turnoverRatePrev}
                      />
                      <MetricRow
                        current={data.workforce.resigned}
                        divider
                        format={fmt.people}
                        label="คนที่ลาออก"
                        previous={data.workforce.resignedPrev}
                      />
                      <MetricRow
                        current={data.workforce.hired}
                        divider
                        format={fmt.people}
                        label="คนเข้าใหม่"
                        lowerIsBetter={false}
                        previous={data.workforce.hiredPrev}
                      />
                    </View>
                  </View>
                </PageSection>
              </Reveal>

              <Reveal delay={90}>
                <PageSection title="วินัยการทำงาน">
                  <View>
                    <MetricRow
                      current={data.discipline.absenceRate}
                      divider={false}
                      format={fmt.percent}
                      label="อัตราขาดงาน"
                      previous={data.discipline.absenceRatePrev}
                    />
                    <MetricRow
                      current={data.discipline.lateMinutesPerHead}
                      divider
                      format={fmt.minutes}
                      label="นาทีสายต่อคน"
                      previous={data.discipline.lateMinutesPerHeadPrev}
                    />
                    <MetricRow
                      current={data.discipline.leaveDaysPerHead}
                      divider
                      format={fmt.days}
                      label="วันลาต่อคน"
                      previous={data.discipline.leaveDaysPerHeadPrev}
                    />
                    <MetricRow
                      current={data.discipline.penaltyAmount}
                      divider
                      format={fmt.money}
                      label="เงินหักจากวินัย"
                      previous={data.discipline.penaltyAmountPrev}
                    />
                  </View>
                </PageSection>
              </Reveal>

              {data.costVisible && data.cost ? (
                <Reveal delay={120}>
                  <PageSection title="ต้นทุนแรงงาน">
                    <View style={{ gap: 14 }}>
                      <View style={{ flexDirection: 'row', gap: 12 }}>
                        <StatCell
                          label="ต้นทุนต่อหัว"
                          value={baht(data.cost.costPerHead)}
                        />
                        <StatCell
                          label="สัดส่วน OT"
                          value={`${data.cost.otCostShare}%`}
                        />
                      </View>

                      <View>
                        <MetricRow
                          current={data.cost.costPerHead}
                          divider={false}
                          format={fmt.money}
                          label="ต้นทุนต่อหัว"
                          previous={data.cost.costPerHeadPrev}
                        />
                        <MetricRow
                          current={data.cost.otHoursPerHead}
                          divider
                          format={fmt.hours}
                          label="ชั่วโมง OT ต่อคน"
                          previous={data.cost.otHoursPerHeadPrev}
                        />
                      </View>
                    </View>
                  </PageSection>
                </Reveal>
              ) : (
                <View
                  style={{
                    alignItems: 'center',
                    backgroundColor: 'rgba(148, 163, 184, 0.12)',
                    borderRadius: 16,
                    flexDirection: 'row',
                    gap: 11,
                    padding: 14,
                  }}
                >
                  <Icon color={AURORA.textMuted} name="lock" size={17} />
                  <Text
                    style={{
                      color: AURORA.textMuted,
                      flex: 1,
                      fontSize: 12.5,
                      lineHeight: 18,
                    }}
                  >
                    บัญชีนี้ไม่มีสิทธิ์ดูข้อมูลต้นทุนแรงงาน
                  </Text>
                </View>
              )}

              {data.trend.length > 0 ? (
                <Reveal delay={150}>
                  <PageSection title="แนวโน้มย้อนหลัง">
                    <View style={{ gap: 16 }}>
                      <View style={{ gap: 6 }}>
                        <Text
                          style={{
                            color: AURORA.textMuted,
                            fontSize: 11.5,
                            lineHeight: 16,
                          }}
                        >
                          อัตราขาดงานรายเดือน (%)
                        </Text>
                        <ColumnChart
                          format={(value) => `${value}%`}
                          points={data.trend.map((row) => ({
                            label: row.month,
                            value: row.absenceRate,
                          }))}
                        />
                      </View>

                      <View style={{ gap: 6 }}>
                        <Text
                          style={{
                            color: AURORA.textMuted,
                            fontSize: 11.5,
                            lineHeight: 16,
                          }}
                        >
                          ชั่วโมง OT ต่อคนรายเดือน
                        </Text>
                        <ColumnChart
                          format={(value) => `${value} ชม.`}
                          points={data.trend.map((row) => ({
                            label: row.month,
                            value: row.otHoursPerHead,
                          }))}
                        />
                      </View>
                    </View>
                  </PageSection>
                </Reveal>
              ) : null}

              <Reveal delay={180}>
                <PageSection
                  title="เทียบรายหน่วยงาน"
                  trailing={
                    <Text
                      style={{
                        color: AURORA.textFaint,
                        fontSize: 11.5,
                        lineHeight: 16,
                      }}
                    >
                      {data.departments.length} หน่วย
                    </Text>
                  }
                >
                  {data.departments.length === 0 ? (
                    <Text
                      style={{
                        color: AURORA.textMuted,
                        fontSize: 12.5,
                        lineHeight: 18,
                        paddingVertical: 10,
                      }}
                    >
                      ยังไม่มีข้อมูลรายแผนกในช่วงนี้
                    </Text>
                  ) : (
                    <View>
                      {data.departments.map((row, index) => (
                        <View
                          key={row.id ?? row.label}
                          style={{
                            borderTopColor: AURORA.glassBorder,
                            borderTopWidth: index > 0 ? 1 : 0,
                            gap: 3,
                            paddingVertical: 11,
                          }}
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
                              {row.label}
                            </Text>
                            <Text
                              style={{
                                color: AURORA.accent,
                                fontSize: 11.5,
                                fontVariant: ['tabular-nums'],
                                fontWeight: '700',
                                lineHeight: 16,
                              }}
                            >
                              {row.headcount} คน
                            </Text>
                          </View>

                          <Text
                            style={{
                              color: AURORA.textMuted,
                              fontSize: 11,
                              fontVariant: ['tabular-nums'],
                              lineHeight: 16,
                            }}
                          >
                            ขาดงาน {row.absenceRate}% · สาย{' '}
                            {row.lateMinutesPerHead} น./คน · OT{' '}
                            {row.otHoursPerHead} ชม./คน · ลาออก{' '}
                            {row.turnoverRate}%
                          </Text>

                          {data.costVisible && row.costPerHead > 0 ? (
                            <Text
                              style={{
                                color: AURORA.textFaint,
                                fontSize: 11,
                                fontVariant: ['tabular-nums'],
                                lineHeight: 16,
                              }}
                            >
                              ต้นทุนต่อหัว {baht(row.costPerHead)} บาท
                            </Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  )}
                </PageSection>
              </Reveal>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
