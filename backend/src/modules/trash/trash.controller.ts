import { Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";

import { Audit } from "../../common/decorators/audit.decorator";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-user.interface";
import { AuditAction } from "../../generated/prisma/client";
import { TrashQueryDto } from "./dto/trash-query.dto";
import { TrashService } from "./trash.service";

/**
 * ถังขยะรวมของทั้งระบบ (~61 โมเดล)
 *
 * ทุก route ต้องส่ง scope ของผู้เรียกเข้า service เสมอ ไม่งั้นผู้ดูแลระดับบริษัท
 * จะเห็นและลบถาวรข้อมูลของบริษัทอื่นได้ เพราะ service ค้นด้วย id ล้วน
 */
@Controller("trash")
@Auth("ORG_MANAGE")
export class TrashController {
  constructor(private readonly trashService: TrashService) {}

  @Get("summary")
  @Audit({
    action: AuditAction.VIEW,
    entity: "Trash",
    description: "ดูสรุปรายการในถังขยะ",
  })
  async getSummary(
    @Query() query: TrashQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.trashService.getSummary(query, user.scope);
  }

  @Get("items")
  @Audit({
    action: AuditAction.VIEW,
    entity: "Trash",
    description: "ดูรายการในถังขยะ",
  })
  async findItems(
    @Query() query: TrashQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.trashService.findItems(query, user.scope);
  }

  @Post("items/:type/:id/restore")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "Trash",
    description: "กู้คืนรายการจากถังขยะ",
  })
  async restoreItem(
    @Param("type") type: string,
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.trashService.restoreItem(type, id, user.scope);
  }

  @Delete("items/:type/:id/permanent")
  @Audit({
    action: AuditAction.DELETE,
    entity: "Trash",
    description: "ลบรายการออกจากถังขยะถาวร",
  })
  async permanentlyDeleteItem(
    @Param("type") type: string,
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.trashService.permanentlyDeleteItem(type, id, user.scope);
  }
}
