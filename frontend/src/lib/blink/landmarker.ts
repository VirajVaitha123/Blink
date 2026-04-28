/**
 * Loads Google's MediaPipe Face Landmarker (with blendshapes) and runs it on
 * a video element. We rely on the model's built-in blendshape scores —
 * pre-trained, no calibration needed for first-pass.
 *
 * Per-frame we extract:
 *   - eyeBlinkLeft / eyeBlinkRight  → drives the blink hook (intent + long)
 *   - eyeLookUpLeft / eyeLookUpRight → drives the look-up gesture (= space)
 *
 * Higher-level intent detection (short blink vs long blink vs sustained
 * look-up vs noise) lives in `useBlink.ts`.
 */
import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

// WASM is served from /public so the version always matches the installed
// `@mediapipe/tasks-vision` (no CDN drift, no cross-origin surprises).
const WASM_BASE = "/mediapipe/wasm";

// The face_landmarker model lives on Google's official models bucket.
// ~3MB; we self-host later if we want offline support.
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export type FaceScores = {
  /** eyeBlinkLeft blendshape (0..1; 1 = fully closed). */
  blinkLeft: number;
  /** eyeBlinkRight blendshape (0..1). */
  blinkRight: number;
  /** eyeLookUpLeft blendshape (0..1; 1 = looking strongly up). */
  lookUpLeft: number;
  /** eyeLookUpRight blendshape (0..1). */
  lookUpRight: number;
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

export function extractFaceScores(
  result: FaceLandmarkerResult,
): FaceScores | null {
  const blendshapes = result.faceBlendshapes?.[0]?.categories;
  if (!blendshapes) return null;

  const out: FaceScores = {
    blinkLeft: 0,
    blinkRight: 0,
    lookUpLeft: 0,
    lookUpRight: 0,
  };
  for (const cat of blendshapes) {
    switch (cat.categoryName) {
      case "eyeBlinkLeft":
        out.blinkLeft = cat.score;
        break;
      case "eyeBlinkRight":
        out.blinkRight = cat.score;
        break;
      case "eyeLookUpLeft":
        out.lookUpLeft = cat.score;
        break;
      case "eyeLookUpRight":
        out.lookUpRight = cat.score;
        break;
    }
  }
  return out;
}
