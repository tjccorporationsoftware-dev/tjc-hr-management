"use client";

import { Download, ExternalLink, FileText, Plus, Trash2 } from "lucide-react";

import { Button, DataTable, RowMenu, type Column } from "@/components/kit";
import { StatusBadge } from "@/components/ui/status-badge";
import type { EmployeeDocumentItem } from "@/types/employee";

import {
  DOCUMENT_STATUS_VOCABULARY,
  dateText,
  documentTypeText,
} from "./employee-format";

/**
 * เอกสารพนักงาน
 * -------------
 * เดิมท้ายแถวมีปุ่มสามปุ่มเรียงกัน (เปิด/ดาวน์โหลด/ลบ) กินความกว้างไปหนึ่งคอลัมน์เต็ม ๆ
 * ย้ายมาอยู่ในเมนูสามจุดของ kit แล้วให้คลิกทั้งแถวเพื่อเปิดไฟล์แทน
 */

function fileSizeText(size: number | null) {
  if (!size) return null;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

export function DocumentsTab({
  documents,
  onOpen,
  onDownload,
  onDelete,
  onAdd,
}: {
  documents: EmployeeDocumentItem[];
  onOpen: (document: EmployeeDocumentItem) => void;
  onDownload: (document: EmployeeDocumentItem) => void;
  onDelete: (document: EmployeeDocumentItem) => void;
  onAdd: () => void;
}) {
  const columns: Array<Column<EmployeeDocumentItem>> = [
    {
      key: "title",
      header: "เอกสาร",
      cell: (item) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{item.title}</p>
          {item.description ? (
            <p className="truncate text-[11px] text-slate-400 3xl:text-[12px]">
              {item.description}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "type",
      header: "ประเภท",
      width: "w-52",
      hideBelow: "lg",
      cell: (item) => (
        <span className="text-slate-700">{documentTypeText(item.type)}</span>
      ),
    },
    {
      key: "file",
      header: "ไฟล์",
      width: "w-64",
      hideBelow: "xl",
      cell: (item) => (
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-slate-300" />
          <div className="min-w-0">
            <p className="truncate text-slate-700">{item.fileName}</p>
            {fileSizeText(item.fileSize) ? (
              <p className="text-[11px] tabular-nums text-slate-400 3xl:text-[12px]">
                {fileSizeText(item.fileSize)}
              </p>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: "issuedDate",
      header: "วันที่ออก",
      width: "w-36",
      hideBelow: "lg",
      cell: (item) => (
        <span className="tabular-nums text-slate-600">
          {dateText(item.issuedDate)}
        </span>
      ),
    },
    {
      key: "status",
      header: "สถานะ",
      width: "w-32",
      cell: (item) => (
        <StatusBadge
          vocabulary={DOCUMENT_STATUS_VOCABULARY}
          status={item.status}
        />
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "w-16",
      cell: (item) => (
        <RowMenu
          items={[
            {
              label: "เปิดไฟล์",
              icon: <ExternalLink className="h-4 w-4" />,
              onSelect: () => onOpen(item),
            },
            {
              label: "ดาวน์โหลด",
              icon: <Download className="h-4 w-4" />,
              onSelect: () => onDownload(item),
            },
            {
              label: "ลบเอกสาร",
              icon: <Trash2 className="h-4 w-4" />,
              tone: "danger",
              separated: true,
              onSelect: () => onDelete(item),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 sm:px-6 3xl:px-7">
        <p className="text-[12px] text-slate-500 3xl:text-[13px]">
          เอกสารแนบของพนักงาน {documents.length.toLocaleString("th-TH")} รายการ
        </p>
        <Button
          variant="primary"
          size="sm"
          icon={<Plus className="h-3.5 w-3.5" />}
          onClick={onAdd}
        >
          เพิ่มเอกสาร
        </Button>
      </div>

      <div className="[&_thead]:bg-white [&_thead_th]:border-slate-300 [&_thead_th]:font-semibold [&_thead_th]:text-slate-600">
        <DataTable
          columns={columns}
          rows={documents}
          rowKey={(item) => item.id}
          onRowClick={onOpen}
          emptyTitle="ยังไม่มีเอกสารพนักงาน"
          emptyDescription="แนบสัญญาจ้าง สำเนาบัตรประชาชน หรือเอกสารอื่นได้จากปุ่มเพิ่มเอกสาร"
          minWidth="min-w-[56rem]"
        />
      </div>
    </div>
  );
}
