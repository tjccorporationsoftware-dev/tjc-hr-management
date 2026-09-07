"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";

import { Badge, Button, Modal, Notice } from "@/components/kit";

import type { CatalogContext, CatalogDocument } from "./document-catalog";
import { getErrorMessage } from "./report-utils";

/**
 * ดูตัวอย่างเอกสารก่อนโหลด
 * ------------------------
 * ยิงเส้นเดียวกับตอนดาวน์โหลดจริง แล้วอ่านเนื้อไฟล์มาแสดงแทนที่จะเซฟลงเครื่อง
 * — ไม่ได้ทำ endpoint ตัวอย่างแยก เพราะถ้าแยกเมื่อไหร่จะมีวันที่ตัวอย่าง
 * ไม่ตรงกับไฟล์จริง ซึ่งอันตรายกว่าไม่มีตัวอย่างเลย
 *
 * ไฟล์นำส่งราชการ/ธนาคารพลาดไม่ได้ ต้องเห็นก่อนว่าคอลัมน์ครบและยอดสมเหตุสมผล
 */

/** อ่านมาแค่นี้พอ — ไฟล์จริงเป็นพันแถว ตัวอย่างมีไว้ดูว่าหน้าตาถูกไหม */
const PREVIEW_ROWS = 30;

/** แยกบรรทัด CSV โดยเคารพเครื่องหมายคำพูด (ชื่อคนไทยมีจุลภาคได้) */
function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      // "" ข้างในค่าที่ครอบด้วยคำพูด คือเครื่องหมายคำพูดตัวจริงหนึ่งตัว
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function parseCsv(text: string) {
  const lines = text
    // BOM ที่ Excel ต้องการ ถ้าไม่ตัดจะติดไปกับหัวคอลัมน์แรก
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  return {
    header: lines[0] ? splitCsvLine(lines[0]) : [],
    rows: lines.slice(1, PREVIEW_ROWS + 1).map(splitCsvLine),
    totalRows: Math.max(lines.length - 1, 0),
  };
}

type PreviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "csv";
      header: string[];
      rows: string[][];
      totalRows: number;
      size: number;
    }
  | { status: "text"; lines: string[]; totalLines: number; size: number }
  | { status: "pdf"; url: string; size: number };

function sizeText(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) {
    return `${(size / 1024).toLocaleString("th-TH", { maximumFractionDigits: 1 })} KB`;
  }
  return `${(size / 1024 / 1024).toLocaleString("th-TH", { maximumFractionDigits: 2 })} MB`;
}

export function CatalogPreviewModal({
  document: doc,
  context,
  onClose,
  onDownload,
}: {
  document: CatalogDocument;
  context: CatalogContext;
  onClose: () => void;
  onDownload: () => void;
}) {
  const [state, setState] = useState<PreviewState>({ status: "loading" });

  useEffect(() => {
    let objectUrl = "";
    let cancelled = false;

    async function load() {
      try {
        const blob = await doc.fetchFile?.(context);
        if (!blob || cancelled) return;

        if (doc.preview === "pdf") {
          objectUrl = window.URL.createObjectURL(blob);
          setState({ status: "pdf", url: objectUrl, size: blob.size });
          return;
        }

        const text = await blob.text();
        if (cancelled) return;

        if (doc.preview === "table") {
          const parsed = parseCsv(text);
          setState({ status: "csv", ...parsed, size: blob.size });
          return;
        }

        const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
        setState({
          status: "text",
          lines: lines.slice(0, PREVIEW_ROWS),
          totalLines: lines.length,
          size: blob.size,
        });
      } catch (error) {
        if (cancelled) return;
        setState({
          status: "error",
          message: getErrorMessage(error, "ดึงตัวอย่างไม่สำเร็จ"),
        });
      }
    }

    // เลื่อนไป tick ถัดไป ไม่ให้ setState ชนกับรอบ render แรกของกล่อง
    const timer = window.setTimeout(() => void load(), 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.key]);

  const shownRows =
    state.status === "csv"
      ? state.rows.length
      : state.status === "text"
        ? state.lines.length
        : 0;
  const totalRows =
    state.status === "csv"
      ? state.totalRows
      : state.status === "text"
        ? state.totalLines
        : 0;

  return (
    <Modal
      open
      title={doc.name}
      description={`ตัวอย่างก่อนดาวน์โหลด · ${doc.format}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            ปิด
          </Button>
          <Button
            variant="primary"
            icon={<Download className="h-3.5 w-3.5" />}
            onClick={onDownload}
          >
            {doc.reportCode ? "สั่งสร้างไฟล์" : "ดาวน์โหลดไฟล์นี้"}
          </Button>
        </>
      }
      onClose={onClose}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-slate-200 pb-3">
        <Badge tone="neutral">{doc.format}</Badge>
        <span className="text-[12px] text-slate-500 3xl:text-[13px]">
          {doc.fileName?.(context) ?? "-"}
        </span>
        {state.status !== "loading" && state.status !== "error" ? (
          <span className="ml-auto text-[12px] text-slate-400 3xl:text-[13px]">
            {/* รายงานที่ยังไม่สร้างไฟล์ไม่มีขนาดให้บอก จึงข้ามไปบอกจำนวนแถวแทน */}
            {state.size > 0 ? sizeText(state.size) : null}
            {totalRows
              ? `${state.size > 0 ? " · " : ""}แสดง ${shownRows.toLocaleString("th-TH")} จาก ${totalRows.toLocaleString("th-TH")} แถว`
              : ""}
          </span>
        ) : null}
      </div>

      {state.status === "loading" ? (
        <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          กำลังดึงตัวอย่าง…
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="pt-4">
          <Notice tone="critical">{state.message}</Notice>
        </div>
      ) : null}

      {state.status === "csv" ? (
        state.header.length ? (
          <div className="mt-3 overflow-auto rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-[12px] 3xl:text-[13px]">
              <thead>
                <tr>
                  {state.header.map((cell, index) => (
                    <th
                      key={`${cell}-${index}`}
                      scope="col"
                      className="whitespace-nowrap border-b border-slate-300 bg-slate-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600"
                    >
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.rows.map((row, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className="border-b border-slate-100 last:border-b-0"
                  >
                    {state.header.map((_, cellIndex) => (
                      <td
                        key={cellIndex}
                        className="whitespace-nowrap px-3 py-1.5 text-slate-700 tabular-nums"
                      >
                        {row[cellIndex] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-16 text-center text-[13px] text-slate-400">
            ไฟล์นี้ยังไม่มีข้อมูล
          </p>
        )
      ) : null}

      {state.status === "text" ? (
        <pre className="mt-3 max-h-[55vh] overflow-auto rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-[12px] leading-5 text-slate-700">
          {state.lines.join("\n") || "ไฟล์นี้ยังไม่มีข้อมูล"}
        </pre>
      ) : null}

      {state.status === "pdf" ? (
        <iframe
          src={state.url}
          title={doc.name}
          className="mt-3 h-[60vh] w-full rounded-xl border border-slate-200"
        />
      ) : null}
    </Modal>
  );
}
