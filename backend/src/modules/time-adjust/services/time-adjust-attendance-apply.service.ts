import { BadRequestException, Injectable } from "@nestjs/common";
import {
  AttendanceChannel,
  AttendanceEditAction,
  AttendanceLogStatus,
  AttendanceLogType,
  Prisma,
} from "../../../generated/prisma/client";
import { TimeAdjustRequestActionDto } from "../dto/time-adjust-request-action.dto";
import type { TimeAdjustRequestWithOriginalLog } from "../types/time-adjust.types";
import { toTimeAdjustDateOnlyFromDate } from "../utils/time-adjust-date.util";
import { assertWorkDateNotLocked } from "../../attendance/utils/attendance-lock.util";

/*
 * TimeAdjustAttendanceApplyService
 * ---------------------------------------------------------
 * ใช้เฉพาะตอนคำขอแก้เวลาอนุมัติครบทุกขั้นตอนแล้ว
 *
 * หน้าที่:
 * - ถ้ามี originalAttendanceLog: update log เดิม
 * - ถ้าไม่มี originalAttendanceLog: create manual attendance log ใหม่
 * - เขียน AttendanceEditLog เพื่อเก็บ audit trail ของการแก้เวลา
 *
 * สำคัญ:
 * - WRONG_TIME / เวลาผิด ต้องแก้ log เดิมเท่านั้น ห้ามสร้าง log ใหม่
 *   เพราะจะทำให้ Daily Summary เห็นทั้งเวลาเดิมและเวลาใหม่พร้อมกัน
 * - MISSING_* เท่านั้นที่สร้าง attendance log ใหม่ได้
 */
@Injectable()
export class TimeAdjustAttendanceApplyService {
  async applyApprovedTimeAdjust(
    tx: Prisma.TransactionClient,
    params: {
      current: TimeAdjustRequestWithOriginalLog;
      actorId: string;
      dto: TimeAdjustRequestActionDto;
    },
  ) {
    const { current, actorId, dto } = params;
    let appliedAttendanceLogId = current.appliedAttendanceLogId;

    const targetWorkDate = toTimeAdjustDateOnlyFromDate(current.requestedLogTime);

    /*
     * การอนุมัติคำขอแก้เวลาเป็นทางที่เขียนเวลาได้โดยไม่ผ่านตัวกันของ attendance
     * ถ้าไม่ตรวจตรงนี้ คำขอที่ค้างอยู่จะถูกอนุมัติเข้างวดที่จ่ายเงินไปแล้วได้
     *
     * ต้องตรวจ "วันใหม่" ด้วย ไม่ใช่แค่วันเดิม — ไม่งั้นย้ายเวลาจากวันที่เปิดอยู่
     * เข้าไปในวันที่ล็อกแล้วได้ ซึ่งเลี่ยงตัวกันไปทั้งดุ้น
     */
    await assertWorkDateNotLocked(tx, current.employeeId, targetWorkDate);

    if (current.originalAttendanceLog) {
      const oldLog = current.originalAttendanceLog;

      if (oldLog.workDate.getTime() !== targetWorkDate.getTime()) {
        await assertWorkDateNotLocked(tx, current.employeeId, oldLog.workDate);
      }
      const nextSession = this.resolveAttendanceSession(
        current.targetLogType,
        current.requestedLogTime,
      );

      const updatedLog = await tx.attendanceLog.update({
        where: {
          id: oldLog.id,
        },
        data: {
          workDate: targetWorkDate,
          logType: current.targetLogType,
          logTime: current.requestedLogTime,
          channel: AttendanceChannel.MANUAL,
          source: oldLog.source || "TIME_ADJUST",
          session: nextSession,
          status: AttendanceLogStatus.EDITED,
          note:
            current.note ||
            `ปรับเวลาจากคำขอแก้เวลา ${current.requestNo ?? current.id}`,
        },
      });

      appliedAttendanceLogId = updatedLog.id;

      await tx.attendanceEditLog.create({
        data: {
          attendanceLogId: updatedLog.id,
          action: AttendanceEditAction.UPDATE_TIME,
          oldLogTime: oldLog.logTime,
          newLogTime: updatedLog.logTime,
          oldStatus: oldLog.status,
          newStatus: updatedLog.status,
          oldChannel: oldLog.channel,
          newChannel: updatedLog.channel,
          reason: current.reason,
          note:
            dto.note?.trim() ||
            current.note ||
            `อนุมัติคำขอแก้เวลา ${current.requestNo ?? current.id}`,
          editedById: actorId,
          timeAdjustRequestId: current.id,
        },
      });

      return appliedAttendanceLogId;
    }

    if (current.adjustType === "WRONG_TIME") {
      throw new BadRequestException(
        "คำขอประเภทเวลาผิดต้องมีรายการลงเวลาเดิมให้แก้ไข กรุณาตรวจสอบประวัติลงเวลาหรือเลือกประเภทคำขอให้ถูกต้อง",
      );
    }

    const createdLog = await tx.attendanceLog.create({
      data: {
        employeeId: current.employeeId,
        workDate: targetWorkDate,
        logType: current.targetLogType,
        logTime: current.requestedLogTime,
        channel: AttendanceChannel.MANUAL,
        source: "TIME_ADJUST",
        session: this.resolveAttendanceSession(
          current.targetLogType,
          current.requestedLogTime,
        ),
        status: AttendanceLogStatus.MANUAL_ADDED,
        note:
          current.note ||
          `เพิ่มเวลาจากคำขอแก้เวลา ${current.requestNo ?? current.id}`,
        createdById: actorId,
      },
    });

    appliedAttendanceLogId = createdLog.id;

    await tx.attendanceEditLog.create({
      data: {
        attendanceLogId: createdLog.id,
        action: AttendanceEditAction.CREATE_MANUAL,
        oldLogTime: null,
        newLogTime: createdLog.logTime,
        oldStatus: null,
        newStatus: createdLog.status,
        oldChannel: null,
        newChannel: createdLog.channel,
        reason: current.reason,
        note:
          dto.note?.trim() ||
          current.note ||
          `อนุมัติคำขอเพิ่มเวลา ${current.requestNo ?? current.id}`,
        editedById: actorId,
        timeAdjustRequestId: current.id,
      },
    });

    return appliedAttendanceLogId;
  }

  private resolveAttendanceSession(logType: AttendanceLogType, logTime: Date) {
    if (logType === AttendanceLogType.CHECK_OUT) return "EVENING";
    if (logType !== AttendanceLogType.CHECK_IN) return null;

    const minutes = this.getBangkokMinutes(logTime);
    return minutes < 12 * 60 ? "MORNING" : "AFTERNOON";
  }

  private getBangkokMinutes(value: Date) {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const [hour = "0", minute = "0"] = formatter.format(value).split(":");
    return Number(hour) * 60 + Number(minute);
  }
}
