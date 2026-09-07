import {
  Controller,
  Get,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { DevicePushGuard } from "../../common/guards/device-push.guard";
import { AttendanceService } from "./attendance.service";
import { AttendanceDevicePunchItemDto } from "./dto/attendance-device-punch.dto";

/**
 * ตัวรับข้อมูลจากเครื่องสแกนโดยตรง (โปรโตคอล ADMS / iclock ของ ZKTeco)
 * -----------------------------------------------------------------
 * เครื่องถูกตั้งค่า server address ให้ชี้มาที่นี่ แล้วยิง HTTP เข้ามาเอง
 *
 * ข้อกำหนดของโปรโตคอลที่ต่างจาก endpoint ปกติ:
 *  - ต้องเป็น public (เครื่องล็อกอินไม่ได้) ระบุตัวด้วย Serial Number
 *  - ต้องตอบเป็น text ดิบ ("OK") ไม่ใช่ JSON — จึงใช้ @Res() เขียนตอบเอง
 *    เพื่อข้าม ResponseInterceptor ที่ห่อ JSON
 *  - อยู่ที่ root /iclock/* (ถูก exclude จาก global prefix /api ใน main.ts)
 *
 * การยืนยันตัวตน: `DevicePushGuard` ตรวจ shared secret (query `?token=` หรือ
 * header `x-device-token`) + IP allowlist — ตั้งค่าผ่าน
 * `ATTENDANCE_DEVICE_PUSH_TOKEN` และ `ATTENDANCE_DEVICE_PUSH_ALLOWED_IPS`
 *
 * SN อย่างเดียวใช้ยืนยันตัวไม่ได้ เพราะเลขนี้พิมพ์ติดอยู่บนตัวเครื่อง
 * ใครเห็นก็ยิงข้อมูลลงเวลาปลอมเข้าระบบได้
 */
@Controller("iclock")
@UseGuards(DevicePushGuard)
export class DevicePushController {
  private readonly logger = new Logger(DevicePushController.name);

  constructor(private readonly attendanceService: AttendanceService) {}

  /**
   * Handshake — เครื่องถามค่า config ตอนเริ่มเชื่อมต่อ
   * ตอบให้เครื่องเปิดส่งข้อมูลลงเวลาแบบเรียลไทม์
   */
  @Get("cdata")
  async getConfig(
    @Query("SN") serialNo: string,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`iclock handshake จากเครื่อง SN=${serialNo ?? "-"}`);
    this.sendText(res, this.buildConfig(serialNo));
  }

  /**
   * เครื่องอัปโหลดข้อมูล — table=ATTLOG คือรายการสแกน
   * table อื่น (OPERLOG/USERINFO/ฯลฯ) รับทราบเฉยๆ ไม่ประมวลผล
   */
  @Post("cdata")
  async receiveData(
    @Query("SN") serialNo: string,
    @Query("table") table: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const body = typeof req.body === "string" ? req.body : "";

    if (!serialNo) {
      this.logger.warn("iclock: ไม่มี SN ในคำขอ");
      this.sendText(res, "OK");
      return;
    }

    if ((table ?? "").toUpperCase() !== "ATTLOG") {
      // ตารางอื่นยังไม่ประมวลผล แต่ต้องรับทราบไม่ให้เครื่องยิงซ้ำ
      this.sendText(res, "OK");
      return;
    }

    const records = this.parseAttlog(serialNo, body);

    if (records.length === 0) {
      this.sendText(res, "OK");
      return;
    }

    try {
      const result = await this.attendanceService.ingestDevicePushBySerial(
        serialNo,
        records,
      );
      this.logger.log(
        `iclock ATTLOG SN=${serialNo}: รับ ${result.receivedCount} สร้าง ${result.createdCount} ซ้ำ ${result.duplicateCount} ไม่แมป ${result.unmatchedCount}`,
      );

      // สำเร็จ (แม้บางรหัสยังไม่ผูกพนักงาน ก็ถือว่ารับแล้ว ไม่ให้ยิงซ้ำ)
      // ตอบจำนวนที่รับ รูปแบบ "OK: <n>"
      this.sendText(res, `OK: ${records.length}`);
    } catch (error) {
      // เครื่องยังไม่ลงทะเบียน / เกิดข้อผิดพลาด → ตอบไม่สำเร็จ
      // เครื่องจะเก็บ log ไว้ยิงซ้ำ ไม่ให้ข้อมูลสแกนหาย พอลงทะเบียนเสร็จก็ไหลเข้าเอง
      this.logger.error(
        `iclock ATTLOG SN=${serialNo} ล้มเหลว: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      res.status(500).type("text/plain").send("ERROR");
    }
  }

  /**
   * เครื่องอัปโหลดไฟล์ — รูปถ่ายตอนสแกน (ATTPHOTO), ลายนิ้วมือ ฯลฯ
   * ต้องรับทราบ (OK) ไม่งั้นเครื่องจะค้างส่งซ้ำและไม่ยอมส่ง ATTLOG ต่อ
   * รอบนี้ยังไม่เก็บรูป แค่ ack ให้เครื่องเดินต่อ
   */
  @Post("fdata")
  async receiveFile(
    @Query("SN") serialNo: string,
    @Query("table") table: string,
    @Res() res: Response,
  ): Promise<void> {
    this.sendText(res, "OK");
  }

  /**
   * เครื่อง poll หาคำสั่งจาก server (ถี่ระดับไม่กี่วินาที)
   *
   * ตอบเป็นบรรทัด `C:<seq>:<คำสั่ง>` ได้หลายบรรทัดในครั้งเดียว
   * ไม่มีคำสั่งค้าง = ตอบ OK เฉย ๆ ห้ามตอบว่างเปล่าเพราะบางเฟิร์มแวร์ถือว่าหลุด
   */
  @Get("getrequest")
  async getRequest(
    @Query("SN") serialNo: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!serialNo) {
      this.sendText(res, "OK");
      return;
    }

    try {
      const commands =
        await this.attendanceService.takePendingCommandsBySerial(serialNo);

      if (commands.length === 0) {
        this.sendText(res, "OK");
        return;
      }

      this.logger.log(
        `iclock ส่ง ${commands.length} คำสั่งให้เครื่อง SN=${serialNo}`,
      );

      this.sendText(
        res,
        commands.map((item) => `C:${item.seq}:${item.command}`).join("\n"),
      );
    } catch (error) {
      /*
       * ดึงคิวไม่สำเร็จ ต้องตอบ OK ไม่ใช่ 500
       * เครื่องรุ่นที่เจอ error ตรงนี้จะหยุดส่ง ATTLOG ตามไปด้วย
       * ยอมให้คำสั่งค้างคิวรอบถัดไป ดีกว่าทำให้ข้อมูลลงเวลาหยุดไหล
       */
      this.logger.error(
        `iclock getrequest SN=${serialNo} ล้มเหลว: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.sendText(res, "OK");
    }
  }

  /**
   * เครื่องส่งผลการทำคำสั่งกลับ
   * รูปแบบ: ID=12&Return=0&CMD=DATA (ได้หลายบรรทัด)
   */
  @Post("devicecmd")
  async deviceCmd(
    @Query("SN") serialNo: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const body = typeof req.body === "string" ? req.body : "";

    if (serialNo && body) {
      for (const rawLine of body.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;

        const params = new URLSearchParams(line);
        const seq = Number(params.get("ID"));
        const returnCode = Number(params.get("Return"));

        if (!Number.isInteger(seq) || Number.isNaN(returnCode)) continue;

        try {
          await this.attendanceService.ackDeviceCommand(
            serialNo,
            seq,
            returnCode,
          );

          if (returnCode !== 0) {
            this.logger.warn(
              `iclock คำสั่ง ${seq} ของเครื่อง SN=${serialNo} ล้มเหลว (Return=${returnCode})`,
            );
          }
        } catch (error) {
          this.logger.error(
            `iclock บันทึกผลคำสั่ง ${seq} ไม่สำเร็จ: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }

    this.sendText(res, "OK");
  }

  /* ---------------------------------------------------------------- */

  /**
   * แปลง ATTLOG (text คั่น tab) เป็นรายการสแกน
   * รูปแบบ: PIN \t YYYY-MM-DD HH:mm:ss \t Status \t Verify \t WorkCode ...
   */
  private parseAttlog(
    serialNo: string,
    body: string,
  ): AttendanceDevicePunchItemDto[] {
    const records: AttendanceDevicePunchItemDto[] = [];

    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;

      const cols = line.split("\t");
      const pin = cols[0]?.trim();
      const timeText = cols[1]?.trim();

      if (!pin || !timeText) continue;

      const iso = this.toIsoBangkok(timeText);
      if (!iso) continue;

      records.push({
        deviceUserId: pin,
        punchedAt: iso,
        // เครื่องไม่ส่ง record id — สร้างจาก SN+PIN+เวลา ให้กันซ้ำได้
        rawRecordId: `${serialNo}:${pin}:${timeText}`,
      });
    }

    return records;
  }

  /** "2026-07-24 08:01:25" (เวลาเครื่อง = ไทย) → ISO ที่ระบุ +07:00 ชัดเจน */
  private toIsoBangkok(value: string): string | null {
    const match = value.match(
      /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/,
    );
    if (!match) return null;

    const [, y, mo, d, h, mi, s] = match;
    return `${y}-${mo}-${d}T${h}:${mi}:${s}+07:00`;
  }

  private buildConfig(serialNo: string): string {
    // ค่า config มาตรฐานของ ADMS ให้เครื่องส่ง ATTLOG แบบเรียลไทม์
    return [
      `GET OPTION FROM: ${serialNo ?? ""}`,
      "Stamp=9999",
      "OpStamp=9999",
      "ErrorDelay=30",
      "Delay=10",
      "TransTimes=00:00;14:05",
      "TransInterval=1",
      "TransFlag=1111000000",
      "Realtime=1",
      "TimeZone=7",
      "Encrypt=0",
      "",
    ].join("\n");
  }

  private sendText(res: Response, text: string): void {
    res.type("text/plain").send(text);
  }
}
