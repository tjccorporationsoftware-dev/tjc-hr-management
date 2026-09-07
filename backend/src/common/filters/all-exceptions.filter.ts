import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import type { RequestWithId } from "../interfaces/request-with-id.interface";

type ErrorResponseBody = {
  message?: string | string[];
  error?: string;
  statusCode?: number;
  code?: string;
  details?: unknown;
};

function normalizeMessage(message: unknown): string {
  if (Array.isArray(message)) {
    return message.join(", ");
  }

  if (typeof message === "string") {
    return message;
  }

  return "Internal server error";
}

function getPrismaErrorMessage(code: string): string {
  const errorMap: Record<string, string> = {
    P2002: "ข้อมูลซ้ำกับรายการที่มีอยู่แล้ว",
    P2025: "ไม่พบข้อมูลที่ต้องการ",
    P2003: "ข้อมูลมีความสัมพันธ์กับรายการอื่น ไม่สามารถดำเนินการได้",
    P2010: "เกิดข้อผิดพลาดในการเชื่อมต่อหรือ query ฐานข้อมูล",
  };

  return errorMap[code] ?? "เกิดข้อผิดพลาดจากฐานข้อมูล";
}

/**
 * ข้อจำกัดระดับฐานข้อมูลที่ Prisma ไม่มีรหัสของตัวเองให้
 *
 * พวก EXCLUDE constraint (เช่น งวดเงินเดือนห้ามคาบเกี่ยวกัน) หลุดมาถึงตัวนี้เป็น
 * error ก้อนดิบของ Postgres ที่ไม่มี property `code` แบบ P**** จึงตกไปเข้าเงื่อนไข
 * Error ธรรมดาแล้วกลายเป็น 500 พร้อมข้อความ ConnectorError ยาวเหยียด
 * ทั้งที่เป็นความผิดของข้อมูลที่ส่งมา ผู้ใช้ควรได้ 400 พร้อมข้อความที่อ่านออก
 *
 * ตัวจริงควรถูกดักด้วยการตรวจในบริการก่อนถึงฐานข้อมูล ตัวนี้เป็นตาข่ายชั้นสุดท้าย
 */
const POSTGRES_CONSTRAINT_ERRORS: Array<{
  test: RegExp;
  message: string;
}> = [
  {
    test: /23P01|exclusion constraint/i,
    message: "ช่วงข้อมูลนี้ทับซ้อนกับรายการที่มีอยู่แล้ว",
  },
  {
    test: /23505|duplicate key value/i,
    message: "ข้อมูลซ้ำกับรายการที่มีอยู่แล้ว",
  },
  {
    test: /23503|violates foreign key/i,
    message: "ข้อมูลมีความสัมพันธ์กับรายการอื่น ไม่สามารถดำเนินการได้",
  },
];

function getPostgresConstraintMessage(exception: unknown): string | null {
  if (!(exception instanceof Error)) return null;

  const text = exception.message ?? "";

  return (
    POSTGRES_CONSTRAINT_ERRORS.find((item) => item.test.test(text))?.message ??
    null
  );
}

/**
 * error ของ body-parser / http-errors (เช่น body ใหญ่เกิน, JSON เสีย)
 *
 * พวกนี้ไม่ใช่ `HttpException` ของ Nest และไม่มี property `code`
 * ถ้าไม่ดักไว้จะตกไปเข้าเงื่อนไข `instanceof Error` แล้วกลายเป็น 500
 * ทั้งที่เป็นความผิดของ request — ผู้ใช้เห็นแค่ "เซิร์ฟเวอร์ผิดพลาด"
 * และ log เด้งเป็น error ร้ายแรงทุกครั้งที่มีคนแนบไฟล์ใหญ่เกิน
 */
type BodyParserError = Error & { type?: string; status?: number; statusCode?: number };

