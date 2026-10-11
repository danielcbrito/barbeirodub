Add-Type -AssemblyName System.Drawing
$srcPath = Join-Path $PSScriptRoot "..\favicon.png"
$src = [System.Drawing.Bitmap]::FromFile((Resolve-Path $srcPath))
$w = $src.Width
$h = $src.Height

# Find bounding box of dark pixels
$minX = $w; $maxX = 0; $minY = $h; $maxY = 0
for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
        $c = $src.GetPixel($x, $y)
        if ($c.R -lt 150) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}
Write-Output "Bounds: minX=$minX, maxX=$maxX, minY=$minY, maxY=$maxY"
$bw = $maxX - $minX + 1
$bh = $maxY - $minY + 1

$dest = New-Object System.Drawing.Bitmap $bw, $bh, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
for ($y = 0; $y -lt $bh; $y++) {
    for ($x = 0; $x -lt $bw; $x++) {
        $c = $src.GetPixel($minX + $x, $minY + $y)
        $darkness = 255 - $c.R
        if ($darkness -gt 15) {
            $dest.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($darkness, 18, 17, 20))
        } else {
            $dest.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
        }
    }
}
$src.Dispose()
$outPath = Join-Path $PSScriptRoot "dub_logo_d.png"
$dest.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$dest.Dispose()
Write-Output "Trimmed transparent D created at $outPath!"
