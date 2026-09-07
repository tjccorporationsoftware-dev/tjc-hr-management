import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

type ResolveAttendancePolicyInput = {
  companyId: string;
  branchId?: string | null;
  employeeTypeId?: string | null;
  workDate: Date;
};

@Injectable()
export class AttendancePolicyResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveEffectivePolicy(input: ResolveAttendancePolicyInput) {
    const prisma = this.prisma as any;

    return prisma.attendancePolicy.findFirst({
      where: {
        companyId: input.companyId,
        status: 'ACTIVE',
        deletedAt: null,
        effectiveFrom: { lte: input.workDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.workDate } }],
        AND: [
          {
            OR: [{ branchId: input.branchId ?? null }, { branchId: null }],
          },
          {
            OR: [
              { employeeTypeId: input.employeeTypeId ?? null },
              { employeeTypeId: null },
            ],
          },
        ],
      },
      orderBy: [
        { priority: 'desc' },
        { branchId: 'desc' },
        { employeeTypeId: 'desc' },
        { effectiveFrom: 'desc' },
      ],
      include: {
        sessionRules: {
          where: { deletedAt: null, status: 'ACTIVE' },
          orderBy: [{ sortOrder: 'asc' }, { openTime: 'asc' }],
        },
      },
    });
  }
}
