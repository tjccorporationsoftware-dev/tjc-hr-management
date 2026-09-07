import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  RATE_LIMIT_METADATA_KEY,
  type RateLimitOptions,
} from "../decorators/rate-limit.decorator";
import type { AuthenticatedRequest } from "../interfaces/authenticated-user.interface";
import { RateLimitService } from "../services/rate-limit.service";

type RequestWithBody = AuthenticatedRequest & {
  body?: {
    email?: string;
    twoFactorToken?: string;
  };
  route?: {
    path?: string;
  };
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithBody>();

    const keyParts: Array<string | null | undefined> = [
      this.getClientIp(request),
    ];

    if (options.includeEmail) {
      keyParts.push(request.body?.email?.trim().toLowerCase());
    }

    if (options.includeUserId) {
      keyParts.push(request.user?.id);
    }

    if (options.includeTwoFactorToken) {
      keyParts.push(request.body?.twoFactorToken);
    }

    if (options.includePath) {
      keyParts.push(`${request.method}:${request.route?.path ?? request.path}`);
    }

    const result = await this.rateLimitService.consume({
      keyPrefix: options.keyPrefix,
      keyParts,
      limit: options.limit,
      windowSeconds: options.windowSeconds,
    });

    if (!result.allowed) {
      throw new HttpException(
        {
          code: "RATE_LIMIT_EXCEEDED",
          message:
            options.message ??
            `ทำรายการบ่อยเกินไป กรุณาลองใหม่ใน ${result.retryAfterSeconds} วินาที`,
          details: {
            limit: result.limit,
            count: result.count,
            remaining: result.remaining,
            retryAfterSeconds: result.retryAfterSeconds,
            resetAt: result.resetAt.toISOString(),
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  /**
   * ใช้ `request.ip` ที่ express คำนวณให้แล้วตาม `trust proxy` เท่านั้น
   *
   * ห้ามอ่าน `x-forwarded-for` เอง: header นี้ผู้เรียกใส่มาเองได้
   * ถ้าเชื่อตรง ๆ ผู้โจมตีหมุนค่าไปเรื่อย ๆ จะได้ bucket ใหม่ทุกคำขอ
   * = rate limit ทั้งระบบไร้ผล และ memory store ก็บวมตามค่าที่ปลอมเข้ามา
   *
   * express จะอ่าน XFF ให้เองเมื่อตั้ง `trust proxy` ให้ตรงกับจำนวน hop จริง
   * (ตั้งที่ main.ts ผ่าน env TRUST_PROXY)
   */
  private getClientIp(request: AuthenticatedRequest) {
    return request.ip ?? null;
  }
}