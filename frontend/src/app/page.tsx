"use client";

import { useCallback, useRef, useState } from "react";

import { BlinkStatus } from "@/components/BlinkStatus";
import { CameraView } from "@/components/CameraView";
import { CommandBar } from "@/components/CommandBar";
import { ScanGrid } from "@/components/ScanGrid";
import { Transcript } from "@/components/Transcript";
import {
  DEFAULT_BLINK_CONFIG,
  useBlink,
  type BlinkEvent,
} from "@/lib/blink/useBlink";
import { DEFAULT_COMMANDS, DEFAULT_GROUPS } from "@/lib/scanner/layouts";
import { useScanner } from "@/lib/scanner/useScanner";

export default function Home() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [scanMs, setScanMs] = useState(1500);

  const { state, dispatch } = useScanner({
    scanMs,
    groups: DEFAULT_GROUPS,
    commands: DEFAULT_COMMANDS,
  });

  const handleBlinkEvent = useCallback(
    (event: BlinkEvent) => {
      if (event.kind === "long") {
        if (state.phase === "idle") {
          dispatch({ type: "start" });
        } else if (state.phase === "commandScan") {
          dispatch({ type: "exitCommands" });
        } else {
          dispatch({ type: "enterCommands" });
        }
        return;
      }
      if (event.kind === "intent") {
        if (state.phase !== "idle") dispatch({ type: "select" });
        return;
      }
      if (event.kind === "lookUp") {
        // Look-up always inserts a space, regardless of scanner phase.
        dispatch({ type: "insertChar", char: " " });
      }
    },
    [dispatch, state.phase],
  );

  const blink = useBlink({
    videoRef,
    enabled: cameraReady,
    onEvent: handleBlinkEvent,
  });

  const phaseLabel =
    state.phase === "idle"
      ? "Hold a blink for 2s — or press Start"
      : state.phase === "groupScan"
        ? "Scanning groups — blink to lock, hold for menu"
        : state.phase === "letterScan"
          ? "Scanning letters — blink to commit, hold for menu"
          : "Command menu — blink to run, hold to cancel";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Blink</h1>
        <span className="text-sm text-white/60">{phaseLabel}</span>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <div className="space-y-3">
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

          <div className="space-y-2 rounded-lg border border-white/15 bg-black/40 p-3 text-sm">
            <label className="flex items-center justify-between gap-4">
              <span className="text-white/70">Scan speed</span>
              <span className="tabular-nums text-white/90">
                {(scanMs / 1000).toFixed(1)}s
              </span>
            </label>
            <input
              type="range"
              min={500}
              max={3000}
              step={100}
              value={scanMs}
              onChange={(e) => setScanMs(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="space-y-1 rounded-lg border border-white/15 bg-black/40 p-3 text-xs text-white/70">
            <div className="font-semibold uppercase tracking-wider text-white/50">
              Gestures
            </div>
            <div>
              <span className="text-white/90">Long blink (2s)</span> — start /
              open command menu / cancel menu
            </div>
            <div>
              <span className="text-white/90">Short blink</span> — select
              (group → letter → commit)
            </div>
            <div>
              <span className="text-white/90">Look up (0.5s)</span> — insert
              space
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <Transcript text={state.text} />

          <CommandBar commands={DEFAULT_COMMANDS} state={state} />

          <ScanGrid groups={DEFAULT_GROUPS} state={state} />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => dispatch({ type: "start" })}
              disabled={state.phase !== "idle"}
            >
              Start
            </button>
            <button
              type="button"
              className="rounded-md bg-white/10 px-4 py-2 font-semibold text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() =>
                dispatch({
                  type:
                    state.phase === "commandScan" ? "exitCommands" : "stop",
                })
              }
              disabled={state.phase === "idle"}
            >
              {state.phase === "commandScan" ? "Cancel menu" : "Stop"}
            </button>
            <button
              type="button"
              className="rounded-md bg-white/10 px-4 py-2 font-semibold text-white hover:bg-white/20"
              onClick={() => dispatch({ type: "clear" })}
            >
              Clear text
            </button>
            <button
              type="button"
              className="rounded-md bg-white/10 px-4 py-2 font-semibold text-white hover:bg-white/20"
              onClick={() => dispatch({ type: "select" })}
              title="Manual select (for testing without a camera)"
            >
              Select (debug)
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
