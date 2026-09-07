<#
.SYNOPSIS
ตั้งงานตามเวลาให้ระบบ (สำรองข้อมูล + ล้างไฟล์เก่า) บน Windows Server

.DESCRIPTION
แทน crontab ของฝั่ง Linux ใช้ Task Scheduler ของ Windows

งานที่ตั้งให้:
  HR-Backup           ทุกวัน 02:00   สำรองฐานข้อมูล + ไฟล์อัปโหลด
  HR-CleanupTemp      ทุกวัน 03:30   ล้างไฟล์ชั่วคราว
  HR-CleanupExports   ทุกวัน 03:40   ล้างไฟล์ส่งออกที่หมดอายุ
  HR-CleanupAudit     อาทิตย์ 04:00  ล้างบันทึกตรวจสอบที่เกินอายุ

ทุกงานรันด้วยสิทธิ์ SYSTEM และรันแม้ไม่มีใครล็อกอินอยู่

.EXAMPLE
  # เปิด PowerShell แบบ Run as Administrator
  .\scripts\windows\register-scheduled-tasks.ps1 -AppRoot D:\hr

.NOTES
ดูผลการรัน:
  Get-ScheduledTask -TaskPath "\HR Workforce\" | Get-ScheduledTaskInfo
ลบทั้งหมด:
  Get-ScheduledTask -TaskPath "\HR Workforce\" | Unregister-ScheduledTask -Confirm:$false
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$AppRoot,

    [string]$PgBin = "C:\Program Files\PostgreSQL\16\bin"
)

$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal] `
        [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    throw "ต้องรัน PowerShell แบบ Run as Administrator"
}

$AppRoot = (Resolve-Path $AppRoot).Path
$backendDir = Join-Path $AppRoot "backend"
$logDir = Join-Path $AppRoot "logs"
$taskPath = "\HR Workforce\"

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

$backupScript = Join-Path $AppRoot "scripts\windows\backup.ps1"
if (-not (Test-Path $backupScript)) { throw "ไม่พบ $backupScript" }

# ใช้ npm.cmd ไม่ใช่ npm — Task Scheduler เรียก .cmd ตรง ๆ ไม่ผ่าน shell
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($null -eq $npmCommand) { throw "หา npm.cmd ไม่เจอใน PATH" }
$npm = $npmCommand.Source

function Register-HrTask {
    param(
        [string]$Name,
        [string]$Description,
        [Microsoft.Management.Infrastructure.CimInstance]$Trigger,
        [Microsoft.Management.Infrastructure.CimInstance]$Action
    )

    # ลบของเดิมก่อน เพื่อให้รันสคริปต์ซ้ำได้ผลเหมือนเดิม
    $existing = Get-ScheduledTask -TaskName $Name -TaskPath $taskPath -ErrorAction SilentlyContinue
    if ($null -ne $existing) {
        Unregister-ScheduledTask -TaskName $Name -TaskPath $taskPath -Confirm:$false
    }

    # SYSTEM เพราะต้องรันได้แม้ไม่มีใครล็อกอิน และต้องอ่าน/เขียนโฟลเดอร์ของระบบได้
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

    # StartWhenAvailable = ถ้าเครื่องปิดอยู่ตอนถึงเวลา ให้รันทันทีที่เปิดมา
    # ไม่งั้นคืนที่เครื่องดับ = ไม่มีไฟล์สำรองของคืนนั้นเลย โดยไม่มีอะไรเตือน
    $settings = New-ScheduledTaskSettingsSet `
        -StartWhenAvailable `
        -DontStopOnIdleEnd `
        -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
        -MultipleInstances IgnoreNew

    Register-ScheduledTask `
        -TaskName $Name `
        -TaskPath $taskPath `
        -Description $Description `
        -Trigger $Trigger `
        -Action $Action `
        -Principal $principal `
        -Settings $settings | Out-Null

    Write-Host "  ตั้ง $Name แล้ว"
}

Write-Host "ตั้งงานตามเวลาที่ $taskPath"

# --- สำรองข้อมูล ---------------------------------------------------------------

# -NoProfile ให้เริ่มเร็วและไม่โดน profile ของผู้ดูแลมาแทรก
# -ExecutionPolicy Bypass เพราะนโยบายเครื่องมักบล็อกสคริปต์ที่ไม่ได้เซ็น
Register-HrTask `
    -Name "HR-Backup" `
    -Description "สำรองฐานข้อมูลและไฟล์ที่ผู้ใช้อัปโหลด" `
    -Trigger (New-ScheduledTaskTrigger -Daily -At "02:00") `
    -Action (New-ScheduledTaskAction `
        -Execute "powershell.exe" `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$backupScript`" -AppRoot `"$AppRoot`" -PgBin `"$PgBin`"" `
        -WorkingDirectory $AppRoot)

# --- ล้างไฟล์ -----------------------------------------------------------------

Register-HrTask `
    -Name "HR-CleanupTemp" `
    -Description "ล้างไฟล์ชั่วคราวที่หมดอายุ" `
    -Trigger (New-ScheduledTaskTrigger -Daily -At "03:30") `
    -Action (New-ScheduledTaskAction -Execute $npm -Argument "run cleanup:temp" -WorkingDirectory $backendDir)

Register-HrTask `
    -Name "HR-CleanupExports" `
    -Description "ล้างไฟล์ส่งออก (รายงาน/สลิป) ที่หมดอายุ" `
    -Trigger (New-ScheduledTaskTrigger -Daily -At "03:40") `
    -Action (New-ScheduledTaskAction -Execute $npm -Argument "run cleanup:exports" -WorkingDirectory $backendDir)

Register-HrTask `
    -Name "HR-CleanupAudit" `
    -Description "ล้างบันทึกตรวจสอบที่เกินอายุเก็บ" `
    -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At "04:00") `
    -Action (New-ScheduledTaskAction -Execute $npm -Argument "run cleanup:audit" -WorkingDirectory $backendDir)

Write-Host ""
Get-ScheduledTask -TaskPath $taskPath |
    Format-Table -Property TaskName, State -AutoSize

Write-Host ""
Write-Host "ทดสอบงานสำรองข้อมูลเดี๋ยวนี้เลย อย่ารอถึงตีสอง:"
Write-Host "  Start-ScheduledTask -TaskName 'HR-Backup' -TaskPath '$taskPath'"
Write-Host ""
Write-Host "แล้วตรวจว่าได้ไฟล์จริง:"
Write-Host "  Get-ChildItem '$AppRoot\backups' | Sort-Object LastWriteTime -Descending | Select-Object -First 1"
