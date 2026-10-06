"use client";

import { useEffect, useRef } from "react";

const MAX_DEVICE_PIXEL_RATIO = 2;
const TARGET_DESKTOP_POINTS = 20500;
const TARGET_MOBILE_POINTS = 9200;
const CHOREOGRAPHY = [
  {
    videoSource:
      "/assets/feline-choreography-trimmed/feline-front-half.webm",
    posterSource:
      "/assets/feline-choreography-trimmed/feline-front-half-poster.webp",
    maskWidth: 240,
    maskHeight: 360,
    displayScale: 1,
    anchorX: 0.2,
    anchorY: 0.72,
    scatterFadeOut: true,
  },
  {
    videoSource:
      "/assets/feline-choreography-trimmed/feline-profile-half.webm",
    posterSource:
      "/assets/feline-choreography-trimmed/feline-profile-half-poster.webp",
    maskWidth: 320,
    maskHeight: 180,
    displayScale: 0.6,
    anchorX: 0.8,
    anchorY: 0.46,
    scatterFadeOut: false,
  },
] as const;

type PointFieldDot = {
  x: number;
  y: number;
  radius: number;
  phase: number;
  baseTone: number;
  revealBias: number;
};

type FelineMask = {
  width: number;
  height: number;
  displayScale: number;
  anchorX: number;
  anchorY: number;
  alpha: Uint8ClampedArray;
  luminance: Uint8ClampedArray;
};

const FELINE_PALETTE = [
  [255, 73, 191],
  [153, 92, 255],
  [71, 170, 255],
  [75, 239, 221],
  [211, 255, 77],
  [255, 222, 78],
  [255, 116, 76],
] as const;

const POINT_BORDER_PALETTE = [
  [255, 255, 255],
  [202, 216, 229],
  [255, 211, 92],
] as const;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createPointField(
  width: number,
  height: number,
  densityMultiplier = 1,
  seedOffset = 0,
): PointFieldDot[] {
  const isMobile = width < 768;
  const baseTargetCount = isMobile
    ? Math.min(TARGET_MOBILE_POINTS, Math.max(5000, Math.round((width * height) / 27)))
    : Math.min(TARGET_DESKTOP_POINTS, Math.max(10500, Math.round((width * height) / 49)));
  const targetCount = Math.round(baseTargetCount * densityMultiplier);
  const minimumDistance = clamp(
    Math.sqrt((0.54 * width * height) / targetCount),
    isMobile ? 3.8 : 4.7,
    isMobile ? 5.3 : 7.6,
  );
  const cellSize = minimumDistance / Math.SQRT2;
  const gridColumns = Math.ceil(width / cellSize);
  const gridRows = Math.ceil(height / cellSize);
  const grid = new Int32Array(gridColumns * gridRows);
  grid.fill(-1);
  const random = createSeededRandom(
    (Math.round(width) * 73856093) ^
      (Math.round(height) * 19349663) ^
      0x46454c49 ^
      seedOffset,
  );
  const points: PointFieldDot[] = [];
  const activePointIndices: number[] = [];

  const addPoint = (x: number, y: number) => {
    const pointIndex = points.length;
    points.push({
      x,
      y,
      radius: 0.4 + random() * 0.28,
      phase: random() * Math.PI * 2,
      baseTone: Math.min(2, Math.floor(random() * 3)),
      revealBias: random(),
    });
    activePointIndices.push(pointIndex);
    grid[Math.floor(y / cellSize) * gridColumns + Math.floor(x / cellSize)] = pointIndex;
  };

  const isCandidateValid = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const gridX = Math.floor(x / cellSize);
    const gridY = Math.floor(y / cellSize);
    for (let offsetY = -2; offsetY <= 2; offsetY += 1) {
      const neighborY = gridY + offsetY;
      if (neighborY < 0 || neighborY >= gridRows) continue;
      for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
        const neighborX = gridX + offsetX;
        if (neighborX < 0 || neighborX >= gridColumns) continue;
        const pointIndex = grid[neighborY * gridColumns + neighborX];
        if (pointIndex < 0) continue;
        const point = points[pointIndex];
        if (Math.hypot(point.x - x, point.y - y) < minimumDistance) return false;
      }
    }
    return true;
  };

  addPoint(random() * width, random() * height);
  while (activePointIndices.length > 0 && points.length < targetCount) {
    const activeListIndex = Math.floor(random() * activePointIndices.length);
    const origin = points[activePointIndices[activeListIndex]];
    let accepted = false;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const angle = random() * Math.PI * 2;
      const distance = minimumDistance * (1 + random());
      const x = origin.x + Math.cos(angle) * distance;
      const y = origin.y + Math.sin(angle) * distance;
      if (isCandidateValid(x, y)) {
        addPoint(x, y);
        accepted = true;
        break;
      }
    }
    if (!accepted) {
      activePointIndices[activeListIndex] = activePointIndices.at(-1)!;
      activePointIndices.pop();
    }
  }
  return points;
}

