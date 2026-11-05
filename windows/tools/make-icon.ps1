# Build a multi-resolution Windows .ico from a PNG (no external tools required).
# Usage:
#   powershell -ExecutionPolicy Bypass -File windows/tools/make-icon.ps1 -Source assets/icon.png -Output windows/WorkEncourager/Assets/app.ico
#   powershell -ExecutionPolicy Bypass -File windows/tools/make-icon.ps1 -Source assets/icon.png -Output windows/WorkEncourager/Assets/app-masked.ico -Grayscale
param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Output,
    [switch]$Grayscale
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

# Windows tray icons are requested at 16/20/24/32/40/48 px depending on DPI scaling,
# the taskbar/Explorer uses up to 256 px. Ship every common size.
$sizes = @(16, 20, 24, 32, 40, 48, 64, 96, 128, 256)

$sourceImage = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $Source).Path)
try {
    $payloads = New-Object System.Collections.ArrayList
    foreach ($size in $sizes) {
        $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
            $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            if ($Grayscale) {
                $matrix = New-Object System.Drawing.Imaging.ColorMatrix
                $matrix.Matrix00 = 0.299
                $matrix.Matrix01 = 0.299
                $matrix.Matrix02 = 0.299
                $matrix.Matrix10 = 0.587
                $matrix.Matrix11 = 0.587
                $matrix.Matrix12 = 0.587
                $matrix.Matrix20 = 0.114
                $matrix.Matrix21 = 0.114
                $matrix.Matrix22 = 0.114
                $matrix.Matrix33 = 1.0
                $matrix.Matrix44 = 1.0
                $attributes = New-Object System.Drawing.Imaging.ImageAttributes
                $attributes.SetColorMatrix($matrix)
                $rectangle = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
                $graphics.DrawImage($sourceImage, $rectangle, 0, 0, $sourceImage.Width, $sourceImage.Height, [System.Drawing.GraphicsUnit]::Pixel, $attributes)
                $attributes.Dispose()
            }
            else {
                $graphics.DrawImage($sourceImage, 0, 0, $size, $size)
            }
        }
        finally {
            $graphics.Dispose()
        }

        $stream = New-Object System.IO.MemoryStream
        $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        $bitmap.Dispose()
        [void]$payloads.Add($stream.ToArray())
        $stream.Dispose()
    }
}
finally {
    $sourceImage.Dispose()
}

$buffer = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter($buffer)
try {
    # ICONDIR
    $writer.Write([uint16]0)                 # reserved
    $writer.Write([uint16]1)                 # type: icon
    $writer.Write([uint16]$sizes.Count)      # image count

    # ICONDIRENTRY table: 16 bytes per image
    $offset = 6 + 16 * $sizes.Count
    for ($index = 0; $index -lt $sizes.Count; $index++) {
        $size = $sizes[$index]
        $payload = $payloads[$index]
        $dimension = if ($size -ge 256) { 0 } else { $size }
        $writer.Write([byte]$dimension)
        $writer.Write([byte]$dimension)
        $writer.Write([byte]0)               # color palette entries
        $writer.Write([byte]0)               # reserved
        $writer.Write([uint16]1)             # color planes
        $writer.Write([uint16]32)            # bits per pixel
        $writer.Write([uint32]$payload.Length)
        $writer.Write([uint32]$offset)
        $offset += $payload.Length
    }

    foreach ($payload in $payloads) {
        $writer.Write($payload)
    }
    $writer.Flush()

    $outputPath = [System.IO.Path]::GetFullPath($Output)
    $outputDirectory = [System.IO.Path]::GetDirectoryName($outputPath)
    if (-not (Test-Path -LiteralPath $outputDirectory)) {
        New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
    }
    [System.IO.File]::WriteAllBytes($outputPath, $buffer.ToArray())
    Write-Host ("Wrote {0} ({1} sizes, {2} bytes)" -f $outputPath, $sizes.Count, $buffer.Length)
}
finally {
    $writer.Dispose()
    $buffer.Dispose()
}
