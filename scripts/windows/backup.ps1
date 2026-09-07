<#
.SYNOPSIS
สำรองฐานข้อมูลและไฟล์ที่ผู้ใช้อัปโหลด สำหรับการติดตั้งตรงบน Windows Server

.DESCRIPTION
ใช้แทน backend/scripts/backup.ts ซึ่งเขียนไว้สำหรับตอนรันด้วย Docker
(ตัวนั้นเรียก `docker exec ... pg_dump` จึงใช้บนเครื่องที่ไม่มี Docker ไม่ได้)

เรียก pg_dump.exe ที่มากับ PostgreSQL for Windows ตรง ๆ

.PARAMETER AppRoot
โฟลเดอร์บนสุดของโปรเจกต์ (ที่มีโฟลเดอร์ backend อยู่ข้างใน)

.EXAMPLE
  .\scripts\windows\backup.ps1 -AppRoot D:\hr

.NOTES
กู้คืน:
  & "C:\Program Files\PostgreSQL\16\bin\pg_restore.exe" -U hr_admin -d hr_workforce `
      --clean --if-exists "D:\hr\backups\backup-20260818-020000\database.dump"
แล้วคัดลอกโฟลเดอร์ uploads / storage กลับที่เดิม
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$AppRoot,

    [string]$PgBin = "C:\Program Files\PostgreSQL\16\bin",

    [int]$KeepDays = 14
)

$ErrorActionPreference = "Stop"

function Read-DotEnv {
    <#
      อ่าน backend\.env เอาค่าที่ต้องใช้ ไม่ใช้ Import-Module อะไรเพิ่ม
      ข้ามบรรทัดคอมเมนต์และบรรทัดว่าง ค่าที่ครอบด้วยเครื่องหมายคำพูดจะถูกถอดออก
    #>
    param([string]$Path)

    $map = @{}
    if (-not (Test-Path $Path)) {
        throw "ไม่พบไฟล์ค่าตั้งระบบ: $Path"
    }

    foreach ($line in Get-Content -Path $Path -Encoding UTF8) {
        $trimmed = $line.Trim()
        if ($trimmed -eq "" -or $trimmed.StartsWith("#")) { continue }

        $index = $trimmed.IndexOf("=")
        if ($index -lt 1) { continue }

        $key = $trimmed.Substring(0, $index).Trim()
        $value = $trimmed.Substring($index + 1).Trim()

        if ($value.Length -ge 2) {
            if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
                ($value.StartsWith("'") -and $value.EndsWith("'"))) {
                $value = $value.Substring(1, $value.Length - 2)
            }
        }

        $map[$key] = $value
    }

    return $map
}

function Get-DatabaseParts {
    <#
      แยก DATABASE_URL ออกเป็นส่วน ๆ
      รูปแบบ postgresql://user:password@host:port/database?schema=public
      รหัสผ่านที่มีอักขระพิเศษถูก encode มาใน URL ต้อง decode ก่อนส่งให้ pg_dump
    #>
    param([string]$Url)

    $uri = [System.Uri]::new($Url)
    $userInfo = $uri.UserInfo.Split(":", 2)

    return @{
        Host     = $uri.Host
        Port     = $uri.Port
        User     = [System.Uri]::UnescapeDataString($userInfo[0])
        Password = if ($userInfo.Length -gt 1) { [System.Uri]::UnescapeDataString($userInfo[1]) } else { "" }
        Database = $uri.AbsolutePath.TrimStart("/")
    }
}

# --- เตรียมค่า -----------------------------------------------------------------

$AppRoot = (Resolve-Path $AppRoot).Path
$envPath = Join-Path $AppRoot "backend\.env"
$config = Read-DotEnv -Path $envPath

if (-not $config.ContainsKey("DATABASE_URL")) {
    throw "ไม่พบ DATABASE_URL ใน $envPath"
}

$db = Get-DatabaseParts -Url $config["DATABASE_URL"]

$pgDump = Join-Path $PgBin "pg_dump.exe"
if (-not (Test-Path $pgDump)) {
    throw "ไม่พบ pg_dump.exe ที่ $pgDump — ระบุเส้นทางด้วย -PgBin"
}

if ($config.ContainsKey("BACKUP_KEEP_DAYS") -and $config["BACKUP_KEEP_DAYS"] -ne "") {
    $KeepDays = [int]$config["BACKUP_KEEP_DAYS"]
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $AppRoot "backups"
$target = Join-Path $backupRoot "backup-$stamp"

New-Item -ItemType Directory -Path $target -Force | Out-Null
Write-Host "สำรองข้อมูลไปที่ $target"

# --- ฐานข้อมูล -----------------------------------------------------------------

Write-Host "  ฐานข้อมูล..."
$dumpFile = Join-Path $target "database.dump"

# ส่งรหัสผ่านผ่านตัวแปรแวดล้อมของ process นี้ ไม่ใส่ในบรรทัดคำสั่ง
# เพราะบรรทัดคำสั่งมองเห็นได้จาก Task Manager ของผู้ใช้อื่นบนเครื่องเดียวกัน
$env:PGPASSWORD = $db.Password
try {
    # -Fc = รูปแบบบีบอัดของ pg_dump กู้ด้วย pg_restore ได้ทีละตาราง
    # --no-owner / --no-acl ให้กู้ขึ้นเครื่องที่ชื่อผู้ใช้ฐานข้อมูลต่างกันได้
    & $pgDump -h $db.Host -p $db.Port -U $db.User -d $db.Database `
        -Fc --no-owner --no-acl -f $dumpFile

    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump ล้มเหลว (exit $LASTEXITCODE)"
    }
}
finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

