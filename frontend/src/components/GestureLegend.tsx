"use client";

import Link from "next/link";
import { memo } from "react";

import {
  ACTION_BY_ID,
  GESTURE_KINDS,
  GESTURES,
  gestureTiming,
  type ControlSettings,
} from "@/lib/controls/controls";

import { Card, CardHeader } from "./Card";

type Props = {
  settings: ControlSettings;
};

export const GestureLegend = memo(GestureLegendInner);

/**
 * The live control scheme at a glance. Rows come straight from the saved
 * bindings, so this can never drift from what the gestures actually do.
 */
function GestureLegendInner({ settings }: Props) {
  const rows = GESTURE_KINDS.filter((k) => settings.bindings[k] !== "none");
  return (
    <Card className="p-4">
      <CardHeader
        title="Controls"
        subtitle={
          <Link
            href="/controls"
            className="font-medium text-cyan-300 underline-offset-4 hover:underline"
          >
            Customise →
          </Link>
        }
      />
      <ul className="mt-3 space-y-2">
        {rows.map((kind) => {
          const action = ACTION_BY_ID[settings.bindings[kind]];
          return (
            <li
              key={kind}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span className="font-medium text-white/90">
                {GESTURES[kind].label}
                <span className="ml-1.5 font-mono text-[11px] font-normal text-white/40">
                  {gestureTiming(kind, settings.config)}
                </span>
              </span>
              <span
                className="text-right text-xs font-semibold"
                style={{ color: action.color }}
              >
                {action.label}
              </span>
            </li>
          );
        })}
        <li className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-medium text-white/90">☰ key</span>
          <span className="text-right text-xs text-white/55">
            Open command menu
          </span>
        </li>
      </ul>
    </Card>
  );
}
