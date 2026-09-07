import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

import { HttpMetricsService } from './http-metrics.service';

/**
 * นับทุกคำขอเข้า metric
 *
 * ต้องใช้ "route pattern" ไม่ใช่ path ดิบ — /api/employees/abc123 กับ /api/employees/def456
 * ต้องเป็น metric เดียวกัน ไม่งั้นทุก id จะกลายเป็น label ใหม่จนหน่วยความจำเต็ม
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: HttpMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const startedAt = process.hrtime.bigint();

    const finish = () => {
      const response = http.getResponse<Response>();
      const durationSeconds =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;

      this.metrics.record({
        method: request.method,
        route: this.resolveRoute(request),
        statusCode: response.statusCode,
        durationSeconds,
      });
    };

    return next.handle().pipe(
      tap({
        next: finish,
        // คำขอที่ล้มก็ต้องนับ ไม่งั้น error rate จะดูดีเกินจริง
        error: finish,
      }),
    );
  }

  private resolveRoute(request: Request) {
    /*
     * Express ใส่ route pattern ไว้ที่ req.route.path เมื่อจับคู่ handler ได้
     * เช่น "/:id" ส่วน baseUrl คือส่วนหน้าที่ router ครอบไว้
     */
    const pattern = (request as { route?: { path?: string } }).route?.path;

    if (pattern) {
      return `${request.baseUrl ?? ''}${pattern}` || pattern;
    }

    // จับคู่ handler ไม่ได้ (404) — รวมเป็นก้อนเดียว ไม่งั้น path มั่ว ๆ จะระเบิด label
    return 'unmatched';
  }
}
