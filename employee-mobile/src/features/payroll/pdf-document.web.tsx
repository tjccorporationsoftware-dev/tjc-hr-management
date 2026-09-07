import 'pdfjs-dist/legacy/build/pdf.worker.mjs';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  createElement,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';

const MIN_ZOOM = 0.75;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function touchDistance(touches: ReactTouchEvent<HTMLDivElement>['touches']) {
  const first = touches[0];
  const second = touches[1];
  if (!first || !second) return 0;
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

type Uint8ArrayWithToHex = Uint8Array & { toHex?: () => string };

/*
 * PDF.js 6 ใช้ Uint8Array.prototype.toHex ซึ่งเพิ่งมีใน Chrome รุ่นใหม่มาก
 * เติมเฉพาะ API มาตรฐานตัวนี้ให้ browser รุ่นที่แอปยังรองรับ แทนการปล่อยให้
 * เอกสารทั้งใบเปิดไม่ได้ด้วย `hashOriginal.toHex is not a function`.
 */
const byteArrayPrototype = Uint8Array.prototype as Uint8ArrayWithToHex;
if (typeof byteArrayPrototype.toHex !== 'function') {
  Object.defineProperty(byteArrayPrototype, 'toHex', {
    configurable: true,
    value(this: Uint8Array) {
      let result = '';
      for (const byte of this) {
        result += byte.toString(16).padStart(2, '0');
      }
      return result;
    },
    writable: true,
  });
}

export interface PdfDocumentProps {
  onError: (message: string) => void;
  onLoad: (pageCount: number) => void;
  onPageChange: (page: number, pageCount: number) => void;
  uri: string;
}

/**
 * Chrome บนมือถือและโหมดจำลองมือถือบล็อก PDF viewer ที่ฝังด้วย iframe
 * จึงเรนเดอร์แต่ละหน้าลง canvas ด้วย PDF.js โดยตรงแทน
 */
export function PdfDocument({
  onError,
  onLoad,
  onPageChange,
  uri,
}: PdfDocumentProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const reportError = useEffectEvent(onError);
  const reportLoad = useEffectEvent(onLoad);
  const reportPageChange = useEffectEvent(onPageChange);

  /*
   * ซิงก์ค่าซูมล่าสุดลง ref ใน effect ไม่ใช่ระหว่าง render
   *
   * ref ตัวนี้มีไว้ให้ตัวจับนิ้วอ่านค่าซูมล่าสุดตอน event วิ่ง (ไม่ใช่ค่าที่
   * ปิดทับไว้ตอนผูก listener) แต่การเขียน ref ระหว่าง render ทำให้ผลลัพธ์
   * ขึ้นกับจังหวะที่ React ตัดสินใจ render ซ้ำ — React Compiler จับได้ถูกแล้ว
   */
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    if (!container) return;

    for (const pageShell of container.querySelectorAll<HTMLElement>(
      '[data-pdf-page-shell]',
    )) {
      const baseWidth = Number(pageShell.dataset.baseWidth ?? 0);
      if (baseWidth > 0) pageShell.style.width = `${baseWidth * zoom}px`;

      const canvas = pageShell.querySelector<HTMLCanvasElement>('canvas');
      const baseHeight = Number(canvas?.dataset.baseHeight ?? 0);
      if (canvas && baseWidth > 0 && baseHeight > 0) {
        canvas.style.width = `${baseWidth * zoom}px`;
        canvas.style.height = `${baseHeight * zoom}px`;
      }
    }
  }, [container, zoom]);

  useEffect(() => {
    if (!container) return;

    let cancelled = false;
    let removeScrollListener = () => {};
    const loadingTask = getDocument({ url: uri });

    void loadingTask.promise
      .then(async (document) => {
        if (cancelled) return;

        container.replaceChildren();
        reportLoad(document.numPages);
        const availableWidth = Math.max(container.clientWidth - 24, 240);
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
          if (cancelled) return;

          const page = await document.getPage(pageNumber);
          const natural = page.getViewport({ scale: 1 });
          const cssScale = availableWidth / natural.width;
          const viewport = page.getViewport({ scale: cssScale * pixelRatio });
          const canvas = window.document.createElement('canvas');
          const pageShell = window.document.createElement('div');
          const currentZoom = zoomRef.current;
          const baseWidth = viewport.width / pixelRatio;
          const baseHeight = viewport.height / pixelRatio;

          canvas.dataset.page = String(pageNumber);
          canvas.dataset.baseHeight = String(baseHeight);
          canvas.height = Math.ceil(viewport.height);
          canvas.style.display = 'block';
          canvas.style.height = `${baseHeight * currentZoom}px`;
          canvas.style.width = `${baseWidth * currentZoom}px`;
          canvas.width = Math.ceil(viewport.width);

          pageShell.dataset.baseWidth = String(baseWidth);
          pageShell.dataset.pdfPageShell = String(pageNumber);
          pageShell.style.background = '#ffffff';
          pageShell.style.boxShadow = '0 3px 14px rgba(15, 23, 42, 0.12)';
          pageShell.style.margin = '12px auto';
          pageShell.style.width = `${baseWidth * currentZoom}px`;
          pageShell.appendChild(canvas);
          container.appendChild(pageShell);

          await page.render({ canvas, viewport }).promise;
        }

        const updateVisiblePage = () => {
          const canvases = Array.from(
            container.querySelectorAll<HTMLCanvasElement>('canvas[data-page]'),
          );
          if (canvases.length === 0) return;

          const viewportCenter = container.scrollTop + container.clientHeight / 2;
          let closest = canvases[0]!;
          let closestDistance = Number.POSITIVE_INFINITY;

          for (const canvas of canvases) {
            const center = canvas.offsetParent
              ? (canvas.offsetParent as HTMLElement).offsetTop + canvas.clientHeight / 2
              : canvas.offsetTop + canvas.clientHeight / 2;
            const distance = Math.abs(center - viewportCenter);
            if (distance < closestDistance) {
              closest = canvas;
              closestDistance = distance;
            }
          }

          reportPageChange(
            Number(closest.dataset.page ?? 1),
            document.numPages,
          );
        };

        container.addEventListener('scroll', updateVisiblePage, {
          passive: true,
        });
        removeScrollListener = () =>
          container.removeEventListener('scroll', updateVisiblePage);
        updateVisiblePage();

        if (cancelled) {
          removeScrollListener();
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        reportError(
          error instanceof Error
            ? error.message
            : 'ไม่สามารถแสดงเอกสาร PDF ได้',
        );
      });

    return () => {
      cancelled = true;
      removeScrollListener();
      void loadingTask.destroy();
      container.replaceChildren();
    };
  }, [container, uri]);

  const zoomButtonStyle = {
    alignItems: 'center',
    background: '#ffffff',
    border: 0,
    color: '#1e293b',
    cursor: 'pointer',
    display: 'flex',
    fontSize: 18,
    fontWeight: 700,
    height: 34,
    justifyContent: 'center',
    padding: 0,
    width: 36,
  } as const;

  return createElement(
    'div',
    { style: { height: '100%', position: 'relative', width: '100%' } },
    createElement(
      'div',
      {
        style: {
          alignItems: 'center',
          background: '#ffffff',
          border: '1px solid rgba(148, 163, 184, 0.45)',
          borderRadius: 12,
          boxShadow: '0 4px 14px rgba(15, 23, 42, 0.14)',
          display: 'flex',
          overflow: 'hidden',
          position: 'absolute',
          right: 12,
          top: 12,
          zIndex: 2,
        },
      },
      createElement(
        'button',
        {
          'aria-label': 'ซูมออก',
          disabled: zoom <= MIN_ZOOM,
          onClick: () => setZoom((current) => clampZoom(current - ZOOM_STEP)),
          style: { ...zoomButtonStyle, opacity: zoom <= MIN_ZOOM ? 0.35 : 1 },
          type: 'button',
        },
        '−',
      ),
      createElement(
        'button',
        {
          'aria-label': 'คืนขนาด PDF',
          onClick: () => setZoom(1),
          style: {
            ...zoomButtonStyle,
            borderLeft: '1px solid #e2e8f0',
            borderRight: '1px solid #e2e8f0',
            fontSize: 12,
            width: 54,
          },
          type: 'button',
        },
        `${Math.round(zoom * 100)}%`,
      ),
      createElement(
        'button',
        {
          'aria-label': 'ซูมเข้า',
          disabled: zoom >= MAX_ZOOM,
          onClick: () => setZoom((current) => clampZoom(current + ZOOM_STEP)),
          style: { ...zoomButtonStyle, opacity: zoom >= MAX_ZOOM ? 0.35 : 1 },
          type: 'button',
        },
        '+',
      ),
    ),
    /*
     * ชั้นนี้เขียนเป็น JSX ไม่ใช่ createElement เหมือนชั้นอื่นในไฟล์
     *
     * ตัวจับนิ้ว (pinch zoom) ต้องอ่าน pinchRef/zoomRef ตอน event วิ่ง แต่กฎ
     * react-hooks/refs มอง createElement เป็นฟังก์ชันธรรมดา จึงเตือนว่า ref
     * อาจถูกอ่านระหว่าง render — JSX เป็นรูปแบบที่กฎรู้จักว่า handler ถูกเรียก
     * ทีหลัง จึงผ่านโดยไม่ต้องปิดกฎหรือย้าย ref ออกจากตัวจับนิ้ว
     */
    <div
      onDoubleClick={() => setZoom((current) => (current === 1 ? 1.75 : 1))}
      onTouchEnd={(event: ReactTouchEvent<HTMLDivElement>) => {
        if (event.touches.length < 2) pinchRef.current = null;
      }}
      onTouchMove={(event: ReactTouchEvent<HTMLDivElement>) => {
        if (event.touches.length !== 2 || !pinchRef.current) return;
        event.preventDefault();
        const distance = touchDistance(event.touches);
        if (distance <= 0) return;
        setZoom(
          clampZoom(
            pinchRef.current.zoom * (distance / pinchRef.current.distance),
          ),
        );
      }}
      onTouchStart={(event: ReactTouchEvent<HTMLDivElement>) => {
        if (event.touches.length !== 2) return;
        pinchRef.current = {
          distance: touchDistance(event.touches),
          zoom: zoomRef.current,
        };
      }}
      onWheel={(event: ReactWheelEvent<HTMLDivElement>) => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        setZoom((current) =>
          clampZoom(current + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)),
        );
      }}
      ref={setContainer}
      style={{
        height: '100%',
        overflow: 'auto',
        touchAction: 'pan-x pan-y',
        WebkitOverflowScrolling: 'touch',
        width: '100%',
      }}
    />,
  );
}
