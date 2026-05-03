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
  // MediaPipe fetches its ~3MB face_landmarker.task model from this
  // Google bucket; opening the connection early shaves the TLS round-trip
  // off the cold-start path.
  ReactDOM.preconnect("https://storage.googleapis.com", {
    crossOrigin: "anonymous",
  });
  return null;
}
