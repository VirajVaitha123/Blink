"use client";

import ReactDOM from "react-dom";

/**
 * Resource hints emitted into the document <head> at the start of the
 * page lifecycle. We preload the wordlist + the MediaPipe model so the
 * browser fetches them in parallel with our JS instead of waiting for
 * `usePredictor` / `useBlink` to ask. Saves ~100-200ms on cold start.
 *
 * The component renders nothing — the side-effect is the registered hint.
 *
 * `ReactDOM.preload` is the React 19 / Next 16 idiomatic replacement for
 * a literal `<link rel="preload">` element; see Next's
 * `generate-metadata` docs (`<link rel="preload" />` row) for the
 * canonical recipe.
 */
export function PreloadResources() {
  ReactDOM.preload("/wordlist.json", {
    as: "fetch",
    crossOrigin: "anonymous",
  });
  // The face_landmarker model is ~3.6MB and blocks blink detection until
  // it loads. Preloading it from our own /public means the browser starts
  // the fetch in parallel with JS evaluation — same trick as the wordlist,
  // shaves ~100-200ms off the cold-start path before useBlink asks for it.
  ReactDOM.preload("/mediapipe/face_landmarker.task", {
    as: "fetch",
    crossOrigin: "anonymous",
  });
  return null;
}
