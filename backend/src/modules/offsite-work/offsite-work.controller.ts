import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AuditAction } from '../../generated/prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CreateOffsiteWorkRequestDto } from './dto/create-offsite-work-request.dto';
import { ListOffsiteWorkRequestsQueryDto } from './dto/list-offsite-work-requests-query.dto';
import { OffsiteWorkActionDto } from './dto/offsite-work-action.dto';
import { UpdateOffsiteWorkRequestDto } from './dto/update-offsite-work-request.dto';
import { VerifyOffsiteLocationDto } from './dto/verify-offsite-location.dto';
import { OffsiteWorkService } from './offsite-work.service';
import type { CurrentUserLike } from './types/offsite-work.types';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

@Auth()
@Controller('offsite-work')
export class OffsiteWorkController {
  constructor(private readonly offsiteWorkService: OffsiteWorkService) {}

  @Get('requests/my')
  @RequirePermissions('OFFSITE_REQUEST_CREATE')
  @Audit({ action: AuditAction.VIEW, entity: 'OffsiteWorkRequest', description: 'ดูคำขอทำงานนอกสถานที่ของตนเอง' })
  findMy(
    @Query() query: ListOffsiteWorkRequestsQueryDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.offsiteWorkService.findMy(query, currentUser);
  }

  @Get('requests/my/approved')
  @RequirePermissions('OFFSITE_REQUEST_CREATE')
  @Audit({ action: AuditAction.VIEW, entity: 'OffsiteWorkRequest', description: 'ดู Offsite ที่อนุมัติแล้วสำหรับลงเวลา' })
  findMyApprovedForPunch(
    @Query('workDate') workDate: string | undefined,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.offsiteWorkService.findMyApprovedForPunch(currentUser, workDate);
  }

  @Get('requests/my/:id')
  @RequirePermissions('OFFSITE_REQUEST_CREATE')
  @Audit({ action: AuditAction.VIEW, entity: 'OffsiteWorkRequest', description: 'ดูรายละเอียดคำขอทำงานนอกสถานที่ของตนเอง' })
  findMyOne(@Param('id') id: string, @CurrentUser() currentUser: CurrentUserLike) {
    return this.offsiteWorkService.findMyOne(id, currentUser);
  }

  @Patch('requests/my/:id')
  @RequirePermissions('OFFSITE_REQUEST_CREATE')
  @Audit({ action: AuditAction.UPDATE, entity: 'OffsiteWorkRequest', description: 'แก้ไขคำขอทำงานนอกสถานที่ของตนเอง' })
  updateMy(
    @Param('id') id: string,
    @Body() dto: UpdateOffsiteWorkRequestDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.offsiteWorkService.updateMy(id, dto, currentUser);
  }

  @Post('requests/my/:id/submit')
  @RequirePermissions('OFFSITE_REQUEST_CREATE')
  @Audit({ action: AuditAction.UPDATE, entity: 'OffsiteWorkRequest', description: 'ส่งคำขอทำงานนอกสถานที่เพื่อขออนุมัติ' })
  submitMy(@Param('id') id: string, @CurrentUser() currentUser: CurrentUserLike) {
    return this.offsiteWorkService.submitMy(id, currentUser);
  }

  @Post('requests/my/:id/cancel')
  @RequirePermissions('OFFSITE_REQUEST_CREATE')
  @Audit({ action: AuditAction.UPDATE, entity: 'OffsiteWorkRequest', description: 'ยกเลิกคำขอทำงานนอกสถานที่ของตนเอง' })
  cancelMy(
    @Param('id') id: string,
    @Body() dto: OffsiteWorkActionDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.offsiteWorkService.cancelMy(id, dto, currentUser);
  }

  @Delete('requests/my/:id')
  @RequirePermissions('OFFSITE_REQUEST_CREATE')
  @Audit({ action: AuditAction.DELETE, entity: 'OffsiteWorkRequest', description: 'ลบคำขอทำงานนอกสถานที่ของตนเอง' })
  deleteMy(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.offsiteWorkService.deleteMy(id, currentUser);
  }