function drawBaseField(
  context: CanvasRenderingContext2D,
  dots: PointFieldDot[],
  elapsedSeconds: number,
) {
  const baseColors = [
    "rgba(255, 246, 224, 0.25)",
    "rgba(255, 255, 255, 0.36)",
    "rgba(190, 205, 212, 0.45)",
  ];
  for (let tone = 0; tone < baseColors.length; tone += 1) {
    context.beginPath();
    for (const dot of dots) {
      if (dot.baseTone !== tone) continue;
      const pulse = 1 + Math.sin(elapsedSeconds * 0.34 + dot.phase) * 0.012;
      context.moveTo(dot.x + dot.radius * pulse, dot.y);
      context.arc(dot.x, dot.y, dot.radius * pulse, 0, Math.PI * 2);
    }
    context.fillStyle = baseColors[tone];
    context.fill();
  }
}

function captureFelineMask(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  displayScale: number,
  anchorX: number,
  anchorY: number,
): FelineMask {
  if (context.canvas.width !== width || context.canvas.height !== height) {
    context.canvas.width = width;
    context.canvas.height = height;
  }
  context.clearRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const alpha = new Uint8ClampedArray(width * height);
  const luminance = new Uint8ClampedArray(alpha.length);
  for (let index = 0; index < alpha.length; index += 1) {
    const pixelIndex = index * 4;
    alpha[index] = pixels[pixelIndex + 3];
    luminance[index] =
      (pixels[pixelIndex] * 54 + pixels[pixelIndex + 1] * 183 + pixels[pixelIndex + 2] * 19) >> 8;
  }
  return {
    width,
    height,
    displayScale,
    anchorX,
    anchorY,
    alpha,
    luminance,
  };
}

function getMaskLayout(width: number, height: number, mask: FelineMask) {
  const maximumWidth = width * (width < 768 ? 0.96 : 0.84);
  const maximumHeight = height * 0.92;
  const scale =
    Math.min(maximumWidth / mask.width, maximumHeight / mask.height) *
    mask.displayScale;
  const displayWidth = mask.width * scale;
  const displayHeight = mask.height * scale;
  const isMobile = width < 768;
  const anchorX = isMobile
    ? mask.anchorX > 0.5
      ? 0.7
      : 0.34
    : mask.anchorX;
  const anchorY = isMobile
    ? mask.anchorY < 0.6
      ? 0.4
      : 0.6
    : mask.anchorY;
  return {
    left: anchorX * width - displayWidth / 2,
    top: anchorY * height - displayHeight / 2,
    width: displayWidth,
    height: displayHeight,
  };
}

