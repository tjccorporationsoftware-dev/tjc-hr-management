"use client";

import { useEffect, useState } from "react";
import {
  Download,
  FileText,
  Image as ImageIcon,
  ImageOff,
  Loader2,
  X,
  ZoomIn,
} from "lucide-react";

import { joinClassName } from "@/components/kit";
import { getPublicFileUrl, previewApprovalAttachment } from "@/lib/api";
import type { ApprovalItem } from "@/types/approvals";

/**
 * รับแค่สามฟิลด์ที่ใช้จริง ไม่ใช่ ApprovalItem ทั้งก้อน
 * แท็บประวัติมีข้อมูลคนละรูปกับศูนย์อนุมัติ แต่ประกอบสามฟิลด์นี้ขึ้นมาได้
 */
export type AttachmentSource = Pick<ApprovalItem, "id" | "type" | "detail">;

/**
 * หลักฐานที่พนักงานแนบมากับคำขอ
 * ============================
 * เดิมโมดัลอนุมัติไม่แสดงไฟล์แนบเลย ทั้งที่หลังบ้านเก็บและส่งรายการมาให้แล้ว
 * ผลคือ HR ต้องอนุมัติใบลาป่วยโดยไม่เห็นใบรับรองแพทย์ หรืออนุมัติ OT
 * โดยไม่เห็นหลักฐาน — ซึ่งเป็นเหตุผลเดียวที่ต้องแนบไฟล์ตั้งแต่แรก
 *
 * ไฟล์ต้องโหลดผ่าน token จึงชี้ <img src> ตรง ๆ ไม่ได้ ต้องดึงเป็น blob ก่อน
 * แล้วค่อยแปลงเป็น object URL — และต้องคืนหน่วยความจำเมื่อปิดโมดัล
 */

type AttachmentMeta = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number | null;
};

type LoadedAttachment = AttachmentMeta & {
  /** ว่างระหว่างกำลังโหลด หรือเมื่อโหลดไม่สำเร็จ */
  objectUrl: string;
  error: string;
};

/** ชนิดที่ preview ได้ในตัวโมดัล ที่เหลือให้กดเปิดในแท็บใหม่แทน */
const isImage = (mimeType: string) => mimeType.startsWith("image/");

function formatFileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * ดึงรายการไฟล์ออกจาก `detail` ซึ่งเป็น Record<string, unknown>
 * โครงต่างกันตามประเภทคำขอ — สามประเภทแรกเก็บเป็นตาราง attachments
 * ส่วนคำขอทำงานนอกสถานที่เก็บเป็น URL เดี่ยวที่เปิดตรงได้ไม่ต้องใช้ token
 */
function readAttachments(item: AttachmentSource): AttachmentMeta[] {
  const raw = item.detail?.attachments;
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== "string") return [];

    return [
      {
        id: row.id,
        fileName:
          (typeof row.fileName === "string" && row.fileName) ||
          (typeof row.title === "string" && row.title) ||
          "ไฟล์แนบ",
        mimeType: typeof row.mimeType === "string" ? row.mimeType : "",
        fileSize: typeof row.fileSize === "number" ? row.fileSize : null,
      },
    ];
  });
}

/**
 * `variant`
 * - `chip` (ค่าตั้งต้น) ใช้ในรายการที่มีหลายใบต่อหน้า — ย่อเป็นชิป กดแล้วค่อยเปิดรูป
 * - `preview` ใช้ในป๊อปอัพที่ดูทีละใบ — แสดงรูปเลย กดที่รูปเพื่อดูเต็มจอ
 */
