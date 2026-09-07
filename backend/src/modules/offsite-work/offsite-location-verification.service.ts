import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OffsiteRequestStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { GpsVerificationStatus } from './types/offsite-work.types';

type VerifyForPunchParams = {
  employeeId: string;
  workDate: Date;
  punchedAt: Date;
  offsiteRequestId: string;
};

/**
 * คงชื่อ service เดิมเพื่อรักษา compatibility ของ module ที่ใช้อยู่
 * แต่ Offsite รุ่นปัจจุบันตรวจเฉพาะคำขอที่อนุมัติ วันที่ และช่วงเวลา
 * โดยไม่อ่าน/ตรวจ GPS ความแม่นยำ หรือรัศมีอีกต่อไป
 */
@Injectable()
export class OffsiteLocationVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  async listApprovedForPunch(params: { employeeId: string; workDate: Date }) {
    const prisma = this.prisma as any;
    return prisma.offsiteWorkRequest.findMany({
      where: {
        employeeId: params.employeeId,
        workDate: this.toDateOnly(params.workDate),
        status: {
          in: [OffsiteRequestStatus.HR_APPROVED, OffsiteRequestStatus.APPROVED],
        },
        deletedAt: null,
      },
      orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async verifyForPunch(params: VerifyForPunchParams) {
    const prisma = this.prisma as any;
    const request = await prisma.offsiteWorkRequest.findFirst({
      where: {
        id: params.offsiteRequestId,
        employeeId: params.employeeId,
        status: {
          in: [OffsiteRequestStatus.HR_APPROVED, OffsiteRequestStatus.APPROVED],
        },
        deletedAt: null,
      },
    });

    if (!request) {
      throw new NotFoundException(
        'ไม่พบคำขอทำงานนอกสถานที่ที่อนุมัติแล้วสำหรับพนักงานคนนี้',
      );
    }

    const requestDateKey = this.toDateKey(request.workDate);
    const punchDateKey = this.toDateKey(params.workDate);
    if (requestDateKey !== punchDateKey) {
      throw new BadRequestException('คำขอทำงานนอกสถานที่ไม่ตรงกับวันที่ลงเวลา');
    }

    const reasons: string[] = [];
    let status: GpsVerificationStatus = 'PASSED';
    let locationVerified = true;

    if (
      !this.isPunchTimeInsideApprovedWindow(
        params.punchedAt,
        request.startTime,
        request.endTime,
      )
    ) {
      status = 'NEED_REVIEW';
      locationVerified = false;
      reasons.push(
        `เวลาลงเวลาอยู่นอกช่วงที่อนุมัติ ${request.startTime}-${request.endTime}`,
      );
    }

    return {
      request,
      status,
      locationVerified,
      distanceMeters: null,
      reasons,
      verificationMode: 'APPROVED_DATE_TIME',
    };
  }

  private isPunchTimeInsideApprovedWindow(
    punchedAt: Date,
    startTime: string,
    endTime: string,
  ) {
    const punchedMinutes = this.getBangkokMinutes(punchedAt);
    const startMinutes = this.parseTimeToMinutes(startTime);
    const endMinutes = this.parseTimeToMinutes(endTime);

    if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return true;
    return punchedMinutes >= startMinutes && punchedMinutes <= endMinutes;
  }

  private toDateOnly(value: Date) {
    return new Date(`${this.toDateKey(value)}T00:00:00.000Z`);
  }

  private toDateKey(value: Date | string) {
    const date = value instanceof Date ? value : new Date(value);
    return date.toISOString().slice(0, 10);
  }

  private getBangkokMinutes(date: Date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
    return hour * 60 + minute;
  }

  private parseTimeToMinutes(time?: string | null) {
    const match = String(time ?? '').match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return Number.NaN;

    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return Number.NaN;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return Number.NaN;

    return hour * 60 + minute;
  }
}
