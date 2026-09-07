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
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

import { PerformanceService } from './performance.service';
import { CreateEvaluationFormDto } from './dto/create-evaluation-form.dto';
import { UpdateEvaluationFormDto } from './dto/update-evaluation-form.dto';
import { ListEvaluationFormsQueryDto } from './dto/list-evaluation-forms-query.dto';
import { CreateEvaluatorDto } from './dto/create-evaluator.dto';
import { ListEvaluatorsQueryDto } from './dto/list-evaluators-query.dto';
import { CreateEvaluationResultDto } from './dto/create-evaluation-result.dto';
import { UpdateEvaluationResultDto } from './dto/update-evaluation-result.dto';
import { ListEvaluationResultsQueryDto } from './dto/list-evaluation-results-query.dto';
import { EvaluationActionDto } from './dto/evaluation-action.dto';
import { CreateWarningLetterDto } from './dto/create-warning-letter.dto';
import { UpdateWarningLetterDto } from './dto/update-warning-letter.dto';
import { ListWarningLettersQueryDto } from './dto/list-warning-letters-query.dto';
import { WarningLetterActionDto } from './dto/warning-letter-action.dto';
import { CreateDisciplinaryHistoryDto } from './dto/create-disciplinary-history.dto';
import { ListDisciplinaryHistoriesQueryDto } from './dto/list-disciplinary-histories-query.dto';

type CurrentUserPayload = {
  id: string;
  email?: string;
  displayName?: string;
};

type ScopedUser = Pick<
  import('../../common/interfaces/authenticated-user.interface').AuthenticatedUser,
  'scope'
>;

@Controller('performance')
@Auth()
export class PerformanceController {
  constructor(private readonly performanceService: PerformanceService) {}

