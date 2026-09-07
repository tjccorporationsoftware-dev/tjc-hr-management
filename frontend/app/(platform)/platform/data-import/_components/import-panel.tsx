"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import {
  ActionDialog,
  type ActionDialogState,
} from "@/components/common/action-dialog";
import {
  Badge,
  Button,
  DataTable,
  Field,
  FieldGrid,
  Notice,
  Section,
  Select,
  StatTile,
  type Column,
  type Tone,
} from "@/components/kit";
import {
  cancelDataImport,
  commitDataImport,
  getDataImportDatasets,
  getDataImports,
  previewDataImport,
  uploadDataImport,
} from "@/lib/api";
import { formatThaiDateTime } from "@/lib/date-format";
import type {
  DataImportCommitResult,
  DataImportDatasetInfo,
  DataImportDuplicateMode,
  DataImportHistoryItem,
  DataImportMapping,
  DataImportPreview,
  DataImportPreviewRow,
  DataImportRowAction,
  DataImportType,
} from "@/types/data-import";

const DUPLICATE_MODES: {
  value: DataImportDuplicateMode;
  label: string;
  helper: string;
}[] = [
  {
    value: "UPDATE",
    label: "อัปเดตทับของเดิม",
    helper: "แถวที่ตรงกับข้อมูลเดิมจะถูกเขียนทับด้วยค่าจากไฟล์",
  },
  {
    value: "SKIP",
    label: "ข้ามของที่มีอยู่แล้ว",
    helper: "เพิ่มเฉพาะรายการใหม่ ของเดิมไม่ถูกแตะต้อง",
  },
  {
    value: "ERROR",
    label: "แจ้งเตือนว่าซ้ำ",
    helper: "ถ้าเจอของเดิมจะขึ้นเป็นแถวผิดพลาด ให้ตัดสินใจก่อน",
  },
];

const ACTION_LABEL: Record<DataImportRowAction, string> = {
  CREATE: "เพิ่มใหม่",
  UPDATE: "อัปเดต",
  SKIP: "ข้าม",
  ERROR: "ผิดพลาด",
};

const ACTION_TONE: Record<DataImportRowAction, Tone> = {
  CREATE: "positive",
  UPDATE: "brand",
  SKIP: "neutral",
  ERROR: "critical",
};

const STATUS_TONE: Record<string, Tone> = {
  ANALYZED: "warning",
  COMMITTED: "positive",
  FAILED: "critical",
  CANCELLED: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  ANALYZED: "รอยืนยัน",
  COMMITTED: "นำเข้าแล้ว",
  FAILED: "ไม่สำเร็จ",
  CANCELLED: "ยกเลิกแล้ว",
};

const TILE_BOX =
  "grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-[repeat(5,minmax(9rem,max-content))] sm:divide-y-0";

