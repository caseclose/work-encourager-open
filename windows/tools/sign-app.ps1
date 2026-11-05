# Sign the published Windows executables with the repository's local code-signing certificate.
#
#   powershell -ExecutionPolicy Bypass -File windows/tools/sign-app.ps1 -Path <exe> [-CreateIfMissing]
#
# The certificate is a self-signed code-signing certificate ("CN=Work Encourager") kept in the
# current user's personal store; only the public part is exported to windows/signing/*.cer so the
# deliverable can ship a trust helper. For real distribution, replace it with a CA-issued
# certificate (OV/EV) and sign with the same command.
param(
    [Parameter(Mandatory = $true)][string[]]$Path,
    [switch]$CreateIfMissing,
    [switch]$TrustCertificate
)

$ErrorActionPreference = 'Stop'

$subject = 'CN=Work Encourager, O=Work Encourager Open Source, C=CN'
$signingDir = Split-Path -Parent $PSScriptRoot
$signingDir = Join-Path $signingDir 'signing'
$cerPath = Join-Path $signingDir 'WorkEncourager-signing.cer'
$timestampServer = 'http://timestamp.digicert.com'

function Get-SigningCertificate {
    Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert -ErrorAction SilentlyContinue |
        Where-Object { $_.Subject -eq $subject } |
        Select-Object -First 1
}

function Trust-Certificate([System.Security.Cryptography.X509Certificates.X509Certificate2]$certificate, [string]$cerFile) {
    $targets = @('Cert:\CurrentUser\TrustedPublisher', 'Cert:\LocalMachine\TrustedPublisher', 'Cert:\LocalMachine\Root')
    foreach ($target in $targets) {
        try {
            Import-Certificate -FilePath $cerFile -CertStoreLocation $target | Out-Null
            Write-Host "  trusted in $target"
        }
        catch {
            Write-Warning "  could not trust in ${target}: $($_.Exception.Message)"
        }
    }
}

$certificate = Get-SigningCertificate
if (-not $certificate) {
    if (-not $CreateIfMissing) {
        throw '找不到代码签名证书。请先运行 windows/tools/sign-app.ps1 -CreateIfMissing，或安装 CA 签发的代码签名证书。'
    }

    Write-Host '创建本地自签名代码签名证书 ...'
    $certificate = New-SelfSignedCertificate -Type CodeSigningCert -Subject $subject -HashAlgorithm SHA256 `
        -KeyLength 2048 -KeyUsage DigitalSignature -NotAfter (Get-Date).AddYears(5) `
        -CertStoreLocation Cert:\CurrentUser\My
    New-Item -ItemType Directory -Force -Path $signingDir | Out-Null
    Export-Certificate -Cert $certificate -FilePath $cerPath -Type CERT | Out-Null
    Write-Host "  已导出公钥证书：$cerPath"
    Trust-Certificate $certificate $cerPath
}
elseif ($TrustCertificate) {
    if (-not (Test-Path $cerPath)) {
        New-Item -ItemType Directory -Force -Path $signingDir | Out-Null
        Export-Certificate -Cert $certificate -FilePath $cerPath -Type CERT | Out-Null
    }
    Trust-Certificate $certificate $cerPath
}

Write-Host "签名证书：$($certificate.Subject) ($($certificate.Thumbprint))"

foreach ($file in $Path) {
    if (-not (Test-Path -LiteralPath $file)) {
        throw "找不到要签名的文件：$file"
    }

    $resolved = (Resolve-Path -LiteralPath $file).Path
    Write-Host "签名 $resolved ..."
    try {
        $result = Set-AuthenticodeSignature -FilePath $resolved -Certificate $certificate -HashAlgorithm SHA256 -TimestampServer $timestampServer
    }
    catch {
        Write-Warning "  时间戳签名失败，改为不时间戳签名：$($_.Exception.Message)"
        $result = Set-AuthenticodeSignature -FilePath $resolved -Certificate $certificate -HashAlgorithm SHA256
    }

    $check = Get-AuthenticodeSignature -FilePath $resolved
    $stamper = if ($check.TimeStamperCertificate) { $check.TimeStamperCertificate.Subject } else { 'no timestamp' }
    if ($check.Status -eq 'Valid') {
        Write-Host "  OK -> $($check.SignerCertificate.Subject) / $stamper"
        continue
    }

    if ($check.Status -in @('UnknownError', 'NotTrusted')) {
        Write-Warning "  已签名，但本机尚未信任该证书（$($check.Status)）。UAC 仍会显示「未知发布者」。"
        Write-Warning '  请以管理员身份运行一次：powershell -ExecutionPolicy Bypass -File windows/tools/sign-app.ps1 -Path <exe> -TrustCertificate'
        continue
    }

    throw "签名校验失败：$resolved -> $($check.Status) $($check.StatusMessage)"
}
