/**
 * Drag handle in the gap between two cards. Drag to resize, arrow keys step 16px, double-click
 * resets. Sizes are view state (`uiStore.panes`), remembered per browser on release.
 */
import { cn } from "@/app/design-system/motionbuilder---brandbook-c4b4eb/lib/utils";
import { PANE_DEFAULTS, PANE_LIMITS, useUi, type Panes } from "@/app/store/uiStore";

/** Which pane it sizes, and which way the pointer grows it. */
const SPEC: Record<keyof Panes, { axis: "x" | "y"; sign: 1 | -1; label: string; place: string }> = {
  library: { axis: "x", sign: 1, label: "Resize library", place: "[grid-area:lib] justify-self-end -mr-[9px] w-1.5 h-full cursor-col-resize" },
  inspector: { axis: "x", sign: -1, label: "Resize inspector", place: "[grid-area:insp] justify-self-start -ml-[9px] w-1.5 h-full cursor-col-resize" },
  timeline: { axis: "y", sign: -1, label: "Resize timeline and viewer", place: "[grid-area:tl] self-start -mt-[9px] h-1.5 w-full cursor-row-resize" },
};

export function Splitter({ pane, max }: { pane: keyof Panes; max?: number }) {
  const size = useUi((s) => s.panes[pane]);
  const setPane = useUi((s) => s.setPane);
  const { axis, sign, label, place } = SPEC[pane];
  const [lo, hi] = PANE_LIMITS[pane];
  const top = Math.min(hi, max ?? hi);
  const set = (px: number, save?: boolean) => setPane(pane, Math.min(top, px), save);

  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const start = axis === "x" ? e.clientX : e.clientY;
    const from = size;
    let last = from;
    const move = (ev: PointerEvent) => set((last = from + sign * ((axis === "x" ? ev.clientX : ev.clientY) - start)));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      set(last, true);
    };
    document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-valuenow={size}
      aria-valuemin={lo}
      aria-valuemax={top}
      title={`${label} · double-click to reset`}
      onPointerDown={down}
      onDoubleClick={() => set(PANE_DEFAULTS[pane], true)}
      onKeyDown={(e) => {
        const grow = axis === "x" ? { ArrowRight: sign, ArrowLeft: -sign } : { ArrowDown: sign, ArrowUp: -sign };
        const d = grow[e.key as keyof typeof grow];
        if (d === undefined) return;
        e.preventDefault();
        set(size + d * 16, true);
      }}
      className={cn(
        "group z-30 grid place-items-center rounded-full outline-offset-1 max-[900px]:hidden",
        place,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "rounded-full bg-line2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-active:bg-ink group-active:opacity-100",
          axis === "x" ? "h-10 w-1" : "h-1 w-10",
        )}
      />
    </div>
  );
}
