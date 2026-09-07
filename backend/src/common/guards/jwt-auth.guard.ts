import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from '../interfaces/authenticated-user.interface';

type AccessTokenPayload = {
  sub: string;
  email: string;
  sessionId: string;
  type: 'access';
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('กรุณาเข้าสู่ระบบ');
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        {
          secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        },
      );

      if (
        payload.type !== 'access' ||
        !payload.sub ||
        !payload.sessionId
      ) {
        throw new UnauthorizedException('Token ไม่ถูกต้อง');
      }

      const session = await this.prisma.userSession.findFirst({
        where: {
          id: payload.sessionId,
          userId: payload.sub,
          revokedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
        select: {
          id: true,
        },
      });

      if (!session) {
        throw new UnauthorizedException('Session หมดอายุหรือถูกยกเลิกแล้ว');
      }

      const user = await this.prisma.user.findFirst({
        where: {
          id: payload.sub,
          status: 'ACTIVE',
          deletedAt: null,
        },
        include: {
          roles: {
            include: {
              role: {
                include: {
                  permissions: {
                    include: {
                      permission: true,
                    },
                  },
                },
              },
            },
          },
          scopedCompany: {
            select: { id: true, code: true, nameTh: true },
          },
          scopedBranch: {
            select: { id: true, code: true, nameTh: true },
          },
        },
      });

      if (!user) {
        throw new UnauthorizedException('ไม่พบผู้ใช้งานหรือบัญชีถูกปิดใช้งาน');
      }

      /**
       * สำคัญ:
       * ต้องใช้เฉพาะ role ที่ active เท่านั้น
       * ไม่อย่างนั้น role ที่ปิดใช้งานแล้ว อาจยังปล่อย permissions หลุดออกมาได้
       */
      const activeUserRoles = user.roles.filter(
        (userRole) => userRole.role.isActive,
      );

      const roles = activeUserRoles.map((userRole) => userRole.role.code);

      const permissions = Array.from(
        new Set(
          activeUserRoles.flatMap((userRole) =>
            userRole.role.permissions
              .filter((rolePermission) => rolePermission.permission.isActive)
              .map((rolePermission) => rolePermission.permission.code),
          ),
        ),
      );

      const scopedUser = user as typeof user & {
        scopeLevel?: 'GLOBAL' | 'COMPANY' | 'BRANCH' | null;
        scopedCompanyId?: string | null;
        scopedBranchId?: string | null;
        scopedCompany?: { id: string; code: string; nameTh: string } | null;
        scopedBranch?: { id: string; code: string; nameTh: string } | null;
        phone?: string | null;
        avatarUrl?: string | null;
        mustChangePassword?: boolean | null;
      };

      const authenticatedUser: AuthenticatedUser = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        phone: scopedUser.phone ?? null,
        avatarUrl: scopedUser.avatarUrl ?? null,
        roles,
        permissions,
        sessionId: payload.sessionId,
        // MustChangePasswordGuard อ่านค่านี้ ถ้าไม่ใส่มาจะไม่มีวันบล็อกใครเลย
        mustChangePassword: scopedUser.mustChangePassword ?? false,
        scope: {
          level: scopedUser.scopeLevel ?? 'BRANCH',
          companyId: scopedUser.scopedCompanyId ?? null,
          branchId: scopedUser.scopedBranchId ?? null,
          companyName: scopedUser.scopedCompany?.nameTh ?? null,
          branchName: scopedUser.scopedBranch?.nameTh ?? null,
        },
      };

      request.user = authenticatedUser;

      return true;
    } catch {
      throw new UnauthorizedException('Token หมดอายุหรือไม่ถูกต้อง');
    }
  }

  private extractBearerToken(request: AuthenticatedRequest) {
    const authorization = request.headers.authorization;

    if (!authorization) {
      return null;
    }

    const [type, token] = authorization.split(' ');

    if (type !== 'Bearer' || !token) {
      return null;
    }

    return token;
  }
}