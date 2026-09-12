import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { stat, unlink } from 'fs/promises';
import {
  EmployeeStatus,
  MasterStatus,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  EMPLOYEE_DOCUMENT_STORAGE_PROVIDER,
  getEmployeeDocumentAbsolutePath,
} from '../employees/employee-document-storage.util';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import {
  createAvatarPublicUrl,
  getAvatarAbsolutePathFromUrl,
} from './utils/avatar-storage.util';

/**
 * ช่องข้อความใน EmployeeProfile ที่พนักงานแก้เองได้จากหน้า "ข้อมูลของฉัน"
 *
 * รายการนี้คือขอบเขตความปลอดภัยของทั้ง ESS และแอปมือถือ — อะไรที่ไม่อยู่ในนี้
 * แก้ผ่านตัวเองไม่ได้ ต้องผ่าน HR (ดูเหตุผลใน UpdateMyProfileDto)
 */
const SELF_EDITABLE_PROFILE_TEXT_FIELDS = [
  'nationality',
  'religion',
  'bloodType',
  'lineId',
  'personalEmail',
  'currentAddress',
  'registeredAddress',
  'emergencyContactName',
  'emergencyContactPhone',
  'emergencyContactRelation',
  'emergencyContactAddress',
  'emergencyContactName2',
  'emergencyContactPhone2',
  'emergencyContactRelation2',
  'emergencyContactAddress2',
  'educationLevel',
  'educationInstitute',
  'educationMajor',
] as const;

type SelfEditableProfileTextField =
  (typeof SELF_EDITABLE_PROFILE_TEXT_FIELDS)[number];

type SelfEditableProfileData = Partial<
  Pick<
    Prisma.EmployeeProfileUncheckedCreateInput,
    SelfEditableProfileTextField | 'maritalStatus'
  >
>;