  @Get('requests/approvals/pending')
  @RequirePermissions('OFFSITE_REQUEST_APPROVE')
  @Audit({ action: AuditAction.VIEW, entity: 'OffsiteWorkRequest', description: 'ดูคำขอ Offsite ที่รออนุมัติ' })
  findPendingApprovals(
    @Query() query: ListOffsiteWorkRequestsQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.offsiteWorkService.findPendingApprovals(
      query,
      currentUser,
      currentUser.scope,
    );
  }

  @Get('requests')
  @RequirePermissions('OFFSITE_REQUEST_READ')
  @Audit({ action: AuditAction.VIEW, entity: 'OffsiteWorkRequest', description: 'ดูรายการคำขอทำงานนอกสถานที่' })
  findAll(
    @Query() query: ListOffsiteWorkRequestsQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.offsiteWorkService.findAll(query, currentUser.scope);
  }

  @Post('requests')
  @RequirePermissions('OFFSITE_REQUEST_CREATE')
  @Audit({ action: AuditAction.CREATE, entity: 'OffsiteWorkRequest', description: 'สร้างคำขอทำงานนอกสถานที่' })
  create(
    @Body() dto: CreateOffsiteWorkRequestDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.offsiteWorkService.create(dto, currentUser, currentUser.scope);
  }

  @Post('verify-location')
  @RequirePermissions('OFFSITE_REQUEST_CREATE')
  @Audit({ action: AuditAction.VIEW, entity: 'OffsiteWorkRequest', description: 'ตรวจสอบสิทธิ์และช่วงเวลา Offsite ก่อนลงเวลา' })
  verifyLocation(
    @Body() dto: VerifyOffsiteLocationDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.offsiteWorkService.verifyLocation(dto, currentUser);
  }

  @Get('requests/:id')
  @RequirePermissions('OFFSITE_REQUEST_READ')
  @Audit({ action: AuditAction.VIEW, entity: 'OffsiteWorkRequest', description: 'ดูรายละเอียดคำขอทำงานนอกสถานที่' })
  findOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.offsiteWorkService.findOne(id, currentUser.scope);
  }

  @Patch('requests/:id')
  @RequirePermissions('OFFSITE_REQUEST_MANAGE')
  @Audit({ action: AuditAction.UPDATE, entity: 'OffsiteWorkRequest', description: 'แก้ไขคำขอทำงานนอกสถานที่' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOffsiteWorkRequestDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.offsiteWorkService.update(id, dto, currentUser.scope);
  }

  @Post('requests/:id/submit')
  @RequirePermissions('OFFSITE_REQUEST_CREATE')
  @Audit({ action: AuditAction.UPDATE, entity: 'OffsiteWorkRequest', description: 'ส่งคำขอทำงานนอกสถานที่เพื่อขออนุมัติ' })
  submit(@Param('id') id: string, @CurrentUser() currentUser: CurrentUserLike) {
    return this.offsiteWorkService.submit(id, currentUser);
  }

  @Post('requests/:id/approve')
  @RequirePermissions('OFFSITE_REQUEST_APPROVE')
  @Audit({ action: AuditAction.APPROVE, entity: 'OffsiteWorkRequest', description: 'อนุมัติคำขอทำงานนอกสถานที่' })
  approve(
    @Param('id') id: string,
    @Body() dto: OffsiteWorkActionDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.offsiteWorkService.approve(id, dto, currentUser);
  }

  @Post('requests/:id/reject')
  @RequirePermissions('OFFSITE_REQUEST_APPROVE')
  @Audit({ action: AuditAction.REJECT, entity: 'OffsiteWorkRequest', description: 'ไม่อนุมัติคำขอทำงานนอกสถานที่' })
  reject(
    @Param('id') id: string,
    @Body() dto: OffsiteWorkActionDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.offsiteWorkService.reject(id, dto, currentUser);
  }

  @Post('requests/:id/cancel')
  @RequirePermissions('OFFSITE_REQUEST_MANAGE')
  @Audit({ action: AuditAction.UPDATE, entity: 'OffsiteWorkRequest', description: 'ยกเลิกคำขอทำงานนอกสถานที่' })
  cancel(
    @Param('id') id: string,
    @Body() dto: OffsiteWorkActionDto,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.offsiteWorkService.cancel(id, dto, currentUser);
  }
}
