# Генерирует PNG для PWA из public/app-icon-source.png (квадратный мастер, рекомендуется 1024+).
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$pub = Join-Path $root "public"
$srcPath = Join-Path $pub "app-icon-source.png"
if (-not (Test-Path $srcPath)) { throw "Not found: $srcPath (положите мастер-иконку сюда)" }

function New-SquarePng {
  param(
    [string]$SourcePath,
    [string]$OutPath,
    [int]$Size,
    [double]$ContentScale
  )
  $src = [System.Drawing.Image]::FromFile($SourcePath)
  try {
    $bmp = New-Object System.Drawing.Bitmap $Size, $Size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
      $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $bg = [System.Drawing.Color]::FromArgb(255, 15, 23, 42)
      $g.Clear($bg)
      $fit = [Math]::Min($Size / $src.Width, $Size / $src.Height) * $ContentScale
      $w = [int][Math]::Round($src.Width * $fit)
      $h = [int][Math]::Round($src.Height * $fit)
      $x = [int][Math]::Round(($Size - $w) / 2.0)
      $y = [int][Math]::Round(($Size - $h) / 2.0)
      $g.DrawImage($src, $x, $y, $w, $h)
    } finally { $g.Dispose() }
    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
  } finally { $src.Dispose() }
}

New-SquarePng -SourcePath $srcPath -OutPath (Join-Path $pub "apple-touch-icon.png") -Size 180 -ContentScale 0.92
New-SquarePng -SourcePath $srcPath -OutPath (Join-Path $pub "app-icon-192.png") -Size 192 -ContentScale 0.92
New-SquarePng -SourcePath $srcPath -OutPath (Join-Path $pub "app-icon-v6.png") -Size 512 -ContentScale 0.92
New-SquarePng -SourcePath $srcPath -OutPath (Join-Path $pub "app-icon-maskable-512.png") -Size 512 -ContentScale 0.62

Write-Host "OK: apple-touch-icon.png, app-icon-192.png, app-icon-v6.png, app-icon-maskable-512.png"
