import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  assertWithinScope,
  effectiveCompanyId,
  tenantWhere,
} from '../../common/tenant/tenant-scope.util';
import { thaiToday, toThaiDateOnly } from '../../common/utils/thai-date.util';
import {
  EmployeeTransferStatus,
  Prisma,
  WorkHistoryType,
} from '../../generated/prisma/client';

import { CancelEmployeeTransferDto } from './dto/cancel-employee-transfer.dto';
import { CreateEmployeeTransferDto } from './dto/create-employee-transfer.dto';
import { ListEmployeeTransfersQueryDto } from './dto/list-employee-transfers-query.dto';
import { EmployeesService } from '../employees/employees.service';

type TransferActor = Pick<AuthenticatedUser, 'id' | 'scope'>;

/**
 * ค่าที่ผู้ใช้ "ตั้งใจเปลี่ยน" ในใบเดียว
 *
 * แยก undefined (ไม่แตะ) ออกจาก null (ถอดออก) ให้ชัด เพราะสองอย่างนี้
 * ให้ผลต่างกันคนละทางตอนเขียนลงทะเบียนพนักงาน
 */
type TransferTarget = {
  branchId?: string | null;
  departmentId?: string | null;
  divisionId?: string | null;
  positionId?: string | null;
  positionTitle?: string | null;
  employeeTypeId?: string | null;
  supervisorId?: string | null;
};

@Injectable()
export class EmployeeTransfersService {
  private readonly logger = new Logger(EmployeeTransfersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly employeesService: EmployeesService,
  ) {}

  /* =========================================================
     อ่าน
  ========================================================= */

  async findAll(query: ListEmployeeTransfersQueryDto, actor: TransferActor) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where = this.buildListWhere(query, actor);

    const [items, total, statusCounts] = await Promise.all([
      this.prisma.employeeTransfer.findMany({
        where,
        skip,
        take: pageSize,
        /*
         * ใบที่ยังไม่ถึงวันต้องอยู่บนสุดเสมอ เพราะเป็นของที่ต้องคอยดู
         * ส่วนใบที่มีผลไปแล้วเป็นประวัติ เรียงวันล่าสุดก่อนก็พอ
         */
        orderBy: [{ status: 'asc' }, { effectiveDate: 'desc' }],
        include: this.transferInclude(),
      }),
      this.prisma.employeeTransfer.count({ where }),
      this.prisma.employeeTransfer.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
    ]);

