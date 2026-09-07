import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  REQUIRED_PERMISSIONS_KEY,
} from "../decorators/require-permissions.decorator";
import type { AuthenticatedRequest } from "../interfaces/authenticated-user.interface";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException("กรุณาเข้าสู่ระบบ");
    }

    const userPermissions = new Set(user.permissions);

    const hasAllRequiredPermissions = requiredPermissions.every((permission) =>
      userPermissions.has(permission),
    );

    if (!hasAllRequiredPermissions) {
      throw new ForbiddenException("คุณไม่มีสิทธิ์ใช้งานส่วนนี้");
    }

    return true;
  }
}