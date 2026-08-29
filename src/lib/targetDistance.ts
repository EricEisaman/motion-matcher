/* eslint-disable @typescript-eslint/no-explicit-any */

import * as cvModuleNs from "@techstark/opencv-js";

// targetDistance.ts
// Image Target Distance - drop-in replacement for face distance module
// Helper: opencv.js npm i @techstark/opencv-js OR CDN https://docs.opencv.org/4.9.0/opencv.js

export const DEFAULT_TARGET_WIDTH_MM = 210; // default target width in mm (A4 sheet width)
export const DEFAULT_IPD_MM = 63; // average human interpupillary distance in mm

// --- Types ---
export type NormalizedPoint = { x: number; y: number }; // 0-1
export interface TargetTrackerResult {
  detected: boolean;
  corners: [NormalizedPoint, NormalizedPoint, NormalizedPoint, NormalizedPoint]; // TL,TR,BR,BL normalized
  widthPx: number;
  heightPx: number;
  confidence: number;
  homography?: number[]; // 3x3 row-major
}

export interface TargetTrackerResultList {
  targets: TargetTrackerResult[];
  // compat field so old code that checks faceLandmarks doesn't crash
  faceLandmarks?: never;
}

// Union for backward compat with FaceLandmarkerResult
export type AnyResult = TargetTrackerResult | TargetTrackerResultList | any;

// --- OpenCV loader ---
let cvLib: any = null;
let cvLoading: Promise<any> | null = null;

async function loadCv(): Promise<any> {
  if (cvLib) return cvLib;
  if (cvLoading) return cvLoading;

  console.debug("target tracker: loading OpenCV from npm package");

  cvLoading = new Promise((resolve, reject) => {
    const fail = (message: string, err?: unknown) => {
      console.error("target tracker: OpenCV load failed", { message, err });
      cvLoading = null;
      reject(err instanceof Error ? err : new Error(message));
    };

    const done = (cv: any) => {
      console.debug("target tracker: OpenCV ready", { hasMat: !!cv?.Mat });
      cvLib = cv;
      cvLoading = null;
      resolve(cvLib);
    };

    void (async () => {
      try {
        const runtime: any = (cvModuleNs as any).default ?? cvModuleNs;

        // Some bundlers expose the package as a Promise-like object; unwrap it by invoking
        // its own .then method rather than calling Promise.resolve on the wrapper.
        const resolved: any = await new Promise<any>((resolve, reject) => {
          if (runtime && typeof runtime.then === "function") {
            runtime.then(resolve, reject);
            return;
          }
          resolve(runtime);
        });

        if (resolved?.Mat) {
          done(resolved);
          return;
        }

        if (resolved && typeof resolved.onRuntimeInitialized === "function") {
          resolved.onRuntimeInitialized = () => done(resolved);
          return;
        }

        fail("OpenCV package import did not produce a valid runtime object.");
      } catch (err) {
        fail("Could not load OpenCV from the installed npm package.", err);
      }
    })();
  });

  return cvLoading;
}

function matFromImageData(cv: any, imgData: ImageData | HTMLCanvasElement | HTMLImageElement): any {
  if (imgData instanceof ImageData) {
    return cv.matFromImageData(imgData);
  }
  return cv.imread(imgData as any);
}

// --- Core Tracker ---
class ImageTargetTrackerImpl {
  cv: any;
  orb: any;
  bf: any;
  targetMat: any = null;
  targetGray: any = null;
  targetKP: any = null;
  targetDesc: any = null;
  targetSize = { w: 0, h: 0 };
  frameCanvas: HTMLCanvasElement;

  constructor(cv: any) {
    this.cv = cv;
    this.orb = new cv.ORB(500);
    this.bf = new cv.BFMatcher(cv.NORM_HAMMING, false);
    this.frameCanvas = document.createElement("canvas");
  }

  async setTarget(
    source: HTMLImageElement | HTMLCanvasElement | ImageData | ImageBitmap | HTMLVideoElement,
  ): Promise<void> {
    const cv = this.cv;
    let canvas: HTMLCanvasElement;

    if (source instanceof ImageData) {
      canvas = document.createElement("canvas");
      canvas.width = source.width;
      canvas.height = source.height;
      canvas.getContext("2d", { willReadFrequently: true })!.putImageData(source, 0, 0);
    } else if (source instanceof HTMLCanvasElement) {
      canvas = source;
    } else if (source instanceof ImageBitmap) {
      canvas = document.createElement("canvas");
      canvas.width = source.width;
      canvas.height = source.height;
      canvas.getContext("2d", { willReadFrequently: true })!.drawImage(source, 0, 0);
    } else if (source instanceof HTMLVideoElement || source instanceof HTMLImageElement) {
      canvas = document.createElement("canvas");
      canvas.width =
        (source as any).videoWidth || (source as any).naturalWidth || (source as any).width;
      canvas.height =
        (source as any).videoHeight || (source as any).naturalHeight || (source as any).height;
      canvas.getContext("2d", { willReadFrequently: true })!.drawImage(source as any, 0, 0, canvas.width, canvas.height);
    } else {
      throw new Error("Unsupported target source");
    }

    const mat = matFromImageData(cv, canvas);
    const gray = new cv.Mat();
    cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);

