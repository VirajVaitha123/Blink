/**
 * Pre-recorded MP3s that bypass the ElevenLabs API entirely.
 *
 * Some cues sound off when generated on-the-fly because the TTS treats
 * isolated letters as English words ("Q" → "queue", "Y" → "why" with
 * question intonation, "U" → "you", and so on). For these, we ship a
 * recorded clip in /public/audio/ keyed by the same `groupSpokenLabel`
 * string that `usePredictor` / `page.tsx` send to `speak()`.
 *
 * On match, `useVoiceCues.fetchUrl` returns the static URL directly —
 * no network round-trip to /api/tts, no ElevenLabs quota burn, instant
 * first play. Anything not in this manifest still goes through the API
 * (transcript playback, ad-hoc cues, etc.).
 *
 * To swap a clip: replace the MP3 in /public/audio/, redeploy. The key
 * stays the same.
 */
export const STATIC_AUDIO: Readonly<Record<string, string>> = {
  "A. to. D.": "/audio/A-to-D.mp3",
  "E. to. H.": "/audio/E-to-H.mp3",
  "I. to. L.": "/audio/I-to-L.mp3",
  "M. to. P.": "/audio/M-to-P.mp3",
  "Q. to. T.": "/audio/Q-to-T.mp3",
  "U. to. X.": "/audio/U-to-X.mp3",
  "Y. to. Z.": "/audio/Y-to-Z.mp3",
};
