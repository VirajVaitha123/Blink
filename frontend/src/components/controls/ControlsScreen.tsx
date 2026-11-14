"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import { CameraView } from "@/components/CameraView";
import { Card, CardHeader } from "@/components/Card";
import { ScanSpeedControl } from "@/components/ScanSpeedControl";
import { StatusDot } from "@/components/StatusDot";
import {
  useBlink,
  type BlinkEvent,
  type BlinkKind,
  type BlinkRuntime,
} from "@/lib/blink/useBlink";
import { useBlinkMetric } from "@/lib/blink/useBlinkMetric";
import {
  ACTION_BY_ID,
  ACTIONS,
  GESTURE_KINDS,
  GESTURES,
  PRESETS,
  TRIGGER_MAX,
  TRIGGER_MIN,
  activePresetId,
  applyPreset,
  formatSeconds,
  gestureFor,
  gestureTiming,
  withBinding,
  withHold,
  withTrigger,
  type ActionId,
  type ControlSettings,
} from "@/lib/controls/controls";
import {
  resetControls,
  updateControls,
  useControls,
} from "@/lib/controls/useControls";

import { HoloEyes } from "./HoloEyes";

const HOLO_DEFAULT = "#67e8f9";

type Fired = { kind: BlinkKind; id: number };

/**
 * The control-binding screen. A hologram of the user's eyes sits in the
 * middle; every gesture the tracker understands orbits it. Pick a gesture,
 * choose what it does, and tune how long / how far it has to be held —
 * optionally with the camera on, so the hologram mirrors your own eyes
 * and each gesture lights up as it fires.
 */
