/**
 * Top bar (no card): logo, project / comp with its version pill, edit status, undo/redo, the flow
 * stepper, Animate / Edit mode and the Deliver pill. Deliver and Batch open their popovers.
 */
import { useState } from "react";
import { Redo2, Rows3, Settings2, Undo2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button, PhaseStepper } from "@/design-system/motionbuilder---brandbook-c4b4eb";
import { cn } from "@/design-system/motionbuilder---brandbook-c4b4eb/lib/utils";
import { BatchPanel } from "@/batch/BatchPanel";
import { RenderPanel } from "@/render/RenderPanel";
import { useDocStore, useUi } from "@/store";

const STEPS = ["Import", "Draft", "Refine", "Deliver"];

/** "Main_v02" → ["Main", "v02"] (versions are `_vNN` duplicates, CLAUDE.md). */
export function splitVersion(name: string): [string, string | undefined] {
  const m = /^(.*?)_(v\d+)$/.exec(name);
  return m ? [m[1]!, m[2]] : [name, undefined];
}

export function Logo() {
  return (
    <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
      <path d="M12 1.5c.6 5.6 4.9 9.9 10.5 10.5-5.6.6-9.9 4.9-10.5 10.5C11.4 16.9 7.1 12.6 1.5 12 7.1 11.4 11.4 7.1 12 1.5z" />
    </svg>
  );
}

export function TopBar() {
  const { doc, edits, canRedo, undo, redo, undoLabel, redoLabel } = useDocStore(
    useShallow((s) => ({
      doc: s.doc,
      edits: s.past.length,
      canRedo: s.future.length > 0,
      undo: s.undo,
      redo: s.redo,
      undoLabel: s.past[s.past.length - 1]?.label,
      redoLabel: s.future[0]?.label,
    })),
  );
  const comp = doc.networks.find((n) => n.id === doc.root)!;
  const [name, version] = splitVersion(comp.name);
  const [panel, setPanel] = useState<"render" | "batch">();
  const flip = (p: "render" | "batch") => setPanel((q) => (q === p ? undefined : p));

  return (
    <header className="relative flex h-12 items-center gap-3 px-1 [grid-area:top] max-[900px]:h-auto max-[900px]:flex-wrap">
      <div className="flex min-w-0 items-center gap-2.5">
        <Logo />
        <span className="truncate text-muted-foreground">{doc.name}</span>
        <span aria-hidden className="text-line2">
          /
        </span>
        <button
          type="button"
          title="Comp settings (Esc)"
          onClick={() => {
            useUi.getState().setPath([]);
            useUi.getState().selectNodes([]);
          }}
          className="flex items-center gap-1.5 rounded-full px-2 py-1 font-semibold hover:bg-card"
        >
          {name}
          {version && <span className="rounded-full bg-card px-[7px] py-0.5 font-mono text-[11px] font-medium text-muted-foreground">{version}</span>}
          <Settings2 aria-hidden className="size-3.5 text-muted-foreground" />
        </button>
        <span role="status" className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full bg-card px-2.5 text-xs text-muted-foreground">
          <span aria-hidden className={cn("size-[7px] rounded-full", edits ? "bg-faint" : "bg-ok-dot")} />
          {edits ? `${edits} ${edits === 1 ? "edit" : "edits"} · not saved` : "No changes"}
        </span>
        <span className="flex">
          <Button variant="ghost" size="icon" aria-label={edits ? `Undo ${undoLabel}` : "Undo"} title="Undo (⌘Z)" disabled={!edits} onClick={undo}>
            <Undo2 />
          </Button>
          <Button variant="ghost" size="icon" aria-label={canRedo ? `Redo ${redoLabel}` : "Redo"} title="Redo (⇧⌘Z)" disabled={!canRedo} onClick={redo}>
            <Redo2 />
          </Button>
        </span>
      </div>

      <PhaseStepper
        className="mx-auto"
        phases={STEPS}
        current={2}
        enabled={[false, false, false, true]}
        onPhaseSelect={(i) => i === 3 && flip("render")}
      />

      <div className="flex items-center gap-2">
        <div role="group" aria-label="Mode" className="flex gap-0.5 rounded-full bg-card p-1 shadow-card">
          <span aria-current="page" className="flex h-[30px] items-center rounded-full bg-field px-3 font-semibold">
            Animate
          </span>
          <button type="button" disabled title="Edit mode for designers comes later (docs/ui-handover.md, phase E)" className="flex h-[30px] items-center rounded-full px-3 text-muted-foreground disabled:cursor-not-allowed">
            Edit
          </button>
        </div>
        <Button variant="secondary" size="lg" aria-expanded={panel === "batch"} onClick={() => flip("batch")}>
          <Rows3 /> Batch
        </Button>
        <Button size="lg" aria-expanded={panel === "render"} onClick={() => flip("render")}>
          Deliver
          <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
            <path d="m13 6 6 6-6 6" />
          </svg>
        </Button>
      </div>
      {panel === "render" && <RenderPanel onClose={() => setPanel(undefined)} />}
      {panel === "batch" && <BatchPanel onClose={() => setPanel(undefined)} />}
    </header>
  );
}
