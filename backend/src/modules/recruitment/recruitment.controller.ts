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
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

import { RecruitmentService } from './recruitment.service';
import {
  CreateJobApplicationDto,
  CreateJobInterviewDto,
  CreateJobOfferDto,
  CreateJobPostingDto,
  HireApplicantDto,
  ListJobApplicationsQueryDto,
  ListJobPostingsQueryDto,
  MoveApplicationStageDto,
  RecordInterviewResultDto,
  UpdateJobApplicationDto,
  UpdateJobOfferStatusDto,
  UpdateJobPostingDto,
} from './dto/recruitment.dto';

type CurrentUserPayload = { id: string };
type ScopedUser = Pick<AuthenticatedUser, 'scope'>;

@Controller('recruitment')
@Auth()
export class RecruitmentController {
  constructor(private readonly recruitmentService: RecruitmentService) {}

  /* ---------------- Job posting ---------------- */

  @Get('postings')
  @RequirePermissions('RECRUITMENT_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'JobPosting',
    description: 'ดูประกาศรับสมัครงาน',
  })
  findPostings(
    @Query() query: ListJobPostingsQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.recruitmentService.findPostings(query, currentUser.scope);
  }

  @Get('postings/:id')
  @RequirePermissions('RECRUITMENT_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'JobPosting',
    description: 'ดูรายละเอียดประกาศรับสมัคร',
  })
  findPosting(@Param('id') id: string, @CurrentUser() currentUser: ScopedUser) {
    return this.recruitmentService.findPosting(id, currentUser.scope);
  }

  @Post('postings')
  @RequirePermissions('RECRUITMENT_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'JobPosting',
    description: 'สร้างประกาศรับสมัครงาน',
  })
  createPosting(
    @Body() dto: CreateJobPostingDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.recruitmentService.createPosting(
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Patch('postings/:id')
  @RequirePermissions('RECRUITMENT_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'JobPosting',
    description: 'แก้ไขประกาศรับสมัครงาน',
  })
  updatePosting(
    @Param('id') id: string,
    @Body() dto: UpdateJobPostingDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.recruitmentService.updatePosting(id, dto, currentUser.scope);
  }

  @Delete('postings/:id')
  @RequirePermissions('RECRUITMENT_MANAGE')
  @Audit({
    action: AuditAction.DELETE,
    entity: 'JobPosting',
    description: 'ลบประกาศรับสมัครงาน',
  })
  removePosting(
    @Param('id') id: string,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.recruitmentService.removePosting(id, currentUser.scope);
  }

  /* ---------------- Application ---------------- */

  @Get('applications')
  @RequirePermissions('RECRUITMENT_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'JobApplication',
    description: 'ดูรายชื่อผู้สมัคร',
  })
  findApplications(
    @Query() query: ListJobApplicationsQueryDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.recruitmentService.findApplications(query, currentUser.scope);
  }

  @Get('applications/:id')
  @RequirePermissions('RECRUITMENT_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'JobApplication',
    description: 'ดูรายละเอียดผู้สมัคร',
  })
  findApplication(
    @Param('id') id: string,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.recruitmentService.findApplication(id, currentUser.scope);
  }

  @Post('applications')
  @RequirePermissions('RECRUITMENT_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'JobApplication',
    description: 'บันทึกผู้สมัครใหม่',
  })
  createApplication(
    @Body() dto: CreateJobApplicationDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.recruitmentService.createApplication(
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Patch('applications/:id')
  @RequirePermissions('RECRUITMENT_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'JobApplication',
    description: 'แก้ไขข้อมูลผู้สมัคร',
  })
  updateApplication(
    @Param('id') id: string,
    @Body() dto: UpdateJobApplicationDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.recruitmentService.updateApplication(id, dto, currentUser.scope);
  }

  @Post('applications/:id/stage')
  @RequirePermissions('RECRUITMENT_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'JobApplication',
    description: 'เปลี่ยนขั้นตอนของผู้สมัคร',
  })
  moveStage(
    @Param('id') id: string,
    @Body() dto: MoveApplicationStageDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.recruitmentService.moveStage(id, dto, currentUser.scope);
  }

  @Post('applications/:id/hire')
  @RequirePermissions('RECRUITMENT_HIRE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'Employee',
    description: 'จ้างผู้สมัครเป็นพนักงาน',
  })
  hireApplicant(
    @Param('id') id: string,
    @Body() dto: HireApplicantDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.recruitmentService.hireApplicant(
      id,
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  /* ---------------- Interview ---------------- */

  @Post('interviews')
  @RequirePermissions('RECRUITMENT_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'JobInterview',
    description: 'นัดสัมภาษณ์ผู้สมัคร',
  })
  createInterview(
    @Body() dto: CreateJobInterviewDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.recruitmentService.createInterview(
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Post('interviews/:id/result')
  @RequirePermissions('RECRUITMENT_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'JobInterview',
    description: 'บันทึกผลสัมภาษณ์',
  })
  recordInterviewResult(
    @Param('id') id: string,
    @Body() dto: RecordInterviewResultDto,
    @CurrentUser() currentUser: ScopedUser,
  ) {
    return this.recruitmentService.recordInterviewResult(
      id,
      dto,
      currentUser.scope,
    );
  }

  /* ---------------- Offer ---------------- */

  @Post('offers')
  @RequirePermissions('RECRUITMENT_MANAGE')
  @Audit({
    action: AuditAction.CREATE,
    entity: 'JobOffer',
    description: 'ออกใบเสนอจ้าง',
  })
  createOffer(
    @Body() dto: CreateJobOfferDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.recruitmentService.createOffer(
      dto,
      currentUser.id,
      currentUser.scope,
    );
  }

  @Patch('offers/:id/status')
  @RequirePermissions('RECRUITMENT_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'JobOffer',
    description: 'อัปเดตสถานะใบเสนอจ้าง',
  })
  updateOfferStatus(
    @Param('id') id: string,
    @Body() dto: UpdateJobOfferStatusDto,
    @CurrentUser() currentUser: CurrentUserPayload & ScopedUser,
  ) {
    return this.recruitmentService.updateOfferStatus(
      id,
      dto,
      currentUser.scope,
      currentUser.id,
    );
  }
}
