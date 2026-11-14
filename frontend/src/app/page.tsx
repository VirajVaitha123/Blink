"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { BlinkStatus } from "@/components/BlinkStatus";
import { CameraView } from "@/components/CameraView";
import { CommandBar } from "@/components/CommandBar";
import { GestureLegend } from "@/components/GestureLegend";
import { ScanGrid } from "@/components/ScanGrid";
import { ScanSpeedControl } from "@/components/ScanSpeedControl";
import { SuggestionStrip } from "@/components/SuggestionStrip";
import { Transcript } from "@/components/Transcript";
import { useBlink, type BlinkEvent } from "@/lib/blink/useBlink";
import {
  ACTION_BY_ID,
  GESTURES,
  gestureFor,
  hintFor,
  type ActionId,
  type ControlSettings,
} from "@/lib/controls/controls";
import { updateControls, useControls } from "@/lib/controls/useControls";
import { usePredictor } from "@/lib/predict/usePredictor";
import {
  DEFAULT_COMMANDS,
  DEFAULT_GROUP_SPOKEN_LABELS,
  DEFAULT_GROUPS,
} from "@/lib/scanner/layouts";
import { useScanner } from "@/lib/scanner/useScanner";
import { useVoiceCues } from "@/lib/voice/useVoiceCues";

// Stable identity so useVoiceCues' prewarm effect doesn't re-run each render.
// Group labels ("A to D", "E to H", …) are spoken every time the cursor lands
// on a group during scanning, so they're prewarmed alongside the static cues
// — the very first announcement should fire instantly with no API round-trip.
const VOICE_CUES: readonly string[] = [
  "Starting",
  "Opened menu",
  "Resumed",
  "Space",
  "Backspace",
  "Suggestions",
  "Cancelled",
  ...DEFAULT_GROUP_SPOKEN_LABELS,
];

