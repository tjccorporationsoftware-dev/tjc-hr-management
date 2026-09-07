import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { diskStorage } from 'multer';

import { Audit } from '../../../common/decorators/audit.decorator';
import { Auth } from '../../../common/decorators/auth.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RateLimit } from '../../../common/decorators/rate-limit.decorator';
import { RateLimitGuard } from '../../../common/guards/rate-limit.guard';
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from '../../../common/interfaces/authenticated-user.interface';
import { AuditAction } from '../../../generated/prisma/client';
import {
  avatarFileFilter,
  AVATAR_MAX_FILE_SIZE,
  AVATAR_UPLOAD_DIR,
  createAvatarFileName,
  ensureAvatarStorageDir,
} from '../../profile/utils/avatar-storage.util';
import { MobileProfileOrchestrator } from '../application/mobile-profile.orchestrator';
import { MobileAuth } from '../decorators/mobile-auth.decorator';
import { MobileUpdateProfileDto } from '../dto/mobile-profile.dto';
import { MOBILE_API_PREFIX } from '../mobile.constants';

@Controller(`${MOBILE_API_PREFIX}/profile`)
export class MobileProfileController {
  constructor(private readonly profile: MobileProfileOrchestrator) {}

  @Get()
  @Auth('ESS_ACCESS')
  @Header('Cache-Control', 'private, no-store')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'Profile',
    description: 'View my profile from mobile',
  })
  getMyProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.profile.getMyProfile(user.id);
  }

  @Patch()
  @MobileAuth('ESS_ACCESS')
  @Header('Cache-Control', 'private, no-store')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'Profile',
    description: 'Update my profile from mobile',
  })
  updateMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MobileUpdateProfileDto,
  ) {
    return this.profile.updateMyProfile(user.id, dto);
  }

  @Post('avatar')
  @MobileAuth('ESS_ACCESS')
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: diskStorage({
        destination: (_req, _file, callback) => {
          ensureAvatarStorageDir();
          callback(null, AVATAR_UPLOAD_DIR);
        },
        filename: (request, file, callback) => {
          const currentUserId =
            (request as AuthenticatedRequest).user?.id ?? 'user';
          callback(null, createAvatarFileName(currentUserId, file));
        },
      }),
      fileFilter: avatarFileFilter,
      limits: { fileSize: AVATAR_MAX_FILE_SIZE },
    }),
  )
  @Audit({
    action: AuditAction.UPLOAD,
    entity: 'ProfileAvatar',
    description: 'Upload my profile avatar from mobile',
  })
  uploadAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.profile.uploadMyAvatar(user.id, file);
  }

  @Delete('avatar')
  @MobileAuth('ESS_ACCESS')
  @Header('Cache-Control', 'private, no-store')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'ProfileAvatar',
    description: 'Delete my profile avatar from mobile',
  })
  deleteAvatar(@CurrentUser() user: AuthenticatedUser) {
    return this.profile.deleteMyAvatar(user.id);
  }

  @Get('documents/:documentId/download')
  @Auth('ESS_ACCESS')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    includePath: true,
    includeUserId: true,
    keyPrefix: 'mobile:profile-document:download',
    limit: 30,
    message: 'ดาวน์โหลดเอกสารบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
    windowSeconds: 60,
  })
  @Audit({
    action: AuditAction.VIEW,
    entity: 'EmployeeDocument',
    description: 'Download my employee document from mobile',
  })
  async downloadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId') documentId: string,
    @Res() response: Response,
  ) {
    const file = await this.profile.getMyDocumentFile(user.id, documentId);

    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', String(file.size));
    response.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    response.setHeader('Cache-Control', 'private, no-store');

    return response.sendFile(file.filePath);
  }
}
