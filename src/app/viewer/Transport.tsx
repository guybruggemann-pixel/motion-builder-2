/**
 * Floating transport over the viewer: previous key (J), play / pause (Space), next key (K),
 * timecode, loop. Frame stepping stays on ←/→ and scrubbing on the timeline ruler.
 * Playback picks the frame from elapsed wall time, but every frame shown is evaluated at its
 * exact frame time, so preview stays frame-accurate (and drops frames rather than drifting).
 */
import { useEffect } from "react";
import { Pause, Play, Repeat } from "lucide-react";
import { cn } from "@/design-system/motionbuilder---brandbook-c4b4eb/lib/utils";
import { useDocStore, useUi, viewComp } from "@/store";
import { jumpToKey } from "@/useShortcuts";

export const timecode = (frame: number, fps: number) => {
  const f = Math.round(fps);
  const s = Math.floor(frame / f);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}:${pad(frame % f)}`;
};

/** Short timecode for the transport: m:ss.ff */
export const shortTimecode = (frame: number, fps: number) => {
  const f = Math.round(fps);
  const s = Math.floor(frame / f);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}.${String(frame % f).padStart(2, "0")}`;
};

/** Frames in a comp: the last frame is the one before the duration ends. */
export const frameCount = (comp: { fps: number; duration: number }) => Math.max(1, Math.round(comp.duration * comp.fps));

function usePlayback(fps: number, frames: number) {
  const { playing, loop, setFrame, setPlaying } = useUi();
  useEffect(() => {
    if (!playing) return;
    const startFrame = useUi.getState().frame >= frames - 1 ? 0 : useUi.getState().frame;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      let f = startFrame + Math.floor(((now - t0) / 1000) * fps);
      if (f >= frames) {
        if (!loop) {
          setFrame(frames - 1);
          setPlaying(false);
          return;
        }
        f %= frames;
      }
      if (f !== useUi.getState().frame) setFrame(f);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, loop, fps, frames, setFrame, setPlaying]);
}

const round = "grid place-items-center rounded-full transition-colors";

function KeyIcon({ dir }: { dir: -1 | 1 }) {
  return (
    <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      {dir < 0 ? (
        <>
          <path d="M6 5v14" />
          <path d="m18 6-8 6 8 6z" />
        </>
      ) : (
        <>
          <path d="M18 5v14" />
          <path d="m6 6 8 6-8 6z" />
        </>
      )}
    </svg>
  );
}

export function Transport() {
  const doc = useDocStore((s) => s.doc);
  const ui = useUi();
  const comp = viewComp(doc, ui.path);
  const frames = frameCount(comp);
  const frame = Math.min(ui.frame, frames - 1);
  usePlayback(comp.fps, frames);

  return (
    <div
      role="toolbar"
      aria-label="Transport"
      className="absolute bottom-3.5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-card p-[5px] shadow-float"
    >
      <button type="button" aria-label="Previous key (J)" title="Previous key (J)" onClick={() => jumpToKey(-1)} className={cn(round, "size-[34px] text-muted-foreground hover:bg-field hover:text-foreground")}>
        <KeyIcon dir={-1} />
      </button>
      <button
        type="button"
        aria-label={ui.playing ? "Pause (Space)" : "Play (Space)"}
        title="Play / pause (Space)"
        onClick={() => ui.setPlaying(!ui.playing)}
        className={cn(round, "size-10 bg-ink text-ink-foreground hover:bg-ink/85 [&_svg]:size-[15px]")}
      >
        {ui.playing ? <Pause fill="currentColor" strokeWidth={0} /> : <Play fill="currentColor" strokeWidth={0} />}
      </button>
      <button type="button" aria-label="Next key (K)" title="Next key (K)" onClick={() => jumpToKey(1)} className={cn(round, "size-[34px] text-muted-foreground hover:bg-field hover:text-foreground")}>
        <KeyIcon dir={1} />
      </button>
      <output aria-label="Timecode" title={`Frame ${frame} · ${timecode(frame, comp.fps)}`} className="whitespace-nowrap pl-1.5 pr-2 font-mono text-[13px] tabular-nums">
        {shortTimecode(frame, comp.fps)} <span className="text-faint">/ {shortTimecode(frames, comp.fps)}</span>
      </output>
      <button
        type="button"
        aria-label="Loop"
        aria-pressed={ui.loop}
        title="Loop"
        onClick={() => ui.toggle("loop")}
        className={cn(round, "mr-0.5 size-[30px] [&_svg]:size-3.5", ui.loop ? "bg-field text-foreground" : "text-muted-foreground hover:bg-field")}
      >
        <Repeat />
      </button>
    </div>
  );
}
