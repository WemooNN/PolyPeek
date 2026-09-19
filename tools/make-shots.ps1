param([string]$In, [string]$Out)
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

function Color([string]$hex, [int]$a = 255) {
  $c = [System.Drawing.ColorTranslator]::FromHtml($hex)
  [System.Drawing.Color]::FromArgb($a, $c.R, $c.G, $c.B)
}
function RR([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = [Math]::Min($r * 2, [Math]::Min($w, $h))
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  $p
}
function Font([float]$px, [bool]$bold) {
  $style = if ($bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
  New-Object System.Drawing.Font('Segoe UI', $px, $style, [System.Drawing.GraphicsUnit]::Pixel)
}

# Etiket (pill): gradyan dolgu, beyaz yazi
function Draw-Pill($g, [string]$text, [float]$x, [float]$y) {
  $f = Font 17 $true
  $sz = $g.MeasureString($text, $f)
  $w = $sz.Width + 26; $h = 36
  $path = RR $x $y $w $h 18
  $rect = New-Object System.Drawing.RectangleF($x, $y, $w, $h)
  $g.FillPath((New-Object System.Drawing.SolidBrush((Color '#000000' 90))), (RR ($x + 2) ($y + 4) $w $h 18))
  $g.FillPath((New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, (Color '#8b5cf6'), (Color '#ec4899'), 0)), $path)
  $g.DrawString($text, $f, [System.Drawing.Brushes]::White, ($x + 13), ($y + 7))
  return $w
}

function Make-Shot([string]$src, [string]$dst, [string]$title, [string]$sub, $boxes, $pills, [bool]$legend) {
  $W = 1280; $H = 800
  $bmp = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'; $g.TextRenderingHint = 'AntiAliasGridFit'

  # Arka plan
  $full = New-Object System.Drawing.RectangleF(0, 0, $W, $H)
  $g.FillRectangle((New-Object System.Drawing.Drawing2D.LinearGradientBrush($full, (Color '#1e1b3a'), (Color '#07080d'), 70)), $full)

  # Baslik
  $g.DrawString($title, (Font 40 $true), [System.Drawing.Brushes]::White, 60, 26)
  $g.DrawString($sub, (Font 20 $false), (New-Object System.Drawing.SolidBrush((Color '#c4b5fd'))), 63, 84)

  if ($legend) {
    $items = @(@('#34d399', '< 100k'), @('#facc15', '< 500k'), @('#fb923c', '< 1M'), @('#f43f5e', '1M +'))
    $lx = 820; $ly = 44; $lf = Font 17 $true
    foreach ($it in $items) {
      $c = Color $it[0]
      $tri = @((New-Object System.Drawing.PointF(($lx + 8), $ly)), (New-Object System.Drawing.PointF(($lx + 16), ($ly + 14))), (New-Object System.Drawing.PointF($lx, ($ly + 14))))
      $g.FillPolygon((New-Object System.Drawing.SolidBrush($c)), $tri)
      $g.DrawString($it[1], $lf, [System.Drawing.Brushes]::White, ($lx + 20), ($ly - 5))
      $lx += 26 + $g.MeasureString($it[1], $lf).Width + 18
    }
  }

  # Ekran goruntusu: 1280x800 -> olcekli, ortali
  $s = 0.8; $sw = 1280 * $s; $sh = 800 * $s
  $ox = ($W - $sw) / 2; $oy = $H - $sh - 20
  $img = [System.Drawing.Image]::FromFile($src)
  $frame = RR $ox $oy $sw $sh 14
  $g.FillPath((New-Object System.Drawing.SolidBrush((Color '#000000' 120))), (RR ($ox + 4) ($oy + 10) $sw $sh 14))
  $g.SetClip($frame)
  $g.DrawImage($img, $ox, $oy, $sw, $sh)

  # Spot isigi: vurgulanan yerler disini karart
  $dim = New-Object System.Drawing.Region($frame)
  $holes = @()
  foreach ($b in $boxes) {
    $hx = $ox + $b[0] * $s - 6; $hy = $oy + $b[1] * $s - 6
    $hw = ($b[2] - $b[0]) * $s + 12; $hh = ($b[3] - $b[1]) * $s + 12
    $hp = RR $hx $hy $hw $hh 10
    $dim.Exclude($hp); $holes += , $hp
  }
  $g.FillRegion((New-Object System.Drawing.SolidBrush((Color '#05060a' 115))), $dim)
  $g.ResetClip()
  $g.DrawPath((New-Object System.Drawing.Pen((Color '#ffffff' 30), 1)), $frame)

  # Vurgu cerceveleri
  foreach ($hp in $holes) {
    $b = $hp.GetBounds()
    $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush($b, (Color '#a78bfa'), (Color '#ec4899'), 0)
    $g.DrawPath((New-Object System.Drawing.Pen((Color '#a78bfa' 70), 9)), $hp)
    $g.DrawPath((New-Object System.Drawing.Pen($grad, 3)), $hp)
  }

  # Etiketler (ekran koordinatinda)
  foreach ($p in $pills) { [void](Draw-Pill $g $p[0] $p[1] $p[2]) }

  $img.Dispose(); $g.Dispose()
  $bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
}

# --- Gorsel 1: ucgen rozetleri ---
Make-Shot (Join-Path $In 'shot8.png') (Join-Path $Out 'screenshot-1-triangles.png') `
  'Triangle count on every model' `
  'Know how heavy a model is before you open it — color-coded by triangle count' `
  @(@(52, 25, 121, 49), @(724, 271, 793, 296), @(724, 517, 793, 542)) `
  @(@('Triangle count', 245, 151), @('1.9M triangles', 780, 348), @('11M triangles - very heavy!', 780, 545)) $true

# --- Gorsel 2: siralama + Hide AI ---
Make-Shot (Join-Path $In 'shot9.png') (Join-Path $Out 'screenshot-2-sort-hide-ai.png') `
  'Sort by triangles. Hide AI models.' `
  'New options added right into Sketchfab search' `
  @(@(64, 26, 140, 50), @(1106, 208, 1238, 282)) `
  @(@('Hide AI-generated models', 150, 190), @('Sort by triangle count', 895, 395)) $false
# --- Gorsel 3: AI rozeti ---
Make-Shot (Join-Path $In 'shot10.png') (Join-Path $Out 'screenshot-3-ai-badge.png') `
  'Spot AI-generated models' `
  'AI-made models get a badge at a glance - or hide them all with one click' `
  @(@(96, 20, 147, 44), @(769, 266, 820, 290), @(1105, 513, 1156, 537)) `
  @(@('AI-generated model', 255, 151), @('Instantly recognizable', 793, 348), @('AI badge', 1000, 590)) $false
'done'


