/**
 * React hook over the predictor singleton.
 *
 * Loads the model on mount (once `enabled`), tracks download progress,
 * and re-runs predictions whenever the input text changes. Concurrent
 * predictions are de-duped by an in-flight token so a slow inference
 * can't overwrite a fresher one.
 */
"use client";

import { useEffect, useRef, useState } from "react";

import {
  loadPredictor,
  predict,
  type LoadProgress,
} from "./predictor";

export type PredictorState = {
  /** True once the model is loaded and ready to predict. */
  ready: boolean;
  /** Live load progress; null before loading starts, persists after. */
  progress: LoadProgress | null;
  /** Last error message, if loading or predicting failed. */
  error: string | null;
  /** Current top-k suggestions for the active text. */
  suggestions: string[];
};

export function usePredictor(text: string, enabled = true): PredictorState {
  const [state, setState] = useState<PredictorState>({
    ready: false,
    progress: null,
    error: null,
    suggestions: [],
  });

  // Bumped on each prediction call so older inferences can drop their
  // results when a fresher input has come along.
  const requestIdRef = useRef(0);

  // Load the model once `enabled` flips true.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadPredictor((progress) => {
      if (cancelled) return;
      setState((s) => ({
        ...s,
        progress,
        ready: progress.status === "ready",
        error:
          progress.status === "error"
            ? (progress.message ?? "load failed")
            : s.error,
      }));
    }).catch((err) => {
      if (cancelled) return;
      setState((s) => ({
        ...s,
        error: err instanceof Error ? err.message : String(err),
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // Re-predict whenever the text changes (and the model is ready).
  // `predict("")` returns `[]` cheaply so we don't need a synchronous
  // empty-text branch here (which the React lint forbids inside effects).
  useEffect(() => {
    if (!state.ready) return;
    const myId = ++requestIdRef.current;
    let cancelled = false;
    predict(text, { k: 3 })
      .then((words) => {
        if (cancelled || requestIdRef.current !== myId) return;
        setState((s) => ({ ...s, suggestions: words }));
      })
      .catch((err) => {
        if (cancelled || requestIdRef.current !== myId) return;
        setState((s) => ({
          ...s,
          error: err instanceof Error ? err.message : String(err),
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [text, state.ready]);

  return state;
}
