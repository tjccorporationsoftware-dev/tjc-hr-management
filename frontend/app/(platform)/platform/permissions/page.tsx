"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Layers3, RefreshCcw } from "lucide-react";

import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import { apiFetchWithMeta } from "@/lib/api";
import type { PermissionItem } from "@/types/access-control";

import {
  Badge,
  Button,
  CellStack,
  DataTable,
  PageChip,
  PageHeading,
  PageSurface,
  SearchInput,
  Select,
  StatTile,
  type Column,
} from "@/components/kit";

/**
 * แคตตาล็อกสิทธิ์ (Platform Console)
 * ==================================
 * สิทธิ์เป็นค่าคงที่ของทั้งระบบ ไม่ได้ผูกกับบริษัทไหน — เป็นรายการที่โค้ดใช้ตรวจ
 * ว่าใครทำอะไรได้ ที่นี่จึงเป็นบ้านที่ถูกต้องของมัน ไม่ใช่พื้นที่บริษัท
 *
 * เดิมหน้านี้ re-export หน้าเดียวกับพื้นที่บริษัท และยังเขียนด้วยสไตล์เก่า
 * (rounded-3xl / h-11) ที่ไม่ตรงกับชุด UI ที่ใช้อยู่ทั้งระบบ
 */

const TILE_BOX =
  "grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-[repeat(3,minmax(10.5rem,max-content))] sm:divide-y-0";

function count(value: number) {
  return value.toLocaleString("th-TH");
}

export default function PlatformPermissionsPage() {
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState<ActionDialogState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      // ดึงมาทั้งชุดครั้งเดียว สิทธิ์ทั้งระบบมีหลักสิบ ไม่ต้องแบ่งหน้า
      const result = await apiFetchWithMeta<PermissionItem[]>(
        "/permissions?page=1&pageSize=300",
      );
      setPermissions(result.data);
    } catch (error) {
      setDialog({
        title: "โหลดสิทธิ์ไม่สำเร็จ",
        description: error instanceof Error ? error.message : "ลองใหม่อีกครั้ง",
        confirmLabel: "รับทราบ",
        tone: "red",
        onConfirm: () => {},
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const groups = useMemo(
    () =>
      Array.from(
        new Set(permissions.map((item) => item.group).filter(Boolean)),
      ).sort(),
    [permissions],
  );

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();

    return permissions.filter((item) => {
      if (group && item.group !== group) return false;
      if (!term) return true;

      return (
        item.code.toLowerCase().includes(term) ||
        (item.name ?? "").toLowerCase().includes(term)
      );
    });
  }, [permissions, q, group]);

  const columns: Array<Column<PermissionItem>> = [
    {
      key: "permission",
      header: "สิทธิ์",
      cell: (item) => (
        <CellStack primary={item.code} secondary={item.name ?? undefined} />
      ),
    },
    {
      key: "group",
      header: "กลุ่ม",
      cell: (item) => <Badge tone="neutral">{item.group || "อื่น ๆ"}</Badge>,
    },
    {
      key: "description",
      header: "คำอธิบาย",
      hideBelow: "lg",
      cell: (item) => item.description || "-",
    },
  ];

  return (
    <PageSurface>
      <PageHeading
        title="สิทธิ์ทั้งระบบ"
        description="รายการสิทธิ์ที่โค้ดใช้ตรวจการเข้าถึง เป็นค่าคงที่ของแพลตฟอร์ม ไม่ผูกกับบริษัทใด"
        chips={
          <>
            <PageChip tone="brand" icon={<KeyRound className="h-3 w-3" />}>
              สิทธิ์ {count(permissions.length)}
            </PageChip>
            <PageChip icon={<Layers3 className="h-3 w-3" />}>
              กลุ่ม {count(groups.length)}
            </PageChip>
          </>
        }
        actions={
          <div className={TILE_BOX}>
            <StatTile
              label="สิทธิ์ทั้งหมด"
              value={count(permissions.length)}
              helper="ใช้ได้ทุกบริษัท"
            />
            <StatTile label="กลุ่มงาน" value={count(groups.length)} helper="แบ่งตามโมดูล" />
            <StatTile
              label="ที่แสดงอยู่"
              value={count(visible.length)}
              helper="ตามตัวกรอง"
            />
          </div>
        }
      />

      <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-5 py-3 sm:flex-row sm:items-end sm:px-6">
        <div className="grid w-full gap-2 sm:max-w-md sm:grid-cols-2">
          <SearchInput
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="ค้นหารหัสหรือชื่อสิทธิ์"
            aria-label="ค้นหาสิทธิ์"
          />
          <Select
            value={group}
            onChange={(event) => setGroup(event.target.value)}
            aria-label="กลุ่มสิทธิ์"
          >
            <option value="">ทุกกลุ่ม</option>
            {groups.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </div>

        <Button
          onClick={() => void load()}
          disabled={loading}
          icon={<RefreshCcw className="h-3.5 w-3.5" />}
        >
          รีเฟรช
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={visible}
        rowKey={(item) => item.id}
        loading={loading && permissions.length === 0}
        groupBy={(row) => [{ key: row.group || "อื่น ๆ", label: row.group || "อื่น ๆ" }]}
        emptyTitle="ไม่พบสิทธิ์ตามเงื่อนไขนี้"
      />

      <ActionDialog state={dialog} loading={loading} onClose={() => setDialog(null)} />
    </PageSurface>
  );
}