    if (this.targetMat) this.targetMat.delete();
    if (this.targetGray) this.targetGray.delete();
    if (this.targetKP) this.targetKP.delete();
    if (this.targetDesc) this.targetDesc.delete();

    this.targetMat = mat;
    this.targetGray = gray;
    this.targetSize = { w: gray.cols, h: gray.rows };

    this.targetKP = new cv.KeyPointVector();
    this.targetDesc = new cv.Mat();
    this.orb.detectAndCompute(gray, new cv.Mat(), this.targetKP, this.targetDesc);
  }

  detectFromCanvas(frameCanvas: HTMLCanvasElement | HTMLVideoElement): TargetTrackerResult | null {
    const cv = this.cv;
    if (!this.targetDesc || this.targetDesc.rows < 8) {
      return this.detectWithTemplate(frameCanvas);
    }

    const w =
      frameCanvas instanceof HTMLVideoElement
        ? frameCanvas.videoWidth
        : (frameCanvas as HTMLCanvasElement).width;
    const h =
      frameCanvas instanceof HTMLVideoElement
        ? frameCanvas.videoHeight
        : (frameCanvas as HTMLCanvasElement).height;

    const frameMat = matFromImageData(cv, frameCanvas as any);
    const frameGray = new cv.Mat();
    cv.cvtColor(frameMat, frameGray, cv.COLOR_RGBA2GRAY);

    const kp = new cv.KeyPointVector();
    const desc = new cv.Mat();
    this.orb.detectAndCompute(frameGray, new cv.Mat(), kp, desc);

    if (desc.rows < 8) {
      frameMat.delete();
      frameGray.delete();
      kp.delete();
      desc.delete();
      return this.detectWithTemplate(frameCanvas);
    }

    const matches = new cv.DMatchVectorVector();
    this.bf.knnMatch(this.targetDesc, desc, matches, 2);

    // Lowe ratio
    const good: any[] = [];
    for (let i = 0; i < matches.size(); i++) {
      const m = matches.get(i);
      if (m.size() >= 2) {
        const m1 = m.get(0),
          m2 = m.get(1);
        if (m1.distance < 0.75 * m2.distance) good.push(m1);
      }
    }

    if (good.length < 10) {
      frameMat.delete();
      frameGray.delete();
      kp.delete();
      desc.delete();
      matches.delete();
      return this.detectWithTemplate(frameCanvas);
    }

    // Build point correspondences
    const srcPts = cv.matFromArray(
      good.length,
      1,
      cv.CV_32FC2,
      good.flatMap((m: any) => {
        const pt = this.targetKP.get(m.queryIdx).pt;
        return [pt.x, pt.y];
      }),
    );
    const dstPts = cv.matFromArray(
      good.length,
      1,
      cv.CV_32FC2,
      good.flatMap((m: any) => {
        const pt = kp.get(m.trainIdx).pt;
        return [pt.x, pt.y];
      }),
    );

    const mask = new cv.Mat();
    const H = cv.findHomography(srcPts, dstPts, cv.RANSAC, 3, mask);

    let result: TargetTrackerResult | null = null;
    if (!H.empty()) {
      const tl = new cv.Mat(1, 1, cv.CV_32FC2);
      tl.data32F.set([0, 0]);
      const tr = new cv.Mat(1, 1, cv.CV_32FC2);
      tr.data32F.set([this.targetSize.w, 0]);
      const br = new cv.Mat(1, 1, cv.CV_32FC2);
      br.data32F.set([this.targetSize.w, this.targetSize.h]);
      const bl = new cv.Mat(1, 1, cv.CV_32FC2);
      bl.data32F.set([0, this.targetSize.h]);

      const transform = (p: any) => {
        const dst = new cv.Mat();
        cv.perspectiveTransform(p, dst, H);
        const x = dst.data32F[0],
          y = dst.data32F[1];
        dst.delete();
        return { x, y };
      };

      const pTL = transform(tl),
        pTR = transform(tr),
        pBR = transform(br),
        pBL = transform(bl);
      tl.delete();
      tr.delete();
      br.delete();
      bl.delete();

      const w = frameGray.cols,
        h = frameGray.rows;
      const widthPx =
        (Math.hypot(pTR.x - pTL.x, pTR.y - pTL.y) + Math.hypot(pBR.x - pBL.x, pBR.y - pBL.y)) / 2;
      const heightPx =
        (Math.hypot(pBL.x - pTL.x, pBL.y - pTL.y) + Math.hypot(pBR.x - pTR.x, pBR.y - pTR.y)) / 2;

      let inliers = 0;
      for (let i = 0; i < mask.rows; i++) if (mask.data[i]) inliers++;
      const confidence = inliers / good.length;

      if (widthPx > 10 && confidence > 0.15) {
        result = {
          detected: true,
          corners: [
            { x: pTL.x / w, y: pTL.y / h },
            { x: pTR.x / w, y: pTR.y / h },
            { x: pBR.x / w, y: pBR.y / h },
            { x: pBL.x / w, y: pBL.y / h },
          ],
          widthPx,
          heightPx,
          confidence,
          homography: Array.from(H.data64F),
        };
      }
    }

    srcPts.delete();
    dstPts.delete();
    mask.delete();
    H.delete();
    frameMat.delete();
    frameGray.delete();
    kp.delete();
    desc.delete();
    matches.delete();
    return result || this.detectWithTemplate(frameCanvas);
  }

  private detectWithTemplate(
    frameCanvas: HTMLCanvasElement | HTMLVideoElement,
  ): TargetTrackerResult | null {
    const cv = this.cv;
    const frameMat = matFromImageData(cv, frameCanvas as any);
    const frameGray = new cv.Mat();
    cv.cvtColor(frameMat, frameGray, cv.COLOR_RGBA2GRAY);

    // The selected crop is only an initialization template. It must not constrain the match to a
    // sub-region of the frame. We search the entire video frame at multiple scales and accept only
    // candidates that match the real target well enough to be plausible.
    const scales = [0.45, 0.6, 0.8, 1.0, 1.25, 1.5, 1.8];
    const frameWidth =
      frameCanvas instanceof HTMLVideoElement
        ? frameCanvas.videoWidth
        : (frameCanvas as HTMLCanvasElement).width;
    const frameHeight =
      frameCanvas instanceof HTMLVideoElement
        ? frameCanvas.videoHeight
        : (frameCanvas as HTMLCanvasElement).height;
    let bestScore = 0,
      bestLoc = { x: 0, y: 0 },
      bestSize = { w: 0, h: 0 };

    for (const s of scales) {
      const targetW = Math.round(this.targetSize.w * s);
      const targetH = Math.round(this.targetSize.h * s);
      if (targetW < 20 || targetH < 20 || targetW > frameGray.cols * 0.9 || targetH > frameGray.rows * 0.9) continue;

      const resized = new cv.Mat();
      cv.resize(this.targetGray, resized, new cv.Size(targetW, targetH), 0, 0, cv.INTER_AREA);

      const result = new cv.Mat();
      cv.matchTemplate(frameGray, resized, result, cv.TM_CCOEFF_NORMED);
      const minMax = cv.minMaxLoc(result);

      const score = Number(minMax.maxVal ?? 0);
      if (score > bestScore) {
        bestScore = score;
        bestLoc = minMax.maxLoc;
        bestSize = { w: targetW, h: targetH };
      }

      resized.delete();
      result.delete();
    }

    frameMat.delete();
    frameGray.delete();

    // A valid target must be found somewhere within the full image; reject obvious background matches.
    if (bestScore < 0.18 || bestSize.w <= 0 || bestSize.h <= 0) return null;

    const x = bestLoc.x,
      y = bestLoc.y;

    const widthPx = bestSize.w;
    const heightPx = bestSize.h;

    return {
      detected: true,
      corners: [
        { x: x / frameWidth, y: y / frameHeight },
        { x: (x + widthPx) / frameWidth, y: y / frameHeight },
        { x: (x + widthPx) / frameWidth, y: (y + heightPx) / frameHeight },
        { x: x / frameWidth, y: (y + heightPx) / frameHeight },
      ],
      widthPx,
      heightPx,
      confidence: bestScore,
    };
  }

  // MediaPipe-like API for drop-in compat
  detectForVideo(video: HTMLVideoElement, _timestamp?: number): TargetTrackerResultList {
    if (video.videoWidth <= 0 || video.videoHeight <= 0) return { targets: [] };
    if (
      this.frameCanvas.width !== video.videoWidth ||
      this.frameCanvas.height !== video.videoHeight
    ) {
      this.frameCanvas.width = video.videoWidth;
      this.frameCanvas.height = video.videoHeight;
    }
    this.frameCanvas.getContext("2d", { willReadFrequently: true })!.drawImage(video, 0, 0);
    const r = this.detectFromCanvas(this.frameCanvas);
    return r ? { targets: [r] } : { targets: [] };
  }

  isReady() {
    return !!this.targetMat;
  }
}

