import { FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from "@mediapipe/tasks-vision";

// Average human interpupillary distance ~ 63 mm
export const DEFAULT_IPD_MM = 63;

let landmarker: FaceLandmarker | null = null;
let loading: Promise<FaceLandmarker> | null = null;

export async function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (landmarker) return landmarker;
  if (loading) return loading;
  loading = (async () => {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
    );
    const fl = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
    landmarker = fl;
    return fl;
  })();
  return loading;
}

// Focal length estimate from FOV assumption
export function estimateFocalPx(videoWidth: number, fovDeg = 60): number {
  const fovRad = (fovDeg * Math.PI) / 180;
  return videoWidth / (2 * Math.tan(fovRad / 2));
}

// Distance from IPD (in pixels) using pinhole model
export function distanceFromIpdPx(
  ipdPx: number,
  videoWidth: number,
  ipdMm: number = DEFAULT_IPD_MM,
  focalScale: number = 1,
): number {
  if (ipdPx <= 0) return 0;
  const f = estimateFocalPx(videoWidth) * focalScale;
  // distance in meters
  return (f * (ipdMm / 1000)) / ipdPx;
}

// Extract IPD (px) from landmarks; uses iris centers (indices 468, 473) if
// available, otherwise falls back to eye corners.
export function ipdPxFromResult(
  result: FaceLandmarkerResult,
  videoWidth: number,
  videoHeight: number,
): number | null {
  const lm = result.faceLandmarks?.[0];
  if (!lm) return null;
  const leftIris = lm[468];
  const rightIris = lm[473];
  let a = leftIris;
  let b = rightIris;
  if (!a || !b) {
    // Fallback: outer eye corners
    a = lm[33];
    b = lm[263];
  }
  if (!a || !b) return null;
  const dx = (a.x - b.x) * videoWidth;
  const dy = (a.y - b.y) * videoHeight;
  return Math.hypot(dx, dy);
}
