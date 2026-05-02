#!/usr/bin/env node
// Generates public/wordlist.json from Peter Norvig's public Google web
// 1-gram frequency table (count_1w.txt). One-shot; re-run if you want to
// resize or refresh the list.
//
//   node scripts/build-wordlist.mjs           # top 5000 (default)
//   node scripts/build-wordlist.mjs 10000     # top 10000
//
// Output schema:
//   [{ "w": "the", "f": 23135851162 }, ...]
// Sorted by frequency desc.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = "https://norvig.com/ngrams/count_1w.txt";
const TOP_N = Number(process.argv[2] ?? 10000);

// AAC-critical vocabulary that Norvig's web-corpus ranking under-weights
// (people don't blog about being hungry; AAC users say it constantly).
// Each gets at least a top-500 rank so a one- or two-letter prefix surfaces
// it. Order matters within the list — earlier = higher boosted rank.
const AAC_BOOST = [
  "yes", "no", "ok", "please", "thanks", "sorry", "help",
  "want", "need", "feel", "hurts", "hurt", "pain",
  "hungry", "thirsty", "tired", "hot", "cold", "sick",
  "water", "food", "drink", "eat", "bathroom", "toilet", "bed", "sleep",
  "mom", "mum", "dad", "wife", "husband", "doctor", "nurse", "family",
  "hello", "hi", "bye", "goodbye", "love", "happy", "sad", "scared", "good", "bad",
  "today", "tomorrow", "yesterday", "now", "later", "morning", "night",
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "..", "public", "wordlist.json");

// Reject anything that isn't pure lowercase a-z. Filters out tokens like
// numbers, punctuation, and the OCR noise scattered through Norvig's set.
// Single-letter entries are kept only for the two real one-letter words.
const ALPHA = /^[a-z]+$/;
const ALLOWED_SINGLES = new Set(["a", "i"]);

console.log(`fetching ${SOURCE}…`);
const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
const text = await res.text();

const rows = [];
for (const line of text.split("\n")) {
  if (!line) continue;
  const [word, countStr] = line.split("\t");
  if (!word || !countStr) continue;
  if (!ALPHA.test(word)) continue;
  if (word.length === 1 && !ALLOWED_SINGLES.has(word)) continue;
  const count = Number(countStr);
  if (!Number.isFinite(count)) continue;
  rows.push({ w: word, f: count });
  if (rows.length >= TOP_N) break;
}

// Promote AAC-critical words. If already present at a worse rank, lift them
// to the boost slot; if missing, synthesize a frequency that places them
// among the top ~500 entries. The float math just gives stable ordering;
// only relative magnitude matters downstream.
const byWord = new Map(rows.map((r, i) => [r.w, i]));
const boostBaseFreq = rows[Math.min(500, rows.length - 1)]?.f ?? 0;
AAC_BOOST.forEach((word, idx) => {
  const synthFreq = boostBaseFreq * (1 + (AAC_BOOST.length - idx) / 100);
  const existingIdx = byWord.get(word);
  if (existingIdx !== undefined) {
    rows[existingIdx].f = Math.max(rows[existingIdx].f, synthFreq);
  } else {
    rows.push({ w: word, f: synthFreq });
  }
});
rows.sort((a, b) => b.f - a.f);

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(rows));
console.log(`wrote ${rows.length} words → ${OUT_PATH}`);
