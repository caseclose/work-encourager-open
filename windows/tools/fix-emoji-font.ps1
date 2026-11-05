# Restore the Windows emoji/symbol font mapping when a font-replacement tool left it broken.
#
# Symptom: emoji (🍱 🎯 🔋 …) render as empty boxes in every application, including browsers.
# Cause: HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts has the "Segoe UI Emoji" /
#        "Segoe UI Symbol" entries pointing at a font file that does not exist (for example
#        PingFangSC.ttf after a "replace system font with PingFang" tweak).
#
# Usage (administrator PowerShell):
#   powershell -ExecutionPolicy Bypass -File fix-emoji-font.ps1
#   powershell -ExecutionPolicy Bypass -File fix-emoji-font.ps1 -Restore
param(
    [switch]$Restore
)

$ErrorActionPreference = 'Stop'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host '需要管理员权限：请右键「以管理员身份运行」 PowerShell 后再执行本脚本。'
    exit 1
}

$fontsKey = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts'
$fontsFolder = Join-Path $env:WINDIR 'Fonts'
$backupDirectory = Join-Path $env:LOCALAPPDATA 'WorkEncourager'
$backupFile = Join-Path $backupDirectory 'emoji-font-backup.json'

# Display name (registry value name) -> expected font file for a stock Windows install.
$expected = [ordered]@{
    'Segoe UI Emoji (TrueType)'  = 'seguiemj.ttf'
    'Segoe UI Symbol (TrueType)' = 'seguisym.ttf'
}

function Get-FontValue([string]$name) {
    $item = Get-ItemProperty -Path $fontsKey -Name $name -ErrorAction SilentlyContinue
    if ($null -eq $item) { return $null }
    return [string]$item.$name
}

function Set-FontValue([string]$name, [string]$fileName) {
    New-ItemProperty -Path $fontsKey -Name $name -Value $fileName -PropertyType String -Force | Out-Null
}

function Send-FontChange {
    if (-not ('W.FontBroadcast' -as [type])) {
        Add-Type -Namespace W -Name FontBroadcast -MemberDefinition '[DllImport("user32.dll")] public static extern System.IntPtr SendMessage(System.IntPtr hWnd, uint msg, System.IntPtr wParam, System.IntPtr lParam);'
    }

    # HWND_BROADCAST + WM_FONTCHANGE: tell running windows the font table changed.
    [void][W.FontBroadcast]::SendMessage([System.IntPtr]0xFFFF, 0x001D, [System.IntPtr]::Zero, [System.IntPtr]::Zero)
}

if ($Restore) {
    if (-not (Test-Path -LiteralPath $backupFile)) {
        Write-Host "找不到备份文件：$backupFile"
        exit 1
    }

    $backup = Get-Content -LiteralPath $backupFile -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($name in $backup.PSObject.Properties.Name) {
        $value = $backup.$name
        if ($null -eq $value) {
            Remove-ItemProperty -Path $fontsKey -Name $name -ErrorAction SilentlyContinue
            Write-Host "已移除 $name"
        }
        else {
            Set-FontValue $name ([string]$value)
            Write-Host "已恢复 $name => $value"
        }
    }

    Send-FontChange
    Write-Host '已发送字体变更通知。'
    exit 0
}

New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null
$current = [ordered]@{}
$needsFix = $false

foreach ($name in $expected.Keys) {
    $fileName = $expected[$name]
    $currentValue = Get-FontValue $name
    $current[$name] = $currentValue
    $targetFile = Join-Path $fontsFolder $fileName
    $valueFile = if ($currentValue) { Join-Path $fontsFolder $currentValue } else { $null }

    $shown = if ($currentValue) { $currentValue } else { '<缺失>' }
    Write-Host ("{0}: 当前 = {1}" -f $name, $shown)

    if (-not (Test-Path -LiteralPath $targetFile)) {
        Write-Host ("  警告：本机缺少 {0}，无法恢复这一项。" -f $fileName)
        continue
    }

    if ($currentValue -eq $fileName -and (Test-Path -LiteralPath $targetFile)) {
        Write-Host '  已指向正确字体，跳过。'
        continue
    }

    if ($valueFile -and (Test-Path -LiteralPath $valueFile)) {
        Write-Host '  当前字体文件存在但与标准不同，仍按标准映射修正。'
    }
    else {
        Write-Host '  当前指向的文件不存在，这就是 emoji 显示为方块的原因。'
    }
    $needsFix = $true
}

if (-not $needsFix) {
    Write-Host '字体映射看起来是正常的，无需修复。'
    exit 0
}

# Save the original values before touching anything.
$current | ConvertTo-Json | Set-Content -LiteralPath $backupFile -Encoding UTF8
Write-Host "已备份原值：$backupFile"

foreach ($name in $expected.Keys) {
    $fileName = $expected[$name]
    if (-not (Test-Path -LiteralPath (Join-Path $fontsFolder $fileName))) { continue }
    Set-FontValue $name $fileName
    Write-Host ("已修复 {0} => {1}" -f $name, $fileName)
}

Send-FontChange

Write-Host ''
Write-Host '完成。Emoji 字体映射已恢复；新启动的程序会立即生效，已运行的程序请重启（浏览器按 Ctrl+F5 或重启应用）。'
Write-Host '如需撤销：powershell -ExecutionPolicy Bypass -File fix-emoji-font.ps1 -Restore'
