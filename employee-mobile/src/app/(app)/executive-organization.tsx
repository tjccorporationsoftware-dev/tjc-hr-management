import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, Input, SkeletonList, Text } from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  OrgChartMotif,
  PageHero,
  PageSection,
  Reveal,
  SectionAction,
} from '@/design/aurora';
import { apiClient } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';
import { z } from 'zod';

/**
 * ผังองค์กรแบบอ่านอย่างเดียว
 *
 * ผิวขาวผืนเดียวชุดเดียวกับจอของพนักงาน (`PageHero` + `PageSection` + `AURORA`)
 *
 * บนจอมือถือไม่วาดเป็นแผนภูมิต้นไม้แบบเว็บ — ผังที่กว้างสามระดับบนจอ 6 นิ้ว
 * ต้องย่อจนอ่านชื่อไม่ออก จึงแสดงเป็นรายการซ้อนชั้นแทน (บริษัท → บริษัทในเครือ →
 * แผนก) พร้อมจำนวนคนแต่ละหน่วย และมีช่องค้นหาคนสำหรับกรณีที่รู้ชื่ออยู่แล้ว
 *
 * จอนี้ต้องมีสิทธิ์ `ORG_READ` เพิ่มจากการเข้าห้องผู้บริหาร
 */

const nodeSchema = z.object({
  code: z.string().nullish(),
  companyId: z.string().nullish(),
  departmentId: z.string().nullish(),
  id: z.string(),
  nameTh: z.string().nullish(),
});

const orgChartSchema = z.object({
  branches: z.array(nodeSchema).default([]),
  companies: z.array(nodeSchema).default([]),
  departments: z.array(nodeSchema.extend({ branchId: z.string().nullish() })).default([]),
  divisions: z.array(nodeSchema).default([]),
  employees: z
    .array(
      z.object({
        branchId: z.string().nullish(),
        companyId: z.string().nullish(),
        departmentId: z.string().nullish(),
        displayName: z.string().nullish(),
        employeeCode: z.string().nullish(),
        firstName: z.string().nullish(),
        id: z.string(),
        lastName: z.string().nullish(),
        position: z.string().nullish(),
        positionMaster: z.object({ nameTh: z.string().nullish() }).nullish(),
        status: z.string().nullish(),
      }),
    )
    .default([]),
});

type OrgChart = z.infer<typeof orgChartSchema>;

function useOrgChart() {
  return useQuery({
    queryFn: async (): Promise<OrgChart> => {
      const payload = await apiClient.get<unknown>(
        '/mobile/v1/executive/organization',
      );
      const result = orgChartSchema.safeParse(payload);

      if (!result.success) {
        throw ApiError.invalidResponse(result.error.issues);
      }

      return result.data;
    },
    queryKey: ['executive', 'organization'] as const,
    retry(failureCount, error) {
      if (error instanceof ApiError && error.status && error.status < 500) {
        return false;
      }

      return failureCount < 2;
    },
    /* โครงสร้างองค์กรแทบไม่เปลี่ยนระหว่างวัน */
    staleTime: 600_000,
  });
}

