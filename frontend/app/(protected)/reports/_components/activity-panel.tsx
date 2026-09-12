"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { ErrorState, LoadingState } from "@/components/common/feedback-state";
import { Badge, Button, Modal, Notice } from "@/components/kit";
import { formatThaiDateTime } from "@/lib/date-format";
import { getReportUserActivity } from "@/lib/api";
import type { ReportStatistics, ReportUserActivity } from "@/types/reports";

import {
  StatBreakdown,
  StatCell,
  StatDayChart,
  StatRow,
  StatSection,
} from "./stat-blocks";
import { auditActionText } from "./stat-labels";

/**
 * แท็บ "การใช้งานระบบ"
 * -----------------------------------------------------------------------------
 * ตอบว่า "ระบบถูกใช้งานหนักแค่ไหน และใครใช้" จากบันทึกการใช้งาน (AuditLog)
 *
 * ต่างจากหน้า ตั้งค่า > บันทึกการใช้งาน ตรงที่หน้านั้นเป็นการไล่ดูทีละรายการ
 * เพื่อการตรวจสอบ ส่วนที่นี่เป็นภาพรวมเชิงสถิติ แล้วค่อยเจาะรายคนเมื่อสงสัย
 *
 * การเจาะรายคนต้องมีสิทธิ์ ORG_MANAGE เพิ่ม (backend บังคับไว้)
 * ถ้าไม่มีสิทธิ์จะขึ้นข้อความบอกในกล่อง แทนที่จะซ่อนปุ่มเงียบ ๆ
 */
