/**
 * Loads Google's MediaPipe Face Landmarker (with blendshapes) and runs it on
 * a video element. We rely on the model's built-in `eyeBlinkLeft` and
 * `eyeBlinkRight` blendshape scores — they are pre-trained on a large dataset
 * and far more reliable than computing eye-aspect-ratio ourselves.
 *
 * Returns a `BlinkScore` (0..1, where 1 = fully closed) per frame. The
 * higher-level intent detection (short blink vs long blink vs natural)
 * lives in `useBlink.ts`.
 */
import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

// WASM is served from /public so the version always matches the installed
// `@mediapipe/tasks-vision` (no CDN drift, no cross-origin surprises).
// See `scripts/copy-mediapipe-wasm` style step in package.json if we ever
// move to bundler-driven copying.
const WASM_BASE = "/mediapipe/wasm";

// The face_landmarker model lives on Google's official models bucket.
// ~3MB; we self-host later if we want offline support.
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export type BlinkSample = {
  /** Average of eyeBlinkLeft + eyeBlinkRight blendshape scores (0..1). */
  closedness: number;
  /** Whether a face was detected this frame. */
  faceDetected: boolean;
  /** Frame timestamp (ms). */
  timestamp: number;
};

let landmarkerSingleton: FaceLandmarker | null = null;

export async function loadFaceLandmarker(): Promise<FaceLandmarker> {
  if (landmarkerSingleton) return landmarkerSingleton;

  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  landmarkerSingleton = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: false,
  });
  return landmarkerSingleton;
}

export function extractBlinkScore(
  result: FaceLandmarkerResult,
): { left: number; right: number } | null {
  const blendshapes = result.faceBlendshapes?.[0]?.categories;
  if (!blendshapes) return null;

  let left = 0;
  let right = 0;
  for (const cat of blendshapes) {
    if (cat.categoryName === "eyeBlinkLeft") left = cat.score;
    else if (cat.categoryName === "eyeBlinkRight") right = cat.score;
  }
  return { left, right };
}
