import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  EmployeeDocumentStatus,
  EmployeeStatus,
  MasterStatus,
  OffboardingReasonType,
  OffboardingStatus,
  Prisma,
  ProbationStatus,
  ResignationStatus,
  WorkHistoryType,
} from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  assertValidEmployeeCode,
  generateEmployeeCode,
} from './utils/employee-code.util';
import { OffboardingService } from '../offboarding/offboarding.service';
import type { AuthenticatedUser, TenantScope } from '../../common/interfaces/authenticated-user.interface';
import { assertWithinScope, tenantWhere } from '../../common/tenant/tenant-scope.util';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { CreateEmployeeDocumentDto } from './dto/create-employee-document.dto';
import { UploadEmployeeDocumentDto } from './dto/upload-employee-document.dto';
import { CreateEmployeeResignationDto } from './dto/create-employee-resignation.dto';
import { UpdateEmployeeResignationDto } from './dto/update-employee-resignation.dto';
import { stat, unlink } from 'fs/promises';
import {
  canReadSensitive,
  isMaskedValue,
  maskEmployeeSensitiveData,
} from '../../common/utils/mask-pii.util';
import {
  createEmployeeDocumentStorageKey,
  EMPLOYEE_DOCUMENT_BUCKET,
  EMPLOYEE_DOCUMENT_STORAGE_PROVIDER,
  getEmployeeDocumentAbsolutePath,
} from './employee-document-storage.util';

/**
 * `permissions` เป็น optional โดยตั้งใจ — ผู้เรียกที่ไม่ส่งมาจะถูกปกปิดข้อมูล
 * อ่อนไหวไว้ก่อน (fail-closed) แทนที่จะหลุดเลขเต็มเพราะลืมส่ง
 */
type EmployeeActor = Pick<AuthenticatedUser, 'id' | 'scope'> & {
  permissions?: readonly string[];
};

const EMPLOYEE_CODE_CREATE_RETRY_LIMIT = 5;

/**
 * สถานะของคนที่พ้นสภาพไปแล้ว — ไม่ขึ้นในทะเบียนถ้าไม่ได้ขอมาเจาะจง
 *
 * INACTIVE รวมอยู่ด้วยเพราะเป็นสถานะที่ระบบตั้งให้ตอน soft delete
 * ซึ่งแปลว่าถูกถอดออกจากรายการใช้งานแล้ว ไม่ใช่คนที่ยังทำงานอยู่
 */