export function ApprovalAttachments({
  item,
  variant = "chip",
}: {
  item: AttachmentSource;
  variant?: "chip" | "preview";
}) {
  const [files, setFiles] = useState<LoadedAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [zoomed, setZoomed] = useState<LoadedAttachment | null>(null);

  /* คำขอทำงานนอกสถานที่เก็บเป็น URL ตรง ไม่ได้อยู่ในตาราง attachments */
  const offsiteUrl =
    item.type === "OFFSITE" && typeof item.detail?.attachmentUrl === "string"
      ? getPublicFileUrl(item.detail.attachmentUrl)
      : "";

  useEffect(() => {
    const metas = readAttachments(item);
    if (!metas.length) return;

    /*
     * เก็บ URL ที่สร้างไว้ในตัวแปรของ effect ไม่ใช่อ่านจาก state ตอน cleanup
     * เพราะ cleanup จะเห็น state ของรอบที่มันผูกอยู่ ไม่ใช่ค่าล่าสุด
     */
    const created: string[] = [];
    let cancelled = false;

    void (async () => {
      setLoading(true);

      const loaded = await Promise.all(
        metas.map(async (meta): Promise<LoadedAttachment> => {
          /* ประเภทที่ไม่มีปลายทางให้โหลด — ไม่ต้องยิงให้เสียเที่ยว */
          if (
            item.type !== "LEAVE" &&
            item.type !== "OVERTIME" &&
            item.type !== "TIME_ADJUST"
          ) {
            return { ...meta, objectUrl: "", error: "ไม่รองรับการเปิดดู" };
          }

          try {
            const preview = await previewApprovalAttachment(
              item.type,
              item.id,
              meta.id,
              meta.fileName,
            );
            created.push(preview.objectUrl);
            return {
              ...meta,
              objectUrl: preview.objectUrl,
              /* บางไฟล์ไม่ได้บันทึก mimeType ไว้ ใช้ค่าที่ตอบกลับมาแทน */
              mimeType: meta.mimeType || preview.contentType,
              error: "",
            };
          } catch (error) {
            return {
              ...meta,
              objectUrl: "",
              error: error instanceof Error ? error.message : "เปิดไฟล์ไม่สำเร็จ",
            };
          }
        }),
      );

      if (!cancelled) {
        setFiles(loaded);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      created.forEach((url) => window.URL.revokeObjectURL(url));
    };
  }, [item]);

  const total = files.length || readAttachments(item).length;
  if (!total && !offsiteUrl) return null;

  return (
    <section className="min-w-0">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        หลักฐานแนบ{total ? ` · ${total}` : ""}
      </p>

      {loading ? (
        <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          กำลังโหลด
        </p>
      ) : null}

      <div className="mt-0.5 flex flex-wrap gap-2">
        {offsiteUrl ? (
          <AttachmentItem
            variant={variant}
            file={OFFSITE_FILE(offsiteUrl)}
            onZoom={() => setZoomed(OFFSITE_FILE(offsiteUrl))}
          />
        ) : null}

        {files.map((file) => (
          <AttachmentItem
            key={file.id}
            variant={variant}
            file={file}
            onZoom={() => setZoomed(file)}
          />
        ))}
      </div>

      {zoomed ? (
        <Lightbox file={zoomed} onClose={() => setZoomed(null)} />
      ) : null}
    </section>
  );
}

/** หลักฐานนอกสถานที่เก็บเป็น URL ตรง ไม่ได้อยู่ในตาราง attachments */
function OFFSITE_FILE(url: string): LoadedAttachment {
  return {
    id: "offsite",
    fileName: "หลักฐานนอกสถานที่",
    mimeType: "image/*",
    fileSize: null,
    objectUrl: url,
    error: "",
  };
}

function AttachmentItem({
  file,
  variant,
  onZoom,
}: {
  file: LoadedAttachment;
  variant: "chip" | "preview";
  onZoom: () => void;
}) {
  /* โหมดรูป ใช้ได้กับไฟล์ที่เป็นรูปและเปิดได้เท่านั้น ที่เหลือถอยไปเป็นชิป */
  if (variant === "preview" && !file.error && file.objectUrl && isImage(file.mimeType)) {
    return (
      <button
        type="button"
        onClick={onZoom}
        title={`เปิดดูเต็มจอ ${file.fileName}`}
        className="group relative overflow-hidden rounded-xl border border-slate-200 transition hover:border-brand-400"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={file.objectUrl}
          alt={file.fileName}
          className="max-h-64 w-auto max-w-full object-contain"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-slate-900/0 text-white opacity-0 transition group-hover:bg-slate-900/35 group-hover:opacity-100">
          <ZoomIn className="h-5 w-5" />
        </span>
      </button>
    );
  }

  return <AttachmentChip file={file} onZoom={onZoom} />;
}

/**
 * ไฟล์แนบหนึ่งชิ้น = ชิปเล็ก ๆ ไม่ใช่รูปย่อ
 * รูปย่อขนาดพอจะดูรู้เรื่องกินความสูงเกือบเท่าเนื้อใบทั้งใบ ทั้งที่ส่วนใหญ่
 * ผู้อนุมัติแค่กวาดตาผ่าน จะเปิดดูจริงเฉพาะบางใบ จึงย่อเหลือชิปแล้วกดเปิดเอา
 */
function AttachmentChip({
  file,
  onZoom,
}: {
  file: LoadedAttachment;
  onZoom: () => void;
}) {
  const size = formatFileSize(file.fileSize);

  const shell =
    "inline-flex max-w-[15rem] items-center gap-1.5 rounded-full border py-1 pl-1.5 pr-2.5 text-[11.5px] font-medium transition";

  /* เปิดไม่ได้ — บอกไปตรง ๆ ดีกว่าให้กดแล้วเงียบ */
  if (file.error || !file.objectUrl) {
    return (
      <span
        title={file.error}
        className={joinClassName(
          shell,
          "cursor-not-allowed border-dashed border-slate-200 text-slate-400",
        )}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100">
          <ImageOff className="h-3 w-3" />
        </span>
        <span className="truncate">{file.error || "เปิดไฟล์ไม่ได้"}</span>
      </span>
    );
  }

  /* ไฟล์ที่ไม่ใช่รูป (เช่น PDF) เปิดแท็บใหม่ ไม่ต้องผ่านตัวดูรูป */
  if (!isImage(file.mimeType)) {
    return (
      <a
        href={file.objectUrl}
        target="_blank"
        rel="noreferrer"
        title={file.fileName}
        className={joinClassName(
          shell,
          "border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:bg-brand-50/60 hover:text-brand-700",
        )}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <FileText className="h-3 w-3" />
        </span>
        <span className="truncate">{file.fileName}</span>
        {size ? (
          <span className="shrink-0 text-[10px] text-slate-400">{size}</span>
        ) : null}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onZoom}
      title={`เปิดดู ${file.fileName}`}
      className={joinClassName(
        shell,
        "border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:bg-brand-50/60 hover:text-brand-700",
      )}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <ImageIcon className="h-3 w-3" />
      </span>
      <span className="truncate">{file.fileName}</span>
      {size ? (
        <span className="shrink-0 text-[10px] text-slate-400">{size}</span>
      ) : null}
    </button>
  );
}

/**
 * ดูรูปเต็ม — ใบรับรองแพทย์ตัวหนังสือเล็ก ย่อเป็นรูปย่อแล้วอ่านไม่ออก
 * ไม่ใช้ `Modal` ของชุด kit เพราะตัวนั้นเป็นกล่องขาวมีหัวเรื่อง
 * ส่วนตัวนี้ต้องการพื้นมืดเต็มจอเพื่อให้สายตาอยู่ที่รูปอย่างเดียว
 */
function Lightbox({
  file,
  onClose,
}: {
  file: LoadedAttachment;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      /* z สูงกว่าโมดัลอนุมัติ (z-70) เพราะเปิดซ้อนบนนั้น */
      className="fixed inset-0 z-[130] flex flex-col bg-slate-950/85 p-4"
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-3 pb-3 text-white">
        <span className="truncate text-[13px] font-medium">
          {file.fileName}
          {file.fileSize ? (
            <span className="ml-2 font-normal text-white/60">
              {formatFileSize(file.fileSize)}
            </span>
          ) : null}
        </span>

        <span className="flex shrink-0 items-center gap-1">
          <a
            href={file.objectUrl}
            download={file.fileName}
            onClick={(event) => event.stopPropagation()}
            className={joinClassName(
              "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium",
              "text-white/80 transition hover:bg-white/10 hover:text-white",
            )}
          >
            <Download className="h-4 w-4" />
            ดาวน์โหลด
          </a>
          <button
            type="button"
            aria-label="ปิด"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </span>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={file.objectUrl}
        alt={file.fileName}
        onClick={(event) => event.stopPropagation()}
        className="min-h-0 flex-1 self-center object-contain"
      />
    </div>
  );
}
