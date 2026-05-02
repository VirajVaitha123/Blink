import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { NextConfig } from "next";

// Next.js only loads .env files from this project (frontend/) by default,
// but the repo keeps a single .env at the monorepo root so backend and
// frontend share one source of truth. Load it manually here so server-only
// vars like ELEVENLABS_API_KEY are available in route handlers.
loadRootEnv();

// Transformers.js pulls in `sharp` and `onnxruntime-node` for its
// server-side path. We only ever run it in the browser, so alias both
// to false in client bundles to avoid noisy "module not found" errors
// during build. (https://huggingface.co/docs/transformers.js/tutorials/next)
const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      sharp$: false,
      "onnxruntime-node$": false,
    };
    return config;
  },
  turbopack: {
    resolveAlias: {
      sharp: { browser: "data:text/javascript,export default null;" },
      "onnxruntime-node": {
        browser: "data:text/javascript,export default null;",
      },
    },
  },
};

export default nextConfig;

function loadRootEnv() {
  const path = resolve(__dirname, "..", ".env");
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
