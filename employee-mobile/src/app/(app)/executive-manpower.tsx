import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Button,
  Icon,
  Input,
  Select,
  Sheet,
  SkeletonList,
  Text,
  hitSlop,
} from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  PageHero,
  PageSection,
  PeopleMotif,
  PressableScale,
  Reveal,
  SectionAction,
} from '@/design/aurora';
import {
  useExecutiveManpower,
  type ExecutiveFilters,
  type ExecutiveGroup,
} from '@/features/executive/executive-views';
import {
  DonutChart,
  MAX_SLICES,
  SERIES,
  SERIES_REST,
} from '@/features/executive/royal';
import { ApiError } from '@/lib/api/api-error';

/**
 * กำลังคน — ภาพรวมและการแบ่งตามมิติต่าง ๆ
 *
 * ผิวขาวผืนเดียวชุดเดียวกับจอของพนักงาน (`PageHero` + `PageSection` + `AURORA`)
 *
 * ตัวกรองอยู่ในแผ่นเลื่อน ไม่ใช่แถบบนจอ เพราะผู้บริหารเปิดจอนี้เพื่อดูภาพรวม
 * ก่อนเสมอ แล้วค่อยกรองเมื่อสงสัยบางหน่วยงาน การกินพื้นที่บนสุดด้วยตัวกรอง
 * ห้าช่องแปลว่าต้องเลื่อนผ่านของที่ยังไม่ได้ใช้ทุกครั้งที่เปิด
 *
 * ตัวเลือกในตัวกรองมาจาก backend ตามขอบเขตของผู้ใช้ ไม่ได้ hardcode —
 * ผู้บริหารที่ถูกจำกัดขอบเขตจะเห็นเฉพาะบริษัทในเครือของตัวเอง
 */

/**
 * รูปแบบกราฟของแต่ละมิติ — **ตั้งตายตัวตามรูปร่างของข้อมูล ไม่ให้ผู้ใช้สลับ**
 *
 *   - `stack`  กลุ่มน้อย (2–4) และรวมกันเป็นร้อยเปอร์เซ็นต์ที่มีความหมาย
 *   - `donut`  กลุ่มปานกลาง (3–6) ที่คำถามคือ "ใครกินสัดส่วนเท่าไร"
 *   - `bar`    กลุ่มเยอะและมีอันดับ คำถามคือ "ใครมากที่สุด ห่างกันแค่ไหน"
 *   - `column` กลุ่มที่ **เรียงตามลำดับธรรมชาติ** (ช่วงอายุ) ห้ามเรียงตามขนาด
 *   - `list`   ชื่อยาวจนกราฟทุกแบบต้องตัดคำ อ่านเป็นตารางตรง ๆ ดีกว่า
 */
type BreakdownChart = 'list' | 'bar' | 'stack' | 'donut' | 'column';

/** สีของชิ้นที่ i — เกินห้าชิ้นแรกใช้เทาเดียวกับชิ้น "อื่น ๆ" */
const sliceColor = (index: number) =>
  index < MAX_SLICES ? SERIES[index % SERIES.length]! : SERIES_REST;

interface BreakdownRow {
  count: number;
  key: string;
  label: string;
}

/**
 * ยุบกลุ่มที่เกินโควตาเป็น "อื่น ๆ"
 *
 * `key` ผูกกับ id ของกลุ่มก่อน แล้วค่อยถอยไปใช้ชื่อ+ลำดับ — ชื่อกลุ่มซ้ำกันได้
 * จริง (แผนกชื่อเดียวกันคนละบริษัท หรือกลุ่ม "ไม่ระบุ" ที่มาจากหลายมิติ)
 * ซึ่งทำให้ React เตือนเรื่อง duplicate key แล้วรีไซเคิลแถวผิดตัว
 */
function buildRows(groups: ExecutiveGroup[], limit: number) {
  const restTotal = groups
    .slice(limit)
    .reduce((sum, group) => sum + group.count, 0);

  const rows: BreakdownRow[] = [
    ...groups.slice(0, limit).map((group, index) => ({
      count: group.count,
      key: group.id ?? `${group.label}-${index}`,
      label: group.label,
    })),
    ...(restTotal > 0
      ? [{ count: restTotal, key: '__rest__', label: 'อื่น ๆ' }]
      : []),
  ];

  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const peak = rows.reduce((max, row) => Math.max(max, row.count), 0);

  return { peak, rows, total };
}

const shareOf = (count: number, total: number) =>
  total > 0 ? Math.round((count / total) * 100) : 0;

