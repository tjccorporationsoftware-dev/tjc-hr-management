import type { Params } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';

/**
 * ตั้งค่า log ของทั้งระบบ
 * -----------------------------------------------------------------------------
 * เดิม log ออกทาง console เป็นข้อความเปล่า ๆ ไม่มีโครงสร้าง
 * เวลามีปัญหาจริงจึงค้นไม่ได้ว่า "คำขอไหนของใครที่ล้ม" ต้องไล่อ่านทีละบรรทัด
 * และ requestId เข้า log เฉพาะตอน 5xx เท่านั้น
 *
 * production ออกเป็น JSON บรรทัดละหนึ่งเหตุการณ์ ส่งเข้า Loki/CloudWatch ได้ทันที
 * ตอนพัฒนาใช้ pino-pretty ให้อ่านด้วยตาได้
 */

/** header ที่ต้องไม่หลุดเข้า log — มีโทเคนและรหัสผ่านอยู่ข้างใน */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  /*
   * ชื่อ header ต้องตรงกับที่ DevicePushGuard อ่านจริง (`x-device-token`)
   * ของเดิมเขียน `x-device-secret` ซึ่งไม่มีใครส่งมา โทเคนของเครื่องสแกนจึงถูก
   * เขียนลง log ทุกคำขอ — ใครอ่าน log ได้ก็สร้างรายการลงเวลาปลอมให้พนักงาน
   * คนไหนก็ได้ และรายการนั้นไหลต่อไปถึงการคำนวณเงินเดือน
   * เก็บชื่อเดิมไว้ด้วยเผื่อมีของเก่าค้างอยู่ ปิดบังเกินไม่เสียหาย
   */
  'req.headers["x-device-token"]',
  'req.headers["x-device-secret"]',
  'res.headers["set-cookie"]',
  // body ของ login/เปลี่ยนรหัสผ่าน
  'req.body.password',
  'req.body.currentPassword',
  'req.body.newPassword',
  'req.body.confirmPassword',
  'req.body.twoFactorCode',
];

/**
 * เส้นทางที่ไม่ต้องเขียน log
 *
 * health/readiness ถูกยิงทุก 10-30 วินาทีจาก load balancer
 * ถ้าเขียนทุกครั้ง log จริงจะจมอยู่ใต้บรรทัดพวกนี้
 */
const SILENT_PATHS = ['/api/health', '/api/monitoring/readiness'];

/**
 * พารามิเตอร์ใน query string ที่เป็นความลับ
 *
 * ปกติความลับควรมาทาง header แต่เครื่องสแกนลายนิ้วมือ (โปรโตคอล ADMS)
 * ตั้งค่าได้แค่ URL ปลายทาง ส่งทาง header ไม่ได้ จึงต้องยอมรับทาง query
 * แล้วมาลบทิ้งตอนเขียน log แทน
 *
 * ตัว redact ของ pino ทำงานกับ path ของ object ไม่ได้แก้ค่าข้างใน string
 * จึงต้องล้าง req.url เองผ่าน serializer
 */
const SECRET_QUERY_PARAMS = ['token', 'secret', 'key', 'password'];

/** ตัดค่าของพารามิเตอร์ลับออกจาก URL แต่คงตัวพารามิเตอร์ไว้ให้รู้ว่ามีส่งมา */
function maskSecretQueryParams(url: string | undefined) {
  if (!url) return url;

  const queryStart = url.indexOf('?');
  if (queryStart === -1) return url;

  const path = url.slice(0, queryStart);
  const params = new URLSearchParams(url.slice(queryStart + 1));

  let touched = false;

  for (const name of SECRET_QUERY_PARAMS) {
    if (params.has(name)) {
      params.set(name, '[REDACTED]');
      touched = true;
    }
  }

  if (!touched) return url;

  return `${path}?${decodeURIComponent(params.toString())}`;
}

export function buildLoggerConfig(): Params {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    pinoHttp: {
      level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),

      // ตอนพัฒนาอ่านด้วยตา ตอนรันจริงเป็น JSON ให้เครื่องอ่าน
      transport: isProduction
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
              singleLine: true,
              translateTime: 'SYS:HH:MM:ss',
              ignore: 'pid,hostname',
            },
          },

      redact: {
        paths: REDACTED_PATHS,
        remove: true,
      },

      /*
       * ผูก requestId เข้ากับทุกบรรทัดของคำขอนั้น
       * ใช้ตัวเดียวกับที่ requestIdMiddleware ใส่ไว้ เพื่อให้ค้นย้อนจาก
       * error ที่ผู้ใช้เห็นบนหน้าจอกลับมาหา log ฝั่งเซิร์ฟเวอร์ได้
       */
      genReqId: (req: IncomingMessage) => {
        const fromMiddleware = (req as { requestId?: string }).requestId;
        if (fromMiddleware) return fromMiddleware;

        const fromHeader = req.headers['x-request-id'];
        if (typeof fromHeader === 'string' && fromHeader) return fromHeader;

        // ปล่อยให้ pino สร้างเลขให้เอง ดีกว่าไม่มีเลย
        return randomUUID();
      },

      /*
       * pino-http เขียน req.url ลง log ทุกบรรทัด ถ้ามีความลับติดมาใน query
       * มันจะไหลเข้า log อย่างถาวร ต้องล้างตั้งแต่ต้นทาง
       * (ฝั่ง reverse proxy ก็ควรตั้งให้ตัด query ของเส้นทางเหล่านี้ด้วยอีกชั้น)
       */
      serializers: {
        req(req: IncomingMessage & { url?: string }) {
          return {
            ...req,
            url: maskSecretQueryParams(req.url),
          };
        },
      },

      customProps: (req: IncomingMessage) => {
        const user = (req as { user?: { id?: string; scope?: { companyId?: string | null } } })
          .user;

        // ใส่แค่ id กับบริษัท ไม่ใส่ชื่อ/อีเมล เพราะ log มักถูกส่งออกนอกระบบ
        return {
          userId: user?.id ?? null,
          companyId: user?.scope?.companyId ?? null,
        };
      },

      autoLogging: {
        ignore: (req: IncomingMessage) =>
          SILENT_PATHS.some((path) => req.url?.startsWith(path)),
      },

      customLogLevel: (
        _req: IncomingMessage,
        res: ServerResponse,
        error?: Error,
      ) => {
        if (error || res.statusCode >= 500) return 'error';
        // 4xx เป็นความผิดของผู้เรียก ไม่ใช่ระบบพัง จึงไม่ควรไปปนกับ error จริง
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    },
  };
}
