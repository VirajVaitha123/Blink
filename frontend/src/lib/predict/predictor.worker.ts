/**
 * Web Worker that hosts the Transformers.js pipeline.
 *
 * Lives off the main thread so beam-search inference (~100-400ms per call)
 * doesn't block the rAF loop that drives the blink-detection visuals. All
 * the casing/filtering logic that used to live in predictor.ts is here too,
 * so the worker is the single owner of "how predictions are produced" and
 * the main-thread shim just shuttles strings.
 *
 * Message protocol (intentionally minimal):
 *   in  ← { type: "load" }
 *        { type: "predict", id, text, k, maxNewTokens }
 *   out → { type: "progress", loaded, total, file }
 *        { type: "ready" }
 *        { type: "loadError", message }
 *        { type: "result", id, words }
 *        { type: "predictError", id, message }
 */
/// <reference lib="webworker" />

import { pipeline } from "@huggingface/transformers";

declare const self: DedicatedWorkerGlobalScope;

const MODEL_ID = "HuggingFaceTB/SmolLM2-135M-Instruct";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GeneratorPipeline = any;

let generatorPromise: Promise<GeneratorPipeline> | null = null;

type IncomingMessage =
  | { type: "load" }
  | {
      type: "predict";
      id: number;
      text: string;
      k: number;
      maxNewTokens: number;
    };

function ensureGenerator(): Promise<GeneratorPipeline> {
  if (generatorPromise) return generatorPromise;
  generatorPromise = pipeline("text-generation", MODEL_ID, {
    dtype: "q4f16",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    progress_callback: (info: any) => {
      if (info?.status === "progress") {
        self.postMessage({
          type: "progress",
          loaded: info.loaded ?? 0,
          total: info.total ?? 0,
          file: info.file,
        });
      }
    },
  })
    .then((g) => {
      self.postMessage({ type: "ready" });
      return g;
    })
    .catch((err) => {
      generatorPromise = null;
      const message = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: "loadError", message });
      throw err;
    });
  return generatorPromise;
}

self.onmessage = async (e: MessageEvent<IncomingMessage>) => {
  const msg = e.data;
  if (msg.type === "load") {
    ensureGenerator().catch(() => {
      // Already reported via loadError; just swallow the rejection here
      // so it doesn't surface as an unhandled promise.
    });
    return;
  }
  if (msg.type === "predict") {
    try {
      const words = await runPrediction(msg.text, msg.k, msg.maxNewTokens);
      self.postMessage({ type: "result", id: msg.id, words });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: "predictError", id: msg.id, message });
    }
  }
};

async function runPrediction(
  text: string,
  k: number,
  maxNewTokens: number,
): Promise<string[]> {
  if (text.length === 0) return [];

  // The keyboard is all-caps so the transcript is e.g. "HEL", but the
  // language model was trained on natural text where uppercase mid-word
  // is rare. Lowercase for inference, then re-upper the result so it
  // matches the transcript's style when inserted.
  const lowered = text.toLowerCase();

  const generator = await ensureGenerator();
  const beams = Math.max(k * 2, 5);
  const raw = (await generator(lowered, {
    max_new_tokens: maxNewTokens,
    num_beams: beams,
    num_return_sequences: beams,
    do_sample: false,
    early_stopping: true,
    return_full_text: true,
  })) as Array<{ generated_text: string }>;

  const lastSpace = lowered.lastIndexOf(" ");
  const partialWord = lowered.slice(lastSpace + 1);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of raw) {
    const after = item.generated_text.slice(lastSpace + 1).trimStart();
    const match = after.match(/^([A-Za-z']+)/);
    if (!match) continue;
    const lower = match[1].toLowerCase();
    if (partialWord && !lower.startsWith(partialWord)) continue;
    if (lower === partialWord) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(lower.toUpperCase());
    if (out.length >= k) break;
  }
  return out;
}
