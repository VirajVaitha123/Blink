/**
 * Word predictor for the AAC scanner. Pure data-structure work — no model,
 * no inference, no fetch beyond loading the static wordlist once.
 *
 * Suggestions are produced by combining four signals:
 *
 *   - Base frequency from a precomputed wordlist (Norvig / Google n-grams)
 *   - Static bigrams (BIGRAMS) — hand-curated AAC-shaped continuations
 *   - Dynamic bigrams — pairs the user has actually produced this app
 *   - Personal usage — how often the user has committed each word
 *
 * Two modes, picked by parsing the transcript:
 *
 *   - Mid-word ("hel"):     prefix lookup in the trie, scored above
 *   - After space ("i ​"):  next-word prediction from bigrams + personal
 *                           history, with a SENTENCE_STARTERS fallback
 *
 * Personal data is owned here; the React hook persists it to localStorage.
 */

// Top-level named import: mnemonist's package exports map only resolves
// deep paths for CommonJS, so `from "mnemonist/trie"` won't ESM-resolve
// under Turbopack. Tree-shaking drops the unused exports (`sideEffects: false`).
import { Trie } from "mnemonist";

import { BIGRAMS, SENTENCE_STARTERS } from "./bigrams";

export type WordlistEntry = { w: string; f: number };

/**
 * Score weights, calibrated against the Google n-gram magnitudes in the
 * wordlist (top word ~2.3e10, top-500 ~1e8, top-10k ~1e6).
 *
 * - PERSONAL_WEIGHT: one user-commit ~ a top-1k word's base frequency,
 *   so 5–10 uses make a personal word dominate among prefix peers.
 * - BIGRAM_WEIGHT:   a static bigram match outranks the top stop word's
 *   raw frequency, so "i ha" → "have" beats "had/has" cleanly.
 * - DYNAMIC_BIGRAM_WEIGHT: each user-observed pair counts roughly 5x a
 *   static bigram entry — the user's own phrasing wins fast.
 */
const PERSONAL_WEIGHT = 1e8;
const BIGRAM_WEIGHT = 5e9;
const DYNAMIC_BIGRAM_WEIGHT = 2.5e10;

export type ParsedContext = {
  /** Previous full word, lowercase, or null at the start of the transcript. */
  prev: string | null;
  /** The current partial word (lowercase a-z only), or "" if just past a space. */
  partial: string;
};

export class Predictor {
  private readonly trie = new Trie<string>();
  private readonly base = new Map<string, number>();
  private readonly personal = new Map<string, number>();
  private readonly dynamicBigrams = new Map<string, Map<string, number>>();

  /** Wordlist from /wordlist.json. Idempotent — safe to call once on startup. */
  load(entries: ReadonlyArray<WordlistEntry>): void {
    for (const { w, f } of entries) {
      if (!this.base.has(w)) this.trie.add(w);
      this.base.set(w, f);
    }
  }

  /** Hydrate persisted state from localStorage. */
  loadPersonal(personal: ReadonlyArray<readonly [string, number]>): void {
    for (const [w, n] of personal) this.personal.set(w, n);
  }

  loadDynamicBigrams(data: Readonly<Record<string, Record<string, number>>>): void {
    for (const [prev, nexts] of Object.entries(data)) {
      this.dynamicBigrams.set(prev, new Map(Object.entries(nexts)));
    }
  }

  /** Snapshot for persistence. */
  exportPersonal(): Array<[string, number]> {
    return [...this.personal.entries()];
  }

  exportDynamicBigrams(): Record<string, Record<string, number>> {
    const out: Record<string, Record<string, number>> = {};
    for (const [k, m] of this.dynamicBigrams) out[k] = Object.fromEntries(m);
    return out;
  }

  /**
   * Record a user-committed word. Updates personal usage and (if a previous
   * word is supplied) the dynamic bigram from prev → word.
   */
  commit(prev: string | null, word: string): void {
    const w = word.toLowerCase();
    if (!w) return;
    this.personal.set(w, (this.personal.get(w) ?? 0) + 1);
    if (prev) {
      const p = prev.toLowerCase();
      let m = this.dynamicBigrams.get(p);
      if (!m) {
        m = new Map();
        this.dynamicBigrams.set(p, m);
      }
      m.set(w, (m.get(w) ?? 0) + 1);
    }
  }

  /** Top-k suggestions for the current transcript. */
  suggest(text: string, k = 5): string[] {
    const { prev, partial } = parseContext(text);
    if (partial.length === 0) return this.suggestNext(prev, k);
    return this.suggestPrefix(prev, partial, k);
  }

  private suggestPrefix(prev: string | null, prefix: string, k: number): string[] {
    const matches = this.trie.find(prefix);
    if (matches.length === 0) return [];
    const scored: Array<readonly [string, number]> = matches.map(
      (w) => [w, this.score(prev, w)] as const,
    );
    scored.sort((a, b) => b[1] - a[1]);
    return scored.slice(0, k).map(([w]) => w);
  }

  private suggestNext(prev: string | null, k: number): string[] {
    if (!prev) return SENTENCE_STARTERS.slice(0, k);

    const candidates = new Map<string, number>();
    const staticNext = BIGRAMS[prev];
    if (staticNext) {
      staticNext.forEach((w, i) => {
        // Static priority: earlier in the list = higher score.
        candidates.set(w, (staticNext.length - i) * 100);
      });
    }
    const dyn = this.dynamicBigrams.get(prev);
    if (dyn) {
      for (const [w, n] of dyn) {
        candidates.set(w, (candidates.get(w) ?? 0) + n * 1000);
      }
    }
    if (candidates.size === 0) return SENTENCE_STARTERS.slice(0, k);
    return [...candidates.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([w]) => w);
  }

  private score(prev: string | null, word: string): number {
    let s = this.base.get(word) ?? 0;
    s += (this.personal.get(word) ?? 0) * PERSONAL_WEIGHT;
    if (prev) {
      const staticNext = BIGRAMS[prev];
      if (staticNext) {
        const idx = staticNext.indexOf(word);
        if (idx >= 0) s += (staticNext.length - idx) * BIGRAM_WEIGHT;
      }
      const n = this.dynamicBigrams.get(prev)?.get(word);
      if (n) s += n * DYNAMIC_BIGRAM_WEIGHT;
    }
    return s;
  }
}

/**
 * Pull the current partial-word and previous-completed-word out of the
 * transcript. Lowercased, non-letter chars stripped from the partial so
 * digits or stray punctuation don't break trie lookup.
 */
export function parseContext(text: string): ParsedContext {
  const lower = text.toLowerCase();
  if (/\s$/.test(lower)) {
    const trimmed = lower.replace(/\s+$/, "");
    const lastSpace = trimmed.lastIndexOf(" ");
    const prev = lastSpace === -1 ? trimmed : trimmed.slice(lastSpace + 1);
    return { prev: prev || null, partial: "" };
  }
  const lastSpace = lower.lastIndexOf(" ");
  const partialRaw = lower.slice(lastSpace + 1);
  const beforePartial = lastSpace === -1 ? "" : lower.slice(0, lastSpace);
  const prevSpace = beforePartial.lastIndexOf(" ");
  const prev = prevSpace === -1 ? beforePartial : beforePartial.slice(prevSpace + 1);
  return {
    prev: prev || null,
    partial: partialRaw.replace(/[^a-z]/g, ""),
  };
}