    const countOf = (status: EmployeeTransferStatus) =>
      statusCounts.find((row) => row.status === status)?._count._all ?? 0;

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary: {
        total,
        scheduled: countOf(EmployeeTransferStatus.SCHEDULED),
        applied: countOf(EmployeeTransferStatus.APPLIED),
        cancelled: countOf(EmployeeTransferStatus.CANCELLED),
      },
    };
  }

  async findOne(id: string, actor: TransferActor) {
    const transfer = await this.prisma.employeeTransfer.findFirst({
      where: {
        id,
        ...this.scopeWhere(actor),
      },
      include: this.transferInclude(),
    });

    if (!transfer) {
      throw new NotFoundException('ไม่พบใบโยกย้าย');
    }

    return transfer;
  }

  /* =========================================================
     สร้าง
  ========================================================= */

  async create(dto: CreateEmployeeTransferDto, actor: TransferActor) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: dto.employeeId,
        deletedAt: null,
        ...(tenantWhere(actor.scope) as Prisma.EmployeeWhereInput),
      },
      select: {
        id: true,
        companyId: true,
        branchId: true,
        departmentId: true,
        divisionId: true,
        positionId: true,
        position: true,
        employeeTypeId: true,
        supervisorId: true,
        status: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('ไม่พบข้อมูลพนักงาน');
    }

    const effectiveDate = toThaiDateOnly(new Date(dto.effectiveDate));
    const target = await this.resolveTarget(dto, employee.companyId, actor);

    /*
     * ใบที่ไม่ได้เปลี่ยนอะไรเลยคือใบเปล่า — ปล่อยผ่านแล้วจะไปสร้างประวัติการทำงาน
     * ที่บอกว่า "ย้าย" ทั้งที่ทุกช่องเหมือนเดิม ซึ่งอ่านย้อนหลังแล้วชวนสับสน
     */
    const changed = this.diffTarget(employee, target);
    if (!changed.length) {
      throw new BadRequestException(
        'ใบโยกย้ายต้องมีการเปลี่ยนแปลงอย่างน้อยหนึ่งอย่าง',
      );
    }

    /*
     * ตรวจ "สังกัดที่จะเป็นหลังย้าย" ทั้งชุดด้วยกติกาเดียวกับฟอร์มแก้ทะเบียน
     * ตรวจตอนสร้างใบ ไม่ใช่ตอนถึงวันมีผล เพราะถ้าไปตรวจตอนนั้นแล้วไม่ผ่าน
     * ใบจะค้างอยู่ในคิวและเด้ง error ทุกคืนโดยไม่มีใครเห็น — ผิดพลาดตอนกรอก
     * ต้องบอกคนกรอกทันทีขณะที่ยังแก้ได้
     */
    await this.employeesService.assertEmploymentTargetValid({
      employeeId: employee.id,
      companyId: employee.companyId,
      branchId: this.nextValue(employee.branchId, target.branchId),
      departmentId: this.nextValue(employee.departmentId, target.departmentId),
      divisionId: this.nextValue(employee.divisionId, target.divisionId),
      positionId: this.nextValue(employee.positionId, target.positionId),
      employeeTypeId: this.nextValue(
        employee.employeeTypeId,
        target.employeeTypeId,
      ),
      supervisorId: this.nextValue(
        employee.supervisorId,
        target.supervisorId,
      ),
    });

    /*
     * ใบที่ยังไม่ถึงวันของคนเดียวกันซ้อนกันได้ แต่ต้องคนละวัน
     * ไม่งั้นสองใบของวันเดียวกันจะเขียนทับกันโดยลำดับที่ไม่มีใครกำหนด
     */
    const duplicate = await this.prisma.employeeTransfer.findFirst({
      where: {
        employeeId: employee.id,
        status: EmployeeTransferStatus.SCHEDULED,
        effectiveDate,
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new BadRequestException(
        'พนักงานคนนี้มีใบโยกย้ายที่รอมีผลในวันเดียวกันอยู่แล้ว',
      );
    }

    const created = await this.prisma.employeeTransfer.create({
      data: {
        companyId: employee.companyId,
        employeeId: employee.id,
        status: EmployeeTransferStatus.SCHEDULED,
        type: this.resolveHistoryType(changed),
        effectiveDate,
        documentNo: this.optionalTrim(dto.documentNo),
        reason: this.optionalTrim(dto.reason),
        note: this.optionalTrim(dto.note),

        fromBranchId: employee.branchId,
        toBranchId: this.nextValue(employee.branchId, target.branchId),
        fromDepartmentId: employee.departmentId,
        toDepartmentId: this.nextValue(
          employee.departmentId,
          target.departmentId,
        ),
        fromDivisionId: employee.divisionId,
        toDivisionId: this.nextValue(employee.divisionId, target.divisionId),
        fromPositionId: employee.positionId,
        toPositionId: this.nextValue(employee.positionId, target.positionId),
        fromPositionTitle: employee.position,
        toPositionTitle: this.nextValue(employee.position, target.positionTitle),
        fromEmployeeTypeId: employee.employeeTypeId,
        toEmployeeTypeId: this.nextValue(
          employee.employeeTypeId,
          target.employeeTypeId,
        ),
        fromSupervisorId: employee.supervisorId,
        toSupervisorId: this.nextValue(
          employee.supervisorId,
          target.supervisorId,
        ),

        createdById: actor.id,
      },
      select: { id: true },
    });

    /*
     * ใบที่วันมีผลคือวันนี้หรือย้อนหลัง ต้องมีผลทันทีตั้งแต่ตอนกดบันทึก
     * ถ้ารอให้ตัวจับเวลารอบถัดไปมาทำ ทะเบียนจะยังเป็นสังกัดเดิมไปทั้งวัน
     */
    if (effectiveDate.getTime() <= thaiToday().getTime()) {
      await this.applyTransfer(created.id);
    }

    return this.findOne(created.id, actor);
  }

  /* =========================================================
     ยกเลิก / สั่งให้มีผลเอง
  ========================================================= */

  async cancel(
    id: string,
    dto: CancelEmployeeTransferDto,
    actor: TransferActor,
  ) {
    const transfer = await this.findOne(id, actor);

    if (transfer.status !== EmployeeTransferStatus.SCHEDULED) {
      throw new BadRequestException(
        transfer.status === EmployeeTransferStatus.APPLIED
          ? 'ใบนี้มีผลไปแล้ว ยกเลิกไม่ได้ — ถ้าต้องการย้ายกลับให้สร้างใบใหม่'
          : 'ใบนี้ถูกยกเลิกไปแล้ว',
      );
    }

    await this.prisma.employeeTransfer.update({
      where: { id },
      data: {
        status: EmployeeTransferStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledById: actor.id,
        cancelReason: this.optionalTrim(dto.cancelReason),
      },
    });

    return this.findOne(id, actor);
  }

  /** สั่งให้ใบที่ตั้งไว้มีผลทันที โดยไม่รอถึงวัน */
  async applyNow(id: string, actor: TransferActor) {
    const transfer = await this.findOne(id, actor);

    if (transfer.status !== EmployeeTransferStatus.SCHEDULED) {
      throw new BadRequestException('ใบนี้ไม่ได้อยู่ในสถานะรอมีผล');
    }

    await this.applyTransfer(id);

    return this.findOne(id, actor);
  }

  /* =========================================================
     ตัวจับเวลา
  ========================================================= */

  /**
   * ทำให้ใบที่ถึงวันแล้วมีผล
   *
   * เรียกจากงานตามตารางเวลา (ดู employee-transfers.processor) และตอนบูต
   * เพราะเซิร์ฟเวอร์ที่ดับข้ามคืนจะพลาดรอบของวันนั้นไปทั้งวัน
   *
   * ทำทีละใบและกลืน error รายใบ — ใบหนึ่งพังต้องไม่ทำให้ใบที่เหลือค้าง
   */
  async applyDueTransfers(now: Date = new Date()) {
    const today = thaiToday(now);

    const due = await this.prisma.employeeTransfer.findMany({
      where: {
        status: EmployeeTransferStatus.SCHEDULED,
        effectiveDate: { lte: today },
      },
      // ใบเก่าก่อน เผื่อคนเดียวมีหลายใบค้างพร้อมกัน ผลสุดท้ายจะได้เป็นใบล่าสุด
      orderBy: { effectiveDate: 'asc' },
      select: { id: true },
    });

    let applied = 0;
    const failed: string[] = [];

    for (const transfer of due) {
      try {
        await this.applyTransfer(transfer.id);
        applied += 1;
      } catch (error) {
        failed.push(transfer.id);
        this.logger.error(
          `ทำใบโยกย้าย ${transfer.id} ให้มีผลไม่สำเร็จ: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (due.length) {
      this.logger.log(
        `ใบโยกย้ายถึงกำหนด ${due.length} ใบ — สำเร็จ ${applied} ใบ ล้มเหลว ${failed.length} ใบ`,
      );
    }

    return { due: due.length, applied, failed };
  }

  /**
   * เขียนใบหนึ่งลงทะเบียนพนักงานจริง
   *
   * ค่าที่ใช้เทียบ "ก่อน/หลัง" อ่านจากพนักงานสด ๆ ในทรานแซกชันนี้ ไม่ใช่ค่า from*
   * ที่บันทึกไว้ตอนสร้าง เพราะระหว่างรอถึงวัน ข้อมูลอาจถูกแก้ด้วยมือหรือมีใบอื่น
   * มีผลไปก่อน — แล้วเขียนค่า from* ทับด้วยของจริง ประวัติจะได้ตรงกับที่เกิดขึ้น
   */
  private async applyTransfer(id: string) {
    await this.prisma.$transaction(async (tx) => {
      /*
       * จองใบไว้ก่อนทำอะไรทั้งสิ้น ด้วยการเปลี่ยนสถานะแบบมีเงื่อนไข
       *
       * ตัวเรียกมีหลายทาง — งานตามตาราง ตอนบูต และปุ่ม "ให้มีผลทันที" — และตอน
       * รันหลาย instance ทุกเครื่องจะไล่ใบค้างพร้อมกันตอนบูต การอ่านสถานะแล้วค่อย
       * เขียนทีหลังไม่พอ เพราะทั้งสองฝั่งอ่านเจอ SCHEDULED ได้พร้อมกัน แล้วต่างคน
       * ต่างสร้างประวัติการทำงานคนละใบให้พนักงานคนเดียว
       *
       * updateMany ที่มีเงื่อนไขสถานะจะล็อกแถวไว้ ฝั่งที่มาทีหลังจึงได้ count = 0
       * แล้วถอยออกไปเงียบ ๆ
       */
      const claimed = await tx.employeeTransfer.updateMany({
        where: { id, status: EmployeeTransferStatus.SCHEDULED },
        data: { status: EmployeeTransferStatus.APPLIED, appliedAt: new Date() },
      });

      if (claimed.count === 0) {
        return;
      }

      const transfer = await tx.employeeTransfer.findUnique({
        where: { id },
        include: {
          employee: {
            select: {
              id: true,
              companyId: true,
              branchId: true,
              departmentId: true,
              divisionId: true,
              positionId: true,
              position: true,
              employeeTypeId: true,
              supervisorId: true,
              status: true,
              deletedAt: true,
            },
          },
        },
      });

      if (!transfer) {
        return;
      }

      const employee = transfer.employee;

      if (employee.deletedAt) {
        throw new BadRequestException('พนักงานถูกลบออกจากทะเบียนแล้ว');
      }

      /*
       * ใบแตะเฉพาะช่องที่ตั้งใจเปลี่ยนจริง ๆ
       *
       * ช่องที่ไม่ได้ตั้งใจเปลี่ยนถูกบันทึกไว้ให้ from* เท่ากับ to* ตั้งแต่ตอนสร้าง
       * ถ้าเขียนทับด้วย to* ทุกช่อง การแก้ทะเบียนด้วยมือระหว่างรอถึงวันจะถูกย้อนกลับ
       * เงียบ ๆ — และช่องที่ตั้งใจ "ถอดออก" (to* เป็น null) ก็จะไม่มีทางถอดได้เลย
       */
      const changed = {
        branch: transfer.fromBranchId !== transfer.toBranchId,
        department: transfer.fromDepartmentId !== transfer.toDepartmentId,
        division: transfer.fromDivisionId !== transfer.toDivisionId,
        position: transfer.fromPositionId !== transfer.toPositionId,
        positionTitle: transfer.fromPositionTitle !== transfer.toPositionTitle,
        employeeType:
          transfer.fromEmployeeTypeId !== transfer.toEmployeeTypeId,
        supervisor: transfer.fromSupervisorId !== transfer.toSupervisorId,
      };

      const nextPositionId = changed.position
        ? transfer.toPositionId
        : employee.positionId;

      const nextPositionTitle = await this.resolvePositionTitle(tx, {
        positionId: nextPositionId,
        positionChanged: changed.position,
        titleChanged: changed.positionTitle,
        requestedTitle: transfer.toPositionTitle,
        currentTitle: employee.position,
      });

      const updated = await tx.employee.update({
        where: { id: employee.id },
        data: {
          branchId: changed.branch ? transfer.toBranchId : employee.branchId,
          departmentId: changed.department
            ? transfer.toDepartmentId
            : employee.departmentId,
          divisionId: changed.division
            ? transfer.toDivisionId
            : employee.divisionId,
          positionId: nextPositionId,
          position: nextPositionTitle,
          employeeTypeId: changed.employeeType
            ? transfer.toEmployeeTypeId
            : employee.employeeTypeId,
          supervisorId: changed.supervisor
            ? transfer.toSupervisorId
            : employee.supervisorId,
        },
      });

      const history = await tx.employeeWorkHistory.create({
        data: {
          employeeId: employee.id,
          type: transfer.type,
          effectiveDate: transfer.effectiveDate,
          title: this.buildHistoryTitle(transfer.type),
          description:
            [transfer.documentNo ? `คำสั่งเลขที่ ${transfer.documentNo}` : null,
              transfer.reason,
            ]
              .filter(Boolean)
              .join(' — ') || null,
          oldCompanyId: employee.companyId,
          newCompanyId: updated.companyId,
          oldBranchId: employee.branchId,
          newBranchId: updated.branchId,
          oldDepartmentId: employee.departmentId,
          newDepartmentId: updated.departmentId,
          oldDivisionId: employee.divisionId,
          newDivisionId: updated.divisionId,
          oldEmployeeTypeId: employee.employeeTypeId,
          newEmployeeTypeId: updated.employeeTypeId,
          oldPosition: employee.position,
          newPosition: updated.position,
          oldStatus: employee.status,
          newStatus: updated.status,
          createdById: transfer.createdById,
        },
        select: { id: true },
      });

      await tx.employeeTransfer.update({
        where: { id },
        data: {
          // สถานะกับ appliedAt ถูกเขียนไปแล้วตอนจองใบด้านบน
          workHistoryId: history.id,
          // เขียนทับด้วยค่าจริง ณ วันที่มีผล
          fromBranchId: employee.branchId,
          fromDepartmentId: employee.departmentId,
          fromDivisionId: employee.divisionId,
          fromPositionId: employee.positionId,
          fromPositionTitle: employee.position,
          fromEmployeeTypeId: employee.employeeTypeId,
          fromSupervisorId: employee.supervisorId,
        },
      });
    });
  }

  /* =========================================================
     ตัวช่วย
  ========================================================= */

  private buildListWhere(
    query: ListEmployeeTransfersQueryDto,
    actor: TransferActor,
  ): Prisma.EmployeeTransferWhereInput {
    const filters: Prisma.EmployeeTransferWhereInput[] = [
      this.scopeWhere(actor),
    ];

    const companyId = effectiveCompanyId(actor.scope, query.companyId);
    if (companyId) {
      filters.push({ companyId });
    }

    if (query.employeeId) {
      filters.push({ employeeId: query.employeeId });
    }

    if (query.status) {
      filters.push({ status: query.status });
    }

    if (query.branchId) {
      if (
        actor.scope.level === 'BRANCH' &&
        query.branchId !== actor.scope.branchId
      ) {
        throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงข้อมูลของสาขานี้');
      }

      filters.push({
        OR: [
          { fromBranchId: query.branchId },
          { toBranchId: query.branchId },
          { employee: { is: { branchId: query.branchId } } },
        ],
      });
    }

    if (query.dateFrom || query.dateTo) {
      filters.push({
        effectiveDate: {
          ...(query.dateFrom
            ? { gte: toThaiDateOnly(new Date(query.dateFrom)) }
            : {}),
          ...(query.dateTo
            ? { lte: toThaiDateOnly(new Date(query.dateTo)) }
            : {}),
        },
      });
    }

    const q = query.q?.trim();
    if (q) {
      filters.push({
        OR: [
          { documentNo: { contains: q, mode: 'insensitive' } },
          { reason: { contains: q, mode: 'insensitive' } },
          {
            employee: {
              is: {
                OR: [
                  { employeeCode: { contains: q, mode: 'insensitive' } },
                  { firstName: { contains: q, mode: 'insensitive' } },
                  { lastName: { contains: q, mode: 'insensitive' } },
                  { nickname: { contains: q, mode: 'insensitive' } },
                  { displayName: { contains: q, mode: 'insensitive' } },
                ],
              },
            },
          },
        ],
      });
    }

    return { AND: filters };
  }

  /**
   * ขอบเขตของใบโยกย้ายตามบัญชีผู้ใช้
   *
   * ผูกกับพนักงานเสมอ ไม่ใช่กับ fromBranchId/toBranchId ของตัวใบ เพราะพนักงาน
   * คนเดียวถูกย้ายข้ามสาขาได้ ถ้ากรองด้วยสาขาบนใบ บัญชีสาขาปลายทางจะมองไม่เห็น
   * ใบที่กำลังจะพาคนเข้ามาหาตัวเอง — ซึ่งเป็นใบที่ต้องเห็นมากที่สุด
   */
  private scopeWhere(actor: TransferActor): Prisma.EmployeeTransferWhereInput {
    const scope = actor.scope;

    if (scope.level === 'GLOBAL') {
      return {};
    }

    if (scope.level === 'COMPANY') {
      return { companyId: scope.companyId ?? '__no_company__' };
    }

    if (!scope.branchId) {
      throw new ForbiddenException(
        'บัญชีของคุณยังไม่ได้ผูกกับสาขาใด กรุณาให้ผู้ดูแลระบบกำหนดขอบเขตก่อนใช้งาน',
      );
    }

    return {
      companyId: scope.companyId ?? '__no_company__',
      OR: [
        { fromBranchId: scope.branchId },
        { toBranchId: scope.branchId },
        { employee: { is: { branchId: scope.branchId } } },
      ],
    };
  }

  /**
   * แปลง dto เป็นค่าปลายทางที่ตรวจแล้วว่าอยู่ในบริษัทเดียวกันจริง
   *
   * ค่าว่างแปลว่า "ถอดออก" (null) ส่วนช่องที่ไม่ได้ส่งมาแปลว่า "ไม่เปลี่ยน" (undefined)
   */
  private async resolveTarget(
    dto: CreateEmployeeTransferDto,
    companyId: string,
    actor: TransferActor,
  ): Promise<TransferTarget> {
    const target: TransferTarget = {};

    if (dto.toBranchId !== undefined) {
      const branchId = dto.toBranchId.trim() || null;

      if (branchId) {
        assertWithinScope(actor.scope, { companyId, branchId });

        const branch = await this.prisma.branch.findFirst({
          where: { id: branchId, companyId, deletedAt: null },
          select: { id: true },
        });

        if (!branch) {
          throw new BadRequestException('ไม่พบสาขาปลายทางในบริษัทนี้');
        }
      }

      target.branchId = branchId;
    }

    if (dto.toDepartmentId !== undefined) {
      const departmentId = dto.toDepartmentId.trim() || null;

      if (departmentId) {
        const department = await this.prisma.department.findFirst({
          where: { id: departmentId, companyId, deletedAt: null },
          select: { id: true },
        });

        if (!department) {
          throw new BadRequestException('ไม่พบแผนกปลายทางในบริษัทนี้');
        }
      }

      target.departmentId = departmentId;
    }

    if (dto.toDivisionId !== undefined) {
      const divisionId = dto.toDivisionId.trim() || null;

      if (divisionId) {
        const division = await this.prisma.division.findFirst({
          where: {
            id: divisionId,
            deletedAt: null,
            department: { is: { companyId } },
          },
          select: { id: true },
        });

        if (!division) {
          throw new BadRequestException('ไม่พบฝ่ายปลายทางในบริษัทนี้');
        }
      }

      target.divisionId = divisionId;
    }

    if (dto.toPositionId !== undefined) {
      const positionId = dto.toPositionId.trim() || null;

      if (positionId) {
        const position = await this.prisma.position.findFirst({
          where: { id: positionId, companyId, deletedAt: null },
          select: { id: true },
        });

        if (!position) {
          throw new BadRequestException('ไม่พบตำแหน่งปลายทางในบริษัทนี้');
        }
      }

      target.positionId = positionId;
    }

    if (dto.toPositionTitle !== undefined) {
      target.positionTitle = dto.toPositionTitle.trim() || null;
    }

    if (dto.toEmployeeTypeId !== undefined) {
      const employeeTypeId = dto.toEmployeeTypeId.trim() || null;

      if (employeeTypeId) {
        const employeeType = await this.prisma.employeeType.findFirst({
          where: { id: employeeTypeId, companyId, deletedAt: null },
          select: { id: true },
        });

        if (!employeeType) {
          throw new BadRequestException('ไม่พบประเภทพนักงานปลายทางในบริษัทนี้');
        }
      }

      target.employeeTypeId = employeeTypeId;
    }

    if (dto.toSupervisorId !== undefined) {
      const supervisorId = dto.toSupervisorId.trim() || null;

      if (supervisorId) {
        if (supervisorId === dto.employeeId) {
          throw new BadRequestException('ตั้งให้พนักงานเป็นหัวหน้าของตัวเองไม่ได้');
        }

        const supervisor = await this.prisma.employee.findFirst({
          where: { id: supervisorId, companyId, deletedAt: null },
          select: { id: true },
        });

        if (!supervisor) {
          throw new BadRequestException('ไม่พบหัวหน้างานปลายทางในบริษัทนี้');
        }
      }

      target.supervisorId = supervisorId;
    }

    return target;
  }

  /** ช่องที่เปลี่ยนจริงเมื่อเทียบกับข้อมูลพนักงานปัจจุบัน */
  private diffTarget(
    employee: {
      branchId: string | null;
      departmentId: string | null;
      divisionId: string | null;
      positionId: string | null;
      position: string | null;
      employeeTypeId: string | null;
      supervisorId: string | null;
    },
    target: TransferTarget,
  ): (keyof TransferTarget)[] {
    const pairs: [keyof TransferTarget, string | null][] = [
      ['branchId', employee.branchId],
      ['departmentId', employee.departmentId],
      ['divisionId', employee.divisionId],
      ['positionId', employee.positionId],
      ['positionTitle', employee.position],
      ['employeeTypeId', employee.employeeTypeId],
      ['supervisorId', employee.supervisorId],
    ];

    return pairs
      .filter(([key, current]) => {
        const next = target[key];
        return next !== undefined && next !== current;
      })
      .map(([key]) => key);
  }

  /**
   * ชนิดของประวัติการทำงานที่จะถูกสร้างตอนมีผล
   *
   * ใบเดียวเปลี่ยนได้หลายอย่างพร้อมกัน แต่ประวัติเก็บชนิดเดียว จึงเลือกตัวที่
   * "ใหญ่ที่สุด" ตามลำดับที่คนอ่านคาดหวัง — ย้ายสาขาเป็นเรื่องใหญ่กว่าย้ายแผนก
   * และเปลี่ยนตำแหน่งสำคัญกว่าเปลี่ยนหัวหน้า
   */
  private resolveHistoryType(changed: (keyof TransferTarget)[]) {
    if (changed.includes('branchId')) return WorkHistoryType.BRANCH_TRANSFER;
    if (changed.includes('departmentId')) {
      return WorkHistoryType.DEPARTMENT_TRANSFER;
    }
    if (changed.includes('divisionId')) return WorkHistoryType.DIVISION_TRANSFER;
    if (changed.includes('positionId') || changed.includes('positionTitle')) {
      return WorkHistoryType.POSITION_CHANGE;
    }
    if (changed.includes('employeeTypeId')) {
      return WorkHistoryType.EMPLOYEE_TYPE_CHANGE;
    }

    return WorkHistoryType.OTHER;
  }

  private buildHistoryTitle(type: WorkHistoryType) {
    switch (type) {
      case WorkHistoryType.BRANCH_TRANSFER:
        return 'โยกย้ายสาขา';
      case WorkHistoryType.DEPARTMENT_TRANSFER:
        return 'โยกย้ายแผนก';
      case WorkHistoryType.DIVISION_TRANSFER:
        return 'โยกย้ายฝ่าย';
      case WorkHistoryType.POSITION_CHANGE:
        return 'ปรับตำแหน่ง';
      case WorkHistoryType.EMPLOYEE_TYPE_CHANGE:
        return 'เปลี่ยนประเภทพนักงาน';
      default:
        return 'โยกย้าย/ปรับสังกัด';
    }
  }

  /**
   * ชื่อตำแหน่งที่จะเขียนลงทะเบียนพนักงาน
   *
   * ถ้าใบระบุตำแหน่งจากทะเบียนมา ให้ยึดชื่อจากทะเบียนเป็นหลัก เพื่อไม่ให้
   * ชื่อที่แสดงกับตำแหน่งที่ผูกไว้เพี้ยนกันเหมือนที่เคยเกิดตอนแก้ด้วยมือ
   */
  private async resolvePositionTitle(
    tx: Prisma.TransactionClient,
    params: {
      positionId: string | null;
      positionChanged: boolean;
      titleChanged: boolean;
      requestedTitle: string | null;
      currentTitle: string | null;
    },
  ) {
    // ระบุชื่อตำแหน่งมาเองถือว่าตั้งใจ ให้ชนะชื่อจากทะเบียน
    if (params.titleChanged) {
      return params.requestedTitle;
    }

    if (params.positionChanged) {
      if (!params.positionId) {
        return null;
      }

      const position = await tx.position.findUnique({
        where: { id: params.positionId },
        select: { nameTh: true },
      });

      return position?.nameTh ?? params.currentTitle;
    }

    return params.currentTitle;
  }

  /** ค่าที่จะเก็บในช่อง to* — ไม่ได้ระบุมา = เก็บค่าปัจจุบันไว้ให้เทียบได้ */
  private nextValue(current: string | null, requested: string | null | undefined) {
    return requested === undefined ? current : requested;
  }

  private optionalTrim(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private transferInclude() {
    const branchSelect = { select: { id: true, code: true, nameTh: true } };
    const orgSelect = { select: { id: true, code: true, nameTh: true } };
    const personSelect = {
      select: {
        id: true,
        employeeCode: true,
        nickname: true,
        title: true,
        firstName: true,
        lastName: true,
        displayName: true,
        position: true,
      },
    };

    return {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          nickname: true,
          title: true,
          firstName: true,
          lastName: true,
          displayName: true,
          position: true,
          status: true,
          branch: branchSelect,
          department: orgSelect,
        },
      },
      fromBranch: branchSelect,
      toBranch: branchSelect,
      fromDepartment: orgSelect,
      toDepartment: orgSelect,
      fromDivision: orgSelect,
      toDivision: orgSelect,
      fromPosition: orgSelect,
      toPosition: orgSelect,
      fromEmployeeType: orgSelect,
      toEmployeeType: orgSelect,
      fromSupervisor: personSelect,
      toSupervisor: personSelect,
      createdBy: { select: { id: true, displayName: true } },
      cancelledBy: { select: { id: true, displayName: true } },
    } satisfies Prisma.EmployeeTransferInclude;
  }
}