export default function Home() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  // Bindings (gesture → action), per-gesture tuning and scan speed, all
  // persisted and editable on /controls. The 1600ms default scan speed is
  // an audio-pacing tune: breathing room between a cue finishing and the
  // cursor advancing.
  const controls = useControls();
  const { scanMs } = controls;
  const setScanMs = useCallback((next: number) => {
    updateControls((c) => ({ ...c, scanMs: next }));
  }, []);

  const { state, dispatch } = useScanner({
    scanMs,
    groups: DEFAULT_GROUPS,
    commands: DEFAULT_COMMANDS,
  });

  const speak = useVoiceCues(VOICE_CUES);

  // Trie-based word predictor. Pure data-structure work — wordlist.json
  // (~280KB, top-10k common English words from Norvig n-grams) loads once
  // on mount, then every keystroke scores in microseconds.
  const predictor = usePredictor(state.text);

  // Refs let `handleBlinkEvent` be a stable identity. Without this,
  // including `state` and `predictor` in its deps rebuilt the callback
  // on every render — and useBlink would then re-run its onEvent ref
  // assignment unnecessarily. Stable identity also means `useCallback`
  // here actually does something downstream.
  const stateRef = useRef(state);
  const predictorRef = useRef(predictor);
  const dispatchRef = useRef(dispatch);
  const speakRef = useRef(speak);
  const controlsRef = useRef(controls);
  useEffect(() => {
    controlsRef.current = controls;
    stateRef.current = state;
    predictorRef.current = predictor;
    dispatchRef.current = dispatch;
    speakRef.current = speak;
  });

  // The "system ready" gate. We refuse to act on any blink event until
  // every dependency is loaded: camera streaming, MediaPipe model in
  // memory, wordlist trie populated. Before this, even if the user is
  // already gesturing (e.g. holding gaze right while the page warms up),
  // we silently swallow the event so it doesn't kick the scanner into a
  // half-initialised state.
  const blinkReadyRef = useRef(false);

  const handleBlinkEvent = useCallback((event: BlinkEvent) => {
    if (!blinkReadyRef.current || !predictorRef.current.ready) {
      // Warming up — drop the event. The user sees the "warming up…"
      // chip in the suggestion card and the amber "Loading model…"
      // status dot, so they know to wait.
      return;
    }
    const state = stateRef.current;
    const predictor = predictorRef.current;
    const dispatch = dispatchRef.current;
    const speak = speakRef.current;

    // Gestures don't mean anything by themselves — the user's bindings
    // decide which action each one triggers.
    const action = controlsRef.current.bindings[event.kind];

    switch (action) {
      case "none":
        return;

      case "menu":
        if (state.phase === "idle") {
          dispatch({ type: "start" });
          void speak("Starting");
        } else if (state.phase === "commandScan") {
          dispatch({ type: "exitCommands" });
          void speak("Resumed");
        } else if (state.phase === "suggestionScan") {
          // Drops back to scanning, mirroring how it cancels the
          // command menu.
          dispatch({ type: "exitSuggestions" });
          void speak("Cancelled");
        } else {
          dispatch({ type: "enterCommands" });
          void speak("Opened menu");
        }
        return;

      case "space":
        dispatch({ type: "insertChar", char: " " });
        void speak("Space");
        return;

      case "select":
        // Commit the active selection: runs commands, picks letters,
        // accepts suggestion chips.
        if (state.phase === "idle") return;
        if (state.phase === "commandScan") {
          const cmd = DEFAULT_COMMANDS[state.cursor];
          // Selecting "Resume" from the command menu also returns to
          // scanning — speak the same cue so the audio is consistent
          // regardless of how the user got there.
          if (cmd?.id === "resume") {
            void speak("Resumed");
          } else if (cmd?.id === "play" && state.text.trim().length > 0) {
            void speak(state.text);
          }
        } else if (state.phase === "suggestionScan") {
          // Record the picked word in the predictor's personal/bigram
          // memory before the reducer swaps the partial for the full
          // word. parseContext on the *current* text gives us the right
          // prev word for the bigram update.
          const word = state.suggestions[state.cursor];
          if (word) predictor.commit(word);
        }
        dispatch({ type: "select" });
        return;

      case "backspace":
        // The menu Backspace pill shows a fill bar growing during the
        // hold so the gesture is reversible (release to abort) and
        // visible in peripheral vision.
        dispatch({ type: "backspace" });
        void speak("Backspace");
        return;

      case "speak":
        if (state.text.trim().length > 0) void speak(state.text);
        return;

      case "suggestions":
        // Open the picker from any phase that's safe to interrupt: idle,
        // groupScan, letterScan. Idle is included so a user can begin a
        // sentence directly with a SENTENCE_STARTERS pick (or a bigram
        // continuation right after a Clear) without having to start
        // scanning first. commandScan is excluded — a destructive command
        // shouldn't be sidestepped — and suggestionScan is excluded
        // because we're already in it.
        if (
          state.phase === "commandScan" ||
          state.phase === "suggestionScan" ||
          predictor.suggestions.length === 0
        ) {
          return;
        }
        dispatch({
          type: "enterSuggestions",
          suggestions: predictor.suggestions,
        });
        void speak("Suggestions");
        return;
    }
  }, []);

  const blink = useBlink({
    videoRef,
    enabled: cameraReady,
    config: controls.config,
    onEvent: handleBlinkEvent,
  });

  // Mirror blink.ready into the ref read by the (stable-identity) event
  // handler. Discrete state changes are rare so this only fires a handful
  // of times per session.
  useEffect(() => {
    blinkReadyRef.current = blink.ready;
  }, [blink.ready]);

  // Speak the active group ("A to D", "E to H", …) every time the cursor
  // lands on one during groupScan. Lets the user track scanning by ear
  // — the visual cursor isn't always reachable for an AAC user. The
  // first announce on entry to groupScan will briefly interrupt the
  // "Starting" / "Resumed" cue that just played; in practice it sounds
  // natural ("Starting… A to D").
  //
  // Pull cursor out *before* the effect so the discriminated-union
  // narrowing is captured in a primitive — phase-mismatched cursors
  // collapse to -1, which both fails the lookup and changes only when
  // we actually re-enter groupScan.
  const groupCursor = state.phase === "groupScan" ? state.cursor : -1;
  useEffect(() => {
    if (groupCursor < 0) return;
    const label = DEFAULT_GROUP_SPOKEN_LABELS[groupCursor];
    // "cycle" tag — drops silently if an action cue is mid-play so e.g.
    // "Backspace" / "Suggestions" finishes uninterrupted, the cursor
    // ticks past one or two groups, and the next group announces normally.
    if (label) void speak(label, "cycle");
  }, [groupCursor, speak]);

  const systemReady = cameraReady && blink.ready && predictor.ready;

  const { bindings, config } = controls;
  const selectHint = hintFor(bindings, "select");
  const menuHint = hintFor(bindings, "menu");
  const backspaceHold = holdFor(controls, "backspace");
  const suggestionsHold = holdFor(controls, "suggestions");

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:py-12">
      <PageHeader
        phase={state.phase}
        systemReady={systemReady}
        selectHint={selectHint}
        menuHint={menuHint}
      />

      <div className="mt-6 grid gap-5 lg:mt-10 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <aside className="space-y-4">
          <CameraView
            onReady={(video) => {
              videoRef.current = video;
              setCameraReady(true);
            }}
          />
          <BlinkStatus
            blink={blink}
            longThresholdMs={config.longMinMs}
            lookUpThresholdMs={config.lookUpMinMs}
            longActionLabel={ACTION_BY_ID[bindings.long].label}
            lookUpActionLabel={ACTION_BY_ID[bindings.lookUp].label}
          />
          <ScanSpeedControl scanMs={scanMs} onChange={setScanMs} />
          <GestureLegend settings={controls} />
        </aside>

        <section className="space-y-4">
          <Transcript text={state.text} />
          <SuggestionStrip
            suggestions={
              state.phase === "suggestionScan"
                ? state.suggestions
                : predictor.suggestions
            }
            blink={blink}
            openHold={suggestionsHold}
            openHint={hintFor(bindings, "suggestions")}
            selectHint={selectHint}
            cancelHint={menuHint}
            activeIndex={
              state.phase === "suggestionScan" ? state.cursor : null
            }
            loading={!predictor.ready}
          />
          <CommandBar
            commands={DEFAULT_COMMANDS}
            state={state}
            blink={blink}
            backspaceHold={backspaceHold}
            selectHint={selectHint}
            menuHint={menuHint}
          />
          <ScanGrid groups={DEFAULT_GROUPS} state={state} />
          <ControlBar state={state} dispatch={dispatch} />
        </section>
      </div>
    </main>
  );
}

