<#
.SYNOPSIS
ติดตั้ง backend และ frontend เป็น Windows Service ด้วย NSSM

.DESCRIPTION
ต้องเป็น Windows Service ไม่ใช่ Task Scheduler เพราะ
  - เริ่มเองตอนเครื่องบูต โดยไม่ต้องมีใครล็อกอิน
  - ถ้าโปรเซสตาย Windows เปิดใหม่ให้เอง
  - ปิด/เปิดจาก services.msc ได้เหมือนบริการอื่นบนเครื่อง

ใช้ NSSM เพราะ sc.exe สร้าง service จาก node.exe ตรง ๆ ไม่ได้
(Windows คาดหวังโปรแกรมที่คุยกับ Service Control Manager เป็น ซึ่ง node ไม่ทำ)

โหลด NSSM จาก https://nssm.cc/download แล้ววาง nssm.exe ไว้ใน PATH
หรือระบุเส้นทางด้วย -NssmPath

.EXAMPLE
  # เปิด PowerShell แบบ Run as Administrator
  .\scripts\windows\install-services.ps1 -AppRoot D:\hr

.NOTES
ถอนการติดตั้ง:
  nssm stop HRBackend ; nssm remove HRBackend confirm
  nssm stop HRFrontend ; nssm remove HRFrontend confirm
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$AppRoot,

    [string]$NssmPath = "nssm.exe",

    [string]$NodePath = "",

    [int]$FrontendPort = 3000,

    # บัญชีที่ service จะรันด้วย ปล่อยว่าง = LocalSystem
    # แนะนำให้สร้างบัญชีเฉพาะงานแล้วให้สิทธิ์เขียนเฉพาะโฟลเดอร์ของระบบนี้
    [string]$ServiceAccount = "",
    [string]$ServicePassword = ""
)

$ErrorActionPreference = "Stop"

# --- ตรวจก่อนลงมือ --------------------------------------------------------------

