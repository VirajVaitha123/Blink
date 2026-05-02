/**
 * Local LLM-backed word-completion predictor.
 *
 * Loads SmolLM2-135M-Instruct (q4f16 ONNX, ~118 MB) lazily via Transformers.js
 * and exposes a `predict(text)` that returns the top-k word continuations
 * given the current transcript. Same model handles both modes naturally:
 *   - mid-word ("I want hel"  → ["hello", "help", "held"])
 *   - post-space ("I want " → ["to", "you", "a"])
 *
 * The pipeline is a singleton because the model weights are ~118 MB and
 * we never want to re-download them within a session. After first load
 * Transformers.js caches the ONNX files in IndexedDB so subsequent visits
 * skip the network entirely.
 */
import { pipeline } from "@huggingface/transformers";

const MODEL_ID = "HuggingFaceTB/SmolLM2-135M-Instruct";

// Type the pipeline loosely — Transformers.js' generic types are awkward
// across versions and `any` here is contained to this module's surface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GeneratorPipeline = any;

let pipelineSingleton: GeneratorPipeline | null = null;
let inFlight: Promise<GeneratorPipeline> | null = null;

export type LoadProgress = {
  /** "downloading" while ONNX shards stream in, "ready" once usable. */
  status: "downloading" | "ready" | "error";
  /** 0..1 fraction of bytes loaded across the model's files. */
  fraction: number;
  /** Human-readable hint (current file or error message). */
  message?: string;
};

/**
 * Load (or return) the singleton text-generation pipeline. Repeated calls
 * before the first load resolves all share the same in-flight promise so
 * we never download twice.
 */
export async function loadPredictor(
  onProgress?: (p: LoadProgress) => void,
): Promise<GeneratorPipeline> {
  if (pipelineSingleton) {
    onProgress?.({ status: "ready", fraction: 1 });
    return pipelineSingleton;
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const pipe = await pipeline("text-generation", MODEL_ID, {
        dtype: "q4f16",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        progress_callback: (info: any) => {
          if (!onProgress) return;
          if (info?.status === "progress") {
            const total = info.total ?? 0;
            const loaded = info.loaded ?? 0;
            onProgress({
              status: "downloading",
              fraction: total > 0 ? loaded / total : 0,
              message: info.file,
            });
          } else if (info?.status === "done") {
            onProgress({ status: "downloading", fraction: 1, message: info.file });
          }
        },
      });
      pipelineSingleton = pipe;
      onProgress?.({ status: "ready", fraction: 1 });
      return pipe;
    } catch (err) {
      inFlight = null;
      const message = err instanceof Error ? err.message : String(err);
      onProgress?.({ status: "error", fraction: 0, message });
      throw err;
    }
  })();

  return inFlight;
}

export type PredictOptions = {
  /** How many distinct candidates to return. */
  k?: number;
  /** Generation cap; 4 covers most English words plus a small buffer. */
  maxNewTokens?: number;
};

/**
 * Return up to `k` candidate words that continue the given text.
 *
 * Internally beam-searches a few extra candidates and de-dupes, since
 * beams often collapse onto the same word with different trailing
 * punctuation. We extract just the first "word" of each continuation
 * (letters + apostrophes) so the caller can drop it straight into the
 * transcript without further parsing.
 */
export async function predict(
  text: string,
  options: PredictOptions = {},
): Promise<string[]> {
  const k = options.k ?? 3;
  const maxNewTokens = options.maxNewTokens ?? 4;
  if (text.length === 0) return [];

  const generator = await loadPredictor();
  const beams = Math.max(k * 2, 5);
  const raw = (await generator(text, {
    max_new_tokens: maxNewTokens,
    num_beams: beams,
    num_return_sequences: beams,
    do_sample: false,
    early_stopping: true,
    return_full_text: true,
  })) as Array<{ generated_text: string }>;

  const lastSpace = text.lastIndexOf(" ");
  const partialWord = text.slice(lastSpace + 1).toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of raw) {
    // From the same character offset onward in the generated text, read
    // forward to the next non-letter character. This reconstructs the
    // *completed* word — important for mid-word completion where the model
    // only adds a suffix to the user's prefix.
    const after = item.generated_text.slice(lastSpace + 1).trimStart();
    const match = after.match(/^([A-Za-z']+)/);
    if (!match) continue;
    const word = match[1];
    const lower = word.toLowerCase();
    // Filter: must extend the partial (if any), must not just echo it,
    // must be unique in the result set.
    if (partialWord && !lower.startsWith(partialWord)) continue;
    if (lower === partialWord) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(word);
    if (out.length >= k) break;
  }

  return out;
}