/** แถวคำอธิบาย: จุดสี · ชื่อ · จำนวน · สัดส่วน — ใช้ซ้ำในทุกรูปแบบที่มีกราฟ */
function LegendRow({
  color,
  compact = false,
  count,
  divider,
  label,
  share,
}: {
  color: string;
  /** ใช้ในการ์ดคู่ที่กว้างครึ่งจอ — ตัดคอลัมน์เปอร์เซ็นต์ทิ้ง */
  compact?: boolean;
  count: number;
  divider: boolean;
  label: string;
  share: number;
}) {
  return (
    <View
      style={{
        alignItems: 'flex-start',
        borderTopColor: AURORA.glassBorder,
        borderTopWidth: divider ? 1 : 0,
        flexDirection: 'row',
        gap: 8,
        paddingVertical: compact ? 5 : 6,
      }}
    >
      <View
        style={{
          backgroundColor: color,
          borderRadius: 999,
          height: 8,
          marginTop: 4,
          width: 8,
        }}
      />
      <Text
        numberOfLines={2}
        style={{
          color: AURORA.text,
          flex: 1,
          fontSize: compact ? 11 : 11.5,
          lineHeight: 16,
        }}
      >
        {label}
      </Text>
      <Text
        maxScale={1.1}
        style={{
          color: AURORA.text,
          fontSize: compact ? 11 : 11.5,
          fontVariant: ['tabular-nums'],
          fontWeight: '700',
          lineHeight: 16,
        }}
      >
        {compact ? String(count) : `${count} คน`}
      </Text>
      {compact ? null : (
        <Text
          maxScale={1.1}
          style={{
            color: AURORA.textFaint,
            fontSize: 10.5,
            fontVariant: ['tabular-nums'],
            lineHeight: 16,
            minWidth: 30,
            textAlign: 'right',
          }}
        >
          {`${share}%`}
        </Text>
      )}
    </View>
  );
}