export function ControlsScreen() {
  const settings = useControls();
  // The app is called Blink — open on the blink.
  const [selected, setSelected] = useState<BlinkKind>("intent");
  const [hovered, setHovered] = useState<BlinkKind | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [fired, setFired] = useState<Fired | null>(null);

  const handleEvent = useCallback((event: BlinkEvent) => {
    setFired((prev) => ({ kind: event.kind, id: (prev?.id ?? 0) + 1 }));
  }, []);

  const blink = useBlink({
    videoRef,
    enabled: cameraOn && cameraReady,
    config: settings.config,
    onEvent: handleEvent,
  });
  const live = cameraOn && cameraReady && blink.ready ? blink : null;

  const focus = hovered ?? selected;
  const focusAction = settings.bindings[focus];
  const holoColor =
    focusAction === "none" ? HOLO_DEFAULT : ACTION_BY_ID[focusAction].color;

  const presetId = activePresetId(settings);
  const missing = (["select", "menu"] as const).filter(
    (a) => gestureFor(settings.bindings, a) === null,
  );

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/"
            className="text-xs font-medium uppercase tracking-[0.16em] text-white/50 transition-colors hover:text-white/90"
          >
            ← Back to Blink
          </Link>
          <h1 className="mt-2 bg-gradient-to-br from-white via-white to-white/55 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
            Controls
          </h1>
          <p className="mt-1 max-w-xl text-sm text-white/55">
            Pick a gesture, then choose what it does. Changes save as you go
            and apply straight away.
          </p>
        </div>

        <div className="flex flex-wrap items-stretch gap-2">
          {PRESETS.map((preset) => {
            const active = preset.id === presetId;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                onClick={() => updateControls((s) => applyPreset(s, preset))}
                className={[
                  "rounded-xl border px-4 py-2 text-left transition-colors",
                  active
                    ? "border-cyan-300/60 bg-cyan-300/10"
                    : "border-white/10 bg-white/[0.03] hover:border-white/25",
                ].join(" ")}
              >
                <div className="text-sm font-semibold text-white/95">
                  {preset.name}
                </div>
                <div className="text-xs text-white/55">{preset.tagline}</div>
              </button>
            );
          })}
          <button
            type="button"
            onClick={resetControls}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white/90"
          >
            Reset
          </button>
        </div>
      </header>

      {missing.length > 0 && (
        <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          No gesture is set to{" "}
          <strong>
            {missing.map((a) => ACTION_BY_ID[a].label).join(" or ")}
          </strong>
          . Blink can&apos;t be driven by eye alone until{" "}
          {missing.length > 1 ? "they are" : "it is"} assigned.
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <Card className="overflow-hidden p-4 sm:p-6">
          <div className="controls-stage">
            <div data-area="eyes" className="relative py-2">
              <HoloEyes
                demo={hovered ?? selected}
                live={live}
                color={holoColor}
              />
              <div className="mt-1 h-5 text-center text-xs font-medium uppercase tracking-[0.16em]">
                {live && fired ? (
                  <span
                    key={fired.id}
                    className="holo-toast inline-block"
                    style={{
                      color: ACTION_BY_ID[settings.bindings[fired.kind]].color,
                    }}
                  >
                    {GESTURES[fired.kind].label} →{" "}
                    {ACTION_BY_ID[settings.bindings[fired.kind]].label}
                  </span>
                ) : (
                  <span className="text-white/35">
                    {live
                      ? blink.faceDetected
                        ? "Mirroring your eyes"
                        : "Looking for your face…"
                      : `Showing: ${GESTURES[focus].label}`}
                  </span>
                )}
              </div>
            </div>

            {GESTURE_KINDS.map((kind) => (
              <GestureNode
                key={kind}
                kind={kind}
                settings={settings}
                selected={kind === selected}
                live={live}
                firedId={live && fired?.kind === kind ? fired.id : null}
                onSelect={setSelected}
                onHover={setHovered}
              />
            ))}
          </div>
        </Card>

        <aside className="space-y-4">
          <GesturePanel kind={selected} settings={settings} live={live} />

          <Card className="p-4">
            <CardHeader
              title="Try it live"
              subtitle={cameraOn ? <StatusDot blink={blink} /> : undefined}
            />
            <p className="mt-2 text-xs leading-relaxed text-white/55">
              Turn the camera on and the hologram copies your eyes. Each
              gesture fills as you hold it and flashes when it fires — nothing
              is typed while you practise.
            </p>
            <button
              type="button"
              onClick={() => {
                setCameraOn((on) => !on);
                setCameraReady(false);
                setFired(null);
              }}
              className={[
                "mt-3 w-full rounded-xl px-4 py-2 text-sm font-semibold transition-all active:scale-[0.98]",
                cameraOn
                  ? "border border-white/12 bg-white/[0.05] text-white/90 hover:bg-white/10"
                  : "bg-cyan-300 text-black shadow-[0_8px_24px_-8px_rgba(103,232,249,0.6)] hover:bg-cyan-200",
              ].join(" ")}
            >
              {cameraOn ? "Stop camera" : "Test with my camera"}
            </button>
            {blink.error && cameraOn && (
              <div className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">
                {blink.error}
              </div>
            )}
            {cameraOn && (
              <div className="mt-3">
                <CameraView
                  onReady={(video) => {
                    videoRef.current = video;
                    setCameraReady(true);
                  }}
                />
              </div>
            )}
          </Card>

          <ScanSpeedControl
            scanMs={settings.scanMs}
            onChange={(scanMs) => updateControls((s) => ({ ...s, scanMs }))}
          />
        </aside>
      </div>
    </main>
  );
}

