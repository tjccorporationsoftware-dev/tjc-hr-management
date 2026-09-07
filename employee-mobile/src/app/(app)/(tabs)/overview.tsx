import { useRouter } from 'expo-router';
import { RefreshControl, View } from 'react-native';

import {
  Card,
  EmptyState,
  ErrorState,
  InlineNotice,
  ListRow,
  Screen,
  Skeleton,
  Text,
} from '@/design';
import {
  ColumnChart,
  ProgressRing,
  StackedBar,
  StatTile,
  statusColor,
} from '@/design/chart';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { useExecutiveSummary } from '@/features/executive/executive';
import { ApiError } from '@/lib/api/api-error';
import { useRefetchOnFocus } from '@/lib/query/use-refetch-on-focus';
import { useAppTheme } from '@/theme/use-app-theme';

/**
 * ภาพรวมบริษัท (จอ 23–24)
 *
 * ## โครงของจอ
 *
 * 1. **ตัวเลขนำหนึ่งตัว** — สัดส่วนคนที่มาแล้ววันนี้ อยู่ในวงแหวน
 *    ผู้บริหารเปิดจอนี้เพื่อถามคำถามเดียว: "วันนี้บริษัทเดินอยู่ไหม"
 * 2. **สัดส่วนวันนี้** — แท่งซ้อนบอกว่าที่เหลือหายไปไหน (ลา/ขาด/ยังไม่เข้า)
 * 3. **กำลังคน** — การ์ดตัวเลข
 * 4. **แนวโน้มค่าจ้าง** — กราฟแท่งตามเดือน
 *
 * หนึ่งจอมีตัวเลขนำได้ตัวเดียว ที่เหลือต้องเล็กลงตามลำดับความสำคัญ
 * ไม่งั้นทุกอย่างเด่นเท่ากันแปลว่าไม่มีอะไรเด่น
 */

const compact = (value: number) => {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} ล้าน`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}K`;

  return Math.round(value).toLocaleString('th-TH');
};

const baht = (value: number) =>
  value.toLocaleString('th-TH', { maximumFractionDigits: 0 });