const employeeName = (employee: {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) =>
  employee.displayName ||
  [employee.firstName, employee.lastName].filter(Boolean).join(' ') ||
  'ไม่ระบุชื่อ';

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
  icon: 'lock' | 'alert-circle' | 'search';
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

export default function ExecutiveOrganizationScreen() {
  const { gutter } = useResponsive();
  const router = useRouter();
  const chart = useOrgChart();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const keyword = search.trim().toLowerCase();

  /*
   * ค้นหาทำในแอปได้ เพราะผังทั้งองค์กรของลูกค้ารายนี้อยู่ในหลักสิบถึงร้อยคน
   * และโหลดมาครบแล้ว การยิง endpoint ค้นหาทุกตัวอักษรจะช้ากว่าเห็น ๆ
   * (ถ้าวันหนึ่งองค์กรโตถึงหลักพัน ต้องย้ายไปค้นที่ฐานข้อมูลแทน)
   */
  const matched = useMemo(() => {
    if (!keyword || !chart.data) return [];

    return chart.data.employees
      .filter((employee) => {
        const haystack = [
          employeeName(employee),
          employee.employeeCode,
          employee.positionMaster?.nameTh ?? employee.position,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(keyword);
      })
      .slice(0, 30);
  }, [chart.data, keyword]);

  const countByDepartment = useMemo(() => {
    const counts = new Map<string, number>();

    for (const employee of chart.data?.employees ?? []) {
      if (!employee.departmentId) continue;
      counts.set(
        employee.departmentId,
        (counts.get(employee.departmentId) ?? 0) + 1,
      );
    }

    return counts;
  }, [chart.data]);

  const data = chart.data;
  const forbidden =
    chart.error instanceof ApiError && chart.error.status === 403;

  return (
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            Platform.OS === 'web' ? undefined : (
              <RefreshControl
                onRefresh={() => void chart.refetch()}
                refreshing={chart.isRefetching}
                tintColor={AURORA.textMuted}
              />
            )
          }
          showsVerticalScrollIndicator={false}
        >
          <Reveal>
            <PageHero
              decoration={<OrgChartMotif />}
              icon="arrow-left"
              iconLabel="ย้อนกลับ"
              onIconPress={() => router.back()}
              subtitle="โครงสร้างและกำลังคนแต่ละหน่วย"
              title="ผังองค์กร"
            />
          </Reveal>

          {chart.isPending ? (
            <View style={{ paddingHorizontal: gutter, paddingTop: 24 }}>
              <SkeletonList rows={6} />
            </View>
          ) : forbidden ? (
            <Notice
              color={AURORA.textMuted}
              description="บัญชีนี้ยังไม่มีสิทธิ์ดูผังองค์กร กรุณาติดต่อผู้ดูแลระบบ"
              icon="lock"
              title="ไม่มีสิทธิ์ดูผังองค์กร"
            />
          ) : chart.isError ? (
            <Notice
              color={AURORA.rose}
              description={
                chart.error instanceof ApiError
                  ? chart.error.message
                  : 'กรุณาลองใหม่อีกครั้ง'
              }
              icon="alert-circle"
              onRetry={() => void chart.refetch()}
              retryLabel={chart.isRefetching ? 'กำลังโหลด...' : 'ลองใหม่'}
              title="ยังโหลดผังองค์กรไม่ได้"
            />
          ) : data ? (
            <View style={{ gap: 28, paddingHorizontal: gutter, paddingTop: 24 }}>
              <Reveal delay={40}>
                <Input
                  appearance="aurora"
                  label="ค้นหาบุคลากร"
                  onChangeText={setSearch}
                  placeholder="ชื่อ รหัสพนักงาน หรือตำแหน่ง"
                  value={search}
                />
              </Reveal>

              {keyword ? (
                <Reveal delay={70}>
                  <PageSection
                    title="ผลการค้นหา"
                    trailing={
                      <Text
                        style={{
                          color: AURORA.accent,
                          fontSize: 11.5,
                          fontVariant: ['tabular-nums'],
                          fontWeight: '700',
                          lineHeight: 16,
                        }}
                      >
                        {matched.length} คน
                      </Text>
                    }
                  >
                    {matched.length === 0 ? (
                      <Text
                        style={{
                          color: AURORA.textMuted,
                          fontSize: 12.5,
                          lineHeight: 18,
                          paddingVertical: 10,
                        }}
                      >
                        ไม่พบบุคลากรที่ตรงกับคำค้น
                      </Text>
                    ) : (
                      <View>
                        {matched.map((employee, index) => (
                          <View
                            key={employee.id}
                            style={{
                              borderTopColor: AURORA.glassBorder,
                              borderTopWidth: index > 0 ? 1 : 0,
                              gap: 2,
                              paddingVertical: 10,
                            }}
                          >
                            <Text
                              numberOfLines={1}
                              style={{
                                color: AURORA.text,
                                fontSize: 13.5,
                                fontWeight: '700',
                                lineHeight: 19,
                              }}
                            >
                              {employeeName(employee)}
                            </Text>
                            <Text
                              numberOfLines={1}
                              style={{
                                color: AURORA.textMuted,
                                fontSize: 11,
                                lineHeight: 16,
                              }}
                            >
                              {[
                                employee.employeeCode,
                                employee.positionMaster?.nameTh ??
                                  employee.position,
                              ]
                                .filter(Boolean)
                                .join(' · ') || 'ไม่ระบุตำแหน่ง'}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </PageSection>
                </Reveal>
              ) : (
                data.companies.map((company, companyIndex) => (
                  <Reveal delay={70 + companyIndex * 40} key={company.id}>
                    <PageSection
                      title={company.nameTh ?? company.code ?? 'บริษัท'}
                    >
                      <View>
                        {data.branches
                          .filter((branch) => branch.companyId === company.id)
                          .map((branch, branchIndex) => {
                            const departments = data.departments.filter(
                              (department) => department.branchId === branch.id,
                            );
                            const isOpen = expanded === branch.id;
                            const branchHeadcount = departments.reduce(
                              (sum, department) =>
                                sum +
                                (countByDepartment.get(department.id) ?? 0),
                              0,
                            );

                            return (
                              <View
                                key={branch.id}
                                style={{
                                  borderTopColor: AURORA.glassBorder,
                                  borderTopWidth: branchIndex > 0 ? 1 : 0,
                                }}
                              >
                                <Pressable
                                  accessibilityRole="button"
                                  onPress={() =>
                                    setExpanded(isOpen ? null : branch.id)
                                  }
                                  style={({ pressed }) => ({
                                    alignItems: 'center',
                                    backgroundColor: pressed
                                      ? 'rgba(37, 99, 235, 0.06)'
                                      : 'transparent',
                                    flexDirection: 'row',
                                    gap: 11,
                                    marginHorizontal: -4,
                                    paddingHorizontal: 4,
                                    paddingVertical: 11,
                                  })}
                                >
                                  <Icon
                                    color={AURORA.accent}
                                    name={
                                      isOpen ? 'chevron-down' : 'chevron-right'
                                    }
                                    size={17}
                                  />

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
                                      {branch.nameTh ?? branch.code ?? 'บริษัทในเครือ'}
                                    </Text>
                                    <Text
                                      style={{
                                        color: AURORA.textMuted,
                                        fontSize: 11,
                                        lineHeight: 16,
                                      }}
                                    >
                                      {departments.length} แผนก
                                    </Text>
                                  </View>

                                  <Text
                                    maxScale={1.1}
                                    style={{
                                      color: AURORA.accent,
                                      fontSize: 12.5,
                                      fontVariant: ['tabular-nums'],
                                      fontWeight: '700',
                                      lineHeight: 18,
                                    }}
                                  >
                                    {branchHeadcount} คน
                                  </Text>
                                </Pressable>

                                {isOpen ? (
                                  <View
                                    style={{
                                      borderLeftColor: AURORA.glassBorder,
                                      borderLeftWidth: 2,
                                      marginBottom: 6,
                                      marginLeft: 8,
                                      paddingLeft: 14,
                                    }}
                                  >
                                    {departments.length === 0 ? (
                                      <Text
                                        style={{
                                          color: AURORA.textMuted,
                                          fontSize: 12,
                                          lineHeight: 17,
                                          paddingVertical: 8,
                                        }}
                                      >
                                        บริษัทนี้ยังไม่มีแผนก
                                      </Text>
                                    ) : (
                                      departments.map((department, index) => (
                                        <View
                                          key={department.id}
                                          style={{
                                            alignItems: 'center',
                                            borderTopColor: AURORA.glassBorder,
                                            borderTopWidth: index > 0 ? 1 : 0,
                                            flexDirection: 'row',
                                            gap: 12,
                                            paddingVertical: 9,
                                          }}
                                        >
                                          <Text
                                            numberOfLines={1}
                                            style={{
                                              color: AURORA.text,
                                              flex: 1,
                                              fontSize: 12.5,
                                              lineHeight: 18,
                                            }}
                                          >
                                            {department.nameTh ??
                                              department.code ??
                                              'แผนก'}
                                          </Text>
                                          <Text
                                            maxScale={1.1}
                                            style={{
                                              color: AURORA.textMuted,
                                              fontSize: 11.5,
                                              fontVariant: ['tabular-nums'],
                                              lineHeight: 16,
                                            }}
                                          >
                                            {countByDepartment.get(
                                              department.id,
                                            ) ?? 0}{' '}
                                            คน
                                          </Text>
                                        </View>
                                      ))
                                    )}
                                  </View>
                                ) : null}
                              </View>
                            );
                          })}
                      </View>
                    </PageSection>
                  </Reveal>
                ))
              )}
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