function drawFelineMask(
  context: CanvasRenderingContext2D,
  dots: PointFieldDot[],
  mask: FelineMask,
  width: number,
  height: number,
  elapsedSeconds: number,
  fadeOutProgress: number,
) {
  const layout = getMaskLayout(width, height, mask);
  const groups: Array<Array<{ x: number; y: number; radius: number }>> =
    Array.from(
      { length: FELINE_PALETTE.length * POINT_BORDER_PALETTE.length },
      () => [],
    );

  for (const dot of dots) {
    const u = (dot.x - layout.left) / layout.width;
    const v = (dot.y - layout.top) / layout.height;
    if (u <= 0 || v <= 0 || u >= 1 || v >= 1) continue;
    const maskX = Math.min(mask.width - 1, Math.floor(u * mask.width));
    const maskY = Math.min(mask.height - 1, Math.floor(v * mask.height));
    const maskIndex = maskY * mask.width + maskX;
    const darkness = 1 - mask.luminance[maskIndex] / 255;
    const alpha = mask.alpha[maskIndex] / 255;
    const lineStrength = alpha * Math.pow(darkness, 0.72);
    if (
      lineStrength < 0.025 ||
      dot.revealBias > clamp(lineStrength * 1.72, 0, 1)
    ) {
      continue;
    }
    const palettePosition = clamp(
      Math.floor(
        (u * 0.42 + v * 0.36 + darkness * 0.34 + dot.revealBias * 0.12) *
          FELINE_PALETTE.length,
      ),
      0,
      FELINE_PALETTE.length - 1,
    );
    const energy = 0.78 + Math.sin(elapsedSeconds * 1.3 + dot.phase) * 0.08;
    const borderIndex = Math.min(
      POINT_BORDER_PALETTE.length - 1,
      Math.floor(dot.revealBias * POINT_BORDER_PALETTE.length),
    );
    const scatterEase =
      fadeOutProgress * fadeOutProgress * (3 - 2 * fadeOutProgress);
    const scatterDistance =
      scatterEase * (34 + dot.revealBias * 76);
    const scatterAngle = dot.phase * 1.73 + dot.revealBias * Math.PI * 2;
    groups[
      palettePosition * POINT_BORDER_PALETTE.length + borderIndex
    ].push({
      x: dot.x + Math.cos(scatterAngle) * scatterDistance,
      y: dot.y + Math.sin(scatterAngle) * scatterDistance,
      radius: dot.radius + lineStrength * 0.31 * energy,
    });
  }

  context.save();
  context.globalCompositeOperation = "lighter";
  context.globalAlpha = 1 - fadeOutProgress;
  groups.forEach((group, groupIndex) => {
    if (group.length === 0) return;
    const paletteIndex = Math.floor(
      groupIndex / POINT_BORDER_PALETTE.length,
    );
    const borderIndex = groupIndex % POINT_BORDER_PALETTE.length;
    const [red, green, blue] = FELINE_PALETTE[paletteIndex];
    const [borderRed, borderGreen, borderBlue] =
      POINT_BORDER_PALETTE[borderIndex];
    context.beginPath();
    for (const dot of group) {
      context.moveTo(dot.x + dot.radius, dot.y);
      context.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
    }
    context.fillStyle = `rgb(${red}, ${green}, ${blue})`;
    context.shadowColor = "transparent";
    context.shadowBlur = 0;
    context.fill();
    context.strokeStyle = `rgba(${borderRed}, ${borderGreen}, ${borderBlue}, 0.9)`;
    context.lineWidth = 0.34;
    context.stroke();
  });
  context.restore();
}

type YayoiPointCanvasProps = { active: boolean };

