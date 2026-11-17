Add-Type -AssemblyName System.Drawing

$pubImg = "c:\Users\patov\Downloads\encantadas\public\images"
$outViews = "c:\Users\patov\Downloads\encantadas\public\images\views"
New-Item -ItemType Directory -Force -Path $outViews | Out-Null

function Save-CleanView {
    param (
        [System.Drawing.Bitmap]$SrcBmp,
        [int]$X,
        [int]$Y,
        [int]$W,
        [int]$H,
        [string]$OutFile
    )
    $rect = New-Object System.Drawing.Rectangle($X, $Y, $W, $H)
    $crop = $SrcBmp.Clone($rect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

    # Normaliza o fundo branco de estúdio para #FFFFFF puro para fundir perfeitamente no canvas branco
    for ($py = 0; $py -lt $H; $py++) {
        for ($px = 0; $px -lt $W; $px++) {
            $c = $crop.GetPixel($px, $py)
            $r = [int]$c.R; $gr = [int]$c.G; $b = [int]$c.B
            $minC = [Math]::Min($r, [Math]::Min($gr, $b))
            if ($minC -gt 242) {
                $crop.SetPixel($px, $py, [System.Drawing.Color]::FromArgb(255, 255, 255, 255))
            }
        }
    }
    $crop.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $crop.Dispose()
}

# ==============================================================================
# 1. IMPERIAL LEÃO (sheet-imperial-leao.jpg: 1024 x 682) — 6 Vistas + 4 Closes
# ==============================================================================
$s1 = [System.Drawing.Bitmap]::FromFile("$pubImg\sheet-imperial-leao.jpg")

# Linha 1: Frontal (Esq) e Traseira (Dir) — sem legendas (Y=12..164)
Save-CleanView -SrcBmp $s1 -X 24  -Y 12  -W 482 -H 152 -OutFile "$outViews\m01-front.png"
Save-CleanView -SrcBmp $s1 -X 520 -Y 12  -W 480 -H 184 -OutFile "$outViews\m01-back.png"

# Linha 2: Lateral Esquerda (Esq) e Lateral Direita (Dir) — sem legendas (Y=188..318)
Save-CleanView -SrcBmp $s1 -X 36  -Y 188 -W 450 -H 130 -OutFile "$outViews\m01-side-left.png"
Save-CleanView -SrcBmp $s1 -X 536 -Y 188 -W 450 -H 130 -OutFile "$outViews\m01-side-right.png"

# Linha 3: Superior (Esq) e Inferior 3/4 (Dir) — sem legendas (Y=342..494)
Save-CleanView -SrcBmp $s1 -X 46  -Y 342 -W 440 -H 152 -OutFile "$outViews\m01-top.png"
Save-CleanView -SrcBmp $s1 -X 532 -Y 362 -W 444 -H 132 -OutFile "$outViews\m01-bottom.png"

$s1.Dispose()
Write-Output "[OK] 6 vistas do Imperial Leão salvas."

# ==============================================================================
# 2. TRIO DE MODELOS (sheet-trio-modelos.jpg: 1024 x 682) — 5 Vistas p/ cada um
# Colunas em X:
#   Col 1 (Frontal):     X = 6,   W = 240
#   Col 2 (Ângulo 3/4):  X = 248, W = 224
#   Col 3 (Lateral):     X = 472, W = 166
#   Col 4 (Superior):    X = 638, W = 174
#   Col 5 (Traseira):    X = 812, W = 206
# ==============================================================================
$s2 = [System.Drawing.Bitmap]::FromFile("$pubImg\sheet-trio-modelos.jpg")

# Modelo 02 — Navigator Âmbar (Linha 1: Y = 56..218)
Save-CleanView -SrcBmp $s2 -X 6   -Y 56 -W 240 -H 162 -OutFile "$outViews\m02-front.png"
Save-CleanView -SrcBmp $s2 -X 248 -Y 56 -W 224 -H 162 -OutFile "$outViews\m02-angle.png"
Save-CleanView -SrcBmp $s2 -X 472 -Y 56 -W 166 -H 162 -OutFile "$outViews\m02-side.png"
Save-CleanView -SrcBmp $s2 -X 638 -Y 56 -W 174 -H 162 -OutFile "$outViews\m02-top.png"
Save-CleanView -SrcBmp $s2 -X 812 -Y 56 -W 206 -H 162 -OutFile "$outViews\m02-back.png"

# Modelo 03 — Pantera Rimless (Linha 2: Y = 264..426)
Save-CleanView -SrcBmp $s2 -X 6   -Y 264 -W 240 -H 162 -OutFile "$outViews\m03-front.png"
Save-CleanView -SrcBmp $s2 -X 248 -Y 264 -W 224 -H 162 -OutFile "$outViews\m03-angle.png"
Save-CleanView -SrcBmp $s2 -X 472 -Y 264 -W 166 -H 162 -OutFile "$outViews\m03-side.png"
Save-CleanView -SrcBmp $s2 -X 638 -Y 264 -W 174 -H 162 -OutFile "$outViews\m03-top.png"
Save-CleanView -SrcBmp $s2 -X 812 -Y 264 -W 206 -H 162 -OutFile "$outViews\m03-back.png"

# Modelo 04 — Bold Tartaruga (Linha 3: Y = 468..636)
Save-CleanView -SrcBmp $s2 -X 6   -Y 468 -W 240 -H 168 -OutFile "$outViews\m04-front.png"
Save-CleanView -SrcBmp $s2 -X 248 -Y 468 -W 224 -H 168 -OutFile "$outViews\m04-angle.png"
Save-CleanView -SrcBmp $s2 -X 472 -Y 468 -W 166 -H 168 -OutFile "$outViews\m04-side.png"
Save-CleanView -SrcBmp $s2 -X 638 -Y 468 -W 174 -H 168 -OutFile "$outViews\m04-top.png"
Save-CleanView -SrcBmp $s2 -X 812 -Y 468 -W 206 -H 168 -OutFile "$outViews\m04-back.png"

$s2.Dispose()
Write-Output "[OK] Todas as 15 vistas do Trio de Modelos salvas."
