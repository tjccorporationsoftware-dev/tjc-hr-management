<#
.SYNOPSIS
  ติดตั้งตัวคั่นหน้าสำหรับเครื่องสแกนลายนิ้วมือเป็น Windows Service

.DESCRIPTION
  เครื่องสแกนตั้งค่าได้แค่ที่อยู่กับพอร์ต แนบโทเคนที่ backend บังคับเองไม่ได้
  service นี้รับจากเครื่องแล้วเติม header ให้ก่อนส่งต่อเข้า backend ในเครื่องเดียวกัน

  อ่านค่า ATTENDANCE_DEVICE_PUSH_TOKEN กับ PORT จาก backend\.env ให้เอง
  จะได้ไม่มีทางตั้งโทเคนไม่ตรงกันจนข้อมูลลงเวลาถูกปฏิเสธเงียบ ๆ

  ต้องมี nssm.exe เหมือนกับ install-services.ps1
  โหลดจาก https://nssm.cc/download

.EXAMPLE
  .\scripts\windows\install-device-proxy-service.ps1 -AppRoot D:\hr -ScannerIps 192.168.100.90

.NOTES
  ถอนออก:
    nssm stop HRDeviceProxy ; nssm remove HRDeviceProxy confirm
    Remove-NetFirewallRule -DisplayName "HR attendance scanner"
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$AppRoot,

    # IP ของเครื่องสแกน คั่นด้วยจุลภาคถ้ามีหลายเครื่อง
    # ใช้ทั้งจำกัดใน service และตั้ง firewall ให้ตรงกัน
    [Parameter(Mandatory = $true)]
    [string]$ScannerIps,

    # พอร์ตที่ตั้งในเครื่องสแกน
    [int]$ListenPort = 8080,

    [string]$NssmPath = "nssm.exe",
    [string]$NodePath = "",

    [string]$ServiceAccount = "",
    [string]$ServicePassword = ""
)

