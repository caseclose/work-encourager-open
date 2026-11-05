# Install (or remove) the Windows desktop app for the current user.
# No administrator rights are required.
#
#   powershell -ExecutionPolicy Bypass -File install.ps1
#   powershell -ExecutionPolicy Bypass -File install.ps1 -Uninstall
param(
    [switch]$Uninstall,
    [switch]$NoDesktopShortcut
)

$ErrorActionPreference = 'Stop'

$appName = '上班鼓励器'
$appId = 'WorkEncourager'
$source = $PSScriptRoot
$installDir = Join-Path $env:LOCALAPPDATA "Programs\$appId"
$exePath = Join-Path $installDir 'WorkEncourager.exe'
$startMenuDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$desktopDir = [Environment]::GetFolderPath('Desktop')
$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$appId"

function Remove-ScheduledTask {
    # Exit code 1 means "task not found"; never treat that as an error.
    try {
        $process = Start-Process -FilePath 'schtasks.exe' `
            -ArgumentList '/Delete', '/TN', 'WorkEncourager', '/F' `
            -Wait -PassThru -WindowStyle Hidden
        return $process.ExitCode
    }
    catch {
        return -1
    }
}

function New-Shortcut([string]$linkPath, [string]$target, [string]$workingDirectory, [string]$description) {
    $shell = New-Object -ComObject WScript.Shell
    try {
        $shortcut = $shell.CreateShortcut($linkPath)
        $shortcut.TargetPath = $target
        $shortcut.WorkingDirectory = $workingDirectory
        $shortcut.IconLocation = "$target,0"
        $shortcut.Description = $description
        $shortcut.Save()
    }
    finally {
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($shell) | Out-Null
    }
}

if ($Uninstall) {
    Write-Host "正在卸载 $appName ..."
    Get-Process WorkEncourager -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Milliseconds 500
    # Remove the highest-privilege logon task created by the app's 开机自动启动 switch.
    Remove-ScheduledTask | Out-Null

    foreach ($link in @(
            (Join-Path $desktopDir "$appName.lnk"),
            (Join-Path $startMenuDir "$appName.lnk"))) {
        if (Test-Path -LiteralPath $link) { Remove-Item -LiteralPath $link -Force }
    }

    if (Test-Path $uninstallKey) { Remove-Item $uninstallKey -Recurse -Force }
    if (Test-Path $installDir) { Remove-Item $installDir -Recurse -Force }

    # Web-layer settings (localStorage) and native preferences stay in %LOCALAPPDATA%\WorkEncourager
    # unless the user removes them explicitly; print the path so removal is a conscious choice.
    Write-Host "已卸载。个人数据保留在：$env:LOCALAPPDATA\WorkEncourager"
    return
}

if (-not (Test-Path $exePath)) {
    if (-not (Test-Path (Join-Path $source 'WorkEncourager.exe'))) {
        throw "找不到 WorkEncourager.exe。请先运行 windows/build.ps1 -Zip，并把安装脚本与发布目录放在一起。"
    }

    Write-Host "正在安装到 $installDir ..."
    Get-Process WorkEncourager -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Milliseconds 500
    # Remove the highest-privilege logon task created by the app's 开机自动启动 switch.
    Remove-ScheduledTask | Out-Null
    if (Test-Path $installDir) { Remove-Item $installDir -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $installDir | Out-Null
    Copy-Item (Join-Path $source '*') $installDir -Recurse -Force
}

if (-not (Test-Path $exePath)) { throw "安装失败：$exePath 不存在。" }

$version = (Get-Item $exePath).VersionInfo.ProductVersion
if ([string]::IsNullOrWhiteSpace($version)) { $version = '1.0.0' }

if (-not (Test-Path $startMenuDir)) { New-Item -ItemType Directory -Force -Path $startMenuDir | Out-Null }
New-Shortcut (Join-Path $startMenuDir "$appName.lnk") $exePath $installDir "$appName - 把每一分钟折算成看得见的进账"
if (-not $NoDesktopShortcut) {
    New-Shortcut (Join-Path $desktopDir "$appName.lnk") $exePath $installDir "$appName - 把每一分钟折算成看得见的进账"
}

New-Item -Path $uninstallKey -Force | Out-Null
Set-ItemProperty -Path $uninstallKey -Name 'DisplayName' -Value $appName
Set-ItemProperty -Path $uninstallKey -Name 'DisplayVersion' -Value $version
Set-ItemProperty -Path $uninstallKey -Name 'Publisher' -Value 'Work Encourager contributors'
Set-ItemProperty -Path $uninstallKey -Name 'InstallLocation' -Value $installDir
Set-ItemProperty -Path $uninstallKey -Name 'DisplayIcon' -Value "$exePath,0"
Set-ItemProperty -Path $uninstallKey -Name 'NoModify' -Value 1 -Type DWord
Set-ItemProperty -Path $uninstallKey -Name 'NoRepair' -Value 1 -Type DWord
Set-ItemProperty -Path $uninstallKey -Name 'UninstallString' `
    -Value "powershell -NoProfile -ExecutionPolicy Bypass -File `"$installDir\install.ps1`" -Uninstall"

Write-Host "安装完成：$exePath"
Write-Host '已创建开始菜单快捷方式；桌面快捷方式可选。'
Write-Host '首次启动会在右下角通知区域出现托盘图标，主面板会同时打开。'
