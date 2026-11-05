# Build, publish and optionally launch the Windows desktop app.
#
#   powershell -ExecutionPolicy Bypass -File windows/build.ps1 -Run
#   powershell -ExecutionPolicy Bypass -File windows/build.ps1 -Zip
#
# Outputs:
#   dist/WorkEncourager-win-x64-framework/   small build, needs the .NET 10 Desktop Runtime
#   dist/WorkEncourager-win-x64-portable/    self-contained single .exe, no runtime needed
#   dist/WorkEncourager-<version>-win-x64.zip
param(
    [ValidateSet('Debug', 'Release')][string]$Configuration = 'Release',
    [switch]$Run,
    [switch]$Zip,
    [switch]$SkipTests,
    [switch]$SkipPortable
)

$ErrorActionPreference = 'Stop'

$windowsRoot = $PSScriptRoot
$repoRoot = Split-Path -Parent $windowsRoot
$project = Join-Path $windowsRoot 'WorkEncourager\WorkEncourager.csproj'
$assets = Join-Path $windowsRoot 'WorkEncourager\Assets'
$dist = Join-Path $repoRoot 'dist'
[xml]$projectXml = Get-Content $project -Raw -Encoding UTF8
$version = @($projectXml.Project.PropertyGroup | ForEach-Object { $_.Version } | Where-Object { $_ }) | Select-Object -First 1
if ([string]::IsNullOrWhiteSpace($version)) { $version = '1.0.0' }

function Write-Step([string]$message) {
    Write-Host ''
    Write-Host "==> $message" -ForegroundColor Cyan
}

# --- icons (generated from the shared app icon, checked in for reproducible builds) ---
if (-not (Test-Path (Join-Path $assets 'app.ico'))) {
    Write-Step 'Generating Windows icons'
    & (Join-Path $windowsRoot 'tools\make-icon.ps1') -Source (Join-Path $repoRoot 'assets\icon.png') -Output (Join-Path $assets 'app.ico')
    & (Join-Path $windowsRoot 'tools\make-icon.ps1') -Source (Join-Path $repoRoot 'assets\icon.png') -Output (Join-Path $assets 'app-masked.ico') -Grayscale
}

# --- the renderer is the unchanged web app: keep its unit tests green ---
if (-not $SkipTests) {
    Write-Step 'Running web-layer unit tests'
    Push-Location $repoRoot
    try {
        & node --test earn.test.mjs goals.test.mjs calendar.test.mjs celebrations.test.mjs features.test.mjs pomodoro.test.mjs
        if ($LASTEXITCODE -ne 0) { throw 'web-layer unit tests failed' }
    }
    finally {
        Pop-Location
    }
}

Write-Step "Building $Configuration"
& dotnet build $project -c $Configuration --nologo
if ($LASTEXITCODE -ne 0) { throw 'build failed' }

New-Item -ItemType Directory -Force -Path $dist | Out-Null

# --- framework-dependent single file (fast startup, requires .NET 10 Desktop Runtime) ---
$frameworkOut = Join-Path $dist 'WorkEncourager-win-x64-framework'
Write-Step "Publishing framework-dependent build to $frameworkOut"
if (Test-Path $frameworkOut) { Remove-Item $frameworkOut -Recurse -Force }
& dotnet publish $project -c $Configuration -r win-x64 --self-contained false --nologo -o $frameworkOut
if ($LASTEXITCODE -ne 0) { throw 'framework-dependent publish failed' }

# --- code signing -------------------------------------------------------------
# A local self-signed certificate is created on first use (see windows/tools/sign-app.ps1).
# For public distribution replace it with a CA-issued certificate.
Write-Step 'Signing published executables'
$signingDir = Join-Path $windowsRoot 'signing'
$certificatePath = Join-Path $signingDir 'WorkEncourager-signing.cer'
$signScript = Join-Path $windowsRoot 'tools\sign-app.ps1'
$trustScript = Join-Path $windowsRoot 'trust-signing-cert.ps1'
$emojiFixScript = Join-Path $windowsRoot 'tools\fix-emoji-font.ps1'
& $signScript -Path (Join-Path $frameworkOut 'WorkEncourager.exe') -CreateIfMissing
foreach ($publishDir in @($frameworkOut, (Join-Path $dist 'WorkEncourager-win-x64-portable'))) {
    if (Test-Path $publishDir) {
        if (Test-Path $certificatePath) { Copy-Item $certificatePath $publishDir -Force }
        if (Test-Path $trustScript) { Copy-Item $trustScript $publishDir -Force }
        if (Test-Path $emojiFixScript) { Copy-Item $emojiFixScript $publishDir -Force }
    }
}