const userProfileInclude = {
  roles: {
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.UserInclude;

const employeeProfileInclude = {
  company: {
    select: {
      id: true,
      code: true,
      nameTh: true,
      nameEn: true,
      taxId: true,
      address: true,
      phone: true,
      email: true,
      status: true,
    },
  },
  branch: {
    select: {
      id: true,
      code: true,
      nameTh: true,
      nameEn: true,
      address: true,
      phone: true,
      email: true,
      status: true,
    },
  },
  department: {
    select: {
      id: true,
      code: true,
      nameTh: true,
      nameEn: true,
      status: true,
    },
  },
  division: {
    select: {
      id: true,
      code: true,
      nameTh: true,
      nameEn: true,
      status: true,
    },
  },
  employeeType: {
    select: {
      id: true,
      code: true,
      nameTh: true,
      nameEn: true,
      description: true,
      status: true,
    },
  },
  positionMaster: {
    select: {
      id: true,
      code: true,
      nameTh: true,
      nameEn: true,
      description: true,
      level: true,
      sortOrder: true,
      status: true,
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
      email: true,
      phone: true,
      position: true,
    },
  },
  user: {
    select: {
      id: true,
      email: true,
      displayName: true,
      phone: true,
      avatarUrl: true,
      status: true,
      lastLoginAt: true,
    },
  },
  profile: true,
  documents: {
    where: {
      deletedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 20,
    include: {
      uploadedBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
    },
  },
  workHistories: {
    orderBy: {
      createdAt: 'desc',
    },
    take: 20,
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
          nameEn: true,
        },
      },
      newCompany: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      oldBranch: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      newBranch: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      oldDepartment: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      newDepartment: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      oldDivision: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      newDivision: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      oldEmployeeType: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      newEmployeeType: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
    },
  },
  resignations: {
    orderBy: {
      createdAt: 'desc',
    },
    take: 10,
    include: {
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
  },
  attendanceLogs: {
    where: {
      deletedAt: null,
    },
    orderBy: {
      logTime: 'desc',
    },
    take: 10,
    include: {
      device: {
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
        },
      },
      location: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          type: true,
        },
      },
    },
  },
  leaveBalances: {
    orderBy: {
      year: 'desc',
    },
    take: 20,
    include: {
      leaveType: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
    },
  },
  leaveRequests: {
    where: {
      deletedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 10,
    include: {
      leaveType: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
      submittedBy: {
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
  },
  overtimeRequests: {
    where: {
      deletedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 10,
    include: {
      submittedBy: {
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
  },
  timeAdjustRequests: {
    where: {
      deletedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 10,
  },
  documentRequests: {
    where: {
      deletedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 10,
    include: {
      documentType: {
        select: {
          id: true,
          code: true,
          nameTh: true,
          nameEn: true,
        },
      },
    },
  },
  complaints: {
    where: {
      deletedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 10,
  },
  evaluationResults: {
    where: {
      deletedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 10,
  },
  warningLetters: {
    where: {
      deletedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 10,
  },
  disciplinaryHistories: {
    where: {
      deletedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 10,
  },
  onboardingTasks: {
    where: {
      deletedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 10,
  },
  onboardingDocuments: {
    where: {
      deletedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 10,
  },
  probationRecords: {
    where: {
      deletedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 10,
  },
  compensations: {
    where: {
      deletedAt: null,
    },
    orderBy: {
      effectiveDate: 'desc',
    },
    take: 10,
  },
  payrollItems: {
    orderBy: {
      createdAt: 'desc',
    },
    take: 10,
    include: {
      run: {
        select: {
          id: true,
          runNo: true,
          status: true,
          calculatedAt: true,
          approvedAt: true,
          paidAt: true,
          period: {
            select: {
              id: true,
              code: true,
              name: true,
              startDate: true,
              endDate: true,
              status: true,
            },
          },
        },
      },
      lines: {
        orderBy: {
          sortOrder: 'asc',
        },
        take: 30,
      },
    },
  },
} satisfies Prisma.EmployeeInclude;

type UserWithProfile = Prisma.UserGetPayload<{
  include: typeof userProfileInclude;
}>;

type EmployeeWithProfileDetail = Prisma.EmployeeGetPayload<{
  include: typeof employeeProfileInclude;
}>;

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Snapshot สำหรับ Mobile Profile เท่านั้น
   *
   * ใช้ select แบบจำกัด field เพื่อไม่ส่ง PII/Payroll/Audit history ก้อนใหญ่จาก getMe()
   * และไม่เปลี่ยน contract ของหน้าเว็บเดิม
   */
  async getMobileProfileSnapshot(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        displayName: true,
        phone: true,
        avatarUrl: true,
      },
    });

    if (!user) {
      throw new NotFoundException('ไม่พบข้อมูลผู้ใช้งาน');
    }

    const employee = await this.prisma.employee.findFirst({
      where: {
        userId,
        deletedAt: null,
        status: {
          notIn: [
            EmployeeStatus.RESIGNED,
            EmployeeStatus.TERMINATED,
            EmployeeStatus.INACTIVE,
          ],
        },
      },
      select: {
        id: true,
        employeeCode: true,
        title: true,
        firstName: true,
        lastName: true,
        nickname: true,
        displayName: true,
        email: true,
        phone: true,
        position: true,
        startDate: true,
        employmentEndDate: true,
        probationEndDate: true,
        probationPassedAt: true,
        status: true,
        company: {
          select: { id: true, code: true, nameTh: true, nameEn: true },
        },
        branch: {
          select: { id: true, code: true, nameTh: true, nameEn: true },
        },
        department: {
          select: { id: true, code: true, nameTh: true, nameEn: true },
        },
        division: {
          select: { id: true, code: true, nameTh: true, nameEn: true },
        },
        employeeType: {
          select: { id: true, code: true, nameTh: true, nameEn: true },
        },
        positionMaster: {
          select: { id: true, code: true, nameTh: true, nameEn: true },
        },
        supervisor: {
          select: {
            id: true,
            employeeCode: true,
            nickname: true,
            firstName: true,
            lastName: true,
            displayName: true,
            email: true,
            phone: true,
            position: true,
            positionMaster: {
              select: { nameTh: true },
            },
          },
        },
        profile: {
          select: {
            gender: true,
            birthDate: true,
            maritalStatus: true,
            nationality: true,
            currentAddress: true,
            registeredAddress: true,
            emergencyContactName: true,
            emergencyContactPhone: true,
            emergencyContactRelation: true,
            emergencyContactAddress: true,
            emergencyContactName2: true,
            emergencyContactPhone2: true,
            emergencyContactRelation2: true,
            emergencyContactAddress2: true,
            educationLevel: true,
            educationInstitute: true,
            educationMajor: true,
            bankName: true,
            bankAccountNo: true,
            bankAccountName: true,
            personalEmail: true,
            workPhoneExt: true,
            lineId: true,
            bloodType: true,
            payrollPaymentMethod: true,
          },
        },
        /*
         * ค่าจ้างที่มีผลอยู่ ณ วันนี้ — เอาไว้ให้พนักงานเห็นฐานเงินเดือนของ
         * ตัวเองในแอป เงื่อนไขคัดเลือกชุดเดียวกับที่ใช้ออกหนังสือรับรอง
         * (document-workflow) เพื่อไม่ให้สองที่ตอบคนละเลข
         */
        compensations: {
          where: {
            deletedAt: null,
            status: MasterStatus.ACTIVE,
            effectiveDate: { lte: new Date() },
            OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
          },
          orderBy: { effectiveDate: 'desc' },
          take: 1,
          select: {
            baseSalary: true,
            effectiveDate: true,
            salaryBasis: true,
            paymentMethod: true,
            socialSecurityEnabled: true,
            taxEnabled: true,
            bankName: true,
            bankAccountNo: true,
            bankAccountName: true,
          },
        },
        documents: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            type: true,
            title: true,
            description: true,
            fileName: true,
            fileSize: true,
            mimeType: true,
            issuedDate: true,
            expiredDate: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    return { user, employee };
  }

  /** เปิดเอกสารของตัวเองเท่านั้น — ไม่รับ employeeId จาก client */
  async getMyDocumentFileForDownload(userId: string, documentId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        userId,
        deletedAt: null,
        status: {
          notIn: [
            EmployeeStatus.RESIGNED,
            EmployeeStatus.TERMINATED,
            EmployeeStatus.INACTIVE,
          ],
        },
      },
      select: { id: true },
    });

    if (!employee) {
      throw new NotFoundException('ไม่พบข้อมูลพนักงาน');
    }

    const document = await this.prisma.employeeDocument.findFirst({
      where: {
        id: documentId,
        employeeId: employee.id,
        deletedAt: null,
      },
      select: {
        fileName: true,
        mimeType: true,
        storageKey: true,
        storageProvider: true,
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

  async getMe(userId: string) {
    const user = await this.findUserById(userId);

    if (!user) {
      throw new NotFoundException('ไม่พบข้อมูลผู้ใช้งาน');
    }

    const employee = await this.findEmployeeByUserId(userId);

    return this.mapProfile(user, employee);
  }

  async updateMe(userId: string, dto: UpdateMyProfileDto) {
    const current = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบข้อมูลผู้ใช้งาน');
    }

    // ชื่อที่แสดงโผล่ทุกที่ในระบบ ปล่อยให้ว่างแล้วจะกลายเป็นแถวไร้ชื่อในสายอนุมัติ
    if (dto.displayName !== undefined && !dto.displayName.trim()) {
      throw new BadRequestException('กรุณากรอกชื่อที่แสดงในระบบ');
    }

    const personalData = this.buildSelfEditableProfileData(dto);

    /*
     * แถวใน EmployeeProfile ของพนักงานเก่าบางคนยังไม่เคยถูกสร้าง
     * ต้อง upsert และต้องแนบ companyId ตามพนักงาน เพราะตารางนี้เก็บสำเนา
     * companyId ไว้บังคับกติกาเลขซ้ำภายในบริษัท (ดู schema.prisma)
     */
    const employeeForUpdate = personalData
      ? await this.prisma.employee.findFirst({
          where: {
            userId,
            deletedAt: null,
            status: {
              notIn: [
                EmployeeStatus.RESIGNED,
                EmployeeStatus.TERMINATED,
                EmployeeStatus.INACTIVE,
              ],
            },
          },
          select: {
            id: true,
            companyId: true,
          },
        })
      : null;

    if (personalData && !employeeForUpdate) {
      throw new BadRequestException(
        'บัญชีนี้ยังไม่ผูกกับข้อมูลพนักงาน จึงแก้ข้อมูลส่วนนี้ไม่ได้',
      );
    }

    const user = await this.prisma.$transaction(async (tx) => {
      if (personalData && employeeForUpdate) {
        await tx.employeeProfile.upsert({
          where: {
            employeeId: employeeForUpdate.id,
          },
          create: {
            employeeId: employeeForUpdate.id,
            companyId: employeeForUpdate.companyId,
            ...personalData,
          },
          update: personalData,
        });
      }

      return tx.user.update({
        where: {
          id: userId,
        },
        data: {
          ...(dto.displayName !== undefined
            ? {
                displayName: dto.displayName.trim(),
              }
            : {}),
          ...(dto.phone !== undefined
            ? {
                phone: dto.phone?.trim() || null,
              }
            : {}),
        },
        include: userProfileInclude,
      });
    });

    const employee = await this.findEmployeeByUserId(userId);

    return this.mapProfile(user, employee);
  }

  /**
   * คัดเฉพาะช่องของ EmployeeProfile ที่พนักงานแก้เองได้ออกมาจาก DTO
   *
   * คืน null เมื่อคำขอไม่ได้แตะช่องเหล่านี้เลย (แก้แค่ชื่อ/เบอร์ในตาราง User)
   * จะได้ไม่ไปสร้างแถว EmployeeProfile เปล่า ๆ ให้บัญชีที่ไม่ผูกกับพนักงาน
   */
  private buildSelfEditableProfileData(dto: UpdateMyProfileDto) {
    const data: SelfEditableProfileData = {};
    let touched = false;

    for (const field of SELF_EDITABLE_PROFILE_TEXT_FIELDS) {
      const value = dto[field];
      if (value === undefined) continue;

      // ลบข้อมูลทิ้งได้ด้วยการส่งค่าว่างมา — เก็บเป็น null ไม่ใช่สตริงว่าง
      data[field] = value?.trim() || null;
      touched = true;
    }

    if (dto.maritalStatus !== undefined) {
      data.maritalStatus = dto.maritalStatus;
      touched = true;
    }

    return touched ? data : null;
  }

  async uploadAvatar(userId: string, file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('กรุณาเลือกรูปโปรไฟล์');
    }

    const current = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
      select: {
        id: true,
        avatarUrl: true,
      },
    });

    if (!current) {
      await this.safeDeleteFile(file.path);
      throw new NotFoundException('ไม่พบข้อมูลผู้ใช้งาน');
    }

    const nextAvatarUrl = createAvatarPublicUrl(file.filename);

    const user = await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        avatarUrl: nextAvatarUrl,
      },
      include: userProfileInclude,
    });

    await this.safeDeleteAvatarByUrl(current.avatarUrl);

    const employee = await this.findEmployeeByUserId(userId);

    return this.mapProfile(user, employee);
  }

  async deleteAvatar(userId: string) {
    const current = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
      select: {
        id: true,
        avatarUrl: true,
      },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบข้อมูลผู้ใช้งาน');
    }

    const user = await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        avatarUrl: null,
      },
      include: userProfileInclude,
    });

    await this.safeDeleteAvatarByUrl(current.avatarUrl);

    const employee = await this.findEmployeeByUserId(userId);

    return this.mapProfile(user, employee);
  }

  private findUserById(userId: string) {
    return this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
      include: userProfileInclude,
    });
  }

  private async findEmployeeByUserId(userId: string) {
    return this.prisma.employee.findFirst({
      where: {
        userId,
        deletedAt: null,
        status: {
          notIn: [
            EmployeeStatus.RESIGNED,
            EmployeeStatus.TERMINATED,
            EmployeeStatus.INACTIVE,
          ],
        },
      },
      include: employeeProfileInclude,
    });
  }

  private async safeDeleteAvatarByUrl(avatarUrl?: string | null) {
    const filePath = getAvatarAbsolutePathFromUrl(avatarUrl);

    if (!filePath) return;

    await this.safeDeleteFile(filePath);
  }

  private async safeDeleteFile(filePath?: string | null) {
    if (!filePath) return;

    try {
      await unlink(filePath);
    } catch {
      // ignore cleanup error
    }
  }

  private mapProfile(
    user: UserWithProfile,
    employee: EmployeeWithProfileDetail | null,
  ) {
    const roles = user.roles
      .filter((userRole) => userRole.role.isActive)
      .map((userRole) => ({
        id: userRole.role.id,
        code: userRole.role.code,
        name: userRole.role.name,
      }));

    const permissions = Array.from(
      new Set(
        user.roles.flatMap((userRole) =>
          userRole.role.permissions
            .filter((rolePermission) => rolePermission.permission.isActive)
            .map((rolePermission) => rolePermission.permission.code),
        ),
      ),
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        status: user.status,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        roles,
        permissions,
      },

      employee,

      summary: this.buildEmployeeSummary(employee),
    };
  }

  private buildEmployeeSummary(employee: EmployeeWithProfileDetail | null) {
    if (!employee) {
      return {
        hasEmployeeProfile: false,
        documentCount: 0,
        activeDocumentCount: 0,
        expiredDocumentCount: 0,
        workHistoryCount: 0,
        resignationCount: 0,
        attendanceLogCount: 0,
        leaveBalanceCount: 0,
        leaveRequestCount: 0,
        pendingLeaveRequestCount: 0,
        approvedLeaveRequestCount: 0,
        overtimeRequestCount: 0,
        pendingOvertimeRequestCount: 0,
        approvedOvertimeRequestCount: 0,
        timeAdjustRequestCount: 0,
        documentRequestCount: 0,
        complaintCount: 0,
        evaluationResultCount: 0,
        warningLetterCount: 0,
        disciplinaryHistoryCount: 0,
        onboardingTaskCount: 0,
        onboardingDocumentCount: 0,
        probationRecordCount: 0,
        compensationCount: 0,
        payrollItemCount: 0,
      };
    }

    return {
      hasEmployeeProfile: Boolean(employee.profile),

      documentCount: employee.documents.length,
      activeDocumentCount: employee.documents.filter(
        (item) => item.status === 'ACTIVE',
      ).length,
      expiredDocumentCount: employee.documents.filter(
        (item) => item.status === 'EXPIRED',
      ).length,

      workHistoryCount: employee.workHistories.length,
      resignationCount: employee.resignations.length,
      attendanceLogCount: employee.attendanceLogs.length,
      leaveBalanceCount: employee.leaveBalances.length,

      leaveRequestCount: employee.leaveRequests.length,
      pendingLeaveRequestCount: employee.leaveRequests.filter(
        (item) => item.status === 'SUBMITTED',
      ).length,
      approvedLeaveRequestCount: employee.leaveRequests.filter(
        (item) => item.status === 'APPROVED',
      ).length,

      overtimeRequestCount: employee.overtimeRequests.length,
      pendingOvertimeRequestCount: employee.overtimeRequests.filter(
        (item) => item.status === 'SUBMITTED',
      ).length,
      approvedOvertimeRequestCount: employee.overtimeRequests.filter(
        (item) => item.status === 'APPROVED',
      ).length,

      timeAdjustRequestCount: employee.timeAdjustRequests.length,
      documentRequestCount: employee.documentRequests.length,
      complaintCount: employee.complaints.length,
      evaluationResultCount: employee.evaluationResults.length,
      warningLetterCount: employee.warningLetters.length,
      disciplinaryHistoryCount: employee.disciplinaryHistories.length,
      onboardingTaskCount: employee.onboardingTasks.length,
      onboardingDocumentCount: employee.onboardingDocuments.length,
      probationRecordCount: employee.probationRecords.length,
      compensationCount: employee.compensations.length,
      payrollItemCount: employee.payrollItems.length,
    };
  }
}