  @Get('forms')
  @RequirePermissions('PERFORMANCE_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'EvaluationForm',
    description: 'ดูรายการแบบประเมินพนักงาน',
  })
  async findForms(
    @Query() query: ListEvaluationFormsQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.performanceService.findForms(query, currentUser.scope);
  }

  @Get('forms/:id')
  @RequirePermissions('PERFORMANCE_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'EvaluationForm',
    description: 'ดูรายละเอียดแบบประเมินพนักงาน',
  })
  async findForm(@Param('id') id: string) {
    return this.performanceService.findForm(id);
  }

  @Post('forms')
  @RequirePermissions('PERFORMANCE_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'EvaluationForm',
    description: 'สร้างแบบประเมินพนักงาน',
  })
  async createForm(
    @Body() dto: CreateEvaluationFormDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.performanceService.createForm(
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Patch('forms/:id')
  @RequirePermissions('PERFORMANCE_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'EvaluationForm',
    description: 'แก้ไขแบบประเมินพนักงาน',
  })
  async updateForm(
    @Param('id') id: string,
    @Body() dto: UpdateEvaluationFormDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.performanceService.updateForm(
      id,
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Delete('forms/:id')
  @RequirePermissions('PERFORMANCE_MANAGE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'EvaluationForm',
    description: 'ลบ/ปิดใช้งานแบบประเมินพนักงาน',
  })
  async removeForm(
    @Param('id') id: string,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.performanceService.removeForm(id, currentUser.scope);
  }

  @Get('evaluators')
  @RequirePermissions('PERFORMANCE_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'Evaluator',
    description: 'ดูรายการผู้ประเมิน',
  })
  async findEvaluators(@Query() query: ListEvaluatorsQueryDto) {
    return this.performanceService.findEvaluators(query);
  }

  @Post('evaluators')
  @RequirePermissions('PERFORMANCE_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'Evaluator',
    description: 'กำหนดผู้ประเมิน',
  })
  async createEvaluator(
    @Body() dto: CreateEvaluatorDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.performanceService.createEvaluator(
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Delete('evaluators/:id')
  @RequirePermissions('PERFORMANCE_MANAGE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'Evaluator',
    description: 'ปิดใช้งานผู้ประเมิน',
  })
  async removeEvaluator(
    @Param('id') id: string,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.performanceService.removeEvaluator(id, currentUser.scope);
  }

  @Get('results')
  @RequirePermissions('PERFORMANCE_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'EvaluationResult',
    description: 'ดูรายการผลการประเมินพนักงาน',
  })
  async findResults(
    @Query() query: ListEvaluationResultsQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.performanceService.findResults(query, currentUser.scope);
  }

  @Get('results/:id')
  @RequirePermissions('PERFORMANCE_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'EvaluationResult',
    description: 'ดูรายละเอียดผลการประเมินพนักงาน',
  })
  async findResult(@Param('id') id: string) {
    return this.performanceService.findResult(id);
  }

  @Post('results')
  @RequirePermissions('PERFORMANCE_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'EvaluationResult',
    description: 'บันทึกผลการประเมินพนักงาน',
  })
  async createResult(
    @Body() dto: CreateEvaluationResultDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.performanceService.createResult(
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Patch('results/:id')
  @RequirePermissions('PERFORMANCE_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'EvaluationResult',
    description: 'แก้ไขผลการประเมินพนักงาน',
  })
  async updateResult(
    @Param('id') id: string,
    @Body() dto: UpdateEvaluationResultDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.performanceService.updateResult(
      id,
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post('results/:id/submit')
  @RequirePermissions('PERFORMANCE_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'EvaluationResult',
    description: 'ส่งผลการประเมินพนักงาน',
  })
  async submitResult(
    @Param('id') id: string,
    @Body() _dto: EvaluationActionDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.performanceService.submitResult(
      id,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post('results/:id/finalize')
  @RequirePermissions('PERFORMANCE_MANAGE')
  @Audit({
    action: AuditAction.APPROVE,
    entity: 'EvaluationResult',
    description: 'สรุปผลการประเมินพนักงาน',
  })
  async finalizeResult(
    @Param('id') id: string,
    @Body() _dto: EvaluationActionDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.performanceService.finalizeResult(
      id,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post('results/:id/cancel')
  @RequirePermissions('PERFORMANCE_MANAGE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'EvaluationResult',
    description: 'ยกเลิกผลการประเมินพนักงาน',
  })
  async cancelResult(
    @Param('id') id: string,
    @Body() _dto: EvaluationActionDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.performanceService.cancelResult(
      id,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Get('warnings')
  @RequirePermissions('PERFORMANCE_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'WarningLetter',
    description: 'ดูรายการหนังสือเตือน',
  })
  async findWarningLetters(
    @Query() query: ListWarningLettersQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.performanceService.findWarningLetters(query, currentUser.scope);
  }

  @Get('warnings/:id')
  @RequirePermissions('PERFORMANCE_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'WarningLetter',
    description: 'ดูรายละเอียดหนังสือเตือน',
  })
  async findWarningLetter(@Param('id') id: string) {
    return this.performanceService.findWarningLetter(id);
  }

  @Post('warnings')
  @RequirePermissions('WARNING_LETTER_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'WarningLetter',
    description: 'สร้างหนังสือเตือน',
  })
  async createWarningLetter(
    @Body() dto: CreateWarningLetterDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.performanceService.createWarningLetter(
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Patch('warnings/:id')
  @RequirePermissions('WARNING_LETTER_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'WarningLetter',
    description: 'แก้ไขหนังสือเตือน',
  })
  async updateWarningLetter(
    @Param('id') id: string,
    @Body() dto: UpdateWarningLetterDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.performanceService.updateWarningLetter(
      id,
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post('warnings/:id/issue')
  @RequirePermissions('WARNING_LETTER_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'WarningLetter',
    description: 'ออกหนังสือเตือน',
  })
  async issueWarningLetter(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.performanceService.issueWarningLetter(
      id,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post('warnings/:id/acknowledge')
  @RequirePermissions('WARNING_LETTER_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'WarningLetter',
    description: 'รับทราบหนังสือเตือน',
  })
  async acknowledgeWarningLetter(
    @Param('id') id: string,
    @Body() dto: WarningLetterActionDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.performanceService.acknowledgeWarningLetter(
      id,
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post('warnings/:id/cancel')
  @RequirePermissions('WARNING_LETTER_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'WarningLetter',
    description: 'ยกเลิกหนังสือเตือน',
  })
  async cancelWarningLetter(
    @Param('id') id: string,
    @Body() dto: WarningLetterActionDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.performanceService.cancelWarningLetter(
      id,
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Delete('warnings/:id')
  @RequirePermissions('WARNING_LETTER_MANAGE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'WarningLetter',
    description: 'ลบหนังสือเตือนสถานะร่าง',
  })
  async removeWarningLetter(
    @Param('id') id: string,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.performanceService.removeWarningLetter(id, currentUser.scope);
  }

  @Get('disciplinary-histories')
  @RequirePermissions('PERFORMANCE_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'DisciplinaryHistory',
    description: 'ดูประวัติวินัยพนักงาน',
  })
  async findDisciplinaryHistories(
    @Query() query: ListDisciplinaryHistoriesQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.performanceService.findDisciplinaryHistories(
      query,
      currentUser.scope,
    );
  }

  @Post('disciplinary-histories')
  @RequirePermissions('WARNING_LETTER_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'DisciplinaryHistory',
    description: 'บันทึกประวัติวินัยพนักงาน',
  })
  async createDisciplinaryHistory(
    @Body() dto: CreateDisciplinaryHistoryDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.performanceService.createDisciplinaryHistory(
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }
}