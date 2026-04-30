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

const ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech";
// Rachel — a stock ElevenLabs voice that doesn't require a custom voice
// in the user's account. Override with ELEVENLABS_VOICE_ID if desired.
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

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

  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID;
  const upstream = await fetch(
    `${ELEVENLABS_URL}/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_flash_v2_5",
      }),
    },
  );

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
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
