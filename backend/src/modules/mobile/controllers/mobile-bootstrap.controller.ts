import { Controller, Get } from '@nestjs/common';

import { Auth } from '../../../common/decorators/auth.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { MobileBootstrapOrchestrator } from '../application/mobile-bootstrap.orchestrator';
import { MobileClient } from '../decorators/mobile-client.decorator';
import { MOBILE_API_PREFIX } from '../mobile.constants';
import type { MobileClientContext } from '../types/mobile-context.types';

/**
 * BE-MOB-003 — Bootstrap / Today
 *
 * ใช้ @Auth (ไม่ใช่ @MobileAuth) โดยตั้งใจ:
 * แอปเวอร์ชันเก่าที่ต่ำกว่าขั้นต่ำต้องยังเรียกได้ เพื่อจะได้อ่าน compatibility
 * แล้วแสดงหน้า "ต้องอัปเดต" ถ้าบล็อกตรงนี้ด้วย แอปเก่าจะค้างโดยไม่รู้สาเหตุ
 */
@Controller(MOBILE_API_PREFIX)
export class MobileBootstrapController {
  constructor(private readonly orchestrator: MobileBootstrapOrchestrator) {}

  @Get('bootstrap')
  @Auth('ESS_ACCESS')
  async getBootstrap(
    @CurrentUser() user: AuthenticatedUser,
    @MobileClient() client: MobileClientContext,
  ) {
    return this.orchestrator.getBootstrap(user, client);
  }

  @Get('today')
  @Auth('ESS_ACCESS')
  async getToday(@CurrentUser() user: AuthenticatedUser) {
    return this.orchestrator.getToday(user);
  }
}
