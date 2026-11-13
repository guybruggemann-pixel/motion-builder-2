/**
 * Top bar (no card): logo, project / comp with its version pill, edit status, undo/redo, the flow
 * stepper, Animate / Edit mode and the Deliver pill. Deliver and Batch open their popovers.
 */
import { useState } from "react";
import { Check, ChevronDown, CopyPlus, FolderOpen, Redo2, Rows3, Save, Settings2, Undo2 } from "lucide-react";
import { openDoc, saveDoc, useFile } from "@/app/file/persist";
import { useShallow } from "zustand/react/shallow";
import { Button, PhaseStepper } from "@/app/design-system/motionbuilder---brandbook-c4b4eb";
import { cn } from "@/app/design-system/motionbuilder---brandbook-c4b4eb/lib/utils";
import { BatchPanel } from "@/app/batch/BatchPanel";
import { RenderPanel } from "@/app/render/RenderPanel";
import { docStore, useDocStore, useUi } from "@/app/store";
import { nextVersionName, saveAsNewVersion, switchVersion, versionsOf } from "@/app/file/versions";

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

function VersionMenu({ label }: { label: string }) {
  const doc = useDocStore((s) => s.doc);
  const [open, setOpen] = useState(false);
  const list = versionsOf(doc, doc.root);
  const go = (fn: () => void) => {
    fn();
    useUi.getState().setPlaying(false);
    useUi.getState().setPath([], 0);
    useUi.getState().selectNodes([]);
    setOpen(false);
  };
  return (
    <div className="relative -ml-1.5" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)} onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Versions"
        aria-label={`Versions, ${label}`}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-0.5 rounded-full bg-card px-[7px] py-0.5 font-mono text-[11px] font-medium text-muted-foreground hover:text-foreground"
      >
        {label}
        <ChevronDown aria-hidden className="size-3" />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-8 z-50 w-56 rounded-xl bg-card p-1.5 shadow-float">
          {list.map((n) => (
            <button
              key={n.id}
              type="button"
              role="menuitemradio"
              aria-checked={n.id === doc.root}
              onClick={() => go(() => docStore.getState().edit(`Open ${n.name}`, (d) => switchVersion(d, n.id)))}
              className={cn("flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left hover:bg-field", n.id === doc.root && "font-semibold")}
            >
              {n.name}
              {n.id === doc.root && <Check aria-hidden className="size-3.5" />}
            </button>
          ))}
          <div className="my-1 h-px bg-line" />
          <button
            type="button"
            role="menuitem"
            onClick={() => go(() => docStore.getState().edit(`Save as ${nextVersionName(doc, doc.root)}`, saveAsNewVersion))}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-field"
          >
            <CopyPlus aria-hidden className="size-3.5" /> Save as {nextVersionName(doc, doc.root).split("_").pop()}
          </button>
        </div>
      )}
    </div>
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
  const savedDoc = useFile((s) => s.savedDoc);
  const message = useFile((s) => s.message);
  const dirty = doc !== savedDoc;
  const comp = doc.networks.find((n) => n.id === doc.root)!;
  const [name, version] = splitVersion(comp.name);
  const [panel, setPanel] = useState<"render" | "batch">();
  const flip = (p: "render" | "batch") => setPanel((q) => (q === p ? undefined : p));
  const screen = useUi((s) => s.screen);
  const setScreen = useUi((s) => s.setScreen);

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
          <Settings2 aria-hidden className="size-3.5 text-muted-foreground" />
        </button>
        <VersionMenu label={version ?? "v—"} />
        <span role="status" className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full bg-card px-2.5 text-xs text-muted-foreground">
          <span aria-hidden className={cn("size-[7px] rounded-full", dirty ? "bg-faint" : "bg-ok-dot")} />
          {dirty ? "Unsaved changes" : "Saved"}
        </span>
        <span className="flex">
          <Button variant="ghost" size="icon" aria-label="Open scene" title="Open scene (⌘O)" onClick={() => void openDoc()}>
            <FolderOpen />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Save scene" title="Save (⌘S) · Save as (⇧⌘S)" onClick={(e) => void saveDoc(e.shiftKey)}>
            <Save />
          </Button>
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
        current={screen === "import" ? 0 : screen === "draft" ? 1 : 2}
        onPhaseSelect={(i) => (i === 3 ? (setScreen("refine"), flip("render")) : setScreen((["import", "draft", "refine"] as const)[i]!))}
      />

      <div className="flex items-center gap-2">
        <div role="group" aria-label="Mode" className="flex gap-0.5 rounded-full bg-card p-1 shadow-card">
          <span aria-current="page" className="flex h-[30px] items-center rounded-full bg-field px-3 font-semibold">
            Animate
          </span>
          <button type="button" disabled title="Edit mode for designers comes later (docs/ui-handover.md, phase E)" className="flex h-[30px] items-center gap-1.5 rounded-full px-3 text-muted-foreground disabled:cursor-not-allowed">
            Edit <span className="text-[10px] uppercase tracking-wide">soon</span>
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
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={cn("absolute left-1/2 top-14 z-50 -translate-x-1/2 rounded-full px-3 py-1.5 text-xs shadow-card", message.kind === "error" ? "bg-destructive text-destructive-foreground" : "bg-card")}>
          {message.text}
        </p>
      )}
      {panel === "render" && <RenderPanel onClose={() => setPanel(undefined)} />}
      {panel === "batch" && <BatchPanel onClose={() => setPanel(undefined)} />}
    </header>
  );
}
