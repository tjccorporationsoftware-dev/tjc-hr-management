import { Body, Controller, Get, Post, Query } from "@nestjs/common";

import { Audit } from "../../common/decorators/audit.decorator";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-user.interface";
import { AuditAction } from "../../generated/prisma/client";
import { CompanyDataService } from "./company-data.service";
import {
  CompanyDataListQueryDto,
  DeleteCompanyDataDto,
  PurgeCompanyDataDto,
} from "./dto/company-data.dto";

/**
 * หน้าดูแลข้อมูลรายบริษัทของผู้ดูแลระดับทั้งระบบ
 *
 * ทุก route ส่ง scope เข้า service ซึ่งจะปฏิเสธถ้าไม่ใช่ระดับ GLOBAL —
 * ที่นี่รับ companyId มาจากผู้เรียกโดยตรง ไม่ได้ยึด scope ของคนล็อกอิน
 * ถ้าไม่กั้น ผู้ดูแลระดับบริษัทจะยิงรหัสบริษัทอื่นเข้ามาลบข้อมูลข้ามบริษัทได้
 */
@Controller("platform/company-data")
@Auth("ORG_MANAGE")
export class CompanyDataController {
  constructor(private readonly companyDataService: CompanyDataService) {}

  @Get("datasets")
  async getDatasets(@CurrentUser() user: AuthenticatedUser) {
    return this.companyDataService.getDatasets(user.scope);
  }

  @Get("summary")
  @Audit({
    action: AuditAction.VIEW,
    entity: "CompanyData",
    description: "ดูสรุปข้อมูลทั้งหมดของบริษัท",
  })
  async getSummary(
    @Query("companyId") companyId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companyDataService.getSummary(companyId, user.scope);
  }

  @Get("items")
  @Audit({
    action: AuditAction.VIEW,
    entity: "CompanyData",
    description: "ดูรายการข้อมูลของบริษัท",
  })
  async getItems(
    @Query() query: CompanyDataListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companyDataService.getItems(query, user.scope);
  }

  @Post("delete")
  @Audit({
    action: AuditAction.DELETE,
    entity: "CompanyData",
    description: "ลบข้อมูลของบริษัทที่เลือกไว้",
  })
  async deleteItems(
    @Body() dto: DeleteCompanyDataDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companyDataService.deleteItems(dto, user.scope);
  }

  @Post("purge")
  @Audit({
    action: AuditAction.DELETE,
    entity: "CompanyData",
    description: "ลบข้อมูลของบริษัททั้งชุดตามช่วงวันที่",
  })
  async purge(
    @Body() dto: PurgeCompanyDataDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companyDataService.purge(dto, user.scope);
  }
}
