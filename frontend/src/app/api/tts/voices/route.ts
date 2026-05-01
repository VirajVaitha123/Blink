/**
 * Diagnostic: lists the voices on the configured ElevenLabs account.
 *
 * Useful when the TTS route 402s — only voices with category "generated"
 * (Voice Design) or "cloned" are owned by you and usable on the free
 * tier. Voices with category "premade" or those added from the public
 * Voice Library count as "library voices" and require a paid plan.
 */

export const runtime = "nodejs";

export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return new Response("ELEVENLABS_API_KEY not configured", { status: 500 });
  }
  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) {
    return new Response(await res.text(), { status: res.status });
  }
  const data = (await res.json()) as {
    voices?: Array<{ voice_id: string; name: string; category?: string }>;
  };
  const summary = (data.voices ?? []).map((v) => ({
    voice_id: v.voice_id,
    name: v.name,
    category: v.category,
    free_tier_usable: v.category === "generated" || v.category === "cloned",
  }));
  return Response.json({ count: summary.length, voices: summary });
}
