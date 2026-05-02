# Considerations — follow-up work after `perf/optimisations`

This file captures an honest, post-perf-PR assessment of the codebase: what's
genuinely good, what would not pass a senior code review, what a from-scratch
build would have looked like, and what to do next, prioritised.

It exists to make the trade-offs visible so we can decide deliberately what
to clean up next, rather than letting "patched incrementally" smell accrete.

---

Honest take, no flattery.

## What I'm genuinely happy with

- **The discrete/continuous split.** This is the load-bearing insight and it's correct. Camera signals are not React state. That doesn't change with any rewrite.
- **Chunked wordlist build, system-ready gate, memo on heavy children.** These are all right calls and would survive a rewrite unchanged.
- **`predictor.ts` design.** Module-level singleton + `parseContext` is appropriate. I wouldn't change this from scratch either.

## What I'd push back on if I were reviewing this as a PR

### 1. `useBlink.ts` is doing too much (real SOLID violation)
350+ lines mixing MediaPipe lifecycle, rAF loop, **three near-identical gesture detectors**, discrete state publishing, and metrics pubsub. The blink/lookUp/lookRight blocks are copy-paste of the same hysteresis-with-episode pattern. From scratch I'd extract a `createEpisodicDetector({ name, scoreSelector, high, low, holdMs, fireKind })` and use it 3×. That would cut ~80 lines and make adding a 4th gesture (look-left? look-down?) a one-liner instead of another copy.

### 2. I rolled my own pubsub when React 18 ships exactly this primitive
`useSyncExternalStore` is the **official React API for "external data source that updates outside React"** — that's literally what we have. My custom `subscribeMetrics` + `useState` + `useEffect` does the same thing with more code, weaker StrictMode/concurrent-rendering guarantees, and a comment about a lint disable. Swapping it out is a 20-line change that makes the code more idiomatic and removes the eslint-disable footgun. **I should have used it from the start; this is the kind of thing a senior reviewer would call out.**

### 3. `useBlinkMetric`'s selector closure is a footgun
The selector is captured at mount. If someone passes `(m) => m.rightForMs / holdMs` where `holdMs` is a prop, they get stale reads. I papered over it with a lint disable. The fix is to switch to a **key-based API**: `useBlinkMetric(blink, "rightForMs")`. Type-safe, no closure trap, no lint disable needed.

### 4. Mnemonist is overkill
I'm using **one class with two methods** from a package that ships ~50 data structures. The trie code I actually use is 30 lines I could own. The defensive argument ("battle-tested lib") is weak when the lib is doing barely anything. From scratch I'd write the trie inline and drop the dep. Not urgent, but it's the kind of thing that accretes.

### 5. The `page.tsx` event handler is a 70-line if/else
`event.kind × state.phase → dispatch` is a lookup table pretending to be a function. From scratch I'd model it as a small handlers map keyed by `[kind, phase]`, or fold it into the reducer (since it's really a state transition). Right now it's spread between the reducer and the page, which means "what does pressing X do" requires reading two files.

### 6. **No tests.** This is the most serious one.
Real-time gesture detection with hysteresis is exactly the kind of code that breaks subtly when you adjust thresholds. The predictor, the scanner reducer, and the gesture detectors are all pure functions — they'd take ~150 lines of vitest to cover. For an AAC app where your cousin depends on this working, shipping zero tests is genuinely something I'd flag as "should not ship". This is the **single biggest gap** in the codebase, bigger than any of the perf stuff we just fixed.

### 7. Resilience gaps
If MediaPipe fails to load (slow network, blocked CDN, GPU delegate missing), the user sees an error string and the keyboard becomes unusable — there's no mouse/keyboard fallback for letter selection. For an AAC tool that's a real problem. From scratch I'd have keyboard `Tab`/`Enter` work as a fallback for "blink" so the user never gets stranded.

---

## What I would have built from scratch

Same data flow, but tighter:

1. **State**: `useReducer` for the scanner is fine — no library needed. **Zustand** for any cross-cutting store (not necessary today; flag for "if state grows").
2. **MediaPipe layer**: as today.
3. **Gesture detection**: one generic detector factory, used 3× — replaces the copy-paste.
4. **External-store glue**: `useSyncExternalStore` instead of my custom pubsub.
5. **Animation**: dwell-fill bar via direct DOM write from the rAF loop. Zero React involvement for the hot animation. Currently I do React-state-with-throttling, which is fine — but DOM-direct is one strict step better and uses *less* code, not more.
6. **Wordlist**: static file (correct), `<link rel="preload">` in the head, custom 30-line trie instead of mnemonist.
7. **Audio**: pool one `<Audio>` element, reuse for cues, instead of `new Audio()` each time.
8. **Tests**: vitest from day 1 on predictor, reducer, gesture detector. ~150 LOC.
9. **Fallback input**: keyboard navigation works without the camera. Belt-and-braces for an AAC tool.

The result would be **~30% less code and meaningfully more robust**, while doing the same thing.

---

## What I'd actually do next, prioritized

**Ship-blocking (do before merging this PR or in a follow-up immediately):**
- Swap custom pubsub for `useSyncExternalStore`. ~20 LOC delta, code quality win, removes the lint-disable.
- Switch `useBlinkMetric` to key-based API. Removes the footgun.
- Extract the gesture-detector factory. Cuts duplication.

**High value, separate PR:**
- **Add tests.** Predictor, scanner reducer, gesture detector. This is the gap I'm most uncomfortable about.

**Worthwhile but not urgent:**
- Replace mnemonist with a 30-line trie.
- Pool the Audio element in `useVoiceCues`.
- Add `<link rel="preload">` for the wordlist.
- Keyboard fallback for selections.

**Skip / defer:**
- Zustand migration. Not worth it at this scale yet.
- Direct-DOM dwell-fill. Marginal over what we have.

---

So: **am I happy?** I'd ship the perf fixes today because they actually fix the lag and they're not introducing anything wrong. But the codebase has real "patched incrementally" smell now — particularly the bloated `useBlink` and the lack of tests. If you want, the cleanest move is to merge this `perf/optimisations` branch as-is (it's a focused perf fix, easy to review), then I open a follow-up `refactor/blink-internals` branch that does items 1–3 from "ship-blocking", and a `test/core-logic` branch after that. Three small PRs, each easy to review, instead of one mega-PR mixing perf + refactor + tests.
