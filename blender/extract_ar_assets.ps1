Add-Type -AssemblyName System.Drawing

$pubImg = "c:\Users\patov\Downloads\encantadas\public\images"
$outAr = "c:\Users\patov\Downloads\encantadas\public\images\ar"
New-Item -ItemType Directory -Force -Path $outAr | Out-Null

function Extract-Crop {
    param (
        [string]$SrcPath,
        [int]$X,
        [int]$Y,
        [int]$W,
        [int]$H,
        [string]$OutStudioWhitePath,
        [string]$OutTransparentArPath
    )

    $src = [System.Drawing.Bitmap]::FromFile($SrcPath)
    $rect = New-Object System.Drawing.Rectangle($X, $Y, $W, $H)
    $crop = $src.Clone($rect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $src.Dispose()

    # 1. Salva a versão de estúdio limpa (fundo branco impecável, sem textos/legendas)
    $studioBmp = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($studioBmp)
    $g.Clear([System.Drawing.Color]::White)
    $g.DrawImage($crop, 0, 0, $W, $H)
    $g.Dispose()
    $studioBmp.Save($OutStudioWhitePath, [System.Drawing.Imaging.ImageFormat]::Png)
    $studioBmp.Dispose()

    # 2. Cria o PNG Transparente para Realidade Aumentada (AR Try-On)
    # Remove o fundo branco de estúdio e preserva a translucidez real das lentes
    for ($py = 0; $py -lt $H; $py++) {
        for ($px = 0; $px -lt $W; $px++) {
            $c = $crop.GetPixel($px, $py)
            $r = [double]$c.R
            $gr = [double]$c.G
            $b = [double]$c.B

            # Luminância e saturação do pixel
            $maxC = [Math]::Max($r, [Math]::Max($gr, $b))
            $minC = [Math]::Min($r, [Math]::Min($gr, $b))
            $chroma = $maxC - $minC
            $lum = ($r * 0.299 + $gr * 0.587 + $b * 0.114)

            # Fundo branco puro ou sombra muito clara de estúdio na borda inferior
            if ($lum -gt 244 -and $chroma -lt 14) {
                $crop.SetPixel($px, $py, [System.Drawing.Color]::FromArgb(0, 255, 255, 255))
            }
            elseif ($lum -gt 225 -and $chroma -lt 18) {
                # Suavização anti-aliasing na borda externa do óculos
                $alpha = [int]([Math]::Max(0, [Math]::Min(255, (244.0 - $lum) / 19.0 * 255.0)))
                $crop.SetPixel($px, $py, [System.Drawing.Color]::FromArgb($alpha, [int]$r, [int]$gr, [int]$b))
            }
            else {
                # Se for lente colorida/degradê translúcida (tons quentes âmbar/marrom/chá claros),
                # calcula o alpha óptico realista para deixar ver os olhos da pessoa através da lente!
                if ($lum -gt 85 -and $chroma -gt 16) {
                    # Quanto mais clara a parte do degradê da lente, mais translúcida na câmera
                    $lensAlpha = [int]([Math]::Max(115, [Math]::Min(245, 265.0 - ($lum * 0.62))))
                    $crop.SetPixel($px, $py, [System.Drawing.Color]::FromArgb($lensAlpha, [int]$r, [int]$gr, [int]$b))
                }
                elseif ($lum -gt 185 -and $chroma -le 16) {
                    # Plaqueta nasal de silicone transparente ou parte muito suave do degradê inferior
                    $padAlpha = [int]([Math]::Max(40, [Math]::Min(180, (240.0 - $lum) * 3.0)))
                    $crop.SetPixel($px, $py, [System.Drawing.Color]::FromArgb($padAlpha, [int]$r, [int]$gr, [int]$b))
                }
                else {
                    # Metal dourado 18K, acetato tartaruga/preto e esmalte permanecem 100% sólidos
                    $crop.SetPixel($px, $py, [System.Drawing.Color]::FromArgb(255, [int]$r, [int]$gr, [int]$b))
                }
            }
        }
    }

    $crop.Save($OutTransparentArPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $crop.Dispose()
    Write-Output "[OK] Gerado: $OutTransparentArPath"
}

# 1. Modelo 01 — Imperial Leão Dourado (Vista Frontal de sheet-imperial-leao.jpg: 1024x682)
# O óculos frontal superior esquerdo fica em X=28..505, Y=12..164 (sem o texto "Frontal" em Y=168+)
Extract-Crop -SrcPath "$pubImg\sheet-imperial-leao.jpg" `
    -X 28 -Y 12 -W 478 -H 152 `
    -OutStudioWhitePath "$outAr\studio-01-imperial-leao.png" `
    -OutTransparentArPath "$outAr\ar-01-imperial-leao.png"

# Close-up 3/4 Inferior Direito do Imperial Leão (sem texto) em X=540..970, Y=365..520
Extract-Crop -SrcPath "$pubImg\sheet-imperial-leao.jpg" `
    -X 540 -Y 365 -W 430 -H 150 `
    -OutStudioWhitePath "$outAr\angle-01-imperial-leao.png" `
    -OutTransparentArPath "$outAr\ar-angle-01-imperial-leao.png"

# 2. Modelo 02 — Navigator Preto & Lente Âmbar (Linha 1, Coluna 1 de sheet-trio-modelos.jpg)
Extract-Crop -SrcPath "$pubImg\sheet-trio-modelos.jpg" `
    -X 6 -Y 92 -W 242 -H 118 `
    -OutStudioWhitePath "$outAr\studio-02-navigator-ambar.png" `
    -OutTransparentArPath "$outAr\ar-02-navigator-ambar.png"

# Vista 3/4 (Linha 1, Coluna 2)
Extract-Crop -SrcPath "$pubImg\sheet-trio-modelos.jpg" `
    -X 248 -Y 92 -W 222 -H 122 `
    -OutStudioWhitePath "$outAr\angle-02-navigator-ambar.png" `
    -OutTransparentArPath "$outAr\ar-angle-02-navigator-ambar.png"

# 3. Modelo 03 — Rimless Pantera Dourada (Linha 2, Coluna 1 de sheet-trio-modelos.jpg)
Extract-Crop -SrcPath "$pubImg\sheet-trio-modelos.jpg" `
    -X 4 -Y 305 -W 242 -H 106 `
    -OutStudioWhitePath "$outAr\studio-03-rimless-pantera.png" `
    -OutTransparentArPath "$outAr\ar-03-rimless-pantera.png"

# Vista 3/4 (Linha 2, Coluna 2)
Extract-Crop -SrcPath "$pubImg\sheet-trio-modelos.jpg" `
    -X 246 -Y 298 -W 226 -H 116 `
    -OutStudioWhitePath "$outAr\angle-03-rimless-pantera.png" `
    -OutTransparentArPath "$outAr\ar-angle-03-rimless-pantera.png"

# 4. Modelo 04 — Bold Tartaruga Clássico (Linha 3, Coluna 1 de sheet-trio-modelos.jpg)
Extract-Crop -SrcPath "$pubImg\sheet-trio-modelos.jpg" `
    -X 6 -Y 514 -W 236 -H 98 `
    -OutStudioWhitePath "$outAr\studio-04-bold-tartaruga.png" `
    -OutTransparentArPath "$outAr\ar-04-bold-tartaruga.png"

# Vista 3/4 (Linha 3, Coluna 2)
Extract-Crop -SrcPath "$pubImg\sheet-trio-modelos.jpg" `
    -X 246 -Y 498 -W 226 -H 122 `
    -OutStudioWhitePath "$outAr\angle-04-bold-tartaruga.png" `
    -OutTransparentArPath "$outAr\ar-angle-04-bold-tartaruga.png"

# 5. Também extrai os 4 retratos individuais da Anna (sem as divisórias de colagem 2x2)
$srcGrid1 = [System.Drawing.Bitmap]::FromFile("$pubImg\anna-pantera-grid.jpg")
$c1 = $srcGrid1.Clone((New-Object System.Drawing.Rectangle(0, 0, 286, 510)), $srcGrid1.PixelFormat)
$c1.Save("$outAr\anna-look-pantera-1.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
$c2 = $srcGrid1.Clone((New-Object System.Drawing.Rectangle(290, 514, 286, 510)), $srcGrid1.PixelFormat)
$c2.Save("$outAr\anna-look-pantera-2.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
$c1.Dispose(); $c2.Dispose(); $srcGrid1.Dispose()

$srcGrid2 = [System.Drawing.Bitmap]::FromFile("$pubImg\anna-ambar-bold-grid.jpg")
$c3 = $srcGrid2.Clone((New-Object System.Drawing.Rectangle(290, 0, 286, 510)), $srcGrid2.PixelFormat)
$c3.Save("$outAr\anna-look-ambar.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
$c4 = $srcGrid2.Clone((New-Object System.Drawing.Rectangle(0, 514, 286, 510)), $srcGrid2.PixelFormat)
$c4.Save("$outAr\anna-look-bold.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
$c3.Dispose(); $c4.Dispose(); $srcGrid2.Dispose()
Write-Output "[OK] Retratos individuais da Anna extraídos."