const FORMER_EMPLOYEE_STATUSES: EmployeeStatus[] = [
  EmployeeStatus.RESIGNED,
  EmployeeStatus.TERMINATED,
  EmployeeStatus.INACTIVE,
];

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly offboardingService: OffboardingService,
  ) {}

  async findAll(query: ListEmployeesQueryDto, currentUser: EmployeeActor) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const filters: Prisma.EmployeeWhereInput[] = [
      { deletedAt: null },
      this.employeeScopeWhere(currentUser.scope),
      this.directoryScopeWhere(currentUser),
    ];

    if (currentUser.scope.level === 'GLOBAL' && query.companyId) {
      filters.push({ companyId: query.companyId });
    }

    if (currentUser.scope.level !== 'BRANCH' && query.branchId) {
      filters.push({ branchId: query.branchId });
    }

    if (query.departmentId) filters.push({ departmentId: query.departmentId });
    if (query.divisionId) filters.push({ divisionId: query.divisionId });
    if (query.employeeTypeId) {
      filters.push({ employeeTypeId: query.employeeTypeId });
    }
    if (query.positionId) filters.push({ positionId: query.positionId });
    if (query.supervisorId) filters.push({ supervisorId: query.supervisorId });
    if (query.hasUser !== undefined) {
      filters.push({ userId: query.hasUser ? { not: null } : null });
    }

    if (query.q) {
      filters.push({
        OR: [
          {
            employeeCode: {
              contains: query.q,
              mode: 'insensitive',
            },
          },
          {
            firstName: {
              contains: query.q,
              mode: 'insensitive',
            },
          },
          {
            lastName: {
              contains: query.q,
              mode: 'insensitive',
            },
          },
          {
            displayName: {
              contains: query.q,
              mode: 'insensitive',
            },
          },
          {
            email: {
              contains: query.q,
              mode: 'insensitive',
            },
          },
          {
            phone: {
              contains: query.q,
              mode: 'insensitive',
            },
          },
          {
            position: {
              contains: query.q,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    /*
     * ตัวเลขสรุปหัวตารางไม่นับตัวกรองสถานะ
     *
     * หน้าทะเบียนพนักงานเปิดมาโดยกรองเฉพาะคนที่ปฏิบัติงานอยู่ ถ้าสรุปเดินตาม
     * ตัวกรองเดียวกัน ช่อง "พนักงานทั้งหมด" จะกลายเป็นจำนวนคนที่ปฏิบัติงาน
     * และช่องลาออก/ทดลองงานจะเป็น 0 เสมอ ทั้งที่ป้ายบอกว่า "ทะเบียนในระบบ"
     * ตัวกรองอื่น (บริษัท/สาขา/แผนก/คำค้น) ยังมีผลกับสรุปตามเดิม
     */
    const summaryWhere: Prisma.EmployeeWhereInput = {
      AND: filters,
    };

    /*
     * ไม่ระบุสถานะมา = เอาเฉพาะคนที่ยังทำงานอยู่
     *
     * ทะเบียนพนักงานถูกเปิดเพื่อดูคนที่ทำงานอยู่เป็นหลัก คนที่พ้นสภาพไปแล้ว
     * ปนอยู่ในรายการทำให้กวาดตาหาคนยาก และจำนวนต่อกลุ่มก็อ่านแล้วเข้าใจผิด
     * ยังค้นเจอได้ด้วยการเลือกสถานะนั้นตรง ๆ หรือกด "ทุกสถานะ"
     */
    const where: Prisma.EmployeeWhereInput = query.status
      ? { AND: [...filters, { status: query.status }] }
      : query.includeFormerEmployees
        ? summaryWhere
        : { AND: [...filters, { status: { notIn: FORMER_EMPLOYEE_STATUSES } }] };

    const [items, total, summary, groupTotals] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        skip,
        take: pageSize,
        /*
         * ต้องเรียงตาม "สาขา แล้วแผนก" เป็นหลัก เพราะหน้าเว็บจัดกลุ่มด้วยสองอย่างนี้
         *
         * เดิมเรียงตามระดับตำแหน่งก่อน ซึ่งไม่เกี่ยวกับการจัดกลุ่มเลย ผลคือหนึ่งหน้า
         * (20 แถว) หยิบคนอาวุโสสุดจากทุกสาขามาปนกัน พอหน้าเว็บจัดกลุ่มต่อ
         * หัวข้อสาขาเดียวกันจึงโผล่ซ้ำหลายหน้าและตัวเลข "กี่คน" ก็นับได้แค่ในหน้านั้น
         * (พนักงาน 27 คน: หน้าแรกได้ ART 14 + TJC 3 หน้าสองได้ TJC 3 + ART 4)
         *
         * เรียงให้ตรงกับการจัดกลุ่มแล้ว หนึ่งหน้าจะเป็นช่วงต่อเนื่องของรายการที่จัดกลุ่มไว้
         * สาขาหนึ่งจึงถูกตัดข้ามหน้าได้อย่างมากที่รอยต่อเดียว ไม่ใช่กระจายทั้งเล่ม
         *
         * ผู้บริหารต้องขึ้นก่อนเสมอ ทำสองชั้น:
         *   - ชั้นแผนก  เรียงตาม sortOrder ของทะเบียนแผนกมาตรฐาน ซึ่ง "บริหาร" = 10
         *     มาก่อนทุกแผนก (ไม่ฮาร์ดโค้ดชื่อแผนก ถ้าบริษัทจัดลำดับใหม่ก็เปลี่ยนตาม)
         *     แผนกที่บริษัทสร้างเองไม่มี sortOrder จึงไปอยู่ท้าย
         *   - ชั้นคน    เรียงตามระดับตำแหน่ง (1 = สูงสุด) ผู้บริหารจึงอยู่บนสุดของแผนก
         *
         * ค่าที่ยังไม่ตั้ง (สาขา/แผนก/ระดับ เป็น NULL) ไปอยู่ท้ายสุดตามพฤติกรรมของ Postgres
         */
        orderBy: [
          // สำนักงานใหญ่ขึ้นก่อนเสมอ — เรียงตามชื่อไทยเฉย ๆ จะได้ "ตั้งใจ" มาก่อน "ทีเจซี"
          { branch: { sortOrder: 'asc' } },
          { branch: { nameTh: 'asc' } },
          { department: { catalog: { sortOrder: 'asc' } } },
          { department: { nameTh: 'asc' } },
          // ลำดับที่จัดมือไว้ในกระดานผังองค์กรมาก่อน (0 = ยังไม่เคยจัด)
          { sortOrder: 'asc' },
          { positionMaster: { level: 'asc' } },
          { employeeCode: 'asc' },
        ],
        include: this.employeeListInclude(),
      }),
      this.prisma.employee.count({
        where,
      }),
      this.buildEmployeeListSummary(summaryWhere),
      /*
       * ตัวเลข "กี่คน" ที่หัวกลุ่มต้องเดินตามตัวกรองเดียวกับแถวที่แสดง (where)
       * ไม่ใช่ตามสรุปสถานะ (summaryWhere ซึ่งตั้งใจไม่นับตัวกรองสถานะ)
       * ไม่งั้นหัวกลุ่มจะขึ้นจำนวนที่รวมคนลาออกไว้ด้วย ทั้งที่แถวข้างล่างไม่มีคนพวกนั้น
       */
      this.buildEmployeeGroupTotals(where),
    ]);

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary: { ...summary, ...groupTotals },
    };
  }

  /**
   * จำกัดทะเบียนพนักงานให้เหลือ "ตัวเอง + ลูกทีมตรง" สำหรับคนที่ไม่ได้ทำงาน HR/เงินเดือน
   *
   * EMPLOYEE_READ เป็นสิทธิ์ที่หัวหน้างานต้องมี เพราะต้องเปิดโปรไฟล์ลูกทีมจาก
   * หน้า "ทีมของฉัน" แต่ตัว where เดิมกรองแค่บริษัท/สาขา หัวหน้าจึงดึงทะเบียน
   * ของทั้งสาขาได้ ทั้งที่ควรเห็นเฉพาะสายบังคับบัญชาตัวเอง
   *
   * ใครที่ถือ HR_WORKSPACE หรือ PAYROLL_WORKSPACE ยังเห็นทั้งองค์กรตาม scope เหมือนเดิม
   * เพราะทั้งสองงานต้องใช้ทะเบียนเต็ม (ทำเอกสาร ยื่นราชการ ทำไฟล์โอนเงิน)
   */
  private directoryScopeWhere(
    currentUser: EmployeeActor,
  ): Prisma.EmployeeWhereInput {
    const permissions = currentUser.permissions ?? [];
    const hasFullDirectory =
      permissions.includes('HR_WORKSPACE') ||
      permissions.includes('PAYROLL_WORKSPACE');

    if (hasFullDirectory) return {};

    return {
      OR: [
        { userId: currentUser.id },
        { supervisor: { userId: currentUser.id } },
      ],
    };
  }

  async findOne(id: string, currentUser: EmployeeActor) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        /*
         * ต้องรวมด้วย AND ไม่ใช่กระจายเข้าออบเจ็กต์เดียวกัน
         * เพราะทั้งขอบเขตสาขา (นับสาขารอง) และตัวจำกัดทะเบียนของหัวหน้างาน
         * ต่างก็คืน OR มา — กระจายรวมกันแล้วตัวหลังจะทับตัวแรกจนขอบเขตสาขาหายไป
         */
        AND: [
          { id, deletedAt: null },
          this.employeeScopeWhere(currentUser.scope),
          this.directoryScopeWhere(currentUser),
        ],
      },
      include: this.employeeDetailInclude(),
    });

    if (!employee) {
      throw new NotFoundException('ไม่พบข้อมูลพนักงาน');
    }

    // PDPA — ไม่มีสิทธิ์ EMPLOYEE_SENSITIVE_READ จะเห็นเลขบัตร/เลขบัญชีแบบปิดหลัก
    // ยกเว้นกำลังเปิดดูข้อมูลของตัวเอง
    return maskEmployeeSensitiveData(
      employee,
      canReadSensitive(
        currentUser.permissions,
        currentUser.id,
        employee.user?.id ?? null,
      ),
    );
  }

  async create(dto: CreateEmployeeDto, currentUser: EmployeeActor) {
    const scopedDto = this.applyScopeToCreateDto(dto, currentUser.scope);

    await this.validateCreate(scopedDto);

    const displayName =
      this.stripNicknameSuffix(scopedDto.displayName, scopedDto.nickname) ||
      [scopedDto.title, scopedDto.firstName, scopedDto.lastName].filter(Boolean).join(' ');

    const selectedPosition = scopedDto.positionId
      ? await this.findActivePosition(scopedDto.positionId)
      : null;

    for (
      let attempt = 1;
      attempt <= EMPLOYEE_CODE_CREATE_RETRY_LIMIT;
      attempt += 1
    ) {
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const employeeCode = await this.generateNextEmployeeCode(
            tx,
            scopedDto.companyId,
            new Date(scopedDto.startDate),
          );

          const employee = await tx.employee.create({
            data: {
              employeeCode,
              title: this.optionalTrim(scopedDto.title),
              firstName: scopedDto.firstName.trim(),
              lastName: scopedDto.lastName.trim(),
              nickname: this.optionalTrim(scopedDto.nickname),
              displayName,
              email: this.optionalTrim(scopedDto.email),
              phone: this.optionalTrim(scopedDto.phone),
              position:
                this.optionalTrim(scopedDto.position) ?? selectedPosition?.nameTh ?? null,
              positionId: scopedDto.positionId || null,
              startDate: new Date(scopedDto.startDate),
              probationEndDate: scopedDto.probationEndDate
                ? new Date(scopedDto.probationEndDate)
                : null,
              probationPassedAt: scopedDto.probationPassedAt
                ? new Date(scopedDto.probationPassedAt)
                : null,
              status: scopedDto.status ?? EmployeeStatus.ACTIVE,
              companyId: scopedDto.companyId,
              branchId: scopedDto.branchId ?? null,
              departmentId: scopedDto.departmentId ?? null,
              divisionId: scopedDto.divisionId ?? null,
              employeeTypeId: scopedDto.employeeTypeId ?? null,
              supervisorId: scopedDto.supervisorId ?? null,
              userId: scopedDto.userId ?? null,
              profile: scopedDto.profile
                ? {
                    create: this.buildProfileCreateData(
                      scopedDto.profile,
                      scopedDto.companyId,
                    ),
                  }
                : undefined,
            },
          });

          await tx.employeeWorkHistory.create({
            data: {
              employeeId: employee.id,
              type: WorkHistoryType.JOINED,
              effectiveDate: employee.startDate,
              title: 'เริ่มงาน',
              description: 'เพิ่มข้อมูลพนักงานใหม่เข้าสู่ระบบ',
              newCompanyId: employee.companyId,
              newBranchId: employee.branchId,
              newDepartmentId: employee.departmentId,
              newDivisionId: employee.divisionId,
              newEmployeeTypeId: employee.employeeTypeId,
              newPosition: employee.position,
              newStatus: employee.status,
              createdById: currentUser.id,
            },
          });

          // กรอกวันสิ้นสุดทดลองงานมา = เปิดใบทดลองงานให้เลย
          // จะได้ไม่ต้องไปกรอกซ้ำที่หน้า /onboarding และข้อมูลสองที่ตรงกันเสมอ
          //
          // ถ้ากรอกวันบรรจุมาด้วย แปลว่าเป็นการย้ายข้อมูลพนักงานที่ผ่านทดลองงานไปแล้ว
          // ให้ปิดใบเป็น PASSED ตามวันบรรจุจริง ไม่ใช่เปิดใบค้างแล้วดันสถานะกลับไปทดลองงาน
          if (employee.probationEndDate) {
            const passedAt = employee.probationPassedAt;

            await tx.probationRecord.create({
              data: {
                companyId: employee.companyId,
                employeeId: employee.id,
                startDate: employee.startDate,
                endDate: employee.probationEndDate,
                reviewDate: this.buildProbationReviewDate(
                  employee.probationEndDate,
                ),
                status: passedAt
                  ? ProbationStatus.PASSED
                  : ProbationStatus.IN_PROGRESS,
                ...(passedAt
                  ? { reviewedAt: passedAt, result: 'ผ่านการทดลองงาน' }
                  : {}),
                note: 'สร้างอัตโนมัติจากการเพิ่มพนักงานใหม่',
                createdById: currentUser.id,
              },
            });

            if (!passedAt) {
              await tx.employee.update({
                where: { id: employee.id },
                data: { status: EmployeeStatus.PROBATION },
              });
            }
          }

          return employee;
        });

        return this.findOne(created.id, currentUser);
      } catch (error) {
        if (!this.isEmployeeCodeUniqueConflict(error)) {
          this.assertNotDuplicateIdentityNumber(error);
        }

        if (attempt === EMPLOYEE_CODE_CREATE_RETRY_LIMIT) {
          throw new ConflictException(
            'ไม่สามารถสร้างรหัสพนักงานอัตโนมัติได้ กรุณาลองใหม่อีกครั้ง',
          );
        }
      }
    }

    throw new ConflictException(
      'ไม่สามารถสร้างรหัสพนักงานอัตโนมัติได้ กรุณาลองใหม่อีกครั้ง',
    );
  }

  async update(id: string, dto: UpdateEmployeeDto, currentUser: EmployeeActor) {
    const current = await this.prisma.employee.findFirst({
      where: {
        id,
        deletedAt: null,
        ...this.employeeScopeWhere(currentUser.scope),
      },
      include: {
        profile: true,
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบข้อมูลพนักงาน');
    }

    const targetCompanyId = dto.companyId ?? current.companyId;
    const targetBranchId =
      dto.branchId !== undefined ? dto.branchId || null : current.branchId;

    this.assertEmployeeTargetWithinScope(currentUser.scope, {
      companyId: targetCompanyId,
      branchId: targetBranchId,
    });

    await this.validateUpdate(id, dto, targetCompanyId, targetBranchId);

    /*
     * จุดลงเวลาที่ผูกรายคนต้องเป็นของบริษัทเดียวกันและยังใช้งานอยู่
     * ไม่งั้นพนักงานย้ายบริษัทแล้วจะยังถูกบังคับให้อยู่ในรัศมีของที่เก่า
     */
    if (dto.attendanceLocationId) {
      const location = await this.prisma.attendanceLocation.findFirst({
        where: {
          id: dto.attendanceLocationId,
          companyId: targetCompanyId,
          deletedAt: null,
        },
        select: { id: true, status: true },
      });
      if (!location) {
        throw new BadRequestException('ไม่พบจุดลงเวลานี้ในบริษัทของพนักงาน');
      }
      if (location.status !== 'ACTIVE') {
        throw new BadRequestException('จุดลงเวลานี้ถูกปิดใช้งานอยู่');
      }
    }

    const shouldCreateWorkHistory = this.shouldCreateWorkHistory(current, dto);
    const selectedPosition = dto.positionId
      ? await this.findActivePosition(dto.positionId)
      : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.update({
        where: {
          id,
        },
        data: {
          ...(dto.employeeCode !== undefined
            ? { employeeCode: assertValidEmployeeCode(dto.employeeCode) }
            : {}),
          ...(dto.title !== undefined
            ? { title: this.optionalTrim(dto.title) }
            : {}),
          ...(dto.firstName !== undefined
            ? { firstName: dto.firstName.trim() }
            : {}),
          ...(dto.lastName !== undefined
            ? { lastName: dto.lastName.trim() }
            : {}),
          ...(dto.nickname !== undefined
            ? { nickname: this.optionalTrim(dto.nickname) }
            : {}),
          ...(dto.displayName !== undefined
            ? {
                displayName: this.stripNicknameSuffix(
                  dto.displayName,
                  dto.nickname !== undefined ? dto.nickname : current.nickname,
                ),
              }
            : {}),
          ...(dto.email !== undefined
            ? { email: this.optionalTrim(dto.email) }
            : {}),
          ...(dto.phone !== undefined
            ? { phone: this.optionalTrim(dto.phone) }
            : {}),
          ...(dto.position !== undefined
            ? { position: this.optionalTrim(dto.position) }
            : dto.positionId !== undefined
              ? { position: selectedPosition?.nameTh ?? null }
              : {}),

          ...(dto.positionId !== undefined
            ? { positionId: dto.positionId || null }
            : {}),
          ...(dto.startDate !== undefined
            ? { startDate: new Date(dto.startDate) }
            : {}),
          ...(dto.probationEndDate !== undefined
            ? {
                probationEndDate: dto.probationEndDate
                  ? new Date(dto.probationEndDate)
                  : null,
              }
            : {}),
          ...(dto.probationPassedAt !== undefined
            ? {
                probationPassedAt: dto.probationPassedAt
                  ? new Date(dto.probationPassedAt)
                  : null,
              }
            : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.companyId !== undefined ? { companyId: dto.companyId } : {}),
          ...(dto.branchId !== undefined
            ? { branchId: dto.branchId || null }
            : {}),
          ...(dto.departmentId !== undefined
            ? { departmentId: dto.departmentId || null }
            : {}),
          ...(dto.divisionId !== undefined
            ? { divisionId: dto.divisionId || null }
            : {}),
          ...(dto.employeeTypeId !== undefined
            ? { employeeTypeId: dto.employeeTypeId || null }
            : {}),
          ...(dto.allowedAttendanceMethods !== undefined
            ? { allowedAttendanceMethods: dto.allowedAttendanceMethods }
            : {}),
          ...(dto.attendanceGeofenceRequired !== undefined
            ? { attendanceGeofenceRequired: dto.attendanceGeofenceRequired }
            : {}),
          ...(dto.attendanceLocationId !== undefined
            ? { attendanceLocationId: dto.attendanceLocationId || null }
            : {}),
          ...(dto.supervisorId !== undefined
            ? { supervisorId: dto.supervisorId || null }
            : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.userId !== undefined ? { userId: dto.userId || null } : {}),
          /*
           * profile เก็บสำเนา companyId ไว้บังคับ "เลขประจำตัวห้ามซ้ำในบริษัทเดียวกัน"
           * ย้ายบริษัทแล้วต้องอัปเดตตาม ไม่งั้นข้อจำกัดจะไปคุมบริษัทเดิมแทน
           */
          ...(dto.profile || current.profile
            ? {
                profile: current.profile
                  ? {
                      update: {
                        ...(dto.profile
                          ? this.buildProfileUpdateData(dto.profile)
                          : {}),
                        ...(targetCompanyId !== current.companyId
                          ? { company: { connect: { id: targetCompanyId } } }
                          : {}),
                      },
                    }
                  : {
                      create: this.buildProfileCreateData(
                        dto.profile!,
                        targetCompanyId,
                      ),
                    },
              }
            : {}),
        },
      });

      if (shouldCreateWorkHistory) {
        await tx.employeeWorkHistory.create({
          data: {
            employeeId: employee.id,
            type: this.resolveWorkHistoryType(current, dto),
            effectiveDate: new Date(),
            title: 'แก้ไขข้อมูลพนักงาน',
            description: 'มีการเปลี่ยนแปลงข้อมูลการทำงานของพนักงาน',
            oldCompanyId: current.companyId,
            newCompanyId: employee.companyId,
            oldBranchId: current.branchId,
            newBranchId: employee.branchId,
            oldDepartmentId: current.departmentId,
            newDepartmentId: employee.departmentId,
            oldDivisionId: current.divisionId,
            newDivisionId: employee.divisionId,
            oldEmployeeTypeId: current.employeeTypeId,
            newEmployeeTypeId: employee.employeeTypeId,
            oldPosition: current.position,
            newPosition: employee.position,
            oldStatus: current.status,
            newStatus: employee.status,
            createdById: currentUser.id,
          },
        });
      }

      return employee;
    }).catch((error) => this.assertNotDuplicateIdentityNumber(error));

    return this.findOne(updated.id, currentUser);
  }

  async remove(id: string, currentUser: EmployeeActor) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id,
        deletedAt: null,
        ...this.employeeScopeWhere(currentUser.scope),
      },
    });

    if (!employee) {
      throw new NotFoundException('ไม่พบข้อมูลพนักงาน');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: {
          id,
        },
        data: {
          deletedAt: new Date(),
          status: EmployeeStatus.INACTIVE,
        },
      });

      await tx.employeeWorkHistory.create({
        data: {
          employeeId: id,
          type: WorkHistoryType.STATUS_CHANGE,
          effectiveDate: new Date(),
          title: 'ปิดใช้งานข้อมูลพนักงาน',
          description: 'Soft delete พนักงานออกจากรายการใช้งาน',
          oldStatus: employee.status,
          newStatus: EmployeeStatus.INACTIVE,
          createdById: currentUser.id,
        },
      });

      await this.cancelInFlightRequests(tx, id, currentUser.id);
    });

    return {
      id,
      deleted: true,
    };
  }