// --- Singleton ---
let tracker: ImageTargetTrackerImpl | null = null;
let loading: Promise<ImageTargetTrackerImpl> | null = null;

export async function getTargetTracker(): Promise<ImageTargetTrackerImpl> {
  if (tracker) return tracker;
  if (loading) return loading;

  loading = (async () => {
    try {
      const cv = await loadCv();
      const t = new ImageTargetTrackerImpl(cv);
      tracker = t;
      return t;
    } catch (error) {
      loading = null;
      throw error;
    }
  })();

  return loading;
}

// Alias for identical interface
export async function getFaceLandmarker(): Promise<ImageTargetTrackerImpl> {
  return getTargetTracker();
}

// --- Target management ---
export async function setTargetFromElement(
  el: HTMLImageElement | HTMLCanvasElement | ImageData | ImageBitmap | HTMLVideoElement,
) {
  const t = await getTargetTracker();
  await t.setTarget(el);
}

export async function setTargetFromUrl(url: string) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
  });
  return setTargetFromElement(img);
}

export async function setTargetFromVideoCrop(
  video: HTMLVideoElement,
  roi?: { x: number; y: number; w: number; h: number }, // normalized 0-1, default center 50%
) {
  const r = roi || { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
  const vw = video.videoWidth,
    vh = video.videoHeight;
  const sx = r.x * vw,
    sy = r.y * vh,
    sw = r.w * vw,
    sh = r.h * vh;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw));
  canvas.height = Math.max(1, Math.round(sh));
  canvas.getContext("2d", { willReadFrequently: true })!.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return setTargetFromElement(canvas);
}

