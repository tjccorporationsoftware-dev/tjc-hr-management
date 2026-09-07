import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { AuthenticatedRequest } from '../../../common/interfaces/authenticated-user.interface';
import {
  readIdempotencyKey,
  readMobileClientContext,
} from '../application/mobile-client-context.util';

/** บริบทเครื่องจาก Header — metadata เท่านั้น ห้ามใช้ตัดสินสิทธิ์ */
export const MobileClient = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) =>
    readMobileClientContext(
      ctx.switchToHttp().getRequest<AuthenticatedRequest>(),
    ),
);

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) =>
    readIdempotencyKey(ctx.switchToHttp().getRequest<AuthenticatedRequest>()),
);
