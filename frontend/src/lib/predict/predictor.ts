/**
 * Main-thread façade over the Web Worker that hosts the language model.
 *
 * Public API (loadPredictor / predict) is unchanged from before so the
 * usePredictor hook didn't have to change — only the implementation
 * moved off-thread.
 *
 * The worker is created lazily on first use; subsequent calls share it
 * (and therefore share the loaded model). Predictions are correlated
 * by an incrementing id so multiple in-flight requests don't get tangled.
 */

export type LoadProgress = {
  status: "downloading" | "ready" | "error";
  /** 0..1 fraction of bytes downloaded across the model's files. */
  fraction: number;
  message?: string;
};

type WorkerMessage =
  | { type: "progress"; loaded: number; total: number; file?: string }
  | { type: "ready" }
  | { type: "loadError"; message: string }
  | { type: "result"; id: number; words: string[] }
  | { type: "predictError"; id: number; message: string };

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<
  number,
  { resolve: (words: string[]) => void; reject: (err: Error) => void }
>();

let cachedReady = false;
let cachedError: string | null = null;
let loadStarted = false;
let progressFn: ((p: LoadProgress) => void) | null = null;
const readyWaiters: Array<{ resolve: () => void; reject: (e: Error) => void }> =
  [];

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./predictor.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
    const msg = e.data;
    switch (msg.type) {
      case "progress": {
        const fraction = msg.total > 0 ? msg.loaded / msg.total : 0;
        progressFn?.({
          status: "downloading",
          fraction,
          message: msg.file,
        });
        break;
      }
      case "ready": {
        cachedReady = true;
        progressFn?.({ status: "ready", fraction: 1 });
        for (const w of readyWaiters) w.resolve();
        readyWaiters.length = 0;
        break;
      }
      case "loadError": {
        cachedError = msg.message;
        progressFn?.({
          status: "error",
          fraction: 0,
          message: msg.message,
        });
        const err = new Error(msg.message);
        for (const w of readyWaiters) w.reject(err);
        readyWaiters.length = 0;
        break;
      }
      case "result":
        pending.get(msg.id)?.resolve(msg.words);
        pending.delete(msg.id);
        break;
      case "predictError":
        pending.get(msg.id)?.reject(new Error(msg.message));
        pending.delete(msg.id);
        break;
    }
  };
  return worker;
}

/**
 * Kick off (or join) the model load. The optional `onProgress` callback
 * receives every progress tick plus the final ready/error event. The
 * returned promise resolves once the worker reports "ready".
 */
export function loadPredictor(
  onProgress?: (p: LoadProgress) => void,
): Promise<void> {
  if (onProgress) progressFn = onProgress;
  const w = getWorker();
  if (cachedReady) {
    onProgress?.({ status: "ready", fraction: 1 });
    return Promise.resolve();
  }
  if (cachedError) {
    onProgress?.({ status: "error", fraction: 0, message: cachedError });
    return Promise.reject(new Error(cachedError));
  }
  if (!loadStarted) {
    loadStarted = true;
    w.postMessage({ type: "load" });
  }
  return new Promise<void>((resolve, reject) => {
    readyWaiters.push({ resolve, reject });
  });
}

export type PredictOptions = {
  k?: number;
  maxNewTokens?: number;
};

/**
 * Send `text` to the worker for inference and return the top-k word
 * continuations. Lowercasing/uppercasing and beam post-processing all
 * happen inside the worker so the main thread never touches the model.
 */
export async function predict(
  text: string,
  options: PredictOptions = {},
): Promise<string[]> {
  if (text.length === 0) return [];
  await loadPredictor();
  const id = nextId++;
  return new Promise<string[]>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({
      type: "predict",
      id,
      text,
      k: options.k ?? 3,
      maxNewTokens: options.maxNewTokens ?? 4,
    });
  });
}
