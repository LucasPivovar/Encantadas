Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Drawing.Imaging

$pubImg = "c:\Users\patov\Downloads\encantadas\public\images"
$outAnna = "$pubImg\anna"
New-Item -ItemType Directory -Force -Path $outAnna | Out-Null

function Save-EnhancedPortrait {
    param (
        [System.Drawing.Bitmap]$SrcBmp,
        [int]$X,
        [int]$Y,
        [int]$W,
        [int]$H,
        [int]$ScaleFactor,
        [string]$OutPath
    )

    $rect = New-Object System.Drawing.Rectangle($X, $Y, $W, $H)
    $crop = $SrcBmp.Clone($rect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

    $newW = $W * $ScaleFactor
    $newH = $H * $ScaleFactor

    # 1. Upscale Bicúbico de Alta Qualidade
    $upscaled = New-Object System.Drawing.Bitmap($newW, $newH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($upscaled)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    # Matriz de cor sutil para enriquecer contraste e nitidez tonal (+6% contraste)
    $cMatrix = New-Object System.Drawing.Imaging.ColorMatrix
    $cMatrix.Matrix00 = 1.06; $cMatrix.Matrix11 = 1.06; $cMatrix.Matrix22 = 1.06
    $cMatrix.Matrix40 = -0.02; $cMatrix.Matrix41 = -0.02; $cMatrix.Matrix42 = -0.02

    $imgAttr = New-Object System.Drawing.Imaging.ImageAttributes
    $imgAttr.SetColorMatrix($cMatrix)

    $destRect = New-Object System.Drawing.Rectangle(0, 0, $newW, $newH)
    $g.DrawImage($crop, $destRect, 0, 0, $W, $H, [System.Drawing.GraphicsUnit]::Pixel, $imgAttr)
    $g.Dispose()
    $crop.Dispose()
    $imgAttr.Dispose()

    # Salva JPEG com Qualidade 98% (zero artefatos de compressão)
    $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]98)

    $upscaled.Save($OutPath, $jpegCodec, $encParams)
    $upscaled.Dispose()
    Write-Output "[OK] Salvo com qualidade aprimorada ($newW x $newH): $OutPath"
}

# 1. Foto Hero Principal (anna-pantera-portrait.jpg: 576x1024 -> recorte limpo 568x868 sem barras cinzas)
$srcHero = [System.Drawing.Bitmap]::FromFile("$pubImg\anna-pantera-portrait.jpg")
Save-EnhancedPortrait -SrcBmp $srcHero -X 4 -Y 78 -W 568 -H 868 -ScaleFactor 2 -OutPath "$outAnna\anna-01-hero-pantera.jpg"
$srcHero.Dispose()

# 2. Os 4 quadros individuais de anna-pantera-grid.jpg (576x1024 -> centro divisor em X=288, Y=512)
# Removemos 6px de margem ao redor das linhas divisórias para zero vestígio de print!
$srcG1 = [System.Drawing.Bitmap]::FromFile("$pubImg\anna-pantera-grid.jpg")
Save-EnhancedPortrait -SrcBmp $srcG1 -X 4   -Y 6   -W 278 -H 498 -ScaleFactor 2 -OutPath "$outAnna\anna-02-pantera-pose.jpg"
Save-EnhancedPortrait -SrcBmp $srcG1 -X 294 -Y 6   -W 278 -H 498 -ScaleFactor 2 -OutPath "$outAnna\anna-03-pantera-perfil.jpg"
Save-EnhancedPortrait -SrcBmp $srcG1 -X 4   -Y 520 -W 278 -H 498 -ScaleFactor 2 -OutPath "$outAnna\anna-04-pantera-close.jpg"
Save-EnhancedPortrait -SrcBmp $srcG1 -X 294 -Y 520 -W 278 -H 498 -ScaleFactor 2 -OutPath "$outAnna\anna-05-pantera-frente.jpg"
$srcG1.Dispose()

# 3. Os 4 quadros individuais de anna-ambar-bold-grid.jpg (576x1024 -> centro divisor em X=288, Y=512)
$srcG2 = [System.Drawing.Bitmap]::FromFile("$pubImg\anna-ambar-bold-grid.jpg")
Save-EnhancedPortrait -SrcBmp $srcG2 -X 4   -Y 6   -W 278 -H 498 -ScaleFactor 2 -OutPath "$outAnna\anna-06-ambar-low.jpg"
Save-EnhancedPortrait -SrcBmp $srcG2 -X 294 -Y 6   -W 278 -H 498 -ScaleFactor 2 -OutPath "$outAnna\anna-07-ambar-frente.jpg"
Save-EnhancedPortrait -SrcBmp $srcG2 -X 4   -Y 520 -W 278 -H 498 -ScaleFactor 2 -OutPath "$outAnna\anna-08-bold-maos.jpg"
Save-EnhancedPortrait -SrcBmp $srcG2 -X 294 -Y 520 -W 278 -H 498 -ScaleFactor 2 -OutPath "$outAnna\anna-09-bold-pose.jpg"
$srcG2.Dispose()
