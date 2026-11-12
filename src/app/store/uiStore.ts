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

export type Theme = "light" | "dark";

/** Theme and library panel are per-user conveniences, remembered in this browser (never in the doc). */
const stored = (key: string): string | null => {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};
const store = (key: string, value: string) => {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    /* private mode: just don't remember */
  }
};

/** Resizable panes, in CSS px (view state, remembered per browser). */
export interface Panes {
  library: number;
  inspector: number;
  timeline: number;
}
export const PANE_DEFAULTS: Panes = { library: 232, inspector: 296, timeline: 290 };
export const PANE_LIMITS: Record<keyof Panes, [number, number]> = { library: [160, 480], inspector: [240, 560], timeline: [120, 2000] };

const storedPanes = (): Panes => {
  try {
    const p = JSON.parse(stored("mb.panes") ?? "{}") as Partial<Panes>;
    const out = { ...PANE_DEFAULTS };
    for (const k of Object.keys(out) as (keyof Panes)[]) if (typeof p[k] === "number" && Number.isFinite(p[k])) out[k] = p[k]!;
    return out;
  } catch {
    return { ...PANE_DEFAULTS };
  }
};

export type BottomTab = "timeline" | "graph" | "network";
export type Tool = "move" | "turn";

export interface UiState {
  theme: Theme;
  /** The Library card next to the viewer (opened from the rail). */
  libraryOpen: boolean;
  /** Preview the comp's alpha on a checkerboard instead of its background colour. */
  transparency: boolean;
  panes: Panes;
  /** The bottom card's tab. The contextual toolbar and the inspector's ease cards open the Graph. */
  bottomTab: BottomTab;
  setBottomTab(tab: BottomTab): void;
  /** What dragging a selected object in the viewer does (Cinema 4D: E move, R turn). */
  tool: Tool;
  setTool(tool: Tool): void;
  /** Resize a pane (clamped to its limits); `save` remembers it in this browser (on release). */
  setPane(key: keyof Panes, px: number, save?: boolean): void;
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
  toggle(key: "loop" | "safeAreas" | "motionBlur" | "transparency"): void;
  setTheme(theme: Theme): void;
  setLibraryOpen(open: boolean): void;
  selectNodes(ids: string[]): void;
  selectKeys(keys: KeyRef[]): void;
  setExpanded(nodeId: string, open: boolean): void;
}

export const sameKey = (a: KeyRef, b: KeyRef) => a.node === b.node && a.param === b.param && Math.abs(a.t - b.t) < 1e-6;

export const useUi = create<UiState>()((set) => ({
  theme: stored("mb.theme") === "dark" ? "dark" : "light",
  libraryOpen: stored("mb.library") !== "closed",
  transparency: false,
  panes: storedPanes(),
  bottomTab: "network",
  setBottomTab: (bottomTab) => set({ bottomTab }),
  tool: "move",
  setTool: (tool) => set({ tool }),
  setPane: (key, px, save) =>
    set((s) => {
      const [lo, hi] = PANE_LIMITS[key];
      const panes = { ...s.panes, [key]: Math.round(Math.min(hi, Math.max(lo, px))) };
      if (save) store("mb.panes", JSON.stringify(panes));
      return { panes };
    }),
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
  setTheme: (theme) => {
    store("mb.theme", theme);
    // flip the class before subscribers redraw, so canvas code reading CSS tokens gets the new ones
    globalThis.document?.documentElement.classList.toggle("dark", theme === "dark");
    set({ theme });
  },
  setLibraryOpen: (libraryOpen) => {
    store("mb.library", libraryOpen ? "open" : "closed");
    set({ libraryOpen });
  },
  selectNodes: (selectedNodes) => set({ selectedNodes, selectedKeys: [] }),
  selectKeys: (selectedKeys) => set({ selectedKeys }),
  setExpanded: (id, open) => set((s) => ({ expanded: { ...s.expanded, [id]: open } })),
}));
