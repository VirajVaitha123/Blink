import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { NextConfig } from "next";

// Next.js only loads .env files from this project (frontend/) by default,
// but the repo keeps a single .env at the monorepo root so backend and
// frontend share one source of truth. Load it manually here so server-only
// vars like ELEVENLABS_API_KEY are available in route handlers.
loadRootEnv();

const nextConfig: NextConfig = {};

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
