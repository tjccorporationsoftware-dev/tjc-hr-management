import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { Audit } from "../../common/decorators/audit.decorator";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from "../../common/interfaces/authenticated-user.interface";
import { AuditAction } from "../../generated/prisma/client";
import { UpdateMyProfileDto } from "./dto/update-my-profile.dto";
import { ProfileService } from "./profile.service";
import {
  avatarFileFilter,
  AVATAR_MAX_FILE_SIZE,
  AVATAR_UPLOAD_DIR,
  createAvatarFileName,
  ensureAvatarStorageDir,
} from "./utils/avatar-storage.util";

@Controller("profile")
@Auth()
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get("me")
  @Audit({
    action: AuditAction.VIEW,
    entity: "Profile",
    description: "View my profile",
  })
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.profileService.getMe(user.id);
  }

  @Patch("me")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "Profile",
    description: "Update my profile",
  })
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMyProfileDto,
  ) {
    return this.profileService.updateMe(user.id, dto);
  }

  @Post("me/avatar")
  @UseInterceptors(
    FileInterceptor("avatar", {
      storage: diskStorage({
        destination: (_req, _file, callback) => {
          ensureAvatarStorageDir();
          callback(null, AVATAR_UPLOAD_DIR);
        },
        filename: (request, file, callback) => {
          const currentUserId =
            (request as AuthenticatedRequest).user?.id ?? "user";

          callback(null, createAvatarFileName(currentUserId, file));
        },
      }),
      fileFilter: avatarFileFilter,
      limits: {
        fileSize: AVATAR_MAX_FILE_SIZE,
      },
    }),
  )
  @Audit({
    action: AuditAction.UPLOAD,
    entity: "ProfileAvatar",
    description: "Upload my profile avatar",
  })
  uploadAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Req() _request: AuthenticatedRequest,
  ) {
    return this.profileService.uploadAvatar(user.id, file);
  }

  @Delete("me/avatar")
  @Audit({
    action: AuditAction.DELETE,
    entity: "ProfileAvatar",
    description: "Delete my profile avatar",
  })
  deleteAvatar(@CurrentUser() user: AuthenticatedUser) {
    return this.profileService.deleteAvatar(user.id);
  }
}