/**
   * ปิดคำขอที่ยังค้างอยู่เมื่อพนักงานถูกลบ
   *
   * ไม่ลบประวัติทิ้ง — คำขอที่อนุมัติไปแล้วต้องเก็บไว้ตรวจย้อนหลังและผูกกับเงินที่จ่ายไป
   * แต่คำขอที่ยังไม่จบ (ร่าง/รออนุมัติ) จะค้างอยู่ในคิวของผู้อนุมัติตลอดไป
   * เพราะเจ้าตัวกดยกเลิกเองไม่ได้แล้ว และผู้อนุมัติก็ไม่รู้ว่าคนนี้ถูกลบไปแล้ว
   *
   * ปิดเฉพาะสถานะที่ยังเดินอยู่ ไม่แตะ APPROVED/REJECTED/CANCELLED
   */
  private async cancelInFlightRequests(
    tx: Prisma.TransactionClient,
    employeeId: string,
    actorId: string,
  ) {
    const reason = 'ปิดอัตโนมัติเพราะพนักงานถูกลบออกจากระบบ';
    const now = new Date();

    // สถานะที่ยังเดินอยู่ของแต่ละประเภท — offsite มีสถานะกลางระหว่างสายอนุมัติด้วย
    const openLeaveStatuses = ['DRAFT', 'SUBMITTED'] as const;
    const openOffsiteStatuses = [
      'DRAFT',
      'SUBMITTED',
      'MANAGER_APPROVED',
    ] as const;

    await tx.leaveRequest.updateMany({
      where: { employeeId, deletedAt: null, status: { in: [...openLeaveStatuses] } },
      data: { status: 'CANCELLED', cancelledAt: now },
    });

    await tx.overtimeRequest.updateMany({
      where: { employeeId, deletedAt: null, status: { in: [...openLeaveStatuses] } },
      data: { status: 'CANCELLED', cancelledAt: now },
    });

    await tx.timeAdjustRequest.updateMany({
      where: { employeeId, deletedAt: null, status: { in: [...openLeaveStatuses] } },
      data: { status: 'CANCELLED', cancelledAt: now },
    });

    await tx.offsiteWorkRequest.updateMany({
      where: {
        employeeId,
        deletedAt: null,
        status: { in: [...openOffsiteStatuses] },
      },
      data: { status: 'CANCELLED', cancelledAt: now },
    });

    await tx.documentRequest.updateMany({
      where: { employeeId, deletedAt: null, status: { in: [...openLeaveStatuses] } },
      data: { status: 'CANCELLED', cancelledAt: now },
    });

    /*
     * ใบโยกย้ายที่ตั้งวันไว้ล่วงหน้าต้องปิดด้วย
     *
     * ต่างจากคำขออื่นตรงที่ไม่มีใครต้องมากดอนุมัติ — ตัวจับเวลาจะหยิบไปทำเองทุกคืน
     * แล้วล้มทุกครั้งเพราะพนักงานถูกลบไปแล้ว กลายเป็น error ที่ขึ้นทุกวันโดยไม่มี
     * ใครแก้ได้ (ตัวใบเองก็เปิดไม่เจอเพราะเจ้าของถูกลบ)
     */
    await tx.employeeTransfer.updateMany({
      where: { employeeId, status: 'SCHEDULED' },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
        cancelledById: actorId,
        cancelReason: reason,
      },
    });

    /*
     * ปิดขั้นอนุมัติที่ยังรออยู่ด้วย ไม่งั้นรายการยังโผล่ในกล่องงาน
     * เพราะกล่องงานอ่านจากขั้นอนุมัติ ไม่ได้อ่านจากสถานะของคำขอ
     */
    const openStepStatuses = ['PENDING', 'WAITING'] as const;

    await tx.leaveApprovalStep.updateMany({
      where: {
        leaveRequest: { employeeId },
        status: { in: [...openStepStatuses] },
      },
      data: { status: 'CANCELLED', actedAt: now, actedById: actorId, reason },
    });

    await tx.overtimeApprovalStep.updateMany({
      where: {
        overtimeRequest: { employeeId },
        status: { in: [...openStepStatuses] },
      },
      data: { status: 'CANCELLED', actedAt: now, actedById: actorId, reason },
    });

    await tx.timeAdjustApprovalStep.updateMany({
      where: {
        timeAdjustRequest: { employeeId },
        status: { in: [...openStepStatuses] },
      },
      data: { status: 'CANCELLED', actedAt: now, actedById: actorId, reason },
    });
  }

  async findDocuments(employeeId: string, currentUser: EmployeeActor) {
    await this.ensureEmployeeExists(employeeId, currentUser.scope);

    return this.prisma.employeeDocument.findMany({
      where: {
        employeeId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
    });
  }

  async createDocument(
    employeeId: string,
    dto: CreateEmployeeDocumentDto,
    currentUser: EmployeeActor,
  ) {
    await this.ensureEmployeeExists(employeeId, currentUser.scope);

    const document = await this.prisma.employeeDocument.create({
      data: {
        employeeId,
        type: dto.type,
        title: dto.title.trim(),
        description: this.optionalTrim(dto.description),
        fileName: dto.fileName.trim(),
        fileSize: dto.fileSize ?? null,
        mimeType: this.optionalTrim(dto.mimeType),
        storageProvider: dto.storageProvider?.trim() || 'LOCAL',
        storageKey: dto.storageKey.trim(),
        bucketName: this.optionalTrim(dto.bucketName),
        issuedDate: dto.issuedDate ? new Date(dto.issuedDate) : null,
        expiredDate: dto.expiredDate ? new Date(dto.expiredDate) : null,
        status: dto.status ?? EmployeeDocumentStatus.ACTIVE,
        uploadedById: currentUser.id,
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
    });

    return document;
  }
  async uploadDocument(
    employeeId: string,
    dto: UploadEmployeeDocumentDto,
    file: Express.Multer.File,
    currentUser: EmployeeActor,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        deletedAt: null,
        ...this.employeeScopeWhere(currentUser.scope),
      },
      select: {
        id: true,
        employeeCode: true,
        nickname: true,
      },
    });

    if (!employee) {
      await this.safelyDeleteUploadedFile(file.path);
      throw new NotFoundException('ไม่พบข้อมูลพนักงาน');
    }

    const storageKey = createEmployeeDocumentStorageKey({
      employeeId: employee.id,
      filename: file.filename,
    });

    const document = await this.prisma.employeeDocument.create({
      data: {
        employeeId: employee.id,
        type: dto.type,
        title: dto.title.trim(),
        description: this.optionalTrim(dto.description),
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        storageProvider: EMPLOYEE_DOCUMENT_STORAGE_PROVIDER,
        storageKey,
        bucketName: EMPLOYEE_DOCUMENT_BUCKET,
        issuedDate: dto.issuedDate ? new Date(dto.issuedDate) : null,
        expiredDate: dto.expiredDate ? new Date(dto.expiredDate) : null,
        status: dto.status ?? EmployeeDocumentStatus.ACTIVE,
        uploadedById: currentUser.id,
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
    });

    return document;
  }

  async getDocumentFileForDownload(
    employeeId: string,
    documentId: string,
    currentUser: EmployeeActor,
  ) {
    await this.ensureEmployeeExists(employeeId, currentUser.scope);

    const document = await this.prisma.employeeDocument.findFirst({
      where: {
        id: documentId,
        employeeId,
        deletedAt: null,
      },
    });

    if (!document) {
      throw new NotFoundException('ไม่พบเอกสารพนักงาน');
    }

    if (document.storageProvider !== EMPLOYEE_DOCUMENT_STORAGE_PROVIDER) {
      throw new BadRequestException('Storage provider นี้ยังไม่รองรับ');
    }

    const filePath = getEmployeeDocumentAbsolutePath(document.storageKey);

    let fileStat: Awaited<ReturnType<typeof stat>>;

    try {
      fileStat = await stat(filePath);
    } catch {
      throw new NotFoundException('ไม่พบไฟล์เอกสารใน storage');
    }

    if (!fileStat.isFile()) {
      throw new NotFoundException('ไม่พบไฟล์เอกสารใน storage');
    }

    return {
      filePath,
      fileName: document.fileName,
      mimeType: document.mimeType || 'application/octet-stream',
      size: fileStat.size,
    };
  }
  async removeDocument(
    employeeId: string,
    documentId: string,
    currentUser: EmployeeActor,
  ) {
    await this.ensureEmployeeExists(employeeId, currentUser.scope);

    const document = await this.prisma.employeeDocument.findFirst({
      where: {
        id: documentId,
        employeeId,
        deletedAt: null,
      },
    });

    if (!document) {
      throw new NotFoundException('ไม่พบเอกสารพนักงาน');
    }

    await this.prisma.employeeDocument.update({
      where: {
        id: documentId,
      },
      data: {
        deletedAt: new Date(),
        status: EmployeeDocumentStatus.DELETED,
      },
    });

    return {
      id: documentId,
      deleted: true,
    };
  }

  async findWorkHistories(employeeId: string, currentUser: EmployeeActor) {
    await this.ensureEmployeeExists(employeeId, currentUser.scope);

    return this.prisma.employeeWorkHistory.findMany({
      where: {
        employeeId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        createdBy: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
        oldCompany: {
          select: {
            id: true,
            code: true,
            nameTh: true,
          },
        },
        newCompany: {
          select: {
            id: true,
            code: true,
            nameTh: true,
          },
        },
        oldBranch: {
          select: {
            id: true,
            code: true,
            nameTh: true,
          },
        },
        newBranch: {
          select: {
            id: true,
            code: true,
            nameTh: true,
          },
        },
        oldDepartment: {
          select: {
            id: true,
            code: true,
            nameTh: true,
          },
        },
        newDepartment: {
          select: {
            id: true,
            code: true,
            nameTh: true,
          },
        },
        oldDivision: {
          select: {
            id: true,
            code: true,
            nameTh: true,
          },
        },
        newDivision: {
          select: {
            id: true,
            code: true,
            nameTh: true,
          },
        },
        oldEmployeeType: {
          select: {
            id: true,
            code: true,
            nameTh: true,
          },
        },
        newEmployeeType: {
          select: {
            id: true,
            code: true,
            nameTh: true,
          },
        },
      },
    });
  }

  async findResignations(employeeId: string, currentUser: EmployeeActor) {
    await this.ensureEmployeeExists(employeeId, currentUser.scope);

    return this.prisma.employeeResignation.findMany({
      where: {
        employeeId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        document: true,
        submittedBy: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
        rejectedBy: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
        cancelledBy: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
    });
  }

  async createResignation(
    employeeId: string,
    dto: CreateEmployeeResignationDto,
    currentUser: EmployeeActor,
  ) {
    const employee = await this.ensureEmployeeExists(employeeId, currentUser.scope);

    if (dto.documentId) {
      await this.ensureDocumentBelongsToEmployee(employeeId, dto.documentId);
    }

    const resignation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.employeeResignation.create({
        data: {
          employeeId,
          resignationDate: new Date(dto.resignationDate),
          effectiveDate: new Date(dto.effectiveDate),
          reason: dto.reason.trim(),
          note: this.optionalTrim(dto.note),
          status: ResignationStatus.SUBMITTED,
          documentId: dto.documentId ?? null,
          submittedAt: new Date(),
          submittedById: currentUser.id,
        },
      });

      await tx.employeeWorkHistory.create({
        data: {
          employeeId,
          type: WorkHistoryType.STATUS_CHANGE,
          effectiveDate: new Date(dto.effectiveDate),
          title: 'บันทึกข้อมูลการลาออก',
          description: 'มีการบันทึกข้อมูลการลาออกของพนักงาน',
          oldStatus: employee.status,
          newStatus: employee.status,
          createdById: currentUser.id,
        },
      });

      return created;
    });

    return resignation;
  }

  async updateResignation(
    employeeId: string,
    resignationId: string,
    dto: UpdateEmployeeResignationDto,
    currentUser: EmployeeActor,
  ) {
    const employee = await this.ensureEmployeeExists(employeeId, currentUser.scope);

    const resignation = await this.prisma.employeeResignation.findFirst({
      where: {
        id: resignationId,
        employeeId,
      },
    });

    if (!resignation) {
      throw new NotFoundException('ไม่พบข้อมูลการลาออก');
    }

    if (dto.documentId) {
      await this.ensureDocumentBelongsToEmployee(employeeId, dto.documentId);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedResignation = await tx.employeeResignation.update({
        where: {
          id: resignationId,
        },
        data: {
          ...(dto.resignationDate !== undefined
            ? { resignationDate: new Date(dto.resignationDate) }
            : {}),
          ...(dto.effectiveDate !== undefined
            ? { effectiveDate: new Date(dto.effectiveDate) }
            : {}),
          ...(dto.reason !== undefined ? { reason: dto.reason.trim() } : {}),
          ...(dto.note !== undefined
            ? { note: this.optionalTrim(dto.note) }
            : {}),
          ...(dto.documentId !== undefined
            ? { documentId: dto.documentId || null }
            : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.status === ResignationStatus.APPROVED
            ? {
                approvedAt: new Date(),
                approvedById: currentUser.id,
              }
            : {}),
          ...(dto.status === ResignationStatus.REJECTED
            ? {
                rejectedAt: new Date(),
                rejectedById: currentUser.id,
              }
            : {}),
          ...(dto.status === ResignationStatus.CANCELLED
            ? {
                cancelledAt: new Date(),
                cancelledById: currentUser.id,
              }
            : {}),
        },
      });

      if (dto.status === ResignationStatus.APPROVED) {
        await tx.employee.update({
          where: {
            id: employeeId,
          },
          data: {
            status: EmployeeStatus.RESIGNED,
          },
        });

        await tx.employeeWorkHistory.create({
          data: {
            employeeId,
            type: WorkHistoryType.STATUS_CHANGE,
            effectiveDate: updatedResignation.effectiveDate,
            title: 'อนุมัติการลาออก',
            description: 'เปลี่ยนสถานะพนักงานเป็นลาออก',
            oldStatus: employee.status,
            newStatus: EmployeeStatus.RESIGNED,
            createdById: currentUser.id,
          },
        });

        // เปิดเคสเคลียร์ของอัตโนมัติ เพื่อไม่ให้ของบริษัทและสิทธิ์ระบบตกหล่น
        const existingCase = await tx.offboardingCase.findFirst({
          where: {
            employeeId,
            status: OffboardingStatus.IN_PROGRESS,
            deletedAt: null,
          },
          select: { id: true },
        });

        if (!existingCase) {
          await this.offboardingService.createCaseInternal(tx, {
            companyId: employee.companyId,
            employeeId,
            resignationId: updatedResignation.id,
            reasonType: OffboardingReasonType.RESIGNATION,
            lastWorkingDate: updatedResignation.effectiveDate,
            effectiveDate: updatedResignation.effectiveDate,
            note: 'เปิดอัตโนมัติเมื่ออนุมัติใบลาออก',
            currentUserId: currentUser.id,
          });
        }
      }

      return updatedResignation;
    });

    return updated;
  }

  private employeeScopeWhere(scope: TenantScope): Prisma.EmployeeWhereInput {
    return tenantWhere(scope) as Prisma.EmployeeWhereInput;
  }

  private applyScopeToCreateDto(
    dto: CreateEmployeeDto,
    scope: TenantScope,
  ): CreateEmployeeDto {
    assertWithinScope(scope, {
      companyId: dto.companyId,
      branchId: dto.branchId ?? null,
    });

    const companyId = scope.level === 'GLOBAL' ? dto.companyId : scope.companyId;
    const branchId = scope.level === 'BRANCH' ? scope.branchId : dto.branchId;

    this.assertEmployeeTargetWithinScope(scope, {
      companyId,
      branchId: branchId ?? null,
    });

    return {
      ...dto,
      companyId: companyId ?? dto.companyId,
      branchId: branchId ?? undefined,
    };
  }

  private assertEmployeeTargetWithinScope(
    scope: TenantScope,
    target: { companyId?: string | null; branchId?: string | null },
  ) {
    if (scope.level === 'GLOBAL') {
      return;
    }

    assertWithinScope(scope, target);

    if (!target.companyId || target.companyId !== scope.companyId) {
      throw new ForbiddenException('ไม่มีสิทธิ์จัดการข้อมูลพนักงานของบริษัทนี้');
    }

    if (scope.level === 'BRANCH' && target.branchId !== scope.branchId) {
      throw new ForbiddenException('ไม่มีสิทธิ์จัดการข้อมูลพนักงานของสาขานี้');
    }
  }

  private async buildEmployeeListSummary(where: Prisma.EmployeeWhereInput) {
    const statusWhere = (status: EmployeeStatus): Prisma.EmployeeWhereInput => ({
      AND: [where, { status }],
    });

    const [
      total,
      active,
      probation,
      suspended,
      resigned,
      terminated,
      inactive,
      linkedUser,
      withoutDepartment,
      withoutPosition,
      withoutSupervisor,
      orgRefs,
    ] = await Promise.all([
      this.prisma.employee.count({ where }),
      this.prisma.employee.count({ where: statusWhere(EmployeeStatus.ACTIVE) }),
      this.prisma.employee.count({ where: statusWhere(EmployeeStatus.PROBATION) }),
      this.prisma.employee.count({ where: statusWhere(EmployeeStatus.SUSPENDED) }),
      this.prisma.employee.count({ where: statusWhere(EmployeeStatus.RESIGNED) }),
      this.prisma.employee.count({ where: statusWhere(EmployeeStatus.TERMINATED) }),
      this.prisma.employee.count({ where: statusWhere(EmployeeStatus.INACTIVE) }),
      this.prisma.employee.count({
        where: {
          AND: [where, { userId: { not: null } }],
        },
      }),
      this.prisma.employee.count({
        where: {
          AND: [where, { departmentId: null }],
        },
      }),
      this.prisma.employee.count({
        where: {
          AND: [where, { positionId: null, position: null }],
        },
      }),
      this.prisma.employee.count({
        where: {
          AND: [where, { supervisorId: null }],
        },
      }),
      this.prisma.employee.findMany({
        where,
        select: {
          branchId: true,
          departmentId: true,
        },
      }),
    ]);

    const branchIds = new Set<string>();
    const departmentIds = new Set<string>();

    for (const item of orgRefs) {
      if (item.branchId) branchIds.add(item.branchId);
      if (item.departmentId) departmentIds.add(item.departmentId);
    }

    return {
      total,
      active,
      probation,
      suspended,
      resigned,
      terminated,
      inactive,
      linkedUser,
      withoutDepartment,
      withoutPosition,
      withoutSupervisor,
      branchCount: branchIds.size,
      departmentCount: departmentIds.size,
      branchDepartmentTotal: branchIds.size + departmentIds.size,
    };
  }

  /**
   * จำนวนคนต่อสาขา/ต่อแผนก นับจากผลลัพธ์ทั้งชุด ไม่ใช่เฉพาะหน้าที่กำลังเปิด
   *
   * หัวข้อกลุ่มบนหน้าเว็บเขียนว่า "X คน" ถ้าให้หน้าเว็บนับเองจะได้แค่จำนวนแถว
   * ที่อยู่ในหน้านั้น สาขาที่ถูกตัดข้ามหน้าจึงขึ้นตัวเลขคนละค่าในสองหน้า
   * ทั้งที่เป็นสาขาเดียวกัน
   *
   * ต้องรับ where ชุดเดียวกับที่ใช้ดึงแถว ไม่ใช่ชุดของสรุปสถานะ
   */
  private async buildEmployeeGroupTotals(where: Prisma.EmployeeWhereInput) {
    const rows = await this.prisma.employee.groupBy({
      by: ['branchId', 'departmentId'],
      where,
      _count: { _all: true },
    });

    const branchTotals = new Map<string, number>();

    for (const row of rows) {
      const branchId = row.branchId ?? '';
      branchTotals.set(
        branchId,
        (branchTotals.get(branchId) ?? 0) + row._count._all,
      );
    }

    return {
      /** จำนวนคนต่อสาขา — null = ยังไม่ระบุสาขา */
      branchTotals: [...branchTotals].map(([branchId, total]) => ({
        branchId: branchId || null,
        total,
      })),
      /** จำนวนคนต่อแผนกภายในสาขา */
      departmentTotals: rows.map((row) => ({
        branchId: row.branchId,
        departmentId: row.departmentId,
        total: row._count._all,
      })),
    };
  }

  private employeeListInclude() {
    return {
      company: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      branch: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      attendanceLocation: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          branchId: true,
          radiusMeters: true,
          status: true,
        },
      },
      department: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      division: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      employeeType: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      positionMaster: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
          // ผังองค์กรใช้จัดลำดับอาวุโส (ค่ามาก = สูงกว่า)
          level: true,
          sortOrder: true,
        },
      },
      supervisor: {
        select: {
          id: true,
          employeeCode: true,
          nickname: true,
          title: true,
          firstName: true,
          lastName: true,
          displayName: true,
          position: true,
          positionId: true,
          status: true,
          positionMaster: {
            select: {
              id: true,
              code: true,
              nameTh: true,
              nameEn: true,
              level: true,
              sortOrder: true,
            },
          },
        },
      },
      _count: {
        select: {
          subordinates: true,
        },
      },
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true,
          status: true,
        },
      },
    } satisfies Prisma.EmployeeInclude;
  }

  private employeeDetailInclude() {
    return {
      company: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      branch: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      department: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      division: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      employeeType: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      positionMaster: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
          level: true,
          sortOrder: true,
        },
      },
      supervisor: {
        select: {
          id: true,
          employeeCode: true,
          nickname: true,
          title: true,
          firstName: true,
          lastName: true,
          displayName: true,
          position: true,
          positionId: true,
          status: true,
          positionMaster: {
            select: {
              id: true,
              code: true,
              nameTh: true,
              nameEn: true,
            },
          },
        },
      },
      subordinates: {
        where: {
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          employeeCode: true,
          nickname: true,
          title: true,
          firstName: true,
          lastName: true,
          displayName: true,
          position: true,
          positionId: true,
          status: true,
          positionMaster: {
            select: {
              id: true,
              code: true,
              nameTh: true,
              nameEn: true,
            },
          },
        },
      },
      _count: {
        select: {
          subordinates: true,
        },
      },
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true,
          status: true,
        },
      },
      profile: true,
      /* บิดา มารดา คู่สมรส พี่น้อง — เรียงให้พ่อแม่ขึ้นก่อนตามที่ HR ใช้จริง */
      familyMembers: {
        where: {
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
      /* ประวัติการศึกษา — วุฒิล่าสุดขึ้นก่อน คนที่ไม่ระบุปีไปอยู่ท้าย */
      educations: {
        where: {
          deletedAt: null,
        },
        orderBy: [{ gradYear: 'desc' }, { createdAt: 'asc' }],
      },
      documents: {
        where: {
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
      workHistories: {
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          createdBy: {
            select: {
              id: true,
              displayName: true,
              email: true,
            },
          },
        },
      },
      resignations: {
        orderBy: {
          createdAt: 'desc',
        },
      },
      probationRecords: {
        where: {
          deletedAt: null,
        },
        orderBy: {
          startDate: 'desc',
        },
        include: {
          reviewedBy: {
            select: {
              id: true,
              displayName: true,
              email: true,
            },
          },
          evaluationResults: {
            where: { deletedAt: null },
            orderBy: { evaluationDate: 'desc' },
            select: {
              id: true,
              totalScore: true,
              maxScore: true,
              percent: true,
              evaluationDate: true,
              form: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  passScore: true,
                  totalScore: true,
                },
              },
            },
          },
        },
      },
    } satisfies Prisma.EmployeeInclude;
  }

  /** นัดรีวิวล่วงหน้า 19 วันก่อนครบกำหนด ให้ HR มีเวลาแจ้งผลทัน */
  private buildProbationReviewDate(endDate: Date) {
    const reviewDate = new Date(endDate);
    reviewDate.setDate(reviewDate.getDate() - 19);

    return reviewDate;
  }

  /**
   * ออกรหัสพนักงานถัดไปของบริษัทนั้น
   *
   * เดิมไล่หาเลขสูงสุดจากพนักงาน "ทั้งแพลตฟอร์ม" บริษัทที่เปิดทีหลังจึงได้เลข
   * ต่อจากบริษัทอื่น (คนแรกได้ EMP-0013) ซึ่งทั้งดูแปลกและบอกใบ้ว่าทั้งระบบ
   * มีพนักงานกี่คน — ย้ายมาใช้ตัวกลางที่นับแยกรายบริษัทและรายปีแล้ว
   */
  private async generateNextEmployeeCode(
    tx: Prisma.TransactionClient,
    companyId: string,
    startDate: Date,
  ): Promise<string> {
    return generateEmployeeCode(tx, { companyId, startDate });
  }

  /**
   * แปลง P2002 ของเลขประจำตัวให้เป็นข้อความที่ HR อ่านรู้เรื่อง
   *
   * ถ้าไม่แปลง ผู้ใช้จะเห็นแค่ error ดิบของฐานข้อมูล แล้วไม่รู้ว่าต้องแก้ช่องไหน
   * ทั้งที่สาเหตุคือมีพนักงานคนนี้อยู่ในระบบแล้ว
   */
  private assertNotDuplicateIdentityNumber(error: unknown): never {
    const prismaError = error as { code?: string; meta?: { target?: unknown } };

    if (prismaError?.code === 'P2002') {
      const target = Array.isArray(prismaError.meta?.target)
        ? prismaError.meta?.target.map(String)
        : [String(prismaError.meta?.target ?? '')];

      const labels: Array<[string, string]> = [
        ['nationalId', 'เลขบัตรประชาชน'],
        ['socialSecurityNo', 'เลขประกันสังคม'],
        ['taxId', 'เลขผู้เสียภาษี'],
      ];

      for (const [field, label] of labels) {
        if (target.some((item) => item.includes(field))) {
          throw new ConflictException(
            `${label}นี้ถูกใช้กับพนักงานคนอื่นในบริษัทนี้แล้ว กรุณาตรวจสอบว่าเป็นคนเดียวกันหรือไม่`,
          );
        }
      }
    }

    throw error;
  }

  private isEmployeeCodeUniqueConflict(error: unknown): boolean {
    const prismaError = error as {
      code?: string;
      meta?: {
        target?: unknown;
      };
    };

    if (prismaError?.code !== 'P2002') {
      return false;
    }

    const target = prismaError.meta?.target;

    if (Array.isArray(target)) {
      return target.some((field) => String(field).includes('employeeCode'));
    }

    return String(target ?? '').includes('employeeCode');
  }

  private async validateCreate(dto: CreateEmployeeDto) {
    if (dto.userId) {
      const duplicatedUser = await this.prisma.employee.findUnique({
        where: {
          userId: dto.userId,
        },
      });

      if (duplicatedUser) {
        throw new ConflictException('บัญชีผู้ใช้นี้ถูกผูกกับพนักงานคนอื่นแล้ว');
      }
    }

    await this.validateMasterData(dto, dto.companyId, dto.branchId ?? null);
    await this.validateSupervisorForCreate(dto);
  }

  private async validateUpdate(
    id: string,
    dto: UpdateEmployeeDto,
    targetCompanyId: string,
    targetBranchId?: string | null,
  ) {
    if (dto.employeeCode !== undefined) {
      const employeeCode = assertValidEmployeeCode(dto.employeeCode);

      const duplicatedCode = await this.prisma.employee.findFirst({
        where: {
          companyId: targetCompanyId,
          employeeCode,
          id: {
            not: id,
          },
        },
      });

      if (duplicatedCode) {
        throw new ConflictException('รหัสพนักงานนี้ถูกใช้งานแล้ว');
      }
    }

    if (dto.userId) {
      const duplicatedUser = await this.prisma.employee.findFirst({
        where: {
          userId: dto.userId,
          id: {
            not: id,
          },
        },
      });

      if (duplicatedUser) {
        throw new ConflictException('บัญชีผู้ใช้นี้ถูกผูกกับพนักงานคนอื่นแล้ว');
      }
    }

    await this.validateMasterData(dto, targetCompanyId, targetBranchId ?? null);
    await this.validateSupervisorForUpdate(
      id,
      dto,
      targetCompanyId,
      targetBranchId ?? null,
    );
  }

  /**
   * ตรวจสังกัดปลายทางด้วยกติกาชุดเดียวกับการแก้ทะเบียนพนักงาน
   *
   * ใบโยกย้าย (EmployeeTransfersService) เขียนลงตาราง employees ตรง ๆ เหมือนกัน
   * ถ้าใช้กติกาคนละชุดมันจะกลายเป็นทางลัดที่สร้างข้อมูลซึ่งฟอร์มแก้ทะเบียนปฏิเสธ
   * เช่น หัวหน้างานอยู่คนละสาขา แผนกที่ผูกกับสาขาอื่น หรือสาขาที่ปิดใช้งานไปแล้ว
   *
   * รับ "ค่าที่จะเป็นหลังย้าย" ทั้งชุด ไม่ใช่เฉพาะช่องที่เปลี่ยน เพราะกติกาหลายข้อ
   * เป็นความสัมพันธ์ระหว่างช่อง (แผนกต้องอยู่ในสาขา หัวหน้าต้องอยู่สาขาเดียวกัน)
   */
  async assertEmploymentTargetValid(params: {
    employeeId: string;
    companyId: string;
    branchId: string | null;
    departmentId: string | null;
    divisionId: string | null;
    positionId: string | null;
    employeeTypeId: string | null;
    supervisorId: string | null;
  }) {
    await this.validateMasterData(
      {
        companyId: params.companyId,
        branchId: params.branchId ?? undefined,
        departmentId: params.departmentId ?? undefined,
        divisionId: params.divisionId ?? undefined,
        positionId: params.positionId ?? undefined,
        employeeTypeId: params.employeeTypeId ?? undefined,
        supervisorId: undefined,
        userId: undefined,
      },
      params.companyId,
      params.branchId,
    );

    if (params.supervisorId) {
      await this.ensureValidSupervisor({
        employeeId: params.employeeId,
        supervisorId: params.supervisorId,
        companyId: params.companyId,
        branchId: params.branchId,
      });
    }
  }

  private async validateMasterData(
    dto: Pick<
      CreateEmployeeDto | UpdateEmployeeDto,
      | 'companyId'
      | 'branchId'
      | 'departmentId'
      | 'divisionId'
      | 'employeeTypeId'
      | 'positionId'
      | 'supervisorId'
      | 'userId'
    >,
    targetCompanyId?: string | null,
    targetBranchId?: string | null,
  ) {
    if (dto.companyId) {
      const company = await this.prisma.company.findFirst({
        where: {
          id: dto.companyId,
          status: MasterStatus.ACTIVE,
          deletedAt: null,
        },
      });

      if (!company) {
        throw new BadRequestException('ไม่พบบริษัทหรือบริษัทไม่พร้อมใช้งาน');
      }
    }

    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: {
          id: dto.branchId,
          status: MasterStatus.ACTIVE,
          deletedAt: null,
          ...(targetCompanyId ? { companyId: targetCompanyId } : {}),
        },
      });

      if (!branch) {
        throw new BadRequestException('ไม่พบสาขาหรือสาขาไม่พร้อมใช้งาน');
      }
    }

    if (dto.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: {
          id: dto.departmentId,
          status: MasterStatus.ACTIVE,
          deletedAt: null,
          ...(targetCompanyId ? { companyId: targetCompanyId } : {}),
          ...(targetBranchId
            ? { OR: [{ branchId: null }, { branchId: targetBranchId }] }
            : {}),
        },
      });

      if (!department) {
        throw new BadRequestException('ไม่พบแผนกหรือแผนกไม่พร้อมใช้งาน');
      }
    }

    if (dto.divisionId) {
      const division = await this.prisma.division.findFirst({
        where: {
          id: dto.divisionId,
          status: MasterStatus.ACTIVE,
          deletedAt: null,
          ...(targetCompanyId || targetBranchId
            ? {
                department: {
                  is: {
                    ...(targetCompanyId ? { companyId: targetCompanyId } : {}),
                    ...(targetBranchId
                      ? {
                          OR: [
                            { branchId: null },
                            { branchId: targetBranchId },
                          ],
                        }
                      : {}),
                  },
                },
              }
            : {}),
        },
      });

      if (!division) {
        throw new BadRequestException(
          'ไม่พบฝ่าย/กลุ่มงาน หรือข้อมูลไม่พร้อมใช้งาน',
        );
      }
    }

    if (dto.employeeTypeId) {
      const employeeType = await this.prisma.employeeType.findFirst({
        where: {
          id: dto.employeeTypeId,
          status: MasterStatus.ACTIVE,
          deletedAt: null,
        },
      });

      if (!employeeType) {
        throw new BadRequestException(
          'ไม่พบประเภทพนักงานหรือประเภทพนักงานไม่พร้อมใช้งาน',
        );
      }
    }

    if (dto.positionId) {
      await this.findActivePosition(dto.positionId);
    }

    if (dto.userId) {
      const user = await this.prisma.user.findFirst({
        where: {
          id: dto.userId,
          deletedAt: null,
        },
      });

      if (!user) {
        throw new BadRequestException(
          'ไม่พบบัญชีผู้ใช้ที่ต้องการผูกกับพนักงาน',
        );
      }
    }
  }

  private async validateSupervisorForCreate(dto: CreateEmployeeDto) {
    if (!dto.supervisorId) {
      return;
    }

    await this.ensureValidSupervisor({
      supervisorId: dto.supervisorId,
      companyId: dto.companyId,
      branchId: dto.branchId ?? null,
    });
  }

  private async validateSupervisorForUpdate(
    employeeId: string,
    dto: UpdateEmployeeDto,
    companyId: string,
    branchId?: string | null,
  ) {
    if (dto.supervisorId === undefined) {
      return;
    }

    if (!dto.supervisorId) {
      return;
    }

    await this.ensureValidSupervisor({
      employeeId,
      supervisorId: dto.supervisorId,
      companyId,
      branchId: branchId ?? null,
    });
  }

  private async ensureValidSupervisor(params: {
    employeeId?: string;
    supervisorId: string;
    companyId?: string | null;
    branchId?: string | null;
  }) {
    if (params.employeeId && params.employeeId === params.supervisorId) {
      throw new BadRequestException(
        'ไม่สามารถเลือกพนักงานคนเดิมเป็นผู้บังคับบัญชาของตัวเองได้',
      );
    }

    const supervisor = await this.prisma.employee.findFirst({
      where: {
        id: params.supervisorId,
        deletedAt: null,
        status: {
          notIn: [
            EmployeeStatus.INACTIVE,
            EmployeeStatus.RESIGNED,
            EmployeeStatus.TERMINATED,
          ],
        },
      },
      select: {
        id: true,
        employeeCode: true,
        nickname: true,
        displayName: true,
        firstName: true,
        lastName: true,
        companyId: true,
        branchId: true,
        supervisorId: true,
      },
    });

    if (!supervisor) {
      throw new BadRequestException(
        'ไม่พบผู้บังคับบัญชา หรือข้อมูลไม่พร้อมใช้งาน',
      );
    }

    if (params.companyId && supervisor.companyId !== params.companyId) {
      throw new BadRequestException(
        'ผู้บังคับบัญชาต้องอยู่ในบริษัทเดียวกันกับพนักงาน',
      );
    }

    /*
     * ไม่บังคับว่าหัวหน้าต้องอยู่สาขาเดียวกันแล้ว
     *
     * ของจริงผู้บริหารนั่งอยู่สำนักงานใหญ่แต่คุมคนทั้งเครือ และ "สาขา" ในระบบนี้
     * หลายตัวเป็นคนละนิติบุคคล การรายงานข้ามสาขาจึงเป็นเรื่องปกติ ไม่ใช่ข้อผิดพลาด
     * ที่ยังกันไว้คือข้ามบริษัท (ด้านบน) กับสายบังคับบัญชาวนกลับ (ด้านล่าง)
     */

    if (!params.employeeId) {
      return supervisor;
    }

    const visited = new Set<string>();
    let cursorId: string | null = supervisor.id;

    while (cursorId) {
      if (cursorId === params.employeeId) {
        throw new BadRequestException(
          'ไม่สามารถกำหนดผู้บังคับบัญชาได้ เพราะจะเกิดลำดับชั้นวนกลับ',
        );
      }

      if (visited.has(cursorId)) {
        throw new BadRequestException(
          'ตรวจพบข้อมูลสายบังคับบัญชาวนกลับในระบบ',
        );
      }

      visited.add(cursorId);

      const current = await this.prisma.employee.findFirst({
        where: {
          id: cursorId,
          deletedAt: null,
        },
        select: {
          supervisorId: true,
        },
      });

      cursorId = current?.supervisorId ?? null;
    }

    return supervisor;
  }

  private async findActivePosition(positionId: string) {
    const position = await this.prisma.position.findFirst({
      where: {
        id: positionId,
        status: MasterStatus.ACTIVE,
        deletedAt: null,
      },
      select: {
        id: true,
        code: true,
        nameTh: true,
        nameEn: true,
      },
    });

    if (!position) {
      throw new BadRequestException(
        'ไม่พบตำแหน่งในบริษัท หรือข้อมูลไม่พร้อมใช้งาน',
      );
    }

    return position;
  }

  private shouldCreateWorkHistory(
    current: {
      companyId: string;
      branchId: string | null;
      departmentId: string | null;
      divisionId: string | null;
      employeeTypeId: string | null;
      positionId: string | null;
      supervisorId: string | null;
      position: string | null;
      status: EmployeeStatus;
    },
    dto: UpdateEmployeeDto,
  ) {
    return (
      (dto.companyId !== undefined && dto.companyId !== current.companyId) ||
      (dto.branchId !== undefined &&
        (dto.branchId || null) !== current.branchId) ||
      (dto.departmentId !== undefined &&
        (dto.departmentId || null) !== current.departmentId) ||
      (dto.divisionId !== undefined &&
        (dto.divisionId || null) !== current.divisionId) ||
      (dto.employeeTypeId !== undefined &&
        (dto.employeeTypeId || null) !== current.employeeTypeId) ||
      (dto.positionId !== undefined &&
        (dto.positionId || null) !== current.positionId) ||
      (dto.supervisorId !== undefined &&
        (dto.supervisorId || null) !== current.supervisorId) ||
      (dto.position !== undefined &&
        (dto.position || null) !== current.position) ||
      (dto.status !== undefined && dto.status !== current.status)
    );
  }

  private resolveWorkHistoryType(
    current: {
      branchId: string | null;
      departmentId: string | null;
      divisionId: string | null;
      employeeTypeId: string | null;
      positionId: string | null;
      supervisorId: string | null;
      position: string | null;
      status: EmployeeStatus;
    },
    dto: UpdateEmployeeDto,
  ): WorkHistoryType {
    if (dto.status !== undefined && dto.status !== current.status) {
      return WorkHistoryType.STATUS_CHANGE;
    }

    if (
      (dto.position !== undefined &&
        (dto.position || null) !== current.position) ||
      (dto.positionId !== undefined &&
        (dto.positionId || null) !== current.positionId)
    ) {
      return WorkHistoryType.POSITION_CHANGE;
    }

    if (
      dto.departmentId !== undefined &&
      (dto.departmentId || null) !== current.departmentId
    ) {
      return WorkHistoryType.DEPARTMENT_TRANSFER;
    }

    if (
      dto.branchId !== undefined &&
      (dto.branchId || null) !== current.branchId
    ) {
      return WorkHistoryType.BRANCH_TRANSFER;
    }

    if (
      dto.employeeTypeId !== undefined &&
      (dto.employeeTypeId || null) !== current.employeeTypeId
    ) {
      return WorkHistoryType.EMPLOYEE_TYPE_CHANGE;
    }

    if (
      dto.supervisorId !== undefined &&
      (dto.supervisorId || null) !== current.supervisorId
    ) {
      return WorkHistoryType.OTHER;
    }

    return WorkHistoryType.OTHER;
  }

  private buildProfileCreateData(
    rawProfile: NonNullable<
      CreateEmployeeDto['profile'] | UpdateEmployeeDto['profile']
    >,
    companyId: string,
  ): Prisma.EmployeeProfileCreateWithoutEmployeeInput {
    // ใช้ตอนสร้าง profile ให้พนักงานที่ยังไม่มี ระหว่างการอัปเดตด้วย
    // จึงต้องกันค่าที่ถูกปกปิดเหมือนกัน ไม่งั้นเลขปลอมถูกบันทึกเป็นค่าตั้งต้น
    const profile = this.stripMaskedSensitiveInput(rawProfile);

    return {
      // สำเนาบริษัท ใช้บังคับ "เลขประจำตัวห้ามซ้ำภายในบริษัทเดียวกัน"
      company: { connect: { id: companyId } },
      gender: profile.gender,
      birthDate: profile.birthDate ? new Date(profile.birthDate) : null,
      nationalId: this.optionalTrim(profile.nationalId),
      passportNo: this.optionalTrim(profile.passportNo),
      maritalStatus: profile.maritalStatus,
      nationality: this.optionalTrim(profile.nationality),
      religion: this.optionalTrim(profile.religion),
      currentAddress: this.optionalTrim(profile.currentAddress),
      registeredAddress: this.optionalTrim(profile.registeredAddress),
      emergencyContactName: this.optionalTrim(profile.emergencyContactName),
      emergencyContactPhone: this.optionalTrim(profile.emergencyContactPhone),
      emergencyContactRelation: this.optionalTrim(
        profile.emergencyContactRelation,
      ),
      emergencyContactName2: this.optionalTrim(profile.emergencyContactName2),
      emergencyContactPhone2: this.optionalTrim(profile.emergencyContactPhone2),
      emergencyContactRelation2: this.optionalTrim(
        profile.emergencyContactRelation2,
      ),
      educationLevel: this.optionalTrim(profile.educationLevel),
      educationInstitute: this.optionalTrim(profile.educationInstitute),
      educationMajor: this.optionalTrim(profile.educationMajor),
      bankName: this.optionalTrim(profile.bankName),
      bankAccountNo: this.optionalTrim(profile.bankAccountNo),
      bankAccountName: this.optionalTrim(profile.bankAccountName),
      firstNameEn: this.optionalTrim(profile.firstNameEn),
      lastNameEn: this.optionalTrim(profile.lastNameEn),
      personalEmail: this.optionalTrim(profile.personalEmail),
      workPhoneExt: this.optionalTrim(profile.workPhoneExt),
      lineId: this.optionalTrim(profile.lineId),
      bloodType: this.optionalTrim(profile.bloodType),
      taxId: this.optionalTrim(profile.taxId),
      socialSecurityNo: this.optionalTrim(profile.socialSecurityNo),
      socialSecurityHospital: this.optionalTrim(
        profile.socialSecurityHospital,
      ),
      providentFundNo: this.optionalTrim(profile.providentFundNo),
      payrollPaymentMethod: this.optionalTrim(profile.payrollPaymentMethod),
      contractNo: this.optionalTrim(profile.contractNo),
      contractStartDate: profile.contractStartDate
        ? new Date(profile.contractStartDate)
        : null,
      contractEndDate: profile.contractEndDate
        ? new Date(profile.contractEndDate)
        : null,
      workLocation: this.optionalTrim(profile.workLocation),
      workPermitNo: this.optionalTrim(profile.workPermitNo),
      workPermitExpiredDate: profile.workPermitExpiredDate
        ? new Date(profile.workPermitExpiredDate)
        : null,
      visaNo: this.optionalTrim(profile.visaNo),
      visaExpiredDate: profile.visaExpiredDate
        ? new Date(profile.visaExpiredDate)
        : null,
      emergencyContactAddress: this.optionalTrim(
        profile.emergencyContactAddress,
      ),
      emergencyContactAddress2: this.optionalTrim(
        profile.emergencyContactAddress2,
      ),
      note: this.optionalTrim(profile.note),
    };
  }

  /**
   * ทิ้งค่าอ่อนไหวที่ส่งกลับมาในรูปแบบที่ถูกปกปิด
   *
   * ผู้ใช้ที่ไม่มีสิทธิ์ EMPLOYEE_SENSITIVE_READ เปิดฟอร์มแก้ไขจะได้ค่าปิดหลัก
   * ไปแสดง (เช่น x-xxxx-xxxxx-x2-3) ถ้ากดบันทึกโดยไม่ได้ตั้งใจแก้ช่องนั้น
   * ค่าปลอมจะทับเลขจริงทิ้ง จึงถือว่าค่าแบบนี้คือ "ไม่ได้แก้"
   */
  private stripMaskedSensitiveInput<T extends object>(profile: T): T {
    const sensitiveKeys = [
      'nationalId',
      'passportNo',
      'taxId',
      'socialSecurityNo',
      'bankAccountNo',
    ] as const;

    const cleaned = { ...profile } as Record<string, unknown>;

    for (const key of sensitiveKeys) {
      if (isMaskedValue(cleaned[key])) {
        delete cleaned[key];
      }
    }

    return cleaned as T;
  }

  private buildProfileUpdateData(
    rawProfile: NonNullable<UpdateEmployeeDto['profile']>,
  ): Prisma.EmployeeProfileUpdateWithoutEmployeeInput {
    const profile = this.stripMaskedSensitiveInput(rawProfile);

    return {
      ...(profile.gender !== undefined ? { gender: profile.gender } : {}),
      ...(profile.birthDate !== undefined
        ? {
            birthDate: profile.birthDate ? new Date(profile.birthDate) : null,
          }
        : {}),
      ...(profile.nationalId !== undefined
        ? { nationalId: this.optionalTrim(profile.nationalId) }
        : {}),
      ...(profile.passportNo !== undefined
        ? { passportNo: this.optionalTrim(profile.passportNo) }
        : {}),
      ...(profile.maritalStatus !== undefined
        ? { maritalStatus: profile.maritalStatus }
        : {}),
      ...(profile.nationality !== undefined
        ? { nationality: this.optionalTrim(profile.nationality) }
        : {}),
      ...(profile.religion !== undefined
        ? { religion: this.optionalTrim(profile.religion) }
        : {}),
      ...(profile.currentAddress !== undefined
        ? { currentAddress: this.optionalTrim(profile.currentAddress) }
        : {}),
      ...(profile.registeredAddress !== undefined
        ? { registeredAddress: this.optionalTrim(profile.registeredAddress) }
        : {}),
      ...(profile.emergencyContactName !== undefined
        ? {
            emergencyContactName: this.optionalTrim(
              profile.emergencyContactName,
            ),
          }
        : {}),
      ...(profile.emergencyContactPhone !== undefined
        ? {
            emergencyContactPhone: this.optionalTrim(
              profile.emergencyContactPhone,
            ),
          }
        : {}),
      ...(profile.emergencyContactRelation !== undefined
        ? {
            emergencyContactRelation: this.optionalTrim(
              profile.emergencyContactRelation,
            ),
          }
        : {}),
      ...(profile.emergencyContactName2 !== undefined
        ? {
            emergencyContactName2: this.optionalTrim(
              profile.emergencyContactName2,
            ),
          }
        : {}),
      ...(profile.emergencyContactPhone2 !== undefined
        ? {
            emergencyContactPhone2: this.optionalTrim(
              profile.emergencyContactPhone2,
            ),
          }
        : {}),
      ...(profile.emergencyContactRelation2 !== undefined
        ? {
            emergencyContactRelation2: this.optionalTrim(
              profile.emergencyContactRelation2,
            ),
          }
        : {}),
      ...(profile.educationLevel !== undefined
        ? { educationLevel: this.optionalTrim(profile.educationLevel) }
        : {}),
      ...(profile.educationInstitute !== undefined
        ? { educationInstitute: this.optionalTrim(profile.educationInstitute) }
        : {}),
      ...(profile.educationMajor !== undefined
        ? { educationMajor: this.optionalTrim(profile.educationMajor) }
        : {}),
      ...(profile.bankName !== undefined
        ? { bankName: this.optionalTrim(profile.bankName) }
        : {}),
      ...(profile.bankAccountNo !== undefined
        ? { bankAccountNo: this.optionalTrim(profile.bankAccountNo) }
        : {}),
      ...(profile.bankAccountName !== undefined
        ? { bankAccountName: this.optionalTrim(profile.bankAccountName) }
        : {}),
      ...(profile.firstNameEn !== undefined
        ? { firstNameEn: this.optionalTrim(profile.firstNameEn) }
        : {}),
      ...(profile.lastNameEn !== undefined
        ? { lastNameEn: this.optionalTrim(profile.lastNameEn) }
        : {}),
      ...(profile.personalEmail !== undefined
        ? { personalEmail: this.optionalTrim(profile.personalEmail) }
        : {}),
      ...(profile.workPhoneExt !== undefined
        ? { workPhoneExt: this.optionalTrim(profile.workPhoneExt) }
        : {}),
      ...(profile.lineId !== undefined
        ? { lineId: this.optionalTrim(profile.lineId) }
        : {}),
      ...(profile.bloodType !== undefined
        ? { bloodType: this.optionalTrim(profile.bloodType) }
        : {}),
      ...(profile.taxId !== undefined
        ? { taxId: this.optionalTrim(profile.taxId) }
        : {}),
      ...(profile.socialSecurityNo !== undefined
        ? { socialSecurityNo: this.optionalTrim(profile.socialSecurityNo) }
        : {}),
      ...(profile.socialSecurityHospital !== undefined
        ? {
            socialSecurityHospital: this.optionalTrim(
              profile.socialSecurityHospital,
            ),
          }
        : {}),
      ...(profile.providentFundNo !== undefined
        ? { providentFundNo: this.optionalTrim(profile.providentFundNo) }
        : {}),
      ...(profile.payrollPaymentMethod !== undefined
        ? {
            payrollPaymentMethod: this.optionalTrim(
              profile.payrollPaymentMethod,
            ),
          }
        : {}),
      ...(profile.contractNo !== undefined
        ? { contractNo: this.optionalTrim(profile.contractNo) }
        : {}),
      ...(profile.contractStartDate !== undefined
        ? {
            contractStartDate: profile.contractStartDate
              ? new Date(profile.contractStartDate)
              : null,
          }
        : {}),
      ...(profile.contractEndDate !== undefined
        ? {
            contractEndDate: profile.contractEndDate
              ? new Date(profile.contractEndDate)
              : null,
          }
        : {}),
      ...(profile.workLocation !== undefined
        ? { workLocation: this.optionalTrim(profile.workLocation) }
        : {}),
      ...(profile.workPermitNo !== undefined
        ? { workPermitNo: this.optionalTrim(profile.workPermitNo) }
        : {}),
      ...(profile.workPermitExpiredDate !== undefined
        ? {
            workPermitExpiredDate: profile.workPermitExpiredDate
              ? new Date(profile.workPermitExpiredDate)
              : null,
          }
        : {}),
      ...(profile.visaNo !== undefined
        ? { visaNo: this.optionalTrim(profile.visaNo) }
        : {}),
      ...(profile.visaExpiredDate !== undefined
        ? {
            visaExpiredDate: profile.visaExpiredDate
              ? new Date(profile.visaExpiredDate)
              : null,
          }
        : {}),
      ...(profile.emergencyContactAddress !== undefined
        ? {
            emergencyContactAddress: this.optionalTrim(
              profile.emergencyContactAddress,
            ),
          }
        : {}),
      ...(profile.emergencyContactAddress2 !== undefined
        ? {
            emergencyContactAddress2: this.optionalTrim(
              profile.emergencyContactAddress2,
            ),
          }
        : {}),
      ...(profile.note !== undefined
        ? { note: this.optionalTrim(profile.note) }
        : {}),
    };
  }

  private async ensureEmployeeExists(employeeId: string, scope?: TenantScope) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        deletedAt: null,
        ...(scope ? this.employeeScopeWhere(scope) : {}),
      },
    });

    if (!employee) {
      throw new NotFoundException('ไม่พบข้อมูลพนักงาน');
    }

    return employee;
  }

  private async ensureDocumentBelongsToEmployee(
    employeeId: string,
    documentId: string,
  ) {
    const document = await this.prisma.employeeDocument.findFirst({
      where: {
        id: documentId,
        employeeId,
        deletedAt: null,
      },
    });

    if (!document) {
      throw new BadRequestException('ไม่พบเอกสารของพนักงานคนนี้');
    }

    return document;
  }
  private async safelyDeleteUploadedFile(filePath?: string) {
    if (!filePath) {
      return;
    }

    try {
      await unlink(filePath);
    } catch {
      // ignore cleanup error
    }
  }

  /**
   * หน้าเว็บโชว์ชื่อเป็น "ชื่อ (ชื่อเล่น)" ทุกหน้า ถ้าฟอร์มแก้ไขเผลอส่งค่าที่โชว์กลับมา
   * ห้ามให้ชื่อเล่นฝังเข้าไปในคอลัมน์ displayName — เอกสารทางการ (สลิป, ภ.ง.ด., สปส.)
   * ใช้คอลัมน์นี้โดยตรงและต้องไม่มีชื่อเล่น
   */
  private stripNicknameSuffix(
    displayName?: string | null,
    nickname?: string | null,
  ) {
    const name = this.optionalTrim(displayName);
    const nick = (nickname ?? '').trim();
    if (!name || !nick) return name;
    const suffix = ` (${nick})`;
    return name.endsWith(suffix) ? name.slice(0, -suffix.length).trim() : name;
  }

  private optionalTrim(value?: string | null) {
    if (value === undefined || value === null) {
      return null;
    }

    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : null;
  }
}
