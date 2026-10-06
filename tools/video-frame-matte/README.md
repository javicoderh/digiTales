# Video frame matte

Herramienta aislada de la aplicación. No forma parte del build de Next.js ni está importada desde `src`.

## Requisitos

- Windows PowerShell
- FFmpeg disponible en `PATH`
- `System.Drawing` de .NET

## Uso

Desde la raíz de `digi Tales`:

```powershell
& ".\tools\video-frame-matte\prepare_feline_scroll_asset.ps1" `
  -InputPath "C:\ruta\secuencia.mp4" `
  -OutputDirectory ".\tools\video-frame-matte\output" `
  -FramesPerSecond 20
```

La herramienta:

1. Extrae los frames con FFmpeg.
2. Aplica el recorte fijo `720x1080` desde `x=600`, `y=0`.
3. Escala el resultado a `360x540` con Lanczos.
4. Detecta el fondo claro conectado a los bordes mediante flood-fill.
5. Convierte ese fondo y sus bordes suavizados en transparencia.
6. Genera `feline-scroll.webm` con canal alfa y `feline-poster.webp`.

Los frames intermedios se crean en una carpeta temporal y se eliminan al finalizar.

## Parámetros importantes

El recorte, el tamaño final, los umbrales monocromáticos y los nombres de salida están definidos dentro del script. Para otra composición de video habrá que ajustarlos allí.