export function isTargetSet(): boolean {
  return !!tracker?.isReady();
}

// --- Math - identical to face module ---
export function estimateFocalPx(videoWidth: number, fovDeg = 60): number {
  const fovRad = (fovDeg * Math.PI) / 180;
  return videoWidth / (2 * Math.tan(fovRad / 2));
}

export function distanceFromTargetWidthPx(
  widthPx: number,
  videoWidth: number,
  targetWidthMm: number = DEFAULT_TARGET_WIDTH_MM,
  focalScale: number = 1,
): number {
  if (widthPx <= 0) return 0;
  const f = estimateFocalPx(videoWidth) * focalScale;
  return (f * (targetWidthMm / 1000)) / widthPx;
}

// Alias keeping original name
export function distanceFromIpdPx(
  ipdPx: number,
  videoWidth: number,
  ipdMm: number = DEFAULT_TARGET_WIDTH_MM,
  focalScale: number = 1,
): number {
  return distanceFromTargetWidthPx(ipdPx, videoWidth, ipdMm, focalScale);
}

export function targetWidthPxFromResult(
  result: TargetTrackerResult,
  videoWidth: number,
  videoHeight: number,
): number | null {
  if (!result?.detected) return null;
  // already in px if available
  if (result.widthPx) return result.widthPx;
  const c = result.corners;
  const dx1 = (c[1].x - c[0].x) * videoWidth;
  const dy1 = (c[1].y - c[0].y) * videoHeight;
  const dx2 = (c[2].x - c[3].x) * videoWidth;
  const dy2 = (c[2].y - c[3].y) * videoHeight;
  return (Math.hypot(dx1, dy1) + Math.hypot(dx2, dy2)) / 2;
}

// Backward compat: same signature as ipdPxFromResult
export function ipdPxFromResult(
  result: AnyResult,
  videoWidth: number,
  videoHeight: number,
): number | null {
  if (!result) return null;
  // New format: {targets: [r]}
  if (result.targets?.[0]) {
    return targetWidthPxFromResult(result.targets[0], videoWidth, videoHeight);
  }
  // Direct TargetTrackerResult
  if (result.corners) {
    return targetWidthPxFromResult(result as TargetTrackerResult, videoWidth, videoHeight);
  }
  // Legacy FaceLandmarkerResult fallback - keep old logic if passed
  const lm = result.faceLandmarks?.[0];
  if (lm) {
    const leftIris = lm[468];
    const rightIris = lm[473];
    let a = leftIris,
      b = rightIris;
    if (!a || !b) {
      a = lm[33];
      b = lm[263];
    }
    if (!a || !b) return null;
    const dx = (a.x - b.x) * videoWidth;
    const dy = (a.y - b.y) * videoHeight;
    return Math.hypot(dx, dy);
  }
  return null;
}

export const targetSizePxFromResult = targetWidthPxFromResult;
