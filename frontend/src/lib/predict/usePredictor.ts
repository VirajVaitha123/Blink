"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { parseContext, Predictor, type WordlistEntry } from "./predictor";

const WORDLIST_URL = "/wordlist.json";
const STORAGE_KEY_PERSONAL = "blink.predictor.personal.v1";
const STORAGE_KEY_BIGRAMS = "blink.predictor.bigrams.v1";

// Build the trie in slices of this many words, yielding to the main thread
// between slices. ~10k words / 1k = ~10 yields, each one giving the
// scheduler a chance to paint or run the MediaPipe rAF tick. With one
// big synchronous load() the cold-start jank was visible for ~80ms; with
// chunking it's spread invisibly across a couple of frames.
const TRIE_BUILD_CHUNK = 1000;

// Module-level singleton, instantiated synchronously so cold-start
// suggestions (SENTENCE_STARTERS, bigrams) are available on the very
// first render — these paths don't need the wordlist trie. The wordlist
// fetch fills in the trie asynchronously for mid-word prefix completion.
const predictorInstance = new Predictor();
let wordlistLoadPromise: Promise<void> | null = null;
let wordlistLoaded = false;

function ensureWordlistLoaded(): Promise<void> {
  if (!wordlistLoadPromise) {
    wordlistLoadPromise = (async () => {
      const res = await fetch(WORDLIST_URL);
      if (!res.ok) {
        throw new Error(
          `wordlist fetch failed: ${res.status} ${res.statusText}`,
        );
      }
      const data: ReadonlyArray<WordlistEntry> = await res.json();
      // Build in slices, yielding between each, so the ~80ms of synchronous
      // trie work doesn't block MediaPipe's rAF tick during cold-start.
      for (let i = 0; i < data.length; i += TRIE_BUILD_CHUNK) {
        predictorInstance.load(data.slice(i, i + TRIE_BUILD_CHUNK));
        if (i + TRIE_BUILD_CHUNK < data.length) {
          await yieldToMain();
        }
      }
      wordlistLoaded = true;
    })();
  }
  return wordlistLoadPromise;
}

function yieldToMain(): Promise<void> {
  // requestIdleCallback is ideal but Safari doesn't ship it; setTimeout(0)
  // is a fine fallback — it gives the scheduler a microtask boundary.
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      (window as Window & {
        requestIdleCallback: (cb: () => void) => void;
      }).requestIdleCallback(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

let personalHydrated = false;
function hydratePersonalOnce(): void {
  if (personalHydrated || typeof window === "undefined") return;
  personalHydrated = true;
  try {
    const personalRaw = window.localStorage.getItem(STORAGE_KEY_PERSONAL);
    if (personalRaw) predictorInstance.loadPersonal(JSON.parse(personalRaw));
  } catch {
    window.localStorage.removeItem(STORAGE_KEY_PERSONAL);
  }
  try {
    const bigramRaw = window.localStorage.getItem(STORAGE_KEY_BIGRAMS);
    if (bigramRaw) predictorInstance.loadDynamicBigrams(JSON.parse(bigramRaw));
  } catch {
    window.localStorage.removeItem(STORAGE_KEY_BIGRAMS);
  }
}

export type UsePredictorResult = {
  /** Wordlist loaded and the trie is fully populated for prefix lookup. */
  ready: boolean;
  /** Top suggestions for the current transcript. Stable reference per text. */
  suggestions: readonly string[];
  /** Record a committed word; updates personal usage + dynamic bigram. */
  commit: (word: string) => void;
  /** Non-null if the wordlist fetch failed; cold-start chips still work. */
  error: string | null;
};

export function usePredictor(
  text: string,
  topK = 5,
): UsePredictorResult {
  // `ready` flips true once the wordlist load resolves; the change drives
  // the suggestions memo to recompute now that the trie has data.
  const [ready, setReady] = useState(wordlistLoaded);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    hydratePersonalOnce();
    ensureWordlistLoaded()
      .then(() => {
        if (cancelled) return;
        setReady(true);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // `ready` is intentional in the dep list even though predictor.suggest
  // doesn't reference it — it forces the memo to recompute the moment
  // the wordlist finishes loading so prefix completions appear without
  // needing another keystroke. The lint rule can't see this.
  const suggestions = useMemo<readonly string[]>(
    () => predictorInstance.suggest(text, topK),
    [text, topK, ready], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Always-fresh text ref so commit() can read the transcript at the
  // moment the user accepted a chip without re-binding the callback on
  // every keystroke.
  const textRef = useRef(text);
  useEffect(() => {
    textRef.current = text;
  });

  const commit = useCallback((word: string) => {
    const { prev } = parseContext(textRef.current);
    predictorInstance.commit(prev, word);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          STORAGE_KEY_PERSONAL,
          JSON.stringify(predictorInstance.exportPersonal()),
        );
        window.localStorage.setItem(
          STORAGE_KEY_BIGRAMS,
          JSON.stringify(predictorInstance.exportDynamicBigrams()),
        );
      } catch {
        // Quota or storage disabled — silently drop persistence; the
        // in-memory predictor still works for this session.
      }
    }
  }, []);

  // Memoise so consumers (useEffect deps, useCallback deps) get a stable
  // reference unless something actually changed. Without this, every
  // parent render produced a fresh object, defeating downstream memo.
  return useMemo<UsePredictorResult>(
    () => ({ ready, suggestions, commit, error }),
    [ready, suggestions, commit, error],
  );
}