function GestureNode({
  kind,
  settings,
  selected,
  live,
  firedId,
  onSelect,
  onHover,
}: {
  kind: BlinkKind;
  settings: ControlSettings;
  selected: boolean;
  live: BlinkRuntime | null;
  firedId: number | null;
  onSelect: (kind: BlinkKind) => void;
  onHover: (kind: BlinkKind | null) => void;
}) {
  const meta = GESTURES[kind];
  const action = ACTION_BY_ID[settings.bindings[kind]];
  const off = action.id === "none";

  return (
    <button
      type="button"
      data-area={kind}
      aria-pressed={selected}
      onClick={() => onSelect(kind)}
      onMouseEnter={() => onHover(kind)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(kind)}
      onBlur={() => onHover(null)}
      className={[
        "relative overflow-hidden rounded-2xl border p-3 text-left",
        "transition-[border-color,background-color,box-shadow,transform] duration-200",
        "hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70",
        selected
          ? "bg-white/[0.07]"
          : "border-white/10 bg-white/[0.025] hover:border-white/25",
      ].join(" ")}
      style={
        selected
          ? {
              borderColor: action.color,
              boxShadow: `0 0 0 1px ${action.color}, 0 10px 34px -14px ${action.color}`,
            }
          : undefined
      }
    >
      {live && (
        <HoldFill
          blink={live}
          metric={meta.holdMetric}
          holdMs={settings.config[meta.holdKey]}
          color={action.color}
        />
      )}
      {firedId !== null && (
        <span
          key={firedId}
          aria-hidden
          className="holo-fired pointer-events-none absolute inset-0 rounded-2xl"
          style={{ backgroundColor: action.color }}
        />
      )}

      <div className="relative flex items-center gap-2.5">
        <GestureGlyph kind={kind} color={off ? "#94a3b8" : action.color} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white/95">
            {meta.label}
          </div>
          <div className="font-mono text-[11px] text-white/45">
            {gestureTiming(kind, settings.config)}
          </div>
        </div>
      </div>
      <div
        className="relative mt-2.5 inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
        style={{
          color: off ? "rgba(255,255,255,0.5)" : action.color,
          backgroundColor: off ? "rgba(255,255,255,0.05)" : `${action.color}1f`,
        }}
      >
        <span aria-hidden>→</span>
        <span className="truncate">{action.label}</span>
      </div>
    </button>
  );
}

/** Background fill that grows while the gesture is held (camera on only). */
function HoldFill({
  blink,
  metric,
  holdMs,
  color,
}: {
  blink: BlinkRuntime;
  metric: Parameters<typeof useBlinkMetric>[1];
  holdMs: number;
  color: string;
}) {
  const heldMs = useBlinkMetric(blink, metric);
  const fraction = Math.min(1, heldMs / holdMs);
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-75"
      style={{ width: `${fraction * 100}%`, backgroundColor: `${color}33` }}
    />
  );
}

/** Small eye icon posed as the gesture: pupil offset, or lids shut. */
function GestureGlyph({ kind, color }: { kind: BlinkKind; color: string }) {
  const { pose } = GESTURES[kind];
  const shut = pose.open < 0.5;
  return (
    <svg
      viewBox="0 0 40 28"
      className="h-7 w-10 shrink-0"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      {shut ? (
        <>
          <path d="M 4 13 Q 20 23 36 13" />
          <path d="M 9 19 L 7 23 M 20 21 V 25 M 31 19 L 33 23" />
          {kind === "long" && <path d="M 12 5 H 28" strokeDasharray="1 4" />}
        </>
      ) : (
        <>
          <path d="M 3 14 Q 20 -1 37 14 Q 20 29 3 14 Z" />
          <circle
            cx={20 + pose.gx * 7}
            cy={14 + pose.gy * 4}
            r="3.5"
            fill={color}
            stroke="none"
          />
        </>
      )}
    </svg>
  );
}

