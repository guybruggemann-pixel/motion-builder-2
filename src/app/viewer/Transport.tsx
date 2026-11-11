/**
 * Transport: play/pause, frame step, jump to ends, loop, scrubber and timecode.
 * Playback picks the frame from elapsed wall time, but every frame shown is evaluated at its
 * exact frame time, so preview stays frame-accurate (and drops frames rather than drifting).
 */
import { useEffect } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, Repeat, ScanLine, SkipBack, SkipForward, Wind } from "lucide-react";
import { Button } from "@/design-system/motionbuilder---brandbook-c4b4eb";
import { cn } from "@/design-system/motionbuilder---brandbook-c4b4eb/lib/utils";
import { useDocStore, useUi, viewComp } from "@/store";

export const timecode = (frame: number, fps: number) => {
  const f = Math.round(fps);
  const s = Math.floor(frame / f);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}:${pad(frame % f)}`;
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

function Toggle({ on, label, onClick, children }: { on: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-pressed={on}
      title={label}
      onClick={onClick}
      className={cn(on && "text-primary hover:text-primary")}
    >
      {children}
    </Button>
  );
}

export function Transport() {
  const doc = useDocStore((s) => s.doc);
  const ui = useUi();
  const comp = viewComp(doc, ui.path);
  const frames = frameCount(comp);
  const frame = Math.min(ui.frame, frames - 1);
  usePlayback(comp.fps, frames);

  const go = (f: number) => {
    ui.setPlaying(false);
    ui.setFrame(Math.min(frames - 1, Math.max(0, f)));
  };

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-t border-border bg-surface px-2">
      <Button variant="ghost" size="icon" aria-label="Go to start" title="Go to start (Home)" onClick={() => go(0)}>
        <SkipBack />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Previous frame" title="Previous frame (←)" onClick={() => go(frame - 1)}>
        <ChevronLeft />
      </Button>
      <Button
        variant={ui.playing ? "primary" : "secondary"}
        size="icon"
        aria-label={ui.playing ? "Pause" : "Play"}
        title="Play / pause (Space)"
        onClick={() => ui.setPlaying(!ui.playing)}
      >
        {ui.playing ? <Pause /> : <Play />}
      </Button>
      <Button variant="ghost" size="icon" aria-label="Next frame" title="Next frame (→)" onClick={() => go(frame + 1)}>
        <ChevronRight />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Go to end" title="Go to end (End)" onClick={() => go(frames - 1)}>
        <SkipForward />
      </Button>

      <output className="ml-2 w-[92px] font-mono text-xs tabular-nums text-foreground" aria-label="Timecode">
        {timecode(frame, comp.fps)}
      </output>
      <span className="w-14 font-mono text-[11px] tabular-nums text-muted-foreground">f {frame}</span>

      <label className="sr-only" htmlFor="scrub">
        Playhead
      </label>
      <input
        id="scrub"
        type="range"
        min={0}
        max={frames - 1}
        step={1}
        value={frame}
        onChange={(e) => go(Number(e.target.value))}
        style={{ ["--pct" as string]: `${(frame / Math.max(1, frames - 1)) * 100}%` }}
        className="mx-2 h-1 flex-1 cursor-pointer appearance-none rounded-xs bg-[linear-gradient(to_right,var(--primary)_var(--pct),var(--border)_var(--pct))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-1.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-xs [&::-webkit-slider-thumb]:bg-foreground"
      />

      <span className="mr-1 whitespace-nowrap font-mono text-[11px] tabular-nums text-muted-foreground max-lg:hidden">
        {comp.width}×{comp.height} · {comp.fps} fps
      </span>
      <Toggle on={ui.loop} label="Loop" onClick={() => ui.toggle("loop")}>
        <Repeat />
      </Toggle>
      <Toggle on={ui.safeAreas} label="Safe areas" onClick={() => ui.toggle("safeAreas")}>
        <ScanLine />
      </Toggle>
      <Toggle on={ui.motionBlur} label="Preview motion blur" onClick={() => ui.toggle("motionBlur")}>
        <Wind />
      </Toggle>
    </div>
  );
}
