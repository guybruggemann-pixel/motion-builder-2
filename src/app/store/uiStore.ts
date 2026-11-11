/**
 * View state: what the user is looking at, never what gets rendered or exported.
 * Nothing here may change output (CLAUDE.md: no output-affecting state outside the doc).
 */
import { create } from "zustand";

export interface UiState {
  /** Network path from the root comp down through opened subnets. Last = the one shown. */
  path: string[];
  /** Playhead in frames of the shown comp (integer). */
  frame: number;
  playing: boolean;
  loop: boolean;
  safeAreas: boolean;
  /** Preview motion blur (uses the comp's shutter settings). Off = faster scrubbing. */
  motionBlur: boolean;
  setPath(path: string[]): void;
  setFrame(frame: number): void;
  setPlaying(playing: boolean): void;
  toggle(key: "loop" | "safeAreas" | "motionBlur"): void;
}

export const useUi = create<UiState>()((set) => ({
  path: [],
  frame: 0,
  playing: false,
  loop: true,
  safeAreas: true,
  motionBlur: true,
  setPath: (path) => set({ path }),
  setFrame: (frame) => set({ frame: Math.max(0, Math.round(frame)) }),
  setPlaying: (playing) => set({ playing }),
  toggle: (key) => set((s) => ({ [key]: !s[key] })),
}));
