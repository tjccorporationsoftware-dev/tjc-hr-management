import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { map, Observable } from "rxjs";
import type { RequestWithId } from "../interfaces/request-with-id.interface";

type StandardPayload = {
  data?: unknown;
  meta?: unknown;
  summary?: unknown;
};

function isStandardPayload(value: unknown): value is StandardPayload {
  return typeof value === "object" && value !== null && "data" in value;
}

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithId>();

    return next.handle().pipe(
      map((responseData) => {
        const requestId = request.requestId;

        if (isStandardPayload(responseData)) {
          return {
            success: true,
            data: responseData.data ?? null,
            meta: responseData.meta,
            summary: responseData.summary,
            requestId,
          };
        }

        return {
          success: true,
          data: responseData ?? null,
          requestId,
        };
      }),
    );
  }
}