# --- self-contained single file (runs on machines without .NET installed) ---
if (-not $SkipPortable) {
    $portableOut = Join-Path $dist 'WorkEncourager-win-x64-portable'
    Write-Step "Publishing self-contained build to $portableOut"
    if (Test-Path $portableOut) { Remove-Item $portableOut -Recurse -Force }
    & dotnet publish $project -c $Configuration -r win-x64 --self-contained true --nologo -p:EnableCompressionInSingleFile=true -o $portableOut
    if ($LASTEXITCODE -ne 0) { throw 'self-contained publish failed' }
    & $signScript -Path (Join-Path $portableOut 'WorkEncourager.exe')
    if (Test-Path $certificatePath) { Copy-Item $certificatePath $portableOut -Force }
    if (Test-Path $trustScript) { Copy-Item $trustScript $portableOut -Force }
    if (Test-Path $emojiFixScript) { Copy-Item $emojiFixScript $portableOut -Force }
}

# --- MSI installer -----------------------------------------------------------
# Requires the WiX toolset: dotnet tool install --global wix --version 5.0.2
Write-Step 'Building MSI installer'
$installerOutput = Join-Path $dist "WorkEncourager-Setup-$version.msi"
$env:PATH = "$env:USERPROFILE\.dotnet\tools;$env:PATH"
$env:DOTNET_ROLL_FORWARD = 'LatestMajor'
if (Get-Command wix.exe -ErrorAction SilentlyContinue) {
    Push-Location (Join-Path $windowsRoot 'installer')
    try {
        & wix build WorkEncourager.wxs -arch x64 -ext WixToolset.UI.wixext -o $installerOutput
        if ($LASTEXITCODE -ne 0) { throw 'MSI build failed' }
    }
    finally {
        Pop-Location
    }
    & $signScript -Path $installerOutput
    Remove-Item (Join-Path $dist "WorkEncourager-Setup-$version.wixpdb") -Force -ErrorAction SilentlyContinue
}
else {
    Write-Host '  未找到 WiX 工具，跳过 MSI 安装包。安装：dotnet tool install --global wix --version 5.0.2'
}

if ($Zip) {
    Write-Step 'Creating release archive'
    $stage = Join-Path $dist 'stage'
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $stage | Out-Null
    $portableOut = Join-Path $dist 'WorkEncourager-win-x64-portable'
    Copy-Item $portableOut (Join-Path $stage 'WorkEncourager') -Recurse
    Copy-Item (Join-Path $windowsRoot 'install.ps1') (Join-Path $stage 'WorkEncourager\install.ps1')
    Copy-Item (Join-Path $windowsRoot 'README.md') (Join-Path $stage 'WorkEncourager\WINDOWS-README.md')
    $archive = Join-Path $dist "WorkEncourager-$version-win-x64.zip"
    if (Test-Path $archive) { Remove-Item $archive -Force }
    Compress-Archive -Path (Join-Path $stage 'WorkEncourager') -DestinationPath $archive -CompressionLevel Optimal
    Remove-Item $stage -Recurse -Force
}

Write-Step 'Results'
foreach ($dir in @('WorkEncourager-win-x64-framework', 'WorkEncourager-win-x64-portable')) {
    $path = Join-Path $dist $dir
    if (-not (Test-Path $path)) { continue }
    $exe = Get-Item (Join-Path $path 'WorkEncourager.exe') -ErrorAction SilentlyContinue
    $total = (Get-ChildItem $path -Recurse -File | Measure-Object Length -Sum).Sum
    Write-Host ("  {0}: exe {1:N0} bytes, folder {2:N1} MB" -f $dir, $exe.Length, ($total / 1MB))
}
$archive = Join-Path $dist "WorkEncourager-$version-win-x64.zip"
if (Test-Path $archive) {
    Write-Host ("  {0}: {1:N1} MB" -f (Split-Path -Leaf $archive), ((Get-Item $archive).Length / 1MB))
}
$installerResult = Join-Path $dist "WorkEncourager-Setup-$version.msi"
if (Test-Path $installerResult) {
    Write-Host ("  {0}: {1:N1} MB" -f (Split-Path -Leaf $installerResult), ((Get-Item $installerResult).Length / 1MB))
}

if ($Run) {
    $target = Join-Path $dist 'WorkEncourager-win-x64-framework\WorkEncourager.exe'
    if (-not (Test-Path $target)) { $target = Join-Path $dist 'WorkEncourager-win-x64-portable\WorkEncourager.exe' }
    Write-Step "Launching $target"
    Start-Process -FilePath $target
}