function getBodyParserError(exception: unknown): BodyParserError | null {
  if (!(exception instanceof Error)) return null;

  const candidate = exception as BodyParserError;
  const status = candidate.status ?? candidate.statusCode;

  // ต้องเป็น 4xx ที่มี `type` ของ body-parser เท่านั้น กัน error อื่นที่บังเอิญมี status
  if (typeof candidate.type !== "string" || !candidate.type.startsWith("entity.")) {
    return null;
  }

  return typeof status === "number" && status >= 400 && status < 500
    ? candidate
    : null;
}

function getBodyParserMessage(type: string): string {
  const errorMap: Record<string, string> = {
    "entity.too.large": "ข้อมูลที่ส่งมามีขนาดใหญ่เกินกำหนด กรุณาลดขนาดไฟล์แนบแล้วลองใหม่",
    "entity.parse.failed": "รูปแบบข้อมูลที่ส่งมาไม่ถูกต้อง",
    "entity.verify.failed": "ตรวจสอบข้อมูลที่ส่งมาไม่ผ่าน",
  };

  return errorMap[type] ?? "ข้อมูลที่ส่งมาไม่ถูกต้อง";
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();

    const isDev = process.env.NODE_ENV !== "production";

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "INTERNAL_SERVER_ERROR";
    let message = "Internal server error";
    let details: unknown = undefined;

    const bodyParserError = getBodyParserError(exception);

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();

      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === "string") {
        message = exceptionResponse;
        code = exception.name;
      } else {
        const body = exceptionResponse as ErrorResponseBody;

        message = normalizeMessage(body.message);
        code = body.code ?? body.error ?? exception.name;
        details = body.details;
      }
    } else if (bodyParserError?.type) {
      statusCode =
        bodyParserError.status ??
        bodyParserError.statusCode ??
        HttpStatus.BAD_REQUEST;
      code = bodyParserError.type;
      message = getBodyParserMessage(bodyParserError.type);
      details = isDev ? bodyParserError.message : undefined;
    } else if (
      typeof exception === "object" &&
      exception !== null &&
      "code" in exception
    ) {
      const prismaCode = String((exception as { code: string }).code);
      const constraintMessage = getPostgresConstraintMessage(exception);

      if (constraintMessage) {
        /*
         * ข้อความของ Postgres บอกได้ตรงกว่ารหัสของ Prisma
         * เช่น P2010 ที่แปลว่า "query พัง" เฉย ๆ ทั้งที่ต้นเหตุคือช่วงวันที่ทับกัน
         */
        statusCode = HttpStatus.BAD_REQUEST;
        code = "DB_CONSTRAINT";
        message = constraintMessage;
        details = isDev ? exception : undefined;
      } else if (prismaCode.startsWith("P")) {
        statusCode = HttpStatus.BAD_REQUEST;
        code = prismaCode;
        message = getPrismaErrorMessage(prismaCode);
        details = isDev ? exception : undefined;
      }
    } else if (getPostgresConstraintMessage(exception)) {
      statusCode = HttpStatus.BAD_REQUEST;
      code = "DB_CONSTRAINT";
      message = getPostgresConstraintMessage(exception) as string;
      details = isDev ? (exception as Error).message : undefined;
    } else if (exception instanceof Error) {
      message = isDev ? exception.message : "Internal server error";
      details = isDev ? exception.stack : undefined;
    }

    // 5xx คือความผิดพลาดที่ไม่ได้ตั้งใจ ต้องมี stack ไว้ไล่ปัญหา
    // เดิม filter ไม่ log อะไรเลย และ prod ก็ไม่ส่ง stack กลับใน response
    // ทำให้ error ฝั่งเซิร์ฟเวอร์หายเงียบ เหลือแค่ message ใน AuditLog
    // 4xx ไม่ log เป็น error เพราะเป็นเรื่องปกติ (validation, ไม่มีสิทธิ์, ไม่พบข้อมูล)
    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.originalUrl} -> ${statusCode} ${code} [requestId=${request.requestId ?? '-'}] ${message}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(statusCode).json({
      success: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
      requestId: request.requestId,
    });
  }
}