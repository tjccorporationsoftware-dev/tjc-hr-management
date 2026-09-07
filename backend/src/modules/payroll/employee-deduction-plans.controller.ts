import {
  Body,
  Controller,
  Delete,
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
import {
  CreateEmployeeDeductionPlanDto,
  EmployeeDeductionPlanActionDto,
  EmployeeDeductionPlanQueryDto,
  UpdateEmployeeDeductionPlanDto,
} from './dto/employee-deduction-plan.dto';
import { EmployeeDeductionPlansService } from './services/employee-deduction-plans.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

type ScopedUser = Pick<AuthenticatedUser, 'scope'>;

/**
 * แผนหักเงินเดือนแบบผ่อนงวด — กยศ./กรอ. เงินกู้พนักงาน สหกรณ์
 * การหักจริงเกิดตอนคำนวณ payroll run ไม่ได้เกิดจาก endpoint พวกนี้
 */
@Controller('payroll/deduction-plans')
export class EmployeeDeductionPlansController {
  constructor(private readonly service: EmployeeDeductionPlansService) {}

  @Get()
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'EmployeeDeductionPlan',
    description: 'ดูรายการแผนหักเงินเดือนแบบผ่อนงวด',
  })
  findAll(
    @Query() query: EmployeeDeductionPlanQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.service.findAll(query, currentUser.scope);
  }

  @Get(':id')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'EmployeeDeductionPlan',
    description: 'ดูรายละเอียดและประวัติการหักของแผน',
  })
  findOne(@Param('id') id: string, @CurrentUser() currentUser: ScopedUser) {
    return this.service.findOne(id, currentUser.scope);
  }

  @Post()
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'EmployeeDeductionPlan',
    description: 'สร้างแผนหักเงินเดือนแบบผ่อนงวด',
  })
  create(
    @Body() dto: CreateEmployeeDeductionPlanDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.service.create(dto, currentUser.scope);
  }

  @Patch(':id')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'EmployeeDeductionPlan',
    description: 'แก้ไขแผนหักเงินเดือน',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDeductionPlanDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.service.update(id, dto, currentUser.scope);
  }

  @Post(':id/suspend')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'EmployeeDeductionPlan',
    description: 'พักการหักชั่วคราว',
  })
  suspend(
    @Param('id') id: string,
    @Body() dto: EmployeeDeductionPlanActionDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.service.suspend(id, currentUser.scope, dto.reason);
  }

  @Post(':id/resume')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'EmployeeDeductionPlan',
    description: 'กลับมาหักต่อ',
  })
  resume(@Param('id') id: string, @CurrentUser() currentUser: ScopedUser) {
    return this.service.resume(id, currentUser.scope);
  }

  @Post(':id/cancel')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'EmployeeDeductionPlan',
    description: 'ยกเลิกแผนหักเงินเดือน',
  })
  cancel(
    @Param('id') id: string,
    @Body() dto: EmployeeDeductionPlanActionDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.service.cancel(id, currentUser.scope, dto.reason);
  }

  @Delete(':id')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'EmployeeDeductionPlan',
    description: 'ลบแผนหักเงินเดือนที่ยังไม่เคยหัก',
  })
  remove(@Param('id') id: string, @CurrentUser() currentUser: ScopedUser) {
    return this.service.remove(id, currentUser.scope);
  }
}