export default function YayoiPointCanvas({ active }: YayoiPointCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!canvas || !container || !active) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const baseCanvas = document.createElement("canvas");
    const baseContext = baseCanvas.getContext("2d");
    const maskCanvas = document.createElement("canvas");
    const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
    if (!baseContext || !maskContext) return;

    const video = document.createElement("video");
    video.muted = true;
    video.loop = false;
    video.playsInline = true;
    video.preload = "auto";
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let dots: PointFieldDot[] = [];
    let maskDots: PointFieldDot[] = [];
    let animationFrameId = 0;
    let lastRenderedAt = 0;
    let lastBaseRenderedAt = Number.NEGATIVE_INFINITY;
    let lastMaskTime = Number.NEGATIVE_INFINITY;
    let baseNeedsRender = true;
    let felineMask: FelineMask | null = null;
    let currentClipIndex = 0;
    let disposed = false;
    const animationStartedAt = performance.now();

    const resizeCanvas = () => {
      const bounds = container.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(bounds.width));
      const nextHeight = Math.max(1, Math.round(bounds.height));
      if (nextWidth === width && nextHeight === height) return;
      width = nextWidth;
      height = nextHeight;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      baseCanvas.width = canvas.width;
      baseCanvas.height = canvas.height;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      baseContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      dots = createPointField(width, height);
      maskDots = createPointField(width, height, 1.8, 0x4d41534b);
      baseNeedsRender = true;
    };

    const updateMask = () => {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      if (video.currentTime === lastMaskTime && felineMask) return;
      const clip = CHOREOGRAPHY[currentClipIndex];
      felineMask = captureFelineMask(
        maskContext,
        video,
        clip.maskWidth,
        clip.maskHeight,
        clip.displayScale,
        clip.anchorX,
        clip.anchorY,
      );
      lastMaskTime = video.currentTime;
    };

    const draw = (timestamp: number) => {
      resizeCanvas();
      const elapsedSeconds = reducedMotion.matches ? 3.6 : (timestamp - animationStartedAt) / 1000;
      if (baseNeedsRender || (!reducedMotion.matches && timestamp - lastBaseRenderedAt >= 100)) {
        baseContext.clearRect(0, 0, width, height);
        drawBaseField(baseContext, dots, elapsedSeconds);
        lastBaseRenderedAt = timestamp;
        baseNeedsRender = false;
      }
      updateMask();
      context.clearRect(0, 0, width, height);
      context.drawImage(baseCanvas, 0, 0, width, height);
      if (felineMask) {
        const clip = CHOREOGRAPHY[currentClipIndex];
        const fadeDuration = 1.6;
        const fadeOutProgress =
          clip.scatterFadeOut && Number.isFinite(video.duration)
            ? clamp(
                (video.currentTime - (video.duration - fadeDuration)) /
                  fadeDuration,
                0,
                1,
              )
            : 0;
        drawFelineMask(
          context,
          maskDots,
          felineMask,
          width,
          height,
          elapsedSeconds,
          fadeOutProgress,
        );
      }
    };

    const animate = (timestamp: number) => {
      if (timestamp - lastRenderedAt >= 1000 / 30) {
        draw(timestamp);
        lastRenderedAt = timestamp;
      }
      animationFrameId = window.requestAnimationFrame(animate);
    };

    const showPoster = () => {
      const clip = CHOREOGRAPHY[currentClipIndex];
      const poster = new Image();
      poster.onload = () => {
        if (disposed) return;
        felineMask = captureFelineMask(
          maskContext,
          poster,
          clip.maskWidth,
          clip.maskHeight,
          clip.displayScale,
          clip.anchorX,
          clip.anchorY,
        );
        draw(performance.now());
      };
      poster.src = clip.posterSource;
    };

    const loadClip = (clipIndex: number) => {
      currentClipIndex = clipIndex % CHOREOGRAPHY.length;
      const clip = CHOREOGRAPHY[currentClipIndex];
      felineMask = null;
      lastMaskTime = Number.NEGATIVE_INFINITY;
      video.src = clip.videoSource;
      video.poster = clip.posterSource;
      video.load();
    };

    const playNextClip = () => {
      loadClip((currentClipIndex + 1) % CHOREOGRAPHY.length);
    };

    const applyMotionPreference = () => {
      if (reducedMotion.matches) {
        video.pause();
        video.currentTime = Math.min(3.6, video.duration || 3.6);
        draw(performance.now());
        return;
      }
      void video.play().catch(showPoster);
      if (!animationFrameId) animationFrameId = window.requestAnimationFrame(animate);
    };

    video.addEventListener("loadeddata", applyMotionPreference);
    video.addEventListener("ended", playNextClip);
    video.addEventListener("error", showPoster);
    reducedMotion.addEventListener("change", applyMotionPreference);
    resizeCanvas();
    showPoster();
    loadClip(0);
    if (!reducedMotion.matches) animationFrameId = window.requestAnimationFrame(animate);

    const resizeObserver = new ResizeObserver(() => draw(performance.now()));
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      reducedMotion.removeEventListener("change", applyMotionPreference);
      video.removeEventListener("loadeddata", applyMotionPreference);
      video.removeEventListener("ended", playNextClip);
      video.removeEventListener("error", showPoster);
      video.pause();
      video.removeAttribute("src");
      video.load();
      if (animationFrameId) window.cancelAnimationFrame(animationFrameId);
    };
  }, [active]);

  return (
    <div
      className={`yayoi-point-canvas${active ? " yayoi-point-canvas--active" : ""}`}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="yayoi-point-canvas__surface" />
    </div>
  );
}
