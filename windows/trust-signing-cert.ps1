# Trust the bundled local code-signing certificate so Windows shows a verified publisher
# instead of "未知发布者" / "Unknown publisher" in the UAC prompt and file properties.
#
# Run this once, as administrator:
#   powershell -ExecutionPolicy Bypass -File trust-signing-cert.ps1
#
# It imports WorkEncourager-signing.cer into the machine-wide Trusted Root and Trusted
# Publisher stores. Remove it later with:
#   Get-ChildItem Cert:\LocalMachine\Root, Cert:\LocalMachine\TrustedPublisher |
#     Where-Object { $_.Subject -like 'CN=Work Encourager*' } | Remove-Item
param(
    [string]$CertificatePath = (Join-Path $PSScriptRoot 'WorkEncourager-signing.cer')
)

$ErrorActionPreference = 'Stop'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host '需要管理员权限：请右键「以管理员身份运行」 PowerShell 后再执行本脚本。'
    exit 1
}

if (-not (Test-Path -LiteralPath $CertificatePath)) {
    throw "找不到证书文件：$CertificatePath。请把本脚本与 WorkEncourager-signing.cer 放在同一目录。"
}

$certificate = Get-PfxCertificate -FilePath $CertificatePath
Write-Host "即将信任证书：$($certificate.Subject)"
Write-Host "  指纹：$($certificate.Thumbprint)"

foreach ($store in @('Cert:\LocalMachine\Root', 'Cert:\LocalMachine\TrustedPublisher')) {
    Import-Certificate -FilePath $CertificatePath -CertStoreLocation $store | Out-Null
    Write-Host "  已导入 $store"
}

Write-Host ''
Write-Host '完成。再次启动 WorkEncourager.exe 时，UAC 会显示「已验证的发布者：Work Encourager」。'