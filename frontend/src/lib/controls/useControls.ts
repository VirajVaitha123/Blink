/**
 * Persisted control settings, shared by the main page and /controls.
 *
 * A tiny module-level store over localStorage, exposed through
 * `useSyncExternalStore` so every consumer re-renders together and the
 * server render (which has no storage) cleanly falls back to defaults.
 */
"use client";

import { useSyncExternalStore } from "react";

import {
  DEFAULT_CONTROLS,
  sanitizeControls,
  type ControlSettings,
} from "./controls";

const STORAGE_KEY = "blink.controls.v1";

let cache: ControlSettings | null = null;
const listeners = new Set<() => void>();

function read(): ControlSettings {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? sanitizeControls(JSON.parse(raw)) : DEFAULT_CONTROLS;
  } catch {
    // Private mode, blocked storage, or corrupt JSON — run on defaults.
    cache = DEFAULT_CONTROLS;
  }
  return cache;
}

function write(next: ControlSettings) {
  cache = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: settings still apply for this page session.
  }
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent) {
  if (event.key !== STORAGE_KEY) return;
  cache = null;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

const getServerSnapshot = () => DEFAULT_CONTROLS;

export function useControls(): ControlSettings {
  return useSyncExternalStore(subscribe, read, getServerSnapshot);
}

export function updateControls(
  updater: (current: ControlSettings) => ControlSettings,
) {
  write(updater(read()));
}

export function resetControls() {
  write(DEFAULT_CONTROLS);
}
