import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuditAction } from '../../generated/prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { GenerateLeaveBalancesBulkDto } from './dto/generate-leave-balances-bulk.dto';
import { GenerateLeaveBalancesDto } from './dto/generate-leave-balances.dto';
import { ListLeaveBalancesQueryDto } from './dto/list-leave-balances-query.dto';
import { UpdateLeaveBalanceDto } from './dto/update-leave-balance.dto';
import { LeaveBalancesService } from './leave-balances.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

type CurrentUserLike = {
  id?: string;
  userId?: string;
  email?: string;
};

type ScopedUser = Pick<AuthenticatedUser, 'scope'>;

@Auth()
@Controller('leaves/balances')
export class LeaveBalancesController {
  constructor(private readonly leaveBalancesService: LeaveBalancesService) {}

  @Get()
  @RequirePermissions('LEAVE_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'LeaveBalance',
    description: 'ดูรายการวันลาคงเหลือ',
  })
  findAll(
    @Query() query: ListLeaveBalancesQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.leaveBalancesService.findAll(query, currentUser.scope);
  }

  @Get('my')
  @RequirePermissions('LEAVE_CREATE')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'LeaveBalance',
    description: 'ดูวันลาคงเหลือของตนเอง',
  })
  findMy(
    @Query('year') year: string | undefined,
    @CurrentUser() currentUser: CurrentUserLike,
  ) {
    return this.leaveBalancesService.findMy(
      {
        year: year ? Number(year) : undefined,
      },
      currentUser,
    );
  }

  @Get(':id')
  @RequirePermissions('LEAVE_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'LeaveBalance',
    description: 'ดูรายละเอียดวันลาคงเหลือ',
  })
  findOne(@Param('id') id: string) {
    return this.leaveBalancesService.findOne(id);
  }

  @Post('generate')
  @RequirePermissions('LEAVE_QUOTA_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'LeaveBalance',
    description: 'สร้างวันลาคงเหลือจากนโยบายวันลา',
  })
  generate(
    @Body() dto: GenerateLeaveBalancesDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.leaveBalancesService.generateForEmployee(
      dto,
      true,
      currentUser.scope,
    );
  }

  /*
   * สร้างยอดให้หลายคนรวดเดียว — ใช้ตอน HR เปิดใช้ระบบครั้งแรก
   * หรือหลังแก้โควตาในหน้านโยบายแล้วต้องการให้ยอดที่สร้างไว้แล้วตามค่าใหม่
   */
  @Post('generate-bulk')
  @RequirePermissions('LEAVE_QUOTA_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'LeaveBalance',
    description: 'สร้างวันลาคงเหลือจากนโยบายให้พนักงานหลายคน',
  })
  generateBulk(
    @Body() dto: GenerateLeaveBalancesBulkDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.leaveBalancesService.generateForMany(dto, currentUser.scope);
  }

  @Patch(':id')
  @RequirePermissions('LEAVE_QUOTA_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'LeaveBalance',
    description: 'ปรับปรุงวันลาคงเหลือ',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeaveBalanceDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.leaveBalancesService.update(id, dto, currentUser.scope);
  }
}