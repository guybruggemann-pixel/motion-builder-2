/**
 * Graph tab side panel: a motion preview and a grid of ease presets (GRAPH_PRESETS, whose springs are
 * the inspector's spring feels). Hovering a tile previews it; clicking writes its ease on the selected
 * segment through `setKeyEase`, one undo step, exactly like picking it by hand.
 */
import { useEffect, useRef, useState } from "react";
import { ease as easeFn, GRAPH_PRESETS } from "@core/motion";
import { cn } from "@/app/design-system/motionbuilder---brandbook-c4b4eb/lib/utils";
import { MiniCurve } from "@/app/shell/look";

const norm = (s: string) => s.replace(/\s+/g, "");

/** A dot sliding along a track with the ease, looping: run 1.2 s, hold 0.5 s. */
function MotionPreview({ ease }: { ease: string }) {
  const dot = useRef<HTMLSpanElement>(null);
  const ghost = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let f: (t: number) => number;
    try {
      f = easeFn(ease);
    } catch {
      f = (t) => t;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const c = ((now - t0) / 1000) % 1.7;
      const p = Math.min(1, c / 1.2);
      const v = f(p);
      if (dot.current) dot.current.style.left = `calc(${v * 100}% - ${v * 16}px)`;
      if (ghost.current) ghost.current.style.transform = `scale(${0.4 + 0.6 * Math.max(0, v)})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ease]);
  return (
    <div className="flex items-center gap-2 rounded-md bg-field p-2" aria-label={`Motion preview: ${ease}`}>
      <div className="relative h-4 flex-1">
        <span className="absolute inset-x-0 top-1/2 h-px bg-line2" />
        <span ref={dot} className="absolute top-0 size-4 rounded-full bg-ink" />
      </div>
      <span ref={ghost} className="size-5 shrink-0 rounded-[4px] bg-ink" />
    </div>
  );
}

export function EasePresets({ current, onPick }: { current?: string; onPick?: (ease: string) => void }) {
  const [hover, setHover] = useState<string>();
  const shown = hover ?? current ?? "outExpo";
  return (
    <aside className="flex w-60 shrink-0 flex-col gap-2 overflow-y-auto border-l border-border p-2" aria-label="Ease presets">
      <MotionPreview ease={shown} />
      <p className="truncate font-mono text-[11px] text-muted-foreground">{hover ? "Preview · " : current ? "This segment · " : ""}{shown}</p>
      {!onPick && <p className="text-[11px] text-muted-foreground">Select a segment with keys to apply a preset.</p>}
      {GRAPH_PRESETS.map((g) => (
        <section key={g.group} className="flex flex-col gap-1">
          <h4 className="text-[11px] font-medium text-muted-foreground">{g.group}</h4>
          <div className="grid grid-cols-3 gap-1">
            {g.items.map((p) => {
              const on = current !== undefined && norm(current) === norm(p.ease);
              return (
                <button
                  key={p.name}
                  type="button"
                  disabled={!onPick}
                  onClick={() => onPick?.(p.ease)}
                  onMouseEnter={() => setHover(p.ease)}
                  onMouseLeave={() => setHover(undefined)}
                  onFocus={() => setHover(p.ease)}
                  onBlur={() => setHover(undefined)}
                  aria-pressed={on}
                  title={p.ease}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md p-1.5 text-[10px] disabled:opacity-60",
                    on ? "bg-ink text-background" : "bg-card hover:shadow-card",
                  )}
                >
                  <MiniCurve ease={p.ease} width="100%" height={20} strokeWidth={1.5} />
                  {p.name}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </aside>
  );
}
