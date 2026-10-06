param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [string]$OutputDirectory,

  [ValidateRange(1, 60)]
  [int]$FramesPerSecond = 20
)

$ErrorActionPreference = "Stop"

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
  $OutputDirectory = Join-Path $scriptDirectory "..\public\assets\feline-scroll"
}

$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("feline-scroll-" + [guid]::NewGuid().ToString("N"))
$sourceFrames = Join-Path $temporaryRoot "source"
$matteFrames = Join-Path $temporaryRoot "matte"

New-Item -ItemType Directory -Force -Path $resolvedOutput, $sourceFrames, $matteFrames | Out-Null

Add-Type -AssemblyName System.Drawing

if (-not ("FelineFrameMatte" -as [type])) {
  Add-Type -ReferencedAssemblies "System.Drawing" -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class FelineFrameMatte
{
    public static void Process(string inputPath, string outputPath)
    {
        using (var source = new Bitmap(inputPath))
        using (var bitmap = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb))
        {
            using (var graphics = Graphics.FromImage(bitmap))
            {
                graphics.DrawImageUnscaled(source, 0, 0);
            }

            var bounds = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
            var data = bitmap.LockBits(bounds, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
            var stride = Math.Abs(data.Stride);
            var pixels = new byte[stride * bitmap.Height];
            Marshal.Copy(data.Scan0, pixels, 0, pixels.Length);

            var width = bitmap.Width;
            var height = bitmap.Height;
            var connectedBackground = new bool[width * height];
            var queue = new Queue<int>(width * 2 + height * 2);

            Action<int, int> enqueueIfBackground = (x, y) =>
            {
                var index = y * width + x;
                if (connectedBackground[index]) return;

                var offset = y * stride + x * 4;
                var blue = pixels[offset];
                var green = pixels[offset + 1];
                var red = pixels[offset + 2];
                var minimum = Math.Min(red, Math.Min(green, blue));
                var maximum = Math.Max(red, Math.Max(green, blue));

                // The source is monochrome. A generous light threshold follows
                // antialiased edges without crossing the dark exterior contour.
                if (minimum < 200 || maximum - minimum > 18) return;

                connectedBackground[index] = true;
                queue.Enqueue(index);
            };

            for (var x = 0; x < width; x++)
            {
                enqueueIfBackground(x, height - 1);
            }

            for (var y = 0; y < height - 1; y++)
            {
                enqueueIfBackground(0, y);
                enqueueIfBackground(width - 1, y);
            }

            while (queue.Count > 0)
            {
                var index = queue.Dequeue();
                var x = index % width;
                var y = index / width;

                if (x > 0) enqueueIfBackground(x - 1, y);
                if (x + 1 < width) enqueueIfBackground(x + 1, y);
                if (y > 0) enqueueIfBackground(x, y - 1);
                if (y + 1 < height) enqueueIfBackground(x, y + 1);
            }

            for (var y = 0; y < height; y++)
            {
                for (var x = 0; x < width; x++)
                {
                    var index = y * width + x;
                    var offset = y * stride + x * 4;

                    if (connectedBackground[index])
                    {
                        var luminance = (pixels[offset + 2] * 54 + pixels[offset + 1] * 183 + pixels[offset] * 19) >> 8;
                        var alpha = Math.Max(0, Math.Min(255, 255 - luminance));

                        // Convert the white-composited antialiasing into a clean
                        // black edge with proportional alpha.
                        pixels[offset] = 0;
                        pixels[offset + 1] = 0;
                        pixels[offset + 2] = 0;
                        pixels[offset + 3] = (byte)alpha;
                    }
                    else
                    {
                        pixels[offset + 3] = 255;
                    }
                }
            }

            Marshal.Copy(pixels, 0, data.Scan0, pixels.Length);
            bitmap.UnlockBits(data);
            bitmap.Save(outputPath, ImageFormat.Png);
        }
    }
}
"@
}

try {
  & ffmpeg `
    -hide_banner `
    -loglevel error `
    -y `
    -i $resolvedInput `
    -an `
    -vf "fps=$FramesPerSecond,crop=720:1080:600:0,scale=360:540:flags=lanczos" `
    (Join-Path $sourceFrames "frame-%04d.png")

  if ($LASTEXITCODE -ne 0) {
    throw "FFmpeg no pudo extraer los frames del video."
  }

  Get-ChildItem -LiteralPath $sourceFrames -Filter "frame-*.png" |
    Sort-Object Name |
    ForEach-Object {
      [FelineFrameMatte]::Process(
        $_.FullName,
        (Join-Path $matteFrames $_.Name)
      )
    }

  & ffmpeg `
    -hide_banner `
    -loglevel error `
    -y `
    -framerate $FramesPerSecond `
    -i (Join-Path $matteFrames "frame-%04d.png") `
    -an `
    -c:v libvpx-vp9 `
    -pix_fmt yuva420p `
    -crf 34 `
    -b:v 0 `
    -g 5 `
    -auto-alt-ref 0 `
    -row-mt 1 `
    -cpu-used 4 `
    (Join-Path $resolvedOutput "feline-scroll.webm")

  if ($LASTEXITCODE -ne 0) {
    throw "FFmpeg no pudo codificar el WebM transparente."
  }

  & ffmpeg `
    -hide_banner `
    -loglevel error `
    -y `
    -i (Join-Path $matteFrames "frame-0001.png") `
    -frames:v 1 `
    -c:v libwebp `
    -lossless 0 `
    -quality 84 `
    (Join-Path $resolvedOutput "feline-poster.webp")

  if ($LASTEXITCODE -ne 0) {
    throw "FFmpeg no pudo crear el poster transparente."
  }
}
finally {
  $temporaryPath = [System.IO.Path]::GetFullPath($temporaryRoot)
  $systemTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())

  if ($temporaryPath.StartsWith($systemTemp, [System.StringComparison]::OrdinalIgnoreCase) -and
      (Test-Path -LiteralPath $temporaryPath)) {
    Remove-Item -LiteralPath $temporaryPath -Recurse -Force
  }
}