function count(value: number) {
  return value.toLocaleString("th-TH");
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function DataImportPanel() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [datasets, setDatasets] = useState<DataImportDatasetInfo[]>([]);
  const [type, setType] = useState<DataImportType>("EMPLOYEE");
  const [duplicateMode, setDuplicateMode] =
    useState<DataImportDuplicateMode>("UPDATE");
  const [file, setFile] = useState<File | null>(null);

  const [preview, setPreview] = useState<DataImportPreview | null>(null);
  const [mapping, setMapping] = useState<DataImportMapping>({});
  const [mappingDirty, setMappingDirty] = useState(false);
  const [commitResult, setCommitResult] =
    useState<DataImportCommitResult | null>(null);

  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [committing, setCommitting] = useState(false);

  const [history, setHistory] = useState<DataImportHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(
    null,
  );

  const activeDataset = useMemo(
    () => datasets.find((dataset) => dataset.type === type) ?? null,
    [datasets, type],
  );

  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      setHistoryError(null);
      const response = await getDataImports({ page: 1, pageSize: 20 });
      setHistory(response.items ?? []);
    } catch (error) {
      const message = getErrorMessage(
        error,
        "โหลดประวัติการนำเข้าข้อมูลไม่สำเร็จ",
      );
      setHistoryError(message);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    async function loadDatasets() {
      try {
        const items = await getDataImportDatasets();
        setDatasets(items);

        if (items.length > 0) {
          setType((current) =>
            items.some((item) => item.type === current) ? current : items[0].type,
          );
        }
      } catch (error) {
        toast.error(getErrorMessage(error, "โหลดรายการชนิดข้อมูลไม่สำเร็จ"));
      }
    }

    void loadDatasets();
    // โหลดครั้งแรกครั้งเดียว การรีเฟรชรอบถัดไปสั่งจากปุ่มหรือหลังนำเข้าเสร็จ
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadHistory();
  }, [loadHistory]);

  function resetWorkspace() {
    setPreview(null);
    setMapping({});
    setMappingDirty(false);
    setCommitResult(null);
    setFile(null);

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleUpload() {
    if (!file) {
      toast.error("กรุณาเลือกไฟล์ Excel ก่อน");
      return;
    }

    try {
      setUploading(true);
      setCommitResult(null);

      const result = await uploadDataImport({ type, duplicateMode, file });

      setPreview(result);
      setMapping(result.mapping);
      setMappingDirty(false);

      if (result.missingFields.length > 0) {
        toast.warning(
          `อ่านไฟล์แล้ว แต่ยังหาคอลัมน์ ${result.missingFields.join(", ")} ไม่เจอ กรุณาเลือกเอง`,
        );
      } else {
        toast.success(
          `อ่านไฟล์เรียบร้อย พบข้อมูล ${count(result.summary.total)} แถว`,
        );
      }
      void loadHistory();
    } catch (error) {
      toast.error(getErrorMessage(error, "อ่านไฟล์ไม่สำเร็จ"));
    } finally {
      setUploading(false);
    }
  }

  async function refreshPreview(
    nextMapping: DataImportMapping,
    nextDuplicateMode: DataImportDuplicateMode,
  ) {
    if (!preview) return;

    try {
      setRefreshing(true);
      const result = await previewDataImport(preview.import.id, {
        mapping: nextMapping,
        duplicateMode: nextDuplicateMode,
      });

      setPreview(result);
      setMapping(result.mapping);
      setMappingDirty(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "ตรวจข้อมูลใหม่ไม่สำเร็จ"));
    } finally {
      setRefreshing(false);
    }
  }

  function handleMappingChange(fieldKey: string, rawValue: string) {
    setMapping((current) => ({
      ...current,
      [fieldKey]: rawValue ? Number(rawValue) : null,
    }));
    setMappingDirty(true);
  }

  function handleDuplicateModeChange(next: DataImportDuplicateMode) {
    setDuplicateMode(next);

    /* ไฟล์ที่อ่านไว้แล้วต้องตรวจใหม่ทันที ไม่งั้นพรีวิวจะไม่ตรงกับที่จะเขียนจริง */
    if (preview) void refreshPreview(mapping, next);
  }

  function handleCommit() {
    if (!preview) return;

    if (preview.missingFields.length > 0) {
      toast.error(
        `ยังจับคู่คอลัมน์ที่จำเป็นไม่ครบ: ${preview.missingFields.join(", ")}`,
      );
      return;
    }

    const { summary } = preview;
    const writable = summary.create + summary.update;

    if (writable === 0) {
      toast.error("ไม่มีแถวที่นำเข้าได้ กรุณาแก้ไฟล์หรือการจับคู่คอลัมน์ก่อน");
      return;
    }

    setActionDialog({
      title: "ยืนยันนำเข้าข้อมูล",
      description: `ระบบจะเพิ่มใหม่ ${count(summary.create)} รายการ และอัปเดต ${count(
        summary.update,
      )} รายการ${
        summary.error > 0
          ? ` ส่วนอีก ${count(summary.error)} แถวที่ผิดพลาดจะถูกข้ามไป`
          : ""
      }`,
      confirmLabel: "ยืนยันนำเข้า",
      cancelLabel: "กลับไปตรวจก่อน",
      tone: "blue",
      onConfirm: async () => {
        try {
          setCommitting(true);
          const result = await commitDataImport(preview.import.id, {
            mapping,
            duplicateMode,
          });

          setCommitResult(result);
          setPreview(null);
          setFile(null);
          if (fileInputRef.current) fileInputRef.current.value = "";

          toast.success(
            `นำเข้าเรียบร้อย เพิ่มใหม่ ${count(result.result.created)} อัปเดต ${count(
              result.result.updated,
            )} รายการ`,
          );
          void loadHistory();
        } finally {
          setCommitting(false);
        }
      },
    });
  }

  function handleDiscard() {
    if (!preview) return;

    setActionDialog({
      title: "ทิ้งไฟล์ที่อ่านไว้",
      description:
        "ระบบจะลบไฟล์ที่อัปโหลดไว้ออกโดยยังไม่เขียนข้อมูลใด ๆ ลงระบบ",
      confirmLabel: "ทิ้งไฟล์นี้",
      cancelLabel: "กลับไป",
      tone: "red",
      onConfirm: async () => {
        await cancelDataImport(preview.import.id);
        resetWorkspace();
        toast.success("ทิ้งไฟล์ที่อ่านไว้แล้ว");
        void loadHistory();
      },
    });
  }

  const previewColumns: Array<Column<DataImportPreviewRow>> = [
    {
      key: "rowNo",
      header: "แถวที่",
      width: "5rem",
      cell: (row) => (
        <span className="tabular-nums text-slate-500">{row.rowNo}</span>
      ),
    },
    {
      key: "key",
      header: "รหัส",
      width: "8rem",
      cell: (row) => (
        <span className="font-semibold text-slate-800">{row.key || "—"}</span>
      ),
    },
    {
      key: "title",
      header: "รายการ",
      cell: (row) => <span className="text-slate-700">{row.title}</span>,
    },
    {
      key: "action",
      header: "ผลลัพธ์",
      width: "7rem",
      cell: (row) => (
        <Badge tone={ACTION_TONE[row.action]}>{ACTION_LABEL[row.action]}</Badge>
      ),
    },
    {
      key: "messages",
      header: "หมายเหตุ",
      cell: (row) => {
        if (row.errors.length === 0 && row.warnings.length === 0) {
          return <span className="text-slate-300">—</span>;
        }

        return (
          <div className="space-y-1">
            {row.errors.map((message) => (
              <p key={message} className="text-[12.5px] text-rose-600">
                {message}
              </p>
            ))}
            {row.warnings.map((message) => (
              <p key={message} className="text-[12.5px] text-amber-600">
                {message}
              </p>
            ))}
          </div>
        );
      },
    },
  ];

  const historyColumns: Array<Column<DataImportHistoryItem>> = [
    {
      key: "createdAt",
      header: "เวลา",
      width: "12rem",
      cell: (row) => (
        <span className="text-slate-600">{formatThaiDateTime(row.createdAt)}</span>
      ),
    },
    {
      key: "fileName",
      header: "ไฟล์",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-800">{row.fileName}</p>
          <p className="text-[12px] text-slate-400">
            {datasets.find((dataset) => dataset.type === row.type)?.label ??
              row.type}
            {row.sheetName ? ` · ชีต ${row.sheetName}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "สถานะ",
      width: "8rem",
      cell: (row) => (
        <Badge tone={STATUS_TONE[row.status] ?? "neutral"}>
          {STATUS_LABEL[row.status] ?? row.status}
        </Badge>
      ),
    },
    {
      key: "result",
      header: "ผลลัพธ์",
      width: "16rem",
      cell: (row) => (
        <span className="text-[12.5px] text-slate-600">
          เพิ่มใหม่ {count(row.createdRows)} · อัปเดต {count(row.updatedRows)} ·
          ข้าม {count(row.skippedRows)} · ผิดพลาด {count(row.errorRows)}
        </span>
      ),
    },
    {
      key: "createdBy",
      header: "ผู้นำเข้า",
      width: "12rem",
      hideBelow: "lg",
      cell: (row) => (
        <span className="text-slate-600">
          {row.createdBy?.displayName || row.createdBy?.email || "—"}
        </span>
      ),
    },
  ];

  return (
    <>
      <Section
        title="เลือกไฟล์ที่จะนำเข้า"
        description="รองรับไฟล์รายงานจากระบบเดิมโดยตรง ระบบจะหาแถวหัวตารางและจับคู่คอลัมน์ให้อัตโนมัติ แล้วให้ตรวจก่อนยืนยันเสมอ"
      >
        <FieldGrid columns={3}>
          <Field label="ชนิดข้อมูล" required hint={activeDataset?.description}>
            <Select
              value={type}
              onChange={(event) => {
                setType(event.target.value as DataImportType);
                resetWorkspace();
              }}
              disabled={uploading || Boolean(preview)}
            >
              {datasets.map((dataset) => (
                <option key={dataset.type} value={dataset.type}>
                  {dataset.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="ถ้าข้อมูลซ้ำกับของเดิม"
            required
            hint={
              DUPLICATE_MODES.find((mode) => mode.value === duplicateMode)
                ?.helper
            }
          >
            <Select
              value={duplicateMode}
              onChange={(event) =>
                handleDuplicateModeChange(
                  event.target.value as DataImportDuplicateMode,
                )
              }
              disabled={uploading || refreshing}
            >
              {DUPLICATE_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="ไฟล์ Excel" required hint="รองรับ .xlsx และ .xls ไม่เกิน 15 MB">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              disabled={uploading || Boolean(preview)}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="block w-full text-[13px] text-slate-600 file:mr-3 file:h-9 file:cursor-pointer file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:text-[13px] file:font-semibold file:text-white hover:file:bg-brand-700"
            />
          </Field>
        </FieldGrid>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            onClick={() => void handleUpload()}
            loading={uploading}
            disabled={!file || Boolean(preview)}
            icon={<Upload className="h-3.5 w-3.5" />}
          >
            อ่านไฟล์และตรวจข้อมูล
          </Button>

          {preview ? (
            <Button
              variant="danger"
              onClick={handleDiscard}
              icon={<Trash2 className="h-3.5 w-3.5" />}
            >
              ทิ้งไฟล์นี้
            </Button>
          ) : null}
        </div>
      </Section>

      {commitResult ? (
        <Section title="ผลการนำเข้าครั้งล่าสุด">
          <Notice
            tone={commitResult.result.failed > 0 ? "warning" : "positive"}
            icon={
              commitResult.result.failed > 0 ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )
            }
          >
            <p className="font-semibold">
              นำเข้าไฟล์ {commitResult.import.fileName} เรียบร้อย
            </p>
            <p className="mt-0.5">
              เพิ่มใหม่ {count(commitResult.result.created)} · อัปเดต{" "}
              {count(commitResult.result.updated)} · ข้าม{" "}
              {count(commitResult.result.skipped)} · ผิดพลาด{" "}
              {count(commitResult.result.failed)} รายการ
            </p>
          </Notice>

          {commitResult.result.errors.length > 0 ? (
            <div className="mt-3 space-y-1 rounded-lg border border-rose-100 bg-rose-50/60 px-4 py-3">
              {commitResult.result.errors.slice(0, 20).map((rowError) => (
                <p
                  key={`${rowError.rowNo}-${rowError.key}`}
                  className="text-[12.5px] text-rose-700"
                >
                  แถวที่ {rowError.rowNo} ({rowError.key || "ไม่มีรหัส"}):{" "}
                  {rowError.message}
                </p>
              ))}
              {commitResult.result.errors.length > 20 ? (
                <p className="text-[12px] text-rose-500">
                  และอีก {count(commitResult.result.errors.length - 20)} แถว
                </p>
              ) : null}
            </div>
          ) : null}
        </Section>
      ) : null}

      {preview ? (
        <>
          <Section
            title="สรุปสิ่งที่จะเกิดขึ้น"
            description={`ไฟล์ ${preview.import.fileName}${
              preview.import.sheetName ? ` · ชีต ${preview.import.sheetName}` : ""
            }${
              preview.import.headerRowNo
                ? ` · หัวตารางอยู่แถวที่ ${preview.import.headerRowNo}`
                : ""
            }`}
            actions={
              <Button
                variant="primary"
                onClick={handleCommit}
                loading={committing}
                disabled={
                  refreshing ||
                  mappingDirty ||
                  preview.missingFields.length > 0
                }
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              >
                ยืนยันนำเข้า
              </Button>
            }
          >
            <div className={TILE_BOX}>
              <StatTile label="ทั้งหมด" value={count(preview.summary.total)} />
              <StatTile
                label="เพิ่มใหม่"
                value={count(preview.summary.create)}
                tone="positive"
              />
              <StatTile label="อัปเดต" value={count(preview.summary.update)} />
              <StatTile
                label="ข้าม"
                value={count(preview.summary.skip)}
                helper="ตามวิธีจัดการข้อมูลซ้ำ"
              />
              <StatTile
                label="ผิดพลาด"
                value={count(preview.summary.error)}
                tone={preview.summary.error > 0 ? "warning" : "neutral"}
                helper="แถวเหล่านี้จะถูกข้าม"
              />
            </div>

            {preview.missingFields.length > 0 ? (
              <Notice tone="critical" icon={<AlertTriangle className="h-4 w-4" />}>
                <p className="font-semibold">
                  ยังหาคอลัมน์ที่จำเป็นไม่เจอ: {preview.missingFields.join(", ")}
                </p>
                <p className="mt-0.5">
                  เลือกคอลัมน์ให้ครบในหัวข้อ &quot;จับคู่คอลัมน์&quot; ด้านล่าง
                  แล้วกด &quot;ตรวจข้อมูลใหม่&quot;
                </p>
              </Notice>
            ) : null}

            {mappingDirty ? (
              <Notice tone="warning" icon={<AlertTriangle className="h-4 w-4" />}>
                แก้การจับคู่คอลัมน์แล้ว กด &quot;ตรวจข้อมูลใหม่&quot;
                ก่อนจึงจะยืนยันนำเข้าได้
              </Notice>
            ) : null}
          </Section>

          <Section
            title="จับคู่คอลัมน์"
            description="ระบบเดาให้จากหัวคอลัมน์ในไฟล์ ถ้าเดาผิดให้เลือกคอลัมน์ที่ถูกต้องเอง"
            actions={
              <Button
                variant="secondary"
                onClick={() => void refreshPreview(mapping, duplicateMode)}
                loading={refreshing}
                icon={<RefreshCw className="h-3.5 w-3.5" />}
              >
                ตรวจข้อมูลใหม่
              </Button>
            }
          >
            <FieldGrid columns={3}>
              {preview.fields.map((field) => (
                <Field
                  key={field.key}
                  label={field.label}
                  required={field.required}
                  hint={field.hint}
                >
                  <Select
                    value={mapping[field.key] ?? ""}
                    onChange={(event) =>
                      handleMappingChange(field.key, event.target.value)
                    }
                  >
                    <option value="">— ไม่ใช้ —</option>
                    {preview.columns.map((column) => (
                      <option key={column.index} value={column.index}>
                        {column.index}. {column.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </FieldGrid>
          </Section>

          <Section
            title="ตรวจรายแถว"
            description={
              preview.rowsTruncated
                ? `แสดง ${count(preview.rows.length)} แถวแรกจากทั้งหมด ${count(
                    preview.summary.total,
                  )} แถว`
                : undefined
            }
          >
            <DataTable
              columns={previewColumns}
              rows={preview.rows}
              rowKey={(row) => String(row.rowNo)}
              loading={refreshing}
              emptyTitle="ไม่พบแถวข้อมูลในไฟล์"
              emptyDescription="ลองตรวจว่าจับคู่คอลัมน์รหัสถูกต้องหรือยัง"
              minWidth="min-w-[52rem]"
            />
          </Section>
        </>
      ) : null}

      <Section
        title="ประวัติการนำเข้า"
        description="ย้อนดูได้ว่าใครนำเข้าไฟล์ไหน และผลออกมาอย่างไร"
        actions={
          <Button
            variant="ghost"
            onClick={() => void loadHistory()}
            icon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            โหลดใหม่
          </Button>
        }
      >
        <DataTable
          columns={historyColumns}
          rows={history}
          rowKey={(row) => row.id}
          loading={historyLoading}
          error={historyError}
          onRetry={() => void loadHistory()}
          emptyTitle="ยังไม่เคยนำเข้าข้อมูล"
          emptyDescription="ไฟล์ที่นำเข้าจะถูกบันทึกไว้ที่นี่"
          emptyAction={<FileSpreadsheet className="h-5 w-5 text-slate-300" />}
          minWidth="min-w-[52rem]"
        />
      </Section>

      <ActionDialog
        state={actionDialog}
        onClose={() => setActionDialog(null)}
      />
    </>
  );
}
