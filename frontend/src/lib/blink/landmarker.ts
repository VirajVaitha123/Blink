/**
 * Loads Google's MediaPipe Face Landmarker (with blendshapes) and runs it on
 * a video element. We rely on the model's built-in blendshape scores —
 * pre-trained, no calibration needed for first-pass.
 *
 * Per-frame we extract:
 *   - eyeBlinkLeft / eyeBlinkRight     → drives the blink hook (intent + long)
 *   - eyeLookUpLeft / eyeLookUpRight   → drives the look-up gesture (= select)
 *   - eyeLookDownLeft / eyeLookDownRight → drives the look-down gesture
 *     (= backspace with visual fill on the menu Backspace pill).
 *   - eyeLookOutRight + eyeLookInLeft  → drives the look-right gesture
 *     (opens the suggestion picker). Both eyes pointing right from the
 *     user's POV means right eye outward + left eye inward.
 *   - eyeLookOutLeft + eyeLookInRight  → drives the look-left gesture
 *     (instant backspace, no fill). Mirror of the look-right pair.
 *
 * Higher-level intent detection (short blink vs long blink vs sustained
 * look-up vs noise) lives in `useBlink.ts`.
 */
import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

// WASM and the face_landmarker model are both served from /public so the
// page makes zero third-party requests on cold load. Pinning the model in
// the repo (~3.6MB) means Google can't silently swap weights under us and
// no visitor IP/UA leaks to storage.googleapis.com.
const WASM_BASE = "/mediapipe/wasm";
const MODEL_URL = "/mediapipe/face_landmarker.task";

export type FaceScores = {
  /** eyeBlinkLeft blendshape (0..1; 1 = fully closed). */
  blinkLeft: number;
  /** eyeBlinkRight blendshape (0..1). */
  blinkRight: number;
  /** eyeLookUpLeft blendshape (0..1; 1 = looking strongly up). */
  lookUpLeft: number;
  /** eyeLookUpRight blendshape (0..1). */
  lookUpRight: number;
  /** eyeLookOutRight blendshape (right eye rotates outward = looking right). */
  lookOutRight: number;
  /** eyeLookInLeft blendshape (left eye rotates inward = looking right). */
  lookInLeft: number;
  /** eyeLookOutLeft blendshape (left eye rotates outward = looking left). */
  lookOutLeft: number;
  /** eyeLookInRight blendshape (right eye rotates inward = looking left). */
  lookInRight: number;
  /** eyeLookDownLeft blendshape (0..1; 1 = looking strongly down). */
  lookDownLeft: number;
  /** eyeLookDownRight blendshape (0..1). */
  lookDownRight: number;
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
    lookOutRight: 0,
    lookInLeft: 0,
    lookOutLeft: 0,
    lookInRight: 0,
    lookDownLeft: 0,
    lookDownRight: 0,
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
      case "eyeLookOutRight":
        out.lookOutRight = cat.score;
        break;
      case "eyeLookInLeft":
        out.lookInLeft = cat.score;
        break;
      case "eyeLookOutLeft":
        out.lookOutLeft = cat.score;
        break;
      case "eyeLookInRight":
        out.lookInRight = cat.score;
        break;
      case "eyeLookDownLeft":
        out.lookDownLeft = cat.score;
        break;
      case "eyeLookDownRight":
        out.lookDownRight = cat.score;
        break;
    }
  }
  return out;
}