export function ActivityPanel({
  data,
  loading,
  error,
  onRetry,
  days,
}: {
  data: ReportStatistics | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  days: number;
}) {
  const [detail, setDetail] = useState<ReportUserActivity | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  async function openUser(userId: string) {
    setOpenUserId(userId);
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);

    try {
      setDetail(await getReportUserActivity(userId, { days }));
    } catch (caught) {
      setDetailError(
        caught instanceof Error
          ? caught.message
          : "โหลดกิจกรรมของผู้ใช้ไม่สำเร็จ",
      );
    } finally {
      setDetailLoading(false);
    }
  }

  if (loading && !data) {
    return <LoadingState title="กำลังรวบรวมการใช้งาน" />;
  }

  if (error && !data) {
    return (
      <ErrorState
        title="โหลดข้อมูลการใช้งานไม่สำเร็จ"
        description={error}
        action={
          <Button
            onClick={onRetry}
            icon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            ลองใหม่
          </Button>
        }
      />
    );
  }

  if (!data) return null;

  const { system } = data;
  const errorRate =
    system.totalEvents > 0
      ? Math.round((system.failedEvents / system.totalEvents) * 1000) / 10
      : 0;

  return (
    <>
      <StatSection
        title="ภาพรวมการใช้งาน"
        description="นับจากทุกการกระทำที่ระบบบันทึกไว้ในช่วงที่เลือก"
      >
        <StatRow>
          <StatCell
            label="กิจกรรมทั้งหมด"
            value={count(system.totalEvents)}
            tone="brand"
            helper="ทุกการกระทำที่ถูกบันทึก"
          />
          <StatCell
            label="เข้าสู่ระบบ"
            value={count(system.logins)}
            helper={`ล้มเหลว ${count(system.failedLogins)} ครั้ง`}
            tone={system.failedLogins > 0 ? "warning" : "neutral"}
          />
          <StatCell
            label="ที่ตอบกลับผิดพลาด"
            value={count(system.failedEvents)}
            tone={system.failedEvents > 0 ? "critical" : "positive"}
            helper={`คิดเป็น ${errorRate}% ของทั้งหมด`}
          />
          <StatCell
            label="ผู้ใช้ที่มีกิจกรรม"
            value={count(system.topUsers.length)}
            helper="แสดงสูงสุด 15 คนแรก"
          />
        </StatRow>

        {system.breakdownTruncated ? (
          <div className="mt-4">
            <Notice tone="warning">
              ช่วงที่เลือกมีกิจกรรมมากกว่า 20,000 รายการ —
              ยอดรวมด้านบนนับครบทั้งช่วง แต่การแจกแจงด้านล่าง
              (รายวัน/ตามการกระทำ/ตามผู้ใช้) คิดจากรายการล่าสุดเท่านั้น
              ลองย่นช่วงเวลาให้แคบลงเพื่อดูภาพที่ครบ
            </Notice>
          </div>
        ) : null}
      </StatSection>

      <StatSection
        title="กิจกรรมรายวัน"
        description="ดูจังหวะการใช้งาน วันไหนหนัก วันไหนเงียบ"
      >
        <StatDayChart items={system.byDay} />
      </StatSection>

      <StatSection title="ทำอะไรกันบ้าง">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 3xl:text-[12px]">
              แยกตามการกระทำ
            </p>
            <StatBreakdown
              items={system.byAction}
              labelOf={auditActionText}
              unit={(item) => `${count(item.count)} ครั้ง`}
              max={10}
            />
          </div>

          <div className="min-w-0">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 3xl:text-[12px]">
              แยกตามเรื่องที่แตะ
            </p>
            <StatBreakdown
              items={system.byEntity}
              unit={(item) => `${count(item.count)} ครั้ง`}
              max={10}
            />
          </div>
        </div>
      </StatSection>

      <StatSection
        title="ผู้ใช้ที่ใช้งานมากที่สุด"
        description="กดที่ปุ่มดูกิจกรรมเพื่อเจาะดูว่าคนนั้นเข้าไปทำอะไรบ้าง"
      >
        {system.topUsers.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-slate-400">
            ยังไม่มีกิจกรรมของผู้ใช้ในช่วงนี้
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
            {system.topUsers.map((user, index) => (
              <li
                key={user.userId}
                className="flex flex-wrap items-center gap-3 px-4 py-2.5"
              >
                <span className="w-6 shrink-0 text-[12px] font-semibold tabular-nums text-slate-400">
                  {index + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="whitespace-nowrap text-[13px] font-semibold text-slate-900 3xl:text-[14px]">
                    {user.displayName ?? user.email ?? "ไม่ทราบชื่อ"}
                  </p>
                  <p className="break-words text-[11px] text-slate-400 3xl:text-[12px]">
                    {[
                      user.email,
                      user.lastLoginAt
                        ? `เข้าล่าสุด ${formatThaiDateTime(user.lastLoginAt)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "-"}
                  </p>
                </div>

                {user.failed > 0 ? (
                  <Badge tone="critical">ผิดพลาด {count(user.failed)}</Badge>
                ) : null}

                <span className="w-28 text-right text-[13px] font-semibold tabular-nums text-slate-900 3xl:text-[14px]">
                  {count(user.count)} ครั้ง
                </span>

                <Button size="sm" onClick={() => void openUser(user.userId)}>
                  ดูกิจกรรม
                </Button>
              </li>
            ))}
          </ul>
        )}
      </StatSection>

      {openUserId ? (
        <Modal
          open
          size="lg"
          title={detail?.user.displayName ?? "กิจกรรมของผู้ใช้"}
          description={detail?.user.email ?? undefined}
          onClose={() => {
            setOpenUserId(null);
            setDetail(null);
            setDetailError("");
          }}
        >
          {detailLoading ? (
            <LoadingState title="กำลังโหลดกิจกรรม" />
          ) : detailError ? (
            <Notice tone="critical">{detailError}</Notice>
          ) : detail ? (
            <UserActivityDetail detail={detail} />
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}

function UserActivityDetail({ detail }: { detail: ReportUserActivity }) {
  return (
    <div className="space-y-5">
      <StatRow>
        <StatCell
          label="กิจกรรมทั้งหมด"
          value={count(detail.total)}
          tone="brand"
          helper={`ย้อนหลัง ${detail.range.days} วัน`}
        />
        <StatCell
          label="ที่ตอบกลับผิดพลาด"
          value={count(detail.failed)}
          tone={detail.failed > 0 ? "critical" : "positive"}
        />
        <StatCell
          label="เข้าระบบล่าสุด"
          value={
            detail.user.lastLoginAt
              ? formatThaiDateTime(detail.user.lastLoginAt)
              : "—"
          }
        />
        <StatCell label="สถานะบัญชี" value={detail.user.status} />
      </StatRow>

      <div>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          กิจกรรมรายวัน
        </p>
        <StatDayChart items={detail.byDay} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            แยกตามการกระทำ
          </p>
          <StatBreakdown
            items={detail.byAction}
            labelOf={auditActionText}
            unit={(item) => `${count(item.count)} ครั้ง`}
          />
        </div>

        <div className="min-w-0">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            แยกตามเรื่องที่แตะ
          </p>
          <StatBreakdown
            items={detail.byEntity}
            unit={(item) => `${count(item.count)} ครั้ง`}
          />
        </div>
      </div>

      <div>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          รายการล่าสุด
        </p>

        {detail.recent.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-slate-400">
            ไม่มีรายการในช่วงนี้
          </p>
        ) : (
          <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {detail.recent.map((log, index) => (
              <li
                key={index}
                className="flex flex-wrap items-center gap-3 px-4 py-2"
              >
                <span className="w-40 shrink-0 text-[12px] tabular-nums text-slate-500">
                  {formatThaiDateTime(log.createdAt)}
                </span>

                <span className="w-28 shrink-0 text-[12px] font-semibold text-slate-700">
                  {auditActionText(log.action)}
                </span>

                <span className="min-w-0 flex-1 truncate text-[12px] text-slate-600">
                  {log.description || log.entity}
                </span>

                {log.statusCode && log.statusCode >= 400 ? (
                  <Badge tone="critical">{log.statusCode}</Badge>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function count(value: number) {
  return value.toLocaleString("th-TH");
}
