param([string]$OutDir, [string]$StoreDir)
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

function New-RoundRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function Color([string]$hex, [int]$a = 255) {
  $c = [System.Drawing.ColorTranslator]::FromHtml($hex)
  return [System.Drawing.Color]::FromArgb($a, $c.R, $c.G, $c.B)
}

# Ikonun kendisini (S x S) verilen grafik uzerine ciz
function Draw-Icon($g, [float]$ox, [float]$oy, [float]$S, [bool]$simple) {
  $g.SmoothingMode = 'AntiAlias'
  $bg = New-RoundRect $ox $oy $S $S ($S * 0.22)
  $rect = New-Object System.Drawing.RectangleF($ox, $oy, $S, $S)
  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, (Color '#1e1b3a'), (Color '#0b0d14'), 60)
  $g.FillPath($bgBrush, $bg)

  # Ucgen koseleri
  $cx = $ox + $S / 2
  $top = New-Object System.Drawing.PointF($cx, ($oy + $S * 0.20))
  $bl  = New-Object System.Drawing.PointF(($ox + $S * 0.17), ($oy + $S * 0.78))
  $br  = New-Object System.Drawing.PointF(($ox + $S * 0.83), ($oy + $S * 0.78))
  $ml  = New-Object System.Drawing.PointF((($top.X + $bl.X) / 2), (($top.Y + $bl.Y) / 2))
  $mr  = New-Object System.Drawing.PointF((($top.X + $br.X) / 2), (($top.Y + $br.Y) / 2))
  $mb  = New-Object System.Drawing.PointF((($bl.X + $br.X) / 2), (($bl.Y + $br.Y) / 2))

  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.RectangleF($bl.X, $top.Y, ($br.X - $bl.X), ($bl.Y - $top.Y))), (Color '#34d399'), (Color '#8b5cf6'), 45)
  $blend = New-Object System.Drawing.Drawing2D.ColorBlend(3)
  $blend.Colors = @((Color '#34d399'), (Color '#8b5cf6'), (Color '#ec4899'))
  $blend.Positions = @(0.0, 0.55, 1.0)
  $grad.InterpolationColors = $blend

  # Hafif dolgu
  $tri = New-Object System.Drawing.Drawing2D.GraphicsPath
  $tri.AddPolygon(@($top, $br, $bl))
  $fill = New-Object System.Drawing.SolidBrush((Color '#8b5cf6' 40))
  $g.FillPath($fill, $tri)

  # Parlama (glow) + ana cizgiler
  $w = [Math]::Max(1.2, $S * 0.055)
  $glow = New-Object System.Drawing.Pen((Color '#a78bfa' 60), ($w * 2.6))
  $glow.LineJoin = 'Round'
  $g.DrawPath($glow, $tri)
  $pen = New-Object System.Drawing.Pen($grad, $w)
  $pen.LineJoin = 'Round'
  $g.DrawPath($pen, $tri)

  if (-not $simple) {
    # Ic mesh (4 kucuk ucgen)
    $inner = New-Object System.Drawing.Pen($grad, ($w * 0.6))
    $g.DrawPolygon($inner, @($ml, $mr, $mb))
    # Koseler (vertex noktalari)
    $r = $S * 0.045
    foreach ($p in @($top, $bl, $br, $ml, $mr, $mb)) {
      $g.FillEllipse((New-Object System.Drawing.SolidBrush((Color '#ffffff' 70))), ($p.X - $r * 1.9), ($p.Y - $r * 1.9), ($r * 3.8), ($r * 3.8))
      $g.FillEllipse((New-Object System.Drawing.SolidBrush((Color '#ffffff'))), ($p.X - $r), ($p.Y - $r), ($r * 2), ($r * 2))
    }
  }
}

function Save-Icon([int]$size, [string]$path) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Transparent)
  Draw-Icon $g 0 0 $size ($size -lt 32)
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

New-Item -ItemType Directory -Force $OutDir | Out-Null
foreach ($s in 16, 32, 48, 128) { Save-Icon $s (Join-Path $OutDir "icon$s.png") }

# ---- Magaza gorselleri ----
New-Item -ItemType Directory -Force $StoreDir | Out-Null

function Save-Promo([int]$W, [int]$H, [string]$path) {
  $bmp = New-Object System.Drawing.Bitmap($W, $H)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  $bgRect = New-Object System.Drawing.RectangleF(0, 0, $W, $H)
  $g.FillRectangle((New-Object System.Drawing.Drawing2D.LinearGradientBrush($bgRect, (Color '#1e1b3a'), (Color '#07080d'), 30)), $bgRect)

  $iconS = $H * 0.42
  $ix = $W * 0.08
  $iy = ($H - $iconS) / 2
  Draw-Icon $g $ix $iy $iconS $false

  $tx = $ix + $iconS + $W * 0.05
  $titleFont = New-Object System.Drawing.Font('Segoe UI', ($H * 0.15), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $subFont = New-Object System.Drawing.Font('Segoe UI', ($H * 0.062), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $g.DrawString('PolyPeek', $titleFont, [System.Drawing.Brushes]::White, $tx, ($H * 0.30))
  $g.DrawString("Triangle count & AI filter`nfor Sketchfab", $subFont, (New-Object System.Drawing.SolidBrush((Color '#c4b5fd'))), ($tx + $H * 0.01), ($H * 0.52))
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

Save-Promo 440 280 (Join-Path $StoreDir 'promo-small-440x280.png')
Save-Promo 1400 560 (Join-Path $StoreDir 'promo-marquee-1400x560.png')
Save-Icon 128 (Join-Path $StoreDir 'store-icon-128.png')
'done'
