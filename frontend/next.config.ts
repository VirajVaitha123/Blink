import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { NextConfig } from "next";

// Next.js only loads .env files from this project (frontend/) by default,
// but the repo keeps a single .env at the monorepo root so backend and
// frontend share one source of truth. Load it manually here so server-only
// vars like ELEVENLABS_API_KEY are available in route handlers.
loadRootEnv();

// Security response headers applied to every route. Defense-in-depth: the
// app has very low XSS surface (no dangerouslySetInnerHTML, transcript
// rendered as text), but these stop a few classes of attack outright with
// no runtime cost.
//
//   X-Frame-Options:           refuses iframe embedding so a malicious
//                              wrapper page can't overlay UI on top of
//                              the camera permission prompt
//   X-Content-Type-Options:    blocks MIME sniffing
//   Referrer-Policy:           limits URL leakage to third parties
//   Permissions-Policy:        even a compromised dep can't silently
//                              request microphone/geolocation/etc.;
//                              camera is the only thing the app uses
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
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