$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal] `
        [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    throw "ต้องรัน PowerShell แบบ Run as Administrator"
}

$AppRoot = (Resolve-Path $AppRoot).Path
$scriptPath = Join-Path $AppRoot "scripts\windows\attendance-device-proxy.js"
$envPath = Join-Path $AppRoot "backend\.env"
$logDir = Join-Path $AppRoot "logs"

if (-not (Test-Path $scriptPath)) {
    throw "ไม่พบ $scriptPath — วางโค้ดไม่ครบหรือระบุ -AppRoot ผิดที่"
}

if (-not (Test-Path $envPath)) {
    throw "ไม่พบ $envPath"
}

# --- อ่านค่าจาก backend\.env ------------------------------------------------------

function Get-EnvValue {
    param([string]$Key)

    foreach ($line in Get-Content $envPath) {
        $trimmed = $line.Trim()
        if ($trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) { continue }

        $name = $trimmed.Substring(0, $trimmed.IndexOf("=")).Trim()
        if ($name -ne $Key) { continue }

        $value = $trimmed.Substring($trimmed.IndexOf("=") + 1).Trim()
        return $value.Trim('"').Trim("'")
    }

    return ""
}

$token = Get-EnvValue "ATTENDANCE_DEVICE_PUSH_TOKEN"
$backendPort = Get-EnvValue "PORT"

if (-not $token) {
    throw @"
backend\.env ยังไม่ได้ตั้ง ATTENDANCE_DEVICE_PUSH_TOKEN
สุ่มค่าใหม่ด้วย: cd backend ; npm run gen:secrets
แล้ววางลง backend\.env ก่อน จากนั้นรีสตาร์ต service HRBackend
"@
}

if ($token.Length -lt 24) {
    throw "ATTENDANCE_DEVICE_PUSH_TOKEN สั้นเกินไป ต้องยาวอย่างน้อย 24 ตัวอักษร"
}

if (-not $backendPort) { $backendPort = "4000" }

if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}

if (-not $NodePath) {
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($null -eq $nodeCommand) { throw "หา node.exe ไม่เจอ — ระบุด้วย -NodePath" }
    $NodePath = $nodeCommand.Source
}

$nssmCommand = Get-Command $NssmPath -ErrorAction SilentlyContinue
if ($null -eq $nssmCommand) {
    throw "หา nssm.exe ไม่เจอ — โหลดจาก https://nssm.cc/download แล้วระบุด้วย -NssmPath"
}
$nssm = $nssmCommand.Source

$allowedIps = ($ScannerIps -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ }) -join ","

Write-Host "node        : $NodePath"
Write-Host "nssm        : $nssm"
Write-Host "ราก         : $AppRoot"
Write-Host "รับที่พอร์ต   : $ListenPort"
Write-Host "ส่งต่อไปที่   : 127.0.0.1:$backendPort"
Write-Host "เครื่องสแกน  : $allowedIps"
Write-Host ""

# --- ติดตั้ง service --------------------------------------------------------------

$name = "HRDeviceProxy"

$existing = Get-Service -Name $name -ErrorAction SilentlyContinue
if ($null -ne $existing) {
    Write-Host "มี service $name อยู่แล้ว — ถอดของเดิมก่อน"
    & $nssm stop $name confirm 2>&1 | Out-Null
    & $nssm remove $name confirm 2>&1 | Out-Null
    Start-Sleep -Seconds 2
}

& $nssm install $name $NodePath $scriptPath
if ($LASTEXITCODE -ne 0) { throw "nssm install $name ล้มเหลว" }

& $nssm set $name AppDirectory $AppRoot
& $nssm set $name DisplayName "HR Workforce — Attendance Device Proxy"
& $nssm set $name Description "เติมโทเคนให้ข้อมูลลงเวลาจากเครื่องสแกน แล้วส่งต่อเข้า backend"
& $nssm set $name Start SERVICE_AUTO_START

$environment = @(
    "ATTENDANCE_DEVICE_PUSH_TOKEN=$token",
    "DEVICE_PROXY_PORT=$ListenPort",
    "DEVICE_PROXY_TARGET_HOST=127.0.0.1",
    "DEVICE_PROXY_TARGET_PORT=$backendPort",
    "DEVICE_PROXY_ALLOWED_IPS=$allowedIps"
) -join "`r`n"

& $nssm set $name AppEnvironmentExtra $environment

& $nssm set $name AppStdout (Join-Path $logDir "$name.out.log")
& $nssm set $name AppStderr (Join-Path $logDir "$name.err.log")
& $nssm set $name AppRotateFiles 1
& $nssm set $name AppRotateOnline 1
& $nssm set $name AppRotateBytes 10485760

& $nssm set $name AppThrottle 5000
& $nssm set $name AppExit Default Restart
& $nssm set $name AppRestartDelay 5000

if ($ServiceAccount) {
    & $nssm set $name ObjectName $ServiceAccount $ServicePassword
}

# --- firewall ---------------------------------------------------------------------

<#
  เปิดเฉพาะ IP ของเครื่องสแกน ไม่เปิดทั้งวง
  พอร์ตนี้เป็น HTTP ล้วน (เครื่องสแกนต่อ TLS ไม่ได้) เปิดกว้างไม่ได้
#>
$ruleName = "HR attendance scanner"

Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue |
    Remove-NetFirewallRule -ErrorAction SilentlyContinue

New-NetFirewallRule -DisplayName $ruleName `
    -Direction Inbound -Protocol TCP -LocalPort $ListenPort `
    -RemoteAddress ($allowedIps -split ",") -Action Allow -Profile Any | Out-Null

Write-Host ""
Write-Host "เปิด firewall พอร์ต $ListenPort เฉพาะ $allowedIps แล้ว"

# --- เปิดใช้ ----------------------------------------------------------------------

Start-Service -Name $name
Start-Sleep -Seconds 2

Get-Service -Name $name | Format-Table -Property Name, Status, StartType -AutoSize

Write-Host ""
Write-Host "ตรวจว่าขึ้นจริง (รันบนเซิร์ฟเวอร์เครื่องนี้):"
Write-Host "  Invoke-WebRequest -UseBasicParsing `"http://127.0.0.1:$ListenPort/iclock/cdata?SN=TEST123`" | Select-Object -Expand Content"
Write-Host ""
Write-Host "ได้ 'GET OPTION FROM: TEST123' = ทางเดินครบแล้ว"
Write-Host "ได้ 401 = โทเคนไม่ตรงกับที่ service HRBackend ใช้อยู่ — รีสตาร์ต HRBackend แล้วลองใหม่"
Write-Host ""
Write-Host "log อยู่ที่ $logDir\$name.out.log"
Write-Host ""
Write-Host "จากนั้นตั้งที่ตัวเครื่องสแกน: Server Address = IP ของเซิร์ฟเวอร์นี้, Port = $ListenPort"
