import { Prisma } from '../../../generated/prisma/client';

/**
 * Leave Request include builder
 * -----------------------------------------------------------------------------
 * รวม include ที่ใช้โหลดรายละเอียดใบลาไว้จุดเดียว
 * ข้อดีคือ response ของ findOne/findAll หลังบ้านจะมี shape เดียวกัน
 * และลดการ copy include ยาว ๆ ในหลาย function
 */
export function buildLeaveRequestInclude() {
  return {
    employee: {
      select: {
        id: true,
        employeeCode: true,
        title: true,
        firstName: true,
        lastName: true,
        displayName: true,
        position: true,
        positionId: true,
        supervisorId: true,
        userId: true,
        companyId: true,
        branchId: true,
        departmentId: true,
        divisionId: true,
        employeeTypeId: true,
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
        company: {
          select: {
            id: true,
            code: true,
            nameTh: true,
          },
        },
        branch: {
          select: {
            id: true,
            code: true,
            nameTh: true,
          },
        },
        department: {
          select: {
            id: true,
            code: true,
            nameTh: true,
          },
        },
        division: {
          select: {
            id: true,
            code: true,
            nameTh: true,
          },
        },
        employeeType: {
          select: {
            id: true,
            code: true,
            nameTh: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        supervisor: {
          select: {
            id: true,
            employeeCode: true,
            title: true,
            firstName: true,
            lastName: true,
            displayName: true,
            position: true,
            userId: true,
            positionMaster: {
              select: {
                id: true,
                code: true,
                nameTh: true,
              },
            },
          },
        },
      },
    },
    leaveType: {
      select: {
        id: true,
        code: true,
        nameTh: true,
        nameEn: true,
        isPaid: true,
        requiresAttachment: true,
        deductQuota: true,
        affectAttendance: true,
        affectPayroll: true,
        allowBackdated: true,
        backdatedRequiresAttachment: true,
      },
    },
    submittedBy: {
      select: {
        id: true,
        email: true,
        displayName: true,
      },
    },
    cancelledBy: {
      select: {
        id: true,
        email: true,
        displayName: true,
      },
    },
    approvalSteps: {
      include: {
        expectedApprover: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
        expectedEmployee: {
          select: {
            id: true,
            employeeCode: true,
            title: true,
            firstName: true,
            lastName: true,
            displayName: true,
            position: true,
            userId: true,
            user: {
              select: {
                id: true,
                email: true,
                displayName: true,
                avatarUrl: true,
              },
            },
            positionMaster: {
              select: {
                id: true,
                code: true,
                nameTh: true,
              },
            },
          },
        },
        position: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
            level: true,
          },
        },
        actedBy: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
      orderBy: {
        stepNo: 'asc',
      },
    },
    attachments: {
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        storageProvider: true,
        storageKey: true,
        bucketName: true,
        description: true,
        uploadedById: true,
        createdAt: true,
        uploadedBy: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    },
    approvalLogs: {
      include: {
        approvedBy: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    },
  } satisfies Prisma.LeaveRequestInclude;
}