function GesturePanel({
  kind,
  settings,
  live,
}: {
  kind: BlinkKind;
  settings: ControlSettings;
  live: BlinkRuntime | null;
}) {
  const meta = GESTURES[kind];
  const bound = settings.bindings[kind];
  const holdMs = settings.config[meta.holdKey];
  const trigger = settings.config[meta.highKey];
  const isBlink = kind === "intent" || kind === "long";

  return (
    <Card className="p-4" active>
      <div className="flex items-center gap-3">
        <GestureGlyph kind={kind} color={HOLO_DEFAULT} />
        <h2 className="text-lg font-semibold text-white/95">{meta.label}</h2>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-white/55">
        {meta.description}
      </p>

      <SectionLabel>What it does</SectionLabel>
      <div role="radiogroup" aria-label={`Action for ${meta.label}`} className="grid grid-cols-2 gap-2">
        {ACTIONS.map((action) => (
          <ActionTile
            key={action.id}
            action={action.id}
            checked={action.id === bound}
            sharedWith={
              action.id === "none"
                ? []
                : GESTURE_KINDS.filter(
                    (k) => k !== kind && settings.bindings[k] === action.id,
                  )
            }
            onPick={() => updateControls((s) => withBinding(s, kind, action.id))}
          />
        ))}
      </div>

      <SectionLabel>Tuning</SectionLabel>
      <div className="space-y-4">
        <Slider
          label={meta.holdLabel}
          valueLabel={formatSeconds(holdMs)}
          min={meta.holdMin}
          max={meta.holdMax}
          step={meta.holdStep}
          value={holdMs}
          onChange={(v) => updateControls((s) => withHold(s, kind, v))}
          lowHint="quicker"
          highHint="more deliberate"
        />
        <div>
          <Slider
            label={isBlink ? "How closed your eyes must be" : "How far you must look"}
            valueLabel={`${Math.round(trigger * 100)}%`}
            min={TRIGGER_MIN}
            max={TRIGGER_MAX}
            step={0.01}
            value={trigger}
            onChange={(v) => updateControls((s) => withTrigger(s, kind, v))}
            lowHint="easier"
            highHint="fewer accidents"
          />
          {live ? (
            <LiveLevel blink={live} metric={meta.levelMetric} trigger={trigger} />
          ) : (
            <p className="mt-2 text-[11px] text-white/40">
              Turn the camera on below to see your own level against this
              line.
            </p>
          )}
          {isBlink && (
            <p className="mt-2 text-[11px] text-white/40">
              Shared by Blink and Long blink.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
      {children}
    </div>
  );
}

function ActionTile({
  action,
  checked,
  sharedWith,
  onPick,
}: {
  action: ActionId;
  checked: boolean;
  sharedWith: readonly BlinkKind[];
  onPick: () => void;
}) {
  const meta = ACTION_BY_ID[action];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onPick}
      className={[
        "rounded-xl border p-2.5 text-left transition-[border-color,background-color] duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70",
        checked
          ? "bg-white/[0.08]"
          : "border-white/10 bg-white/[0.02] hover:border-white/25",
      ].join(" ")}
      style={checked ? { borderColor: meta.color } : undefined}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{
            backgroundColor: meta.color,
            boxShadow: checked ? `0 0 10px ${meta.color}` : undefined,
          }}
        />
        <span className="text-sm font-semibold text-white/95">
          {meta.label}
        </span>
      </div>
      <div className="mt-1 text-[11px] leading-snug text-white/50">
        {meta.description}
      </div>
      {sharedWith.length > 0 && (
        <div className="mt-1 text-[11px] text-white/35">
          Also on {sharedWith.map((k) => GESTURES[k].label).join(", ")}
        </div>
      )}
    </button>
  );
}

function Slider({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
  lowHint,
  highHint,
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  lowHint: string;
  highHint: string;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-white/80">{label}</span>
        <span className="font-mono tabular-nums text-white/90">
          {valueLabel}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full"
      />
      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wider text-white/35">
        <span>{lowHint}</span>
        <span>{highHint}</span>
      </div>
    </label>
  );
}

/**
 * The user's live score for this gesture on the same scale as the trigger
 * slider above it, with the trigger drawn as a line to cross.
 */
function LiveLevel({
  blink,
  metric,
  trigger,
}: {
  blink: BlinkRuntime;
  metric: Parameters<typeof useBlinkMetric>[1];
  trigger: number;
}) {
  const level = useBlinkMetric(blink, metric);
  const span = TRIGGER_MAX - TRIGGER_MIN;
  const toPct = (v: number) =>
    Math.max(0, Math.min(1, (v - TRIGGER_MIN) / span)) * 100;
  const over = level > trigger;
  return (
    <div className="mt-2">
      <div className="relative h-2 rounded-full bg-white/[0.08]">
        <div
          className="h-full rounded-full transition-[width,background-color] duration-100"
          style={{
            width: `${toPct(level)}%`,
            backgroundColor: over ? "#34d399" : "rgba(255,255,255,0.45)",
          }}
        />
        <div
          aria-hidden
          className="absolute -inset-y-1 w-0.5 rounded-full bg-white"
          style={{ left: `${toPct(trigger)}%` }}
        />
      </div>
      <div className="mt-1 text-[11px] text-white/45">
        You now: {Math.round(level * 100)}%{over ? " — past the line" : ""}
      </div>
    </div>
  );
}