/**
 * Hold metric + threshold of the gesture bound to `action`, for the
 * dwell-fill affordances. Null when nothing is bound to it.
 */
function holdFor(controls: ControlSettings, action: ActionId) {
  const kind = gestureFor(controls.bindings, action);
  if (!kind) return null;
  const meta = GESTURES[kind];
  return { metric: meta.holdMetric, holdMs: controls.config[meta.holdKey] };
}

/** "Title — a to x, b to y", skipping hints for unbound actions. */
function describePhase(
  title: string,
  hints: readonly (string | null | false)[],
): string {
  const parts = hints.filter(Boolean);
  return parts.length > 0 ? `${title} — ${parts.join(", ")}` : title;
}

function PageHeader({
  phase,
  systemReady,
  selectHint,
  menuHint,
}: {
  phase: ReturnType<typeof useScanner>["state"]["phase"];
  systemReady: boolean;
  selectHint: string | null;
  menuHint: string | null;
}) {
  const sel = (verb: string) => selectHint && `${selectHint} to ${verb}`;
  const menu = (verb: string) => menuHint && `${menuHint} ${verb}`;
  const phaseLabel = !systemReady
    ? "Warming up — gestures will start once the camera and model are ready"
    : phase === "idle"
      ? menuHint
        ? `${menuHint.charAt(0).toUpperCase()}${menuHint.slice(1)} to start — or press Start`
        : "Press Start to begin"
      : phase === "groupScan"
        ? describePhase("Scanning groups", [sel("lock"), menu("for menu")])
        : phase === "letterScan"
          ? describePhase("Scanning letters", [
              sel("commit"),
              menu("for menu"),
            ])
          : phase === "commandScan"
            ? describePhase("Command menu", [sel("run"), menu("to cancel")])
            : describePhase("Suggestion picker", [
                sel("commit"),
                menu("to cancel"),
              ]);

  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-center gap-3">
        <BrandMark />
        <div>
          <h1 className="bg-gradient-to-br from-white via-white to-white/55 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
            Blink
          </h1>
          <p className="text-xs uppercase tracking-[0.18em] text-white/45 sm:text-sm">
            Eye-driven communication
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs text-white/75 backdrop-blur sm:text-sm">
          {phaseLabel}
        </div>
        <Link
          href="/controls"
          className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-1.5 text-xs font-semibold text-cyan-200 transition-colors hover:bg-cyan-300/20 sm:text-sm"
        >
          Controls
        </Link>
      </div>
    </header>
  );
}

function BrandMark() {
  // Inline SVG: a stylised eye with a soft inner glow. Cheap, no asset to
  // load, scales cleanly.
  return (
    <span
      aria-hidden
      className="relative grid h-12 w-12 place-items-center rounded-2xl border border-white/15 bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/20 shadow-[0_8px_24px_-12px_rgba(99,102,241,0.6)]"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-6 w-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
        <circle cx="12" cy="12" r="2.6" />
      </svg>
    </span>
  );
}

function ControlBar({
  state,
  dispatch,
}: {
  state: ReturnType<typeof useScanner>["state"];
  dispatch: ReturnType<typeof useScanner>["dispatch"];
}) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <Button
        variant="primary"
        onClick={() => dispatch({ type: "start" })}
        disabled={state.phase !== "idle"}
      >
        Start scanning
      </Button>
      <Button
        onClick={() =>
          dispatch({
            type: state.phase === "commandScan" ? "exitCommands" : "stop",
          })
        }
        disabled={state.phase === "idle"}
      >
        {state.phase === "commandScan" ? "Cancel menu" : "Stop"}
      </Button>
      <Button onClick={() => dispatch({ type: "clear" })}>Clear text</Button>
      <Button
        onClick={() => dispatch({ type: "select" })}
        title="Manual select (for testing without a camera)"
        muted
      >
        Select (debug)
      </Button>
    </div>
  );
}

function Button({
  children,
  onClick,
  disabled,
  title,
  variant = "default",
  muted = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  variant?: "default" | "primary";
  muted?: boolean;
}) {
  const base =
    "rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40";
  const styles =
    variant === "primary"
      ? "bg-emerald-400 text-black shadow-[0_8px_24px_-8px_rgba(52,211,153,0.6)] hover:bg-emerald-300 active:scale-[0.98]"
      : muted
        ? "border border-white/10 bg-transparent text-white/70 hover:bg-white/5"
        : "border border-white/12 bg-white/[0.05] text-white/90 hover:bg-white/10 active:scale-[0.98]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${styles}`}
    >
      {children}
    </button>
  );
}
