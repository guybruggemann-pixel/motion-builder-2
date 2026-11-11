/**
 * View state: what the user is looking at and has selected, never what gets rendered or exported.
 * Nothing here may change output (CLAUDE.md: no output-affecting state outside the doc).
 */
import { create } from "zustand";

/** One level of the open-network path: a network, and the Subnet node it was opened through. */
export interface Crumb {
  network: string;
  /** Subnet node in the parent crumb's network; absent for the root comp. */
  node?: string;
}

/** A key, identified by node, param and time (indices shift when keys move). */
export interface KeyRef {
  node: string;
  param: string;
  t: number;
}

export interface UiState {
  /** Opened subnets below the root comp. Empty = the root comp. */
  path: Crumb[];
  /** Playhead in frames of the shown network (integer). */
  frame: number;
  playing: boolean;
  loop: boolean;
  safeAreas: boolean;
  /** Preview motion blur (uses the comp's shutter settings). Off = faster scrubbing. */
  motionBlur: boolean;
  /** Selected nodes and keys in the shown network. */
  selectedNodes: string[];
  selectedKeys: KeyRef[];
  /** Layer rows twirled open or shut in the timeline (unset = the row's default). */
  expanded: Record<string, boolean>;
  setPath(path: Crumb[], frame?: number): void;
  setFrame(frame: number): void;
  setPlaying(playing: boolean): void;
  toggle(key: "loop" | "safeAreas" | "motionBlur"): void;
  selectNodes(ids: string[]): void;
  selectKeys(keys: KeyRef[]): void;
  setExpanded(nodeId: string, open: boolean): void;
}

export const sameKey = (a: KeyRef, b: KeyRef) => a.node === b.node && a.param === b.param && Math.abs(a.t - b.t) < 1e-6;

export const useUi = create<UiState>()((set) => ({
  path: [],
  frame: 0,
  playing: false,
  loop: true,
  safeAreas: true,
  motionBlur: true,
  selectedNodes: [],
  selectedKeys: [],
  expanded: {},
  setPath: (path, frame) =>
    set((s) => ({ path, frame: Math.max(0, Math.round(frame ?? s.frame)), selectedNodes: [], selectedKeys: [], expanded: {} })),
  setFrame: (frame) => set({ frame: Math.max(0, Math.round(frame)) }),
  setPlaying: (playing) => set({ playing }),
  toggle: (key) => set((s) => ({ [key]: !s[key] })),
  selectNodes: (selectedNodes) => set({ selectedNodes, selectedKeys: [] }),
  selectKeys: (selectedKeys) => set({ selectedKeys }),
  setExpanded: (id, open) => set((s) => ({ expanded: { ...s.expanded, [id]: open } })),
}));