export default function OverviewScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const bootstrap = useBootstrap();
  const canView = bootstrap.data?.featureFlags.executive ?? false;
  const summary = useExecutiveSummary(canView);

  /* ตัวเลขทั้งบริษัทขยับตลอดวัน ต้องไม่ค้างอยู่ที่ยอดตอนเช้า */
  useRefetchOnFocus(summary);

  const data = summary.data;
  const today = data?.today;
  const trend = data?.trend ?? [];

  /* ฐานของสัดส่วนคือคนที่ต้องมาทำงานวันนี้ ไม่ใช่พนักงานทั้งหมด */
  const expected = today
    ? today.checkedIn + today.late + today.notCheckedIn + today.onLeave
    : 0;
  const present = today ? today.checkedIn + today.late : 0;
  const rate = expected > 0 ? present / expected : 0;

  /* สีของวงแหวนสื่อระดับ ไม่ใช่ตัวตน — ต่ำกว่า 70% คือเรื่องที่ต้องดู */
  const ringStatus = rate >= 0.9 ? 'good' : rate >= 0.7 ? 'warning' : 'critical';

  return (
    <Screen
      scroll
      scrollProps={{
        refreshControl: (
          <RefreshControl
            onRefresh={() => void summary.refetch()}
            refreshing={summary.isRefetching}
            tintColor={theme.colors.primary}
          />
        ),
      }}
    >
      <View style={{ gap: theme.spacing.lg }}>
        <View>
          <Text variant="h1">ภาพรวมบริษัท</Text>
          <Text tone="muted">กำลังคน การลงเวลา และค่าจ้าง</Text>
        </View>

        {!canView ? (
          <InlineNotice
            icon="lock-closed-outline"
            message="บัญชีนี้ไม่ได้รับสิทธิ์ดูภาพรวมบริษัท"
          />
        ) : summary.isPending ? (
          <View style={{ gap: theme.spacing.md }}>
            <Card>
              <Skeleton height={120} radius={theme.radius.md} />
            </Card>
            <Card>
              <Skeleton height={150} radius={theme.radius.md} />
            </Card>
          </View>
        ) : summary.isError ? (
          <ErrorState
            description={
              summary.error instanceof ApiError
                ? summary.error.message
                : undefined
            }
            onRetry={() => void summary.refetch()}
            retrying={summary.isRefetching}
          />
        ) : data && today ? (
          <>
            {/* ------------------------------------- ตัวเลขนำของทั้งจอ */}
            <Card>
              <View
                style={{
                  alignItems: 'center',
                  flexDirection: 'row',
                  gap: theme.spacing.lg,
                }}
              >
                <ProgressRing
                  color={statusColor(theme, ringStatus)}
                  size={104}
                  value={rate}
                >
                  <Text variant="h1">{Math.round(rate * 100)}%</Text>
                  <Text tone="subtle" variant="caption">
                    มาแล้ว
                  </Text>
                </ProgressRing>

                <View style={{ flex: 1, gap: 4 }}>
                  <Text tone="muted" variant="caption">
                    การลงเวลาวันนี้
                  </Text>
                  <Text variant="h2">
                    {present}
                    <Text tone="muted" variant="body">
                      {' '}
                      / {expected} คน
                    </Text>
                  </Text>
                  <Text tone="subtle" variant="caption">
                    จากพนักงานที่ทำงานอยู่ {data.manpower.activeEmployees} คน
                  </Text>
                </View>
              </View>

              {/* สัดส่วนว่าที่เหลือหายไปไหน — มีตัวเลขกำกับทุกช่วง */}
              {expected > 0 ? (
                <View style={{ marginTop: theme.spacing.md }}>
                  <StackedBar
                    format={(value) => `${value} คน`}
                    segments={[
                      {
                        color: statusColor(theme, 'good'),
                        label: 'ลงเวลาตรงเวลา',
                        value: today.checkedIn,
                      },
                      {
                        color: statusColor(theme, 'warning'),
                        label: 'มาสาย',
                        value: today.late,
                      },
                      {
                        color: theme.colors.primary,
                        label: 'ลา',
                        value: today.onLeave,
                      },
                      {
                        color: statusColor(theme, 'critical'),
                        label: 'ยังไม่เข้า',
                        value: today.notCheckedIn,
                      },
                    ]}
                  />
                </View>
              ) : null}
            </Card>

            {/* ------------------------------------------------ กำลังคน */}
            <View style={{ gap: theme.spacing.xs }}>
              <Text tone="muted" variant="label">
                กำลังคน
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: theme.spacing.xs,
                }}
              >
                <StatTile
                  label="พนักงานทั้งหมด"
                  unit="คน"
                  value={compact(data.manpower.totalEmployees)}
                />
                <StatTile
                  label="เข้าใหม่เดือนนี้"
                  unit="คน"
                  value={compact(data.manpower.newThisMonth)}
                />
                <StatTile
                  label="ทดลองงาน"
                  unit="คน"
                  value={compact(data.manpower.probationEmployees)}
                />
                <StatTile
                  label="OT อนุมัติวันนี้"
                  unit="ชม."
                  value={compact(today.approvedOtHours)}
                />
              </View>
            </View>

            {/* --------------------------------------- แนวโน้มค่าจ้าง */}
            {!data.payrollVisible ? (
              <InlineNotice
                icon="lock-closed-outline"
                message="บัญชีนี้ไม่ได้รับสิทธิ์ดูข้อมูลค่าจ้าง"
                tone="neutral"
              />
            ) : trend.length === 0 ? (
              <Card title="แนวโน้มค่าจ้าง">
                <EmptyState
                  description="เมื่อมีงวดเงินเดือนที่ทำเสร็จแล้ว กราฟจะขึ้นที่นี่"
                  icon="bar-chart-outline"
                  title="ยังไม่มีข้อมูลย้อนหลัง"
                />
              </Card>
            ) : (
              <Card
                description="ยอดจ่ายจริงต่องวด · แตะแท่งเพื่อดูค่า"
                title={`ค่าจ้าง ${trend.length} เดือนล่าสุด`}
              >
                <ColumnChart
                  format={(value) => `${baht(value)} บาท`}
                  points={trend.map((point) => ({
                    detail: `พนักงาน ${point.employees} คน`,
                    label: point.label,
                    value: point.netPay,
                  }))}
                />
              </Card>
            )}

            {/* --------------------------------------- เจาะลึกต่อ */}
            <Card
              description="จอภาพรวมตอบว่าเกิดอะไรขึ้น จอเหล่านี้ตอบว่าเกิดที่ไหนและกับใคร"
              title="ดูละเอียด"
            >
              <ListRow
                icon="speedometer-outline"
                onPress={() => router.push('/executive-insights')}
                subtitle="อัตราส่วน ต่อหัว และเทียบเดือนก่อน"
                title="ตัวชี้วัดบริหาร"
              />
              <ListRow
                icon="people-outline"
                onPress={() => router.push('/executive-manpower')}
                subtitle="แยกตามบริษัท สาขา แผนก และตำแหน่ง"
                title="กำลังคน"
              />
              <ListRow
                icon="time-outline"
                onPress={() => router.push('/executive-attendance')}
                subtitle="ใครมา ใครลา ใครขาด รายคน"
                title="เวลาทำงานวันนี้"
              />
              <ListRow
                icon="wallet-outline"
                onPress={() => router.push('/executive-payroll')}
                subtitle="แนวโน้มและองค์ประกอบค่าแรง"
                title="ค่าจ้างองค์กร"
              />
              <ListRow
                icon="git-network-outline"
                onPress={() => router.push('/executive-organization')}
                subtitle="โครงสร้างและกำลังคนแต่ละหน่วย"
                title="ผังองค์กร"
              />
              <ListRow
                divider={false}
                icon="document-text-outline"
                onPress={() => router.push('/executive-reports')}
                subtitle="ขอไฟล์รายงานและติดตามสถานะ"
                title="รายงาน"
              />
            </Card>
          </>
        ) : null}
      </View>
    </Screen>
  );
}