# ไฟล์ว่างแปลว่า pg_dump ล้มแบบไม่คืน exit code — ต้องดักเอง
# ไฟล์สำรองที่เสียแต่ยังอยู่ อันตรายกว่าไม่มีไฟล์สำรอง เพราะเข้าใจผิดว่ามีของ
$dumpSize = (Get-Item $dumpFile).Length
if ($dumpSize -lt 1024) {
    Remove-Item -Recurse -Force $target
    throw "ไฟล์สำรองฐานข้อมูลเล็กผิดปกติ ($dumpSize ไบต์) — ยกเลิกและลบทิ้งแล้ว"
}

# --- ไฟล์ที่ผู้ใช้อัปโหลด ----------------------------------------------------------

# ไม่เก็บ storage\exports กับ storage\temp เพราะระบบสร้างใหม่ได้
# และเป็นโฟลเดอร์ที่โตเร็วที่สุด เก็บไปก็เปลืองที่เปล่า
$folders = @(
    @{ Name = "uploads"; Path = Join-Path $AppRoot "backend\uploads" },
    @{ Name = "storage"; Path = Join-Path $AppRoot "backend\storage" }
)

foreach ($folder in $folders) {
    if (-not (Test-Path $folder.Path)) {
        Write-Host "  ข้าม $($folder.Name) (ยังไม่มีโฟลเดอร์)"
        continue
    }

    Write-Host "  $($folder.Name)..."
    $dest = Join-Path $target $folder.Name

    # /MIR คัดลอกแบบสะท้อนโครงสร้าง /XD ข้ามโฟลเดอร์ที่ไม่ต้องเก็บ
    # /NFL /NDL /NJH /NJS ปิดรายงานรายไฟล์ ไม่งั้น log บวมมากตอนตั้งเวลารันทุกคืน
    $exportsDir = Join-Path $folder.Path "exports"
    $tempDir = Join-Path $folder.Path "temp"

    robocopy $folder.Path $dest /MIR /XD $exportsDir $tempDir /NFL /NDL /NJH /NJS /R:2 /W:2 | Out-Null

    # robocopy คืนค่า 0-7 = สำเร็จ (8 ขึ้นไปคือมีไฟล์ที่คัดลอกไม่ได้จริง)
    # ถ้าไม่ดักแบบนี้ ErrorActionPreference=Stop จะทำให้สคริปต์ตายทั้งที่งานสำเร็จ
    if ($LASTEXITCODE -ge 8) {
        throw "คัดลอก $($folder.Name) ล้มเหลว (robocopy exit $LASTEXITCODE)"
    }
}

# --- ลบของเก่า -----------------------------------------------------------------

if ($KeepDays -gt 0) {
    Write-Host "  ลบไฟล์สำรองที่เก่ากว่า $KeepDays วัน..."
    $cutoff = (Get-Date).AddDays(-$KeepDays)

    Get-ChildItem -Path $backupRoot -Directory -Filter "backup-*" |
        Where-Object { $_.LastWriteTime -lt $cutoff } |
        ForEach-Object {
            Write-Host "    ลบ $($_.Name)"
            Remove-Item -Recurse -Force $_.FullName
        }
}

$totalMb = [math]::Round(((Get-ChildItem -Recurse $target | Measure-Object -Property Length -Sum).Sum / 1MB), 1)
Write-Host "เสร็จ: $totalMb MB"
Write-Host ""
Write-Host "อย่าลืมคัดลอกออกนอกเครื่องด้วย เก็บไว้บนเครื่องเดียวกับระบบไม่ช่วยอะไรตอนเครื่องพัง"
