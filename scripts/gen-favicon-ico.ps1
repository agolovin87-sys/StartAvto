Add-Type -AssemblyName System.Drawing
$size = 32
$bmp = New-Object System.Drawing.Bitmap $size, $size
for ($y = 0; $y -lt $size; $y++) {
  for ($x = 0; $x -lt $size; $x++) {
    $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, 15, 23, 42))
  }
}
$projectRoot = Split-Path -Parent $PSScriptRoot
$publicDir = Join-Path $projectRoot "public"
if (-not (Test-Path $publicDir)) { New-Item -ItemType Directory -Path $publicDir | Out-Null }
$path = Join-Path $publicDir "favicon.ico"
$ico = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
$fs = [System.IO.File]::Create($path)
$ico.Save($fs)
$fs.Close()
$ico.Dispose()
$bmp.Dispose()
Write-Host "Wrote $path"