$isAdmin = ([Security.Principal.WindowsPrincipal] `
        [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    throw "ต้องรัน PowerShell แบบ Run as Administrator"
}

$AppRoot = (Resolve-Path $AppRoot).Path
$backendDir = Join-Path $AppRoot "backend"
$frontendDir = Join-Path $AppRoot "frontend"
$logDir = Join-Path $AppRoot "logs"

foreach ($dir in @($backendDir, $frontendDir)) {
    if (-not (Test-Path $dir)) { throw "ไม่พบโฟลเดอร์: $dir" }
}

# ต้อง build มาก่อนแล้ว — service รันของที่คอมไพล์แล้วเท่านั้น ไม่คอมไพล์ให้
$backendEntry = Join-Path $backendDir "dist\main.js"
if (-not (Test-Path $backendEntry)) {
    throw "ไม่พบ $backendEntry — สั่ง 'npm run build' ในโฟลเดอร์ backend ก่อน"
}

if (-not (Test-Path (Join-Path $backendDir ".env"))) {
    throw "ไม่พบ backend\.env — คัดลอกจาก .env.example แล้วเติมค่าให้ครบก่อน"
}

<#
  frontend รันแบบ standalone ไม่ใช่ `next start`
  next.config.ts ตั้ง output: "standalone" ไว้ ซึ่ง Next บอกตรง ๆ ว่า
  `next start` ใช้กับโหมดนี้ไม่ได้ (ขึ้นคำเตือนแล้วพฤติกรรมไม่รับประกัน)
  ตัว standalone มี node_modules เฉพาะที่ใช้จริงมาให้ในตัว จึงเบากว่าด้วย
#>
$standaloneDir = Join-Path $frontendDir ".next\standalone"
$standaloneEntry = Join-Path $standaloneDir "server.js"
if (-not (Test-Path $standaloneEntry)) {
    throw "ไม่พบ $standaloneEntry — สั่ง 'npm run build' ในโฟลเดอร์ frontend ก่อน"
}

if ($NodePath -eq "") {
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($null -eq $nodeCommand) { throw "หา node.exe ไม่เจอใน PATH — ระบุด้วย -NodePath" }
    $NodePath = $nodeCommand.Source
}

$nssmCommand = Get-Command $NssmPath -ErrorAction SilentlyContinue
if ($null -eq $nssmCommand) {
    throw "หา nssm.exe ไม่เจอ — โหลดจาก https://nssm.cc/download แล้วระบุด้วย -NssmPath"
}
$nssm = $nssmCommand.Source

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

Write-Host "node : $NodePath"
Write-Host "nssm : $nssm"
Write-Host "ราก  : $AppRoot"
Write-Host ""

# --- เติมไฟล์ที่ standalone ขาด ---------------------------------------------------

<#
  `next build` ไม่ได้ก๊อป .next\static กับ public เข้าไปใน standalone ให้เอง
  ขาดสองอย่างนี้แล้วหน้าเว็บจะขึ้นแต่ไม่มี CSS ไม่มีรูป และ chunk ของ JS โหลด 404
  หน้าตาเหมือนเว็บพัง แต่ไม่มี error ใน log ของ service เลย — หายากมาก
  จึงทำให้ตรงนี้ทุกครั้งที่ติดตั้ง ไม่ปล่อยให้เป็นขั้นตอนที่คนต้องจำ
#>
Write-Host "เติมไฟล์ static/public เข้า standalone ..."

$staticSource = Join-Path $frontendDir ".next\static"
$staticTarget = Join-Path $standaloneDir ".next\static"
if (Test-Path $staticSource) {
    robocopy $staticSource $staticTarget /MIR /NFL /NDL /NJH /NJS /R:2 /W:2 | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "คัดลอก .next\static ล้มเหลว (robocopy exit $LASTEXITCODE)" }
}
else {
    throw "ไม่พบ $staticSource — build frontend ไม่สมบูรณ์"
}

$publicSource = Join-Path $frontendDir "public"
$publicTarget = Join-Path $standaloneDir "public"
if (Test-Path $publicSource) {
    robocopy $publicSource $publicTarget /MIR /NFL /NDL /NJH /NJS /R:2 /W:2 | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "คัดลอก public ล้มเหลว (robocopy exit $LASTEXITCODE)" }
}

Write-Host "  เรียบร้อย"
Write-Host ""

# --- ฟังก์ชันติดตั้งทีละ service -------------------------------------------------

function Install-NodeService {
    param(
        [string]$Name,
        [string]$DisplayName,
        [string]$Description,
        [string]$WorkingDir,
        [string]$Arguments,
        [string[]]$ExtraEnvironment = @()
    )

    Write-Host "ติดตั้ง $Name ..."

    # ลบของเดิมก่อนเสมอ เพื่อให้รันสคริปต์ซ้ำได้ผลเหมือนเดิมทุกครั้ง
    $existing = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if ($null -ne $existing) {
        Write-Host "  พบ service เดิม — หยุดและลบออกก่อน"
        & $nssm stop $Name confirm 2>&1 | Out-Null
        & $nssm remove $Name confirm 2>&1 | Out-Null
        Start-Sleep -Seconds 2
    }

    & $nssm install $Name $NodePath $Arguments
    if ($LASTEXITCODE -ne 0) { throw "nssm install $Name ล้มเหลว" }

    & $nssm set $Name AppDirectory $WorkingDir
    & $nssm set $Name DisplayName $DisplayName
    & $nssm set $Name Description $Description
    & $nssm set $Name Start SERVICE_AUTO_START

    # NODE_ENV กับ TZ ต้องมาจาก service ไม่ใช่จาก .env
    # เพราะโค้ดบางส่วนอ่านสองค่านี้ตั้งแต่ก่อน .env จะถูกโหลด
    $environment = @("NODE_ENV=production", "TZ=Asia/Bangkok") + $ExtraEnvironment
    & $nssm set $Name AppEnvironmentExtra $environment

    # เก็บ log ของโปรเซส ไม่งั้นเวลาพังจะไม่เหลืออะไรให้ดูเลย
    & $nssm set $Name AppStdout (Join-Path $logDir "$Name.out.log")
    & $nssm set $Name AppStderr (Join-Path $logDir "$Name.err.log")
    & $nssm set $Name AppRotateFiles 1
    & $nssm set $Name AppRotateOnline 1
    & $nssm set $Name AppRotateBytes 10485760

    # หน่วงก่อนเปิดใหม่ 5 วินาที กันวนรีสตาร์ตรัว ๆ ตอนฐานข้อมูลยังไม่พร้อม
    & $nssm set $Name AppThrottle 5000
    & $nssm set $Name AppExit Default Restart
    & $nssm set $Name AppRestartDelay 5000

    # ให้เวลาปิดตัวเอง 30 วินาที งานที่ค้างในคิวจะได้ไม่ถูกตัดกลางคัน
    & $nssm set $Name AppStopMethodConsole 30000

    if ($ServiceAccount -ne "") {
        & $nssm set $Name ObjectName $ServiceAccount $ServicePassword
    }

    Write-Host "  เรียบร้อย"
}

# --- ติดตั้ง -------------------------------------------------------------------

Install-NodeService `
    -Name "HRBackend" `
    -DisplayName "HR Workforce — Backend API" `
    -Description "NestJS API ของระบบบุคคล/เงินเดือน ฟังที่พอร์ตตาม PORT ใน backend\.env" `
    -WorkingDir $backendDir `
    -Arguments "dist\main.js"

# HOSTNAME=127.0.0.1 เพื่อไม่ให้ frontend รับจากภายนอกตรง ๆ
# ต้องผ่าน reverse proxy ที่ทำ HTTPS เท่านั้น
Install-NodeService `
    -Name "HRFrontend" `
    -DisplayName "HR Workforce — Frontend" `
    -Description "Next.js หน้าเว็บของระบบบุคคล/เงินเดือน (โหมด standalone)" `
    -WorkingDir $standaloneDir `
    -Arguments "server.js" `
    -ExtraEnvironment @("PORT=$FrontendPort", "HOSTNAME=127.0.0.1")

# --- เปิดใช้ -------------------------------------------------------------------

Write-Host ""
Write-Host "เริ่ม service ..."

# backend ต้องขึ้นก่อน ไม่งั้นหน้าเว็บเปิดมาแล้วเรียก API ไม่ได้ในนาทีแรก
Start-Service -Name "HRBackend"
Start-Sleep -Seconds 5
Start-Service -Name "HRFrontend"

Write-Host ""
Get-Service -Name "HRBackend", "HRFrontend" |
    Format-Table -Property Name, Status, StartType -AutoSize

Write-Host ""
Write-Host "ตรวจว่าขึ้นจริง:"
Write-Host "  Invoke-RestMethod http://127.0.0.1:4000/api/health"
Write-Host "  Invoke-WebRequest http://127.0.0.1:$FrontendPort -UseBasicParsing | Select-Object StatusCode"
Write-Host ""
Write-Host "ดู log ที่ $logDir"
Write-Host ""
Write-Host "ทุกครั้งที่ build frontend ใหม่ ต้องรันสคริปต์นี้ซ้ำ"
Write-Host "เพราะไฟล์ static ชุดใหม่ต้องถูกคัดลอกเข้า standalone อีกรอบ"
