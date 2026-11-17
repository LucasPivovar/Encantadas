param(
  [string]$Src,
  [string]$Out,
  [double]$CropX, [double]$CropY, [double]$CropW, [double]$CropH
)

Add-Type -AssemblyName System.Drawing
if (-not ("FrameKeyer" -as [type])) {
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class FrameKeyer {
  // Remove o fundo cinza-claro neutro do estúdio, preserva sombra suave e translucidez das lentes,
  // e recorta automaticamente no bounding box do óculos.
  public static void Process(string src, string dst, double cx, double cy, double cw, double ch) {
    using (var full = new Bitmap(src)) {
      int x0 = (int)(full.Width * cx), y0 = (int)(full.Height * cy);
      int w = (int)(full.Width * cw), h = (int)(full.Height * ch);
      using (var bmp = full.Clone(new Rectangle(x0, y0, w, h), PixelFormat.Format32bppArgb)) {
        var data = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
        int stride = data.Stride;
        byte[] px = new byte[stride * h];
        Marshal.Copy(data.Scan0, px, 0, px.Length);

        int minX = w, minY = h, maxX = 0, maxY = 0;
        for (int y = 0; y < h; y++) {
          for (int x = 0; x < w; x++) {
            int i = y * stride + x * 4;
            int b = px[i], g = px[i + 1], r = px[i + 2];
            int mx = Math.Max(r, Math.Max(g, b)), mn = Math.Min(r, Math.Min(g, b));
            int chroma = mx - mn;
            double lum = r * 0.299 + g * 0.587 + b * 0.114;
            int a = 255;
            if (chroma < 14 && lum > 196) {
              // fundo / sombra de contato
              a = (int)Math.Max(0, Math.Min(255, (222.0 - lum) / 26.0 * 255.0));
            } else if (chroma >= 14 && lum > 150) {
              // parte clara do degradê das lentes: translúcida
              a = (int)Math.Max(120, Math.Min(250, 290.0 - lum * 0.75));
            }
            px[i + 3] = (byte)a;
            if (a > 40) {
              if (x < minX) minX = x; if (x > maxX) maxX = x;
              if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
          }
        }
        Marshal.Copy(px, 0, data.Scan0, px.Length);
        bmp.UnlockBits(data);

        int pad = 16;
        minX = Math.Max(0, minX - pad); minY = Math.Max(0, minY - pad);
        maxX = Math.Min(w - 1, maxX + pad); maxY = Math.Min(h - 1, maxY + pad);
        using (var trimmed = bmp.Clone(new Rectangle(minX, minY, maxX - minX + 1, maxY - minY + 1), PixelFormat.Format32bppArgb)) {
          trimmed.Save(dst, ImageFormat.Png);
          Console.WriteLine("[OK] " + dst + " " + trimmed.Width + "x" + trimmed.Height);
        }
      }
    }
  }
}
"@
}

[FrameKeyer]::Process($Src, $Out, $CropX, $CropY, $CropW, $CropH)