/** ตัวกราฟล้วน ไม่มีหัวข้อ — ใช้ได้ทั้งในหมวดเต็มความกว้างและในบล็อกย่อย */
function ChartBody({
  chart,
  peak,
  rows,
  total,
}: {
  chart: BreakdownChart;
  peak: number;
  rows: BreakdownRow[];
  total: number;
}) {
  if (chart === 'donut') {
    return (
      <View
        style={{
          alignItems: 'center',
          flexDirection: 'row',
          gap: 13,
          paddingTop: 4,
        }}
      >
        <DonutChart
          center={String(total)}
          centerLabel="คน"
          size={92}
          slices={rows.map((row, index) => ({
            color: sliceColor(index),
            label: row.label,
            text: `${row.count} คน`,
            value: row.count,
          }))}
        />

        {/* ชื่อกลุ่มยาวกว่าครึ่งจอได้ จึงตัดสองบรรทัดแทนที่จะตัดหายท้ายบรรทัด */}
        <View style={{ flex: 1, minWidth: 0 }}>
          {rows.map((row, index) => (
            <LegendRow
              color={sliceColor(index)}
              count={row.count}
              divider={index > 0}
              key={row.key}
              label={row.label}
              share={shareOf(row.count, total)}
            />
          ))}
        </View>
      </View>
    );
  }

  if (chart === 'stack') {
    return (
      <View style={{ gap: 10, paddingTop: 4 }}>
        <View
          style={{
            backgroundColor: AURORA.accentSoft,
            borderRadius: 999,
            flexDirection: 'row',
            gap: 2,
            height: 10,
            overflow: 'hidden',
          }}
        >
          {rows
            .filter((row) => row.count > 0)
            .map((row, index) => (
              <View
                key={row.key}
                style={{
                  backgroundColor: sliceColor(index),
                  flexGrow: row.count,
                }}
              />
            ))}
        </View>

        <View>
          {rows.map((row, index) => (
            <LegendRow
              color={sliceColor(index)}
              count={row.count}
              divider={index > 0}
              key={row.key}
              label={row.label}
              share={shareOf(row.count, total)}
            />
          ))}
        </View>
      </View>
    );
  }

  if (chart === 'column') {
    return (
      <View style={{ gap: 7, paddingTop: 6 }}>
        {/* แท่งตั้งเรียงตามลำดับที่ backend ส่งมา ห้ามเรียงตามขนาด —
            ช่วงอายุที่สลับลำดับคืออ่านไม่ออกว่าองค์กรอายุเยอะหรือน้อย */}
        <View
          style={{
            alignItems: 'flex-end',
            flexDirection: 'row',
            gap: 6,
            height: 84,
          }}
        >
          {rows.map((row, index) => (
            <View key={row.key} style={{ flex: 1, gap: 4 }}>
              <Text
                maxScale={1}
                numberOfLines={1}
                style={{
                  color: AURORA.text,
                  fontSize: 10,
                  fontVariant: ['tabular-nums'],
                  fontWeight: '700',
                  textAlign: 'center',
                }}
              >
                {row.count}
              </Text>
              <View
                style={{
                  backgroundColor: sliceColor(index),
                  borderRadius: 5,
                  /* แท่งค่าศูนย์ยังต้องเห็นเป็นขีดบาง ๆ ไม่ใช่หายไปทั้งแท่ง */
                  height: Math.max(peak > 0 ? (row.count / peak) * 62 : 0, 3),
                }}
              />
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 6 }}>
          {rows.map((row) => (
            <Text
              key={row.key}
              maxScale={1}
              numberOfLines={2}
              style={{
                color: AURORA.textFaint,
                flex: 1,
                fontSize: 9,
                letterSpacing: -0.3,
                lineHeight: 12,
                textAlign: 'center',
              }}
            >
              {row.label}
            </Text>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View>
      {rows.map((row, index) => (
        <View
          key={row.key}
          style={{
            borderTopColor: AURORA.glassBorder,
            borderTopWidth: index > 0 ? 1 : 0,
            gap: chart === 'bar' ? 6 : 0,
            paddingVertical: chart === 'bar' ? 10 : 9,
          }}
        >
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: 12 }}>
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
              {`${row.count} คน`}
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
              {`${shareOf(row.count, total)}%`}
            </Text>
          </View>

          {chart === 'bar' ? (
            <View
              style={{
                backgroundColor: AURORA.accentSoft,
                borderRadius: 999,
                height: 5,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  backgroundColor: sliceColor(index),
                  borderRadius: 999,
                  height: 5,
                  width: `${peak > 0 ? Math.max((row.count / peak) * 100, 3) : 0}%`,
                }}
              />
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** หมวดเต็มความกว้าง — หัวข้อขีดน้ำเงิน + กราฟของมิตินั้น */
function BreakdownSection({
  chart,
  groups,
  title,
}: {
  chart: BreakdownChart;
  groups: ExecutiveGroup[];
  title: string;
}) {
  if (groups.length === 0) return null;

  /* โหมดแท่งตั้งไม่ยุบกลุ่ม — ช่วงอายุที่ขาดช่วงกลางไปจะอ่านผิดทันที */
  const { peak, rows, total } = buildRows(
    groups,
    chart === 'column' ? groups.length : 6,
  );

  return (
    <PageSection
      title={title}
      trailing={
        <Text
          style={{
            color: AURORA.textFaint,
            fontSize: 11.5,
            fontVariant: ['tabular-nums'],
            lineHeight: 16,
          }}
        >
          {`${groups.length} กลุ่ม`}
        </Text>
      }
    >
      <ChartBody chart={chart} peak={peak} rows={rows} total={total} />
    </PageSection>
  );
}

/**
 * มิติเล็ก ๆ ในการ์ดครึ่งจอ — วงแหวนกับคำอธิบายเรียงลงล่าง
 *
 * มิติอย่างเพศหรือประเภทพนักงานมีสองสามกลุ่ม ถ้ากินความกว้างเต็มจอเท่ากับ
 * มิติที่มีสิบสี่แผนก จอจะยาวขึ้นเป็นเท่าตัวโดยไม่ได้บอกอะไรเพิ่ม — จับคู่กัน
 * สองใบต่อแถวแล้วอ่านเทียบกันได้ในสายตาเดียว
 */
function MiniCard({
  groups,
  title,
}: {
  groups: ExecutiveGroup[];
  title: string;
}) {
  if (groups.length === 0) return null;

  const { rows, total } = buildRows(groups, 4);

  return (
    /* ไม่มีพื้นการ์ด — สองมิตินี้แยกจากกันด้วยระยะห่างกับหัวข้อของตัวเอง
       พอ (กติกา "หนึ่งจอ หนึ่งผิว" ของแอป) พื้นฟ้าจางบนพื้นขาวอ่านเป็นเทา
       และทำให้จอมีกล่องซ้อนกล่องโดยไม่ได้บอกอะไรที่ระยะห่างบอกไม่ได้ */
    <View style={{ flex: 1, gap: 8 }}>
      <Text
        maxScale={1.15}
        numberOfLines={1}
        style={{ color: AURORA.text, fontSize: 12.5, fontWeight: '800' }}
      >
        {title}
      </Text>

      <View style={{ alignItems: 'center' }}>
        <DonutChart
          center={String(total)}
          centerLabel="คน"
          size={78}
          slices={rows.map((row, index) => ({
            color: sliceColor(index),
            label: row.label,
            text: `${row.count} คน`,
            value: row.count,
          }))}
        />
      </View>

      <View>
        {rows.map((row, index) => (
          <LegendRow
            color={sliceColor(index)}
            compact
            count={row.count}
            divider={index > 0}
            key={row.key}
            label={row.label}
            share={shareOf(row.count, total)}
          />
        ))}
      </View>
    </View>
  );
}

export default function ExecutiveManpowerScreen() {
  const { gutter } = useResponsive();
  const router = useRouter();

  const [filters, setFilters] = useState<ExecutiveFilters>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<ExecutiveFilters>({});

  const manpower = useExecutiveManpower(filters);
  const data = manpower.data;
  const options = data?.filterOptions;

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const toOptions = (groups: ExecutiveGroup[] | undefined) => [
    { label: 'ทั้งหมด', value: '' },
    ...(groups ?? [])
      .filter((group) => group.id)
      .map((group) => ({ label: group.label, value: group.id as string })),
  ];

  return (
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            Platform.OS === 'web' ? undefined : (
              <RefreshControl
                onRefresh={() => void manpower.refetch()}
                refreshing={manpower.isRefetching}
                tintColor={AURORA.textMuted}
              />
            )
          }
          showsVerticalScrollIndicator={false}
        >
          <Reveal>
            <PageHero
              decoration={<PeopleMotif />}
              icon="arrow-left"
              iconLabel="ย้อนกลับ"
              onIconPress={() => router.back()}
              right={
                <PressableScale
                  accessibilityLabel="ตัวกรอง"
                  accessibilityRole="button"
                  hitSlop={hitSlop}
                  onPress={() => {
                    setDraft(filters);
                    setSheetOpen(true);
                  }}
                  style={{
                    alignItems: 'center',
                    backgroundColor:
                      activeFilterCount > 0
                        ? AURORA.accent
                        : AURORA.accentSoft,
                    borderRadius: 999,
                    flexDirection: 'row',
                    gap: 6,
                    height: 34,
                    justifyContent: 'center',
                    paddingHorizontal: 13,
                  }}
                >
                  <Icon
                    color={
                      activeFilterCount > 0 ? AURORA.baseDeep : AURORA.accent
                    }
                    name="sliders"
                    size={15}
                  />
                  <Text
                    maxScale={1.1}
                    style={{
                      color:
                        activeFilterCount > 0
                          ? AURORA.baseDeep
                          : AURORA.accent,
                      fontSize: 11.5,
                      fontWeight: '700',
                      lineHeight: 16,
                    }}
                  >
                    {activeFilterCount > 0 ? String(activeFilterCount) : 'กรอง'}
                  </Text>
                </PressableScale>
              }
              subtitle={
                activeFilterCount > 0
                  ? `กรองอยู่ ${activeFilterCount} เงื่อนไข`
                  : 'ทั้งองค์กรตามสิทธิ์ของคุณ'
              }
              title="กำลังคน"
            />
          </Reveal>

          {manpower.isPending ? (
            <View style={{ paddingHorizontal: gutter, paddingTop: 24 }}>
              <SkeletonList rows={6} />
            </View>
          ) : manpower.isError ? (
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
                ยังโหลดข้อมูลกำลังคนไม่ได้
              </Text>
              <Text
                style={{ color: AURORA.textMuted, textAlign: 'center' }}
                variant="caption"
              >
                {manpower.error instanceof ApiError
                  ? manpower.error.message
                  : 'กรุณาลองใหม่อีกครั้ง'}
              </Text>
              <SectionAction
                label={manpower.isRefetching ? 'กำลังโหลด...' : 'ลองใหม่'}
                onPress={() => void manpower.refetch()}
              />
            </View>
          ) : data && data.metrics.totalEmployees === 0 ? (
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
                  backgroundColor: AURORA.accentSoft,
                  borderRadius: 999,
                  height: 52,
                  justifyContent: 'center',
                  marginBottom: 4,
                  width: 52,
                }}
              >
                <Icon color={AURORA.accent} name="users" size={23} />
              </View>
              <Text style={{ color: AURORA.text }} variant="bodyStrong">
                ไม่พบพนักงานตามเงื่อนไขนี้
              </Text>
              <Text
                style={{ color: AURORA.textMuted, textAlign: 'center' }}
                variant="caption"
              >
                ลองล้างตัวกรองแล้วดูใหม่อีกครั้ง
              </Text>
            </View>
          ) : data ? (
            <>
              {/*
                หัวสรุปเป็นตัวเลขพระเอกบนพื้นขาว ไม่ใช่แถบสีที่มีห้าช่องเรียงกัน
                — ห้าช่องขนาดเท่ากันแปลว่าไม่มีตัวไหนสำคัญกว่าตัวไหน ทั้งที่
                คำถามแรกของจอนี้คือ "ตอนนี้มีคนทำงานอยู่กี่คน" ตัวเดียว
                ที่เหลือเป็นบริบทของมัน
              */}
              <Reveal delay={40}>
                <View
                  style={{ gap: 14, paddingHorizontal: gutter, paddingTop: 22 }}
                >
                  <View style={{ gap: 2 }}>
                    <Text
                      maxScale={1.15}
                      style={{
                        color: AURORA.textMuted,
                        fontSize: 11.5,
                        lineHeight: 16,
                      }}
                    >
                      พนักงานที่ทำงานอยู่
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
                        {data.metrics.activeEmployees}
                      </Text>
                      <Text
                        style={{
                          color: AURORA.textMuted,
                          fontSize: 12.5,
                          paddingBottom: 7,
                        }}
                      >
                        คน
                      </Text>
                    </View>

                    <Text
                      style={{
                        color: AURORA.textMuted,
                        fontSize: 11.5,
                        lineHeight: 16,
                      }}
                    >
                      {`คิดเป็น ${data.metrics.activeRate}% ของทะเบียนทั้งหมด ${data.metrics.totalEmployees} คน`}
                    </Text>
                  </View>

                  {/*
                    แท่งสถานะ — **แท่งเดียวของทั้งจอ** ที่เหลือใช้เปอร์เซ็นต์
                    ท้ายบรรทัดแทน เพราะเจ็ดมิติที่ไล่อยู่ข้างล่างถ้ามีแท่งครบ
                    ทุกแถวจะกลายเป็นหลอดสี่สิบกว่าหลอดที่ไม่มีอันไหนเด่น
                  */}
                  <View style={{ gap: 9 }}>
                    <View
                      style={{
                        backgroundColor: AURORA.accentSoft,
                        borderRadius: 999,
                        flexDirection: 'row',
                        gap: 2,
                        height: 9,
                        overflow: 'hidden',
                      }}
                    >
                      {[
                        {
                          color: AURORA.accent,
                          key: 'active',
                          value: data.metrics.activeEmployees,
                        },
                        {
                          color: AURORA.sky,
                          key: 'probation',
                          value: data.metrics.probationEmployees,
                        },
                        {
                          color: 'rgba(87, 96, 122, 0.3)',
                          key: 'resigned',
                          value: data.metrics.resignedEmployees,
                        },
                      ]
                        .filter((part) => part.value > 0)
                        .map((part) => (
                          <View
                            key={part.key}
                            style={{
                              backgroundColor: part.color,
                              flexGrow: part.value,
                            }}
                          />
                        ))}
                    </View>

                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 14,
                      }}
                    >
                      {[
                        {
                          color: AURORA.accent,
                          label: 'ทำงานอยู่',
                          value: data.metrics.activeEmployees,
                        },
                        {
                          color: AURORA.sky,
                          label: 'ทดลองงาน',
                          value: data.metrics.probationEmployees,
                        },
                        {
                          color: 'rgba(87, 96, 122, 0.35)',
                          label: 'ลาออกแล้ว',
                          value: data.metrics.resignedEmployees,
                        },
                      ].map((part) => (
                        <View
                          key={part.label}
                          style={{
                            alignItems: 'center',
                            flexDirection: 'row',
                            gap: 6,
                          }}
                        >
                          <View
                            style={{
                              backgroundColor: part.color,
                              borderRadius: 999,
                              height: 7,
                              width: 7,
                            }}
                          />
                          <Text
                            maxScale={1.1}
                            style={{
                              color: AURORA.textMuted,
                              fontSize: 11,
                              fontVariant: ['tabular-nums'],
                              lineHeight: 16,
                            }}
                          >
                            {`${part.label} ${part.value}`}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              </Reveal>

              <View style={{ gap: 28, paddingHorizontal: gutter, paddingTop: 24 }}>
                {/*
                  จัดกลุ่มใหม่เป็นสามชั้น แทนที่จะเรียงเจ็ดหมวดหน้าตาเหมือนกัน
                  ลงมาเรื่อย ๆ:
                    1. องค์กร — คนกระจายอยู่ที่ไหน (บริษัทในเครือ → แผนก)
                    2. ตัวพนักงาน — เขาเป็นใคร (เพศ · ประเภท · ช่วงอายุ)
                    3. ตำแหน่งกับสถานะ — รายละเอียดที่ไล่อ่านทีหลัง
                  มิติเล็กจับคู่เป็นการ์ดครึ่งจอ ไม่กินความสูงเท่ามิติที่มีสิบสี่แผนก
                */}
                <Reveal delay={70}>
                  <BreakdownSection
                    chart="donut"
                    groups={data.breakdown.byBranch}
                    title="กระจายตามบริษัทในเครือ"
                  />
                </Reveal>

                <Reveal delay={100}>
                  <BreakdownSection
                    chart="bar"
                    groups={data.breakdown.byDepartment}
                    title="กระจายตามแผนก"
                  />
                </Reveal>

                <Reveal delay={130}>
                  <View style={{ flexDirection: 'row', gap: 18 }}>
                    <MiniCard groups={data.breakdown.byGender} title="เพศ" />
                    <MiniCard
                      groups={data.breakdown.byEmployeeType}
                      title="ประเภทพนักงาน"
                    />
                  </View>
                </Reveal>

                <Reveal delay={160}>
                  <BreakdownSection
                    chart="column"
                    groups={data.breakdown.byAge}
                    title="ช่วงอายุ"
                  />
                </Reveal>

                <Reveal delay={190}>
                  <BreakdownSection
                    chart="list"
                    groups={data.breakdown.byPosition}
                    title="ตำแหน่งงาน"
                  />
                </Reveal>

                <Reveal delay={220}>
                  <BreakdownSection
                    chart="stack"
                    groups={data.breakdown.byStatus}
                    title="สถานะพนักงาน"
                  />
                </Reveal>

                {/* บริษัทแม่ขึ้นเฉพาะตอนมีมากกว่าหนึ่ง — บริษัทเดียว 100%
                    คือแถวที่ไม่ได้บอกอะไรนอกจากกินที่ */}
                {data.breakdown.byCompany.length > 1 ? (
                  <Reveal delay={250}>
                    <BreakdownSection
                      chart="stack"
                      groups={data.breakdown.byCompany}
                      title="กระจายตามบริษัท"
                    />
                  </Reveal>
                ) : null}
              </View>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>

      <Sheet
        onClose={() => setSheetOpen(false)}
        title="ตัวกรอง"
        visible={sheetOpen}
      >
        <View style={{ gap: 14 }}>
          <Select
            appearance="aurora"
            label="บริษัท"
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                companyId: value || undefined,
              }))
            }
            options={toOptions(options?.companies)}
            value={draft.companyId ?? ''}
          />
          <Select
            appearance="aurora"
            label="บริษัทในเครือ"
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                branchId: value || undefined,
              }))
            }
            options={toOptions(options?.branches)}
            value={draft.branchId ?? ''}
          />
          <Select
            appearance="aurora"
            label="แผนก"
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                departmentId: value || undefined,
              }))
            }
            options={toOptions(options?.departments)}
            value={draft.departmentId ?? ''}
          />
          <Select
            appearance="aurora"
            label="ประเภทพนักงาน"
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                employeeTypeId: value || undefined,
              }))
            }
            options={toOptions(options?.employeeTypes)}
            value={draft.employeeTypeId ?? ''}
          />

          <Input
            label="ค้นหา"
            onChangeText={(value) =>
              setDraft((current) => ({ ...current, search: value }))
            }
            placeholder="ชื่อหรือรหัสพนักงาน"
            value={draft.search ?? ''}
          />

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button
                onPress={() => {
                  setDraft({});
                  setFilters({});
                  setSheetOpen(false);
                }}
                title="ล้างตัวกรอง"
                variant="secondary"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                onPress={() => {
                  setFilters({
                    ...draft,
                    search: draft.search?.trim() || undefined,
                  });
                  setSheetOpen(false);
                }}
                title="ใช้ตัวกรอง"
              />
            </View>
          </View>
        </View>
      </Sheet>
    </View>
  );
}
