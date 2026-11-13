/**
 * A slim time bar for the Graph and Network tabs: seconds ticks, the playhead (ink line, volt
 * time pill) and drag anywhere to scrub, so time is in reach whichever tab is open.
 */
import { useRef } from "react";
import { useDocStore, useUi, viewComp } from "@/app/store";
import { frameCount } from "@/app/viewer/Transport";

export function ScrubBar() {
  const doc = useDocStore((s) => s.doc);
  const path = useUi((s) => s.path);
  const frame = useUi((s) => s.frame);
  const comp = viewComp(doc, path);
  const frames = frameCount(comp);
  const bar = useRef<HTMLDivElement>(null);
  const at = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    const u = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    useUi.getState().setPlaying(false);
    useUi.getState().setFrame(Math.round(u * (frames - 1)));
  };
  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    at(e.clientX);
    const move = (ev: PointerEvent) => at(ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const secs = Math.floor(comp.duration);
  const u = frames > 1 ? frame / (frames - 1) : 0;
  return (
    <div className="px-3 pb-1">
      <div
        ref={bar}
        role="slider"
        aria-label="Scrub time"
        aria-valuemin={0}
        aria-valuemax={frames - 1}
        aria-valuenow={frame}
        tabIndex={0}
        onPointerDown={down}
        className="relative h-[22px] cursor-ew-resize select-none rounded-md bg-field"
      >
        {Array.from({ length: secs + 1 }, (_, s) => (
          <span key={s} aria-hidden className="absolute top-0 h-full" style={{ left: `${(s / comp.duration) * 100}%` }}>
            <span className="absolute bottom-0 h-1.5 w-px bg-line2" />
            <span className="absolute left-1 top-[3px] font-mono text-[10px] text-faint">{s}s</span>
          </span>
        ))}
        <span aria-hidden className="absolute inset-y-0 w-[1.5px] bg-ink" style={{ left: `${u * 100}%` }}>
          <span className="absolute left-1/2 top-[3px] -translate-x-1/2 whitespace-nowrap rounded-full bg-volt px-1.5 font-mono text-[10px] font-medium text-volt-ink">
            {Math.floor(frame / comp.fps)}:{String(frame % Math.round(comp.fps)).padStart(2, "0")}
          </span>
        </span>
      </div>
    </div>
  );
}
