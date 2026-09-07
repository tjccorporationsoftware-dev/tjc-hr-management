import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import { Auth } from '../../../common/decorators/auth.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { MobileDeviceService } from '../application/mobile-device.service';
import { MobileAuth } from '../decorators/mobile-auth.decorator';
import { MobileClient } from '../decorators/mobile-client.decorator';
import {
  MobileRegisterDeviceDto,
  MobileUpdateCurrentDeviceDto,
} from '../dto/mobile-device.dto';
import { MOBILE_API_PREFIX } from '../mobile.constants';
import type { MobileClientContext } from '../types/mobile-context.types';

/** BE-MOB-004 — ข้อมูล MOBILE_OWNED ล้วน ไม่มีของเว็บมาเกี่ยว */
@Controller(`${MOBILE_API_PREFIX}/devices`)
export class MobileDevicesController {
  constructor(private readonly deviceService: MobileDeviceService) {}

  @Post('register')
  @MobileAuth('ESS_ACCESS')
  async register(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MobileRegisterDeviceDto,
    @MobileClient() client: MobileClientContext,
  ) {
    return this.deviceService.register(user.id, dto, client);
  }

  @Patch('current')
  @MobileAuth('ESS_ACCESS')
  async updateCurrent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MobileUpdateCurrentDeviceDto,
    @MobileClient() client: MobileClientContext,
  ) {
    return this.deviceService.updateCurrent(
      user.id,
      client.installationId,
      dto,
      client,
    );
  }

  @Get()
  @Auth('ESS_ACCESS')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @MobileClient() client: MobileClientContext,
  ) {
    return this.deviceService.list(user.id, client);
  }

  @Post('revoke-others')
  @MobileAuth('ESS_ACCESS')
  async revokeOthers(
    @CurrentUser() user: AuthenticatedUser,
    @MobileClient() client: MobileClientContext,
  ) {
    return this.deviceService.revokeOthers(user.id, client.installationId);
  }

  @Delete(':deviceId')
  @MobileAuth('ESS_ACCESS')
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('deviceId') deviceId: string,
  ) {
    return this.deviceService.revoke(user.id, deviceId);
  }
}
