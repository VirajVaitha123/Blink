"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { BlinkStatus } from "@/components/BlinkStatus";
import { CameraView } from "@/components/CameraView";
import { CommandBar } from "@/components/CommandBar";
import { GestureLegend } from "@/components/GestureLegend";
import { ScanGrid } from "@/components/ScanGrid";
import { ScanSpeedControl } from "@/components/ScanSpeedControl";
import {
  computeActiveChip,
  SuggestionStrip,
} from "@/components/SuggestionStrip";
import { Transcript } from "@/components/Transcript";
import {
  DEFAULT_BLINK_CONFIG,
  useBlink,
  type BlinkEvent,
} from "@/lib/blink/useBlink";
import { usePredictor } from "@/lib/predict/usePredictor";
import { DEFAULT_COMMANDS, DEFAULT_GROUPS } from "@/lib/scanner/layouts";
import { useScanner } from "@/lib/scanner/useScanner";
import { useVoiceCues } from "@/lib/voice/useVoiceCues";

// Stable identity so useVoiceCues' prewarm effect doesn't re-run each render.
const VOICE_CUES = [
  "Starting",
  "Opened menu",
  "Resumed",
  "Space",
  "Accepted",
] as const;

export default function Home() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  // 1050ms — settled here after iterating: 1000ms was a touch too brisk,
  // 1100ms felt slightly slow. The slider step is 50ms so this sits on a
  // snap point, and the label formatter shows the extra precision as
  // "1.05s". Tunable live via the slider (500–3000ms).
  const [scanMs, setScanMs] = useState(1050);

  const { state, dispatch } = useScanner({
    scanMs,
    groups: DEFAULT_GROUPS,
    commands: DEFAULT_COMMANDS,
  });

  const speak = useVoiceCues(VOICE_CUES);

  // Local-LLM predictor. Runs entirely in the browser; first visit pays
  // a one-time ~118 MB download, then it's cached in IndexedDB.
  const predictor = usePredictor(state.text, /* enabled */ true);

  const handleBlinkEvent = useCallback(
    (event: BlinkEvent) => {
      if (event.kind === "long") {
        if (state.phase === "idle") {
          dispatch({ type: "start" });
          void speak("Starting");
        } else if (state.phase === "commandScan") {
          dispatch({ type: "exitCommands" });
          void speak("Resumed");
        } else {
          dispatch({ type: "enterCommands" });
          void speak("Opened menu");
        }
        return;
      }
      if (event.kind === "intent") {
        if (state.phase === "idle") return;
        if (state.phase === "commandScan") {
          const cmd = DEFAULT_COMMANDS[state.cursor];
          // Selecting "Resume" from the command menu also returns to
          // scanning — speak the same cue so the audio is consistent
          // regardless of whether the user long-blinked or selected it.
          if (cmd?.id === "resume") {
            void speak("Resumed");
          } else if (cmd?.id === "play" && state.text.trim().length > 0) {
            void speak(state.text);
          }
        }
        dispatch({ type: "select" });
        return;
      }
      if (event.kind === "lookUp") {
        dispatch({ type: "insertChar", char: " " });
        void speak("Space");
        return;
      }
      if (event.kind === "lookRight") {
        // The held duration carried in the event tells us which chip was
        // active at release. Replace the partial word at the end of the
        // transcript with the full suggested word + a trailing space.
        const { index } = computeActiveChip(
          event.durationMs,
          predictor.suggestions.length,
        );
        if (index === null) return;
        const word = predictor.suggestions[index];
        if (!word) return;
        const lastSpace = state.text.lastIndexOf(" ");
        const base = state.text.slice(0, lastSpace + 1);
        dispatch({ type: "setText", text: base + word + " " });
        void speak("Accepted");
      }
    },
    [dispatch, speak, state, predictor.suggestions],
  );

  const blink = useBlink({
    videoRef,
    enabled: cameraReady,
    onEvent: handleBlinkEvent,
  });

  // Speak each suggestion as the dwell-cycle activates it, so the user
  // can hear which chip would be committed if they release now. Tracked
  // with a ref so we don't re-speak when unrelated state churns.
  const lastSpokenChipRef = useRef<number | null>(null);
  useEffect(() => {
    if (!blink.isLookingRight) {
      lastSpokenChipRef.current = null;
      return;
    }
    const { index } = computeActiveChip(
      blink.rightForMs,
      predictor.suggestions.length,
    );
    if (index === null) {
      lastSpokenChipRef.current = null;
      return;
    }
    if (lastSpokenChipRef.current !== index) {
      lastSpokenChipRef.current = index;
      const word = predictor.suggestions[index];
      if (word) void speak(word);
    }
  }, [blink.isLookingRight, blink.rightForMs, predictor.suggestions, speak]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:py-12">
      <PageHeader phase={state.phase} />

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
            longThresholdMs={DEFAULT_BLINK_CONFIG.longMinMs}
            lookUpThresholdMs={DEFAULT_BLINK_CONFIG.lookUpMinMs}
          />
          <ScanSpeedControl scanMs={scanMs} onChange={setScanMs} />
          <GestureLegend />
        </aside>

        <section className="space-y-4">
          <Transcript text={state.text} />
          <SuggestionStrip
            suggestions={predictor.suggestions}
            rightForMs={blink.rightForMs}
            isLookingRight={blink.isLookingRight}
            loading={!predictor.ready}
            loadProgress={predictor.progress?.fraction ?? 0}
          />
          <CommandBar commands={DEFAULT_COMMANDS} state={state} />
          <ScanGrid groups={DEFAULT_GROUPS} state={state} />
          <ControlBar state={state} dispatch={dispatch} />
        </section>
      </div>
    </main>
  );
}

function PageHeader({ phase }: { phase: ReturnType<typeof useScanner>["state"]["phase"] }) {
  const phaseLabel =
    phase === "idle"
      ? "Hold a blink for 1.5s — or press Start"
      : phase === "groupScan"
        ? "Scanning groups — blink to lock, hold or pick ☰ for menu"
        : phase === "letterScan"
          ? "Scanning letters — blink to commit, hold or pick ☰ for menu"
          : "Command menu — blink to run, hold to cancel";

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
      <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs text-white/75 backdrop-blur sm:text-sm">
        {phaseLabel}
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
