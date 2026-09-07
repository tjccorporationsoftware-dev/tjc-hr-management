import { Injectable } from '@nestjs/common';

import { ProfileService } from '../../profile/profile.service';
import { MobileUpdateProfileDto } from '../dto/mobile-profile.dto';
import { toMobileProfile } from '../mappers/mobile-profile.mapper';

@Injectable()
export class MobileProfileOrchestrator {
  constructor(private readonly profileService: ProfileService) {}

  async getMyProfile(userId: string) {
    return toMobileProfile(
      await this.profileService.getMobileProfileSnapshot(userId),
    );
  }

  async updateMyProfile(userId: string, dto: MobileUpdateProfileDto) {
    await this.profileService.updateMe(userId, dto);
    return this.getMyProfile(userId);
  }

  async uploadMyAvatar(userId: string, file?: Express.Multer.File) {
    await this.profileService.uploadAvatar(userId, file);
    return this.getMyProfile(userId);
  }

  async deleteMyAvatar(userId: string) {
    await this.profileService.deleteAvatar(userId);
    return this.getMyProfile(userId);
  }

  getMyDocumentFile(userId: string, documentId: string) {
    return this.profileService.getMyDocumentFileForDownload(userId, documentId);
  }
}
