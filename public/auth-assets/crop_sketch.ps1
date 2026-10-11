Add-Type -AssemblyName System.Drawing
$srcPath = Join-Path $PSScriptRoot "barber_crew_sketch.png"
$src = [System.Drawing.Bitmap]::FromFile((Resolve-Path $srcPath))
$w = $src.Width
$h = $src.Height
$minX = $w; $maxX = 0; $minY = $h; $maxY = 0
for ($y = 0; $y -lt $h; $y += 2) {
    for ($x = 0; $x -lt $w; $x += 2) {
        $c = $src.GetPixel($x, $y)
        # Check non-white / line pixels
        if ($c.A -gt 20 -and ($c.R -lt 230 -or $c.G -lt 230 -or $c.B -lt 230)) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}
Write-Output "Barbers: w=$w, h=$h, minX=$minX, maxX=$maxX, minY=$minY, maxY=$maxY"
# Crop tightly so it goes edge-to-edge
$bw = $maxX - $minX + 1
$bh = $maxY - $minY + 1
$dest = New-Object System.Drawing.Bitmap $bw, $bh, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
for ($y = 0; $y -lt $bh; $y++) {
    for ($x = 0; $x -lt $bw; $x++) {
        $c = $src.GetPixel($minX + $x, $minY + $y)
        $dest.SetPixel($x, $y, $c)
    }
}
$src.Dispose()
$outPath = Join-Path $PSScriptRoot "barber_crew_edge.png"
$dest.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$dest.Dispose()
Write-Output "Tight edge-to-edge barber sketch saved to $outPath!"
