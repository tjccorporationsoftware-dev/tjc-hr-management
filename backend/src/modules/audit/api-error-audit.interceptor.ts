import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { catchError, Observable, throwError } from "rxjs";
import {
  AUDIT_METADATA_KEY,
  type AuditOptions,
} from "../../common/decorators/audit.decorator";
import type { RequestWithId } from "../../common/interfaces/request-with-id.interface";
import { AuditAction } from "../../generated/prisma/client";
import { AuditService } from "./audit.service";

type AuthenticatedRequest = RequestWithId & {
  user?: {
    id?: string;
    userId?: string;
    sub?: string;
    email?: string;
  };
};

function getErrorStatusCode(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "getStatus" in error &&
    typeof (error as { getStatus?: unknown }).getStatus === "function"
  ) {
    return (error as { getStatus: () => number }).getStatus();
  }

  return 500;
}

function getErrorName(error: unknown) {
  if (error instanceof Error) return error.name;
  return "UnknownError";
}

function getSafeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unknown API error";
}

@Injectable()
export class ApiErrorAuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const hasExplicitAudit = this.reflector.getAllAndOverride<AuditOptions>(
      AUDIT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    return next.handle().pipe(
      catchError((error) => {
        if (!hasExplicitAudit) {
          const http = context.switchToHttp();
          const request = http.getRequest<AuthenticatedRequest>();
          const statusCode = getErrorStatusCode(error);

          void this.auditService
            .createLog({
              action: AuditAction.VIEW,
              entity: "ApiError",
              entityId: null,
              description: "Unhandled or non-audited API error",
              userId:
                request.user?.id ??
                request.user?.userId ??
                request.user?.sub ??
                null,
              requestId: request.requestId ?? null,
              ipAddress: this.getClientIp(request),
              userAgent: request.headers["user-agent"] ?? null,
              method: request.method,
              path: request.originalUrl,
              statusCode,
              metadata: {
                errorName: getErrorName(error),
                message: getSafeErrorMessage(error),
              },
            })
            .catch((auditError) => {
              if (process.env.NODE_ENV !== "production") {
                console.error("Failed to write API error audit log:", auditError);
              }
            });
        }

        return throwError(() => error);
      }),
    );
  }

  private getClientIp(request: AuthenticatedRequest) {
    const forwardedFor = request.headers["x-forwarded-for"];

    if (typeof forwardedFor === "string") {
      return forwardedFor.split(",")[0]?.trim() ?? null;
    }

    return request.ip ?? null;
  }
}
