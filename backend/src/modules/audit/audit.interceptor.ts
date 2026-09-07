import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { catchError, Observable, tap, throwError } from "rxjs";
import {
  AUDIT_METADATA_KEY,
  type AuditOptions,
} from "../../common/decorators/audit.decorator";
import type { RequestWithId } from "../../common/interfaces/request-with-id.interface";
import { AuditAction } from "../../generated/prisma/client";
import { AuditService } from "./audit.service";

/**
 * VIEW คิดเป็น ~95% ของแถวใน AuditLog เพราะทุก endpoint ที่อ่านข้อมูลถูกติด
 * @Audit(VIEW) ไว้ (229 จาก 647 endpoint) ทำให้เปิดหน้าหนึ่งครั้ง = INSERT
 * หนึ่งแถว บนระบบที่มีคนใช้จริงนี่คือภาระเขียนที่ใหญ่ที่สุดในระบบ
 *
 * ค่าเริ่มต้นยังเป็น true เพื่อไม่เปลี่ยนพฤติกรรมเดิม แต่เปิดทางให้ปิดได้
 * ถ้าไม่ได้ต้องใช้ร่องรอยการอ่านเพื่อ compliance
 * (การแก้ไข/อนุมัติ/ส่งออก และเหตุการณ์ล็อกอิน ยังบันทึกเสมอไม่ว่าตั้งค่าใด)
 */
function isViewAuditEnabled() {
  return (process.env.AUDIT_VIEW_ENABLED ?? "true") !== "false";
}

type AuthenticatedRequest = RequestWithId & {
  user?: {
    id?: string;
    userId?: string;
    sub?: string;
    email?: string;
  };
  params?: Record<string, string>;
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const auditOptions = this.reflector.getAllAndOverride<AuditOptions>(
      AUDIT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!auditOptions) {
      return next.handle();
    }

    if (auditOptions.action === AuditAction.VIEW && !isViewAuditEnabled()) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse();

    return next.handle().pipe(
      tap(() => {
        this.writeAuditLog({
          request,
          statusCode: response.statusCode,
          auditOptions,
        });
      }),
      catchError((error) => {
        const statusCode =
          typeof error?.getStatus === "function" ? error.getStatus() : 500;

        this.writeAuditLog({
          request,
          statusCode,
          auditOptions,
          isError: true,
        });

        return throwError(() => error);
      }),
    );
  }

  private writeAuditLog(params: {
    request: AuthenticatedRequest;
    statusCode: number;
    auditOptions: AuditOptions;
    isError?: boolean;
  }) {
    const { request, statusCode, auditOptions, isError } = params;

    const userId =
      request.user?.id ?? request.user?.userId ?? request.user?.sub ?? null;

    const entityId =
      typeof request.params?.id === "string" ? request.params.id : null;

    const ipAddress = this.getClientIp(request);

    void this.auditService
      .createLog({
        action: auditOptions.action,
        entity: auditOptions.entity,
        entityId,
        description: auditOptions.description ?? null,
        userId,
        // เก็บบริษัทตอนที่เกิดเหตุ ไม่ใช่ไปสาวจาก User ทีหลัง
        // เพราะผู้ใช้ย้ายบริษัทหรือถูกลบได้ แล้วบันทึกเก่าจะถูกนับผิดบริษัท
        companyId:
          (request.user as { scope?: { companyId?: string | null } } | undefined)
            ?.scope?.companyId ?? null,
        requestId: request.requestId ?? null,
        ipAddress,
        userAgent: request.headers["user-agent"] ?? null,
        method: request.method,
        path: request.originalUrl,
        statusCode,
        metadata: {
          isError: Boolean(isError),
        },
      })
      .catch((error) => {
        this.logger.error(
          `เขียน audit log ไม่สำเร็จ: ${auditOptions.action} ${auditOptions.entity}`,
          error instanceof Error ? error.stack : String(error),
        );
      });
  }

  private getClientIp(request: AuthenticatedRequest) {
    const forwardedFor = request.headers["x-forwarded-for"];

    if (typeof forwardedFor === "string") {
      return forwardedFor.split(",")[0]?.trim() ?? null;
    }

    return request.ip ?? null;
  }
}