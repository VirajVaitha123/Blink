/**
 * ElevenLabs text-to-speech proxy.
 *
 * Keeping the API key server-side: the browser POSTs a short phrase, we
 * forward it to ElevenLabs with the secret key from env, and stream the
 * MP3 back. Used for voice cues like "Starting" / "Opened menu" that fire
 * on long-blink transitions in the scanner.
 *
 * eleven_flash_v2_5 is chosen for latency — these cues need to feel
 * immediate, so quality is traded for ~75ms TTFB.
 */

export const runtime = "nodejs";

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

// Free-tier ElevenLabs keys can only use the account's "default" voices
// (category="premade") — voices added from the public library or marked
// professional return 402. If ELEVENLABS_VOICE_ID isn't set we fetch the
// voice list once, pick the first premade voice, and cache it.
let cachedVoiceId: string | null = null;
async function resolveVoiceId(apiKey: string): Promise<string> {
  if (process.env.ELEVENLABS_VOICE_ID) return process.env.ELEVENLABS_VOICE_ID;
  if (cachedVoiceId) return cachedVoiceId;
  const res = await fetch(`${ELEVENLABS_BASE}/voices`, {
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) {
    throw new Error(`voices ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as {
    voices?: Array<{ voice_id: string; category?: string; name?: string }>;
  };
  const voices = data.voices ?? [];
  // Free-tier compatible categories, in preference order.
  const premade = voices.find((v) => v.category === "premade");
  const generated = voices.find((v) => v.category === "generated");
  const cloned = voices.find((v) => v.category === "cloned");
  const pick = premade ?? generated ?? cloned;
  if (!pick) {
    throw new Error(
      `no free-tier voices on this account (found ${voices.length} voices, none premade/generated/cloned)`,
    );
  }
  console.log(
    `[tts] using voice "${pick.name}" (${pick.category}) ${pick.voice_id}`,
  );
  cachedVoiceId = pick.voice_id;
  return pick.voice_id;
}

export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return new Response("ELEVENLABS_API_KEY not configured", { status: 500 });
  }

  let text: unknown;
  try {
    ({ text } = await request.json());
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  if (typeof text !== "string" || text.length === 0 || text.length > 200) {
    return new Response("text must be a non-empty string ≤200 chars", {
      status: 400,
    });
  }

  let voiceId: string;
  try {
    voiceId = await resolveVoiceId(apiKey);
  } catch (err) {
    console.error(`[tts] could not resolve voice: ${(err as Error).message}`);
    return new Response(`could not resolve voice: ${(err as Error).message}`, {
      status: 502,
    });
  }
  const upstream = await fetch(
    `${ELEVENLABS_BASE}/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        // eleven_flash_v2_5 is the lowest-latency model (~75ms TTFB).
        // The cues are 1-3 words so quality difference is negligible
        // and snappiness matters far more than fidelity.
        model_id: "eleven_flash_v2_5",
      }),
    },
  );

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    console.error(
      `[tts] ElevenLabs ${upstream.status} for voice=${voiceId}: ${detail}`,
    );
    return new Response(`tts upstream ${upstream.status}: ${detail}`, {
      status: 502,
    });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
