-- คิวคำสั่งที่รอส่งลงเครื่องสแกน (โปรโตคอล ADMS)
--
-- ส่งตรงไปที่เครื่องไม่ได้ เครื่องเป็นฝ่ายมา poll เอาคำสั่งไปเอง (/iclock/getrequest)
-- แล้วรายงานผลกลับมาทีหลัง (/iclock/devicecmd) จึงต้องพักคำสั่งไว้ในตารางนี้
-- และเก็บผลไว้ให้คนสั่งรู้ว่าลงเครื่องสำเร็จจริงหรือไม่

CREATE TABLE "attendance_device_commands" (
    "id" TEXT NOT NULL,
    -- เลขลำดับสำหรับใส่ในคำสั่งที่ส่งให้เครื่อง (C:<seq>:...)
    -- เฟิร์มแวร์ ZKTeco อ่านช่อง ID เป็นตัวเลข ส่ง cuid ไปแล้วมันตอบผลกลับมาไม่ตรง
    "seq" SERIAL NOT NULL,
    "deviceId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'USERINFO',
    "employeeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "returnCode" INTEGER,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_device_commands_pkey" PRIMARY KEY ("id")
);

-- คิวถูกอ่านด้วยคู่ (เครื่อง, สถานะ) ทุกครั้งที่เครื่องมา poll ซึ่งถี่ระดับวินาที
CREATE UNIQUE INDEX "attendance_device_commands_seq_key"
    ON "attendance_device_commands"("seq");

CREATE INDEX "attendance_device_commands_deviceId_status_idx"
    ON "attendance_device_commands"("deviceId", "status");

CREATE INDEX "attendance_device_commands_employeeId_idx"
    ON "attendance_device_commands"("employeeId");

CREATE INDEX "attendance_device_commands_createdAt_idx"
    ON "attendance_device_commands"("createdAt");

ALTER TABLE "attendance_device_commands"
    ADD CONSTRAINT "attendance_device_commands_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "attendance_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ลบพนักงานแล้วคำสั่งเก่ายังอยู่เป็นประวัติ แค่ไม่รู้ว่าเป็นของใคร
ALTER TABLE "attendance_device_commands"
    ADD CONSTRAINT "attendance_device_commands_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
