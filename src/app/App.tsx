/**
 * Workspace layout: viewer on top, library left, inspector right, timeline/network full width below.
 */
import { Redo2, Undo2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@/design-system/motionbuilder---brandbook-c4b4eb";
import { Library } from "@/panels/Library";
import { fullPath, useDocStore, useUi } from "@/store";
import { openDepth } from "@/store/navigation";
import { Timeline } from "@/timeline/Timeline";
import { useShortcuts } from "@/useShortcuts";
import { Transport } from "@/viewer/Transport";
import { Viewer } from "@/viewer/Viewer";

function Placeholder({ children }: { children: React.ReactNode }) {
  return <p className="grid h-full place-items-center font-mono text-xs text-muted-foreground">{children}</p>;
}

function Header() {
  const { doc, canUndo, canRedo, undo, redo, undoLabel, redoLabel } = useDocStore(
    useShallow((s) => ({
    doc: s.doc,
    canUndo: s.past.length > 0,
    canRedo: s.future.length > 0,
    undo: s.undo,
    redo: s.redo,
    undoLabel: s.past[s.past.length - 1]?.label,
      redoLabel: s.future[0]?.label,
    })),
  );
  const path = useUi((s) => s.path);
  return (
    <header className="col-span-3 flex items-center gap-3 border-b border-border bg-surface px-3">
      <span className="font-display text-sm font-bold tracking-tight">Motion Builder</span>
      <span className="text-muted-foreground" aria-hidden>
        /
      </span>
      <span className="text-sm">{doc.name}</span>
      <nav aria-label="Open networks" className="flex items-center gap-1 font-mono text-xs">
        {fullPath(doc, path).map((c, i, all) => {
          const name = doc.networks.find((n) => n.id === c.network)?.name ?? c.network;
          const last = i === all.length - 1;
          return (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground" aria-hidden>›</span>}
              {last ? (
                <span aria-current="page" className="text-foreground">{name}</span>
              ) : (
                <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => openDepth(i)}>
                  {name}
                </button>
              )}
            </span>
          );
        })}
      </nav>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label={canUndo ? `Undo ${undoLabel}` : "Undo"} title="Undo (⌘Z)" disabled={!canUndo} onClick={undo}>
          <Undo2 />
        </Button>
        <Button variant="ghost" size="icon" aria-label={canRedo ? `Redo ${redoLabel}` : "Redo"} title="Redo (⇧⌘Z)" disabled={!canRedo} onClick={redo}>
          <Redo2 />
        </Button>
      </div>
    </header>
  );
}

export function App() {
  useShortcuts();
  return (
    <div className="grid h-full grid-cols-[240px_minmax(0,1fr)_300px] grid-rows-[40px_minmax(0,1fr)_minmax(200px,32vh)] bg-background text-foreground">
      <Header />
      <aside aria-label="Library" className="flex min-h-0 flex-col border-r border-border bg-surface">
        <Library />
      </aside>
      <main className="flex min-h-0 min-w-0 flex-col">
        <Viewer />
        <Transport />
      </main>
      <aside aria-label="Inspector" className="min-h-0 border-l border-border bg-surface">
        <Placeholder>Inspector · step 1c</Placeholder>
      </aside>
      <section aria-label="Timeline and network" className="col-span-3 min-h-0 border-t border-border bg-surface">
        <Tabs defaultValue="timeline" className="flex h-full flex-col gap-0">
          <div className="flex h-10 items-center border-b border-border px-2">
            <TabsList>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="network">Network</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="timeline" className="min-h-0 flex-1">
            <Timeline />
          </TabsContent>
          <TabsContent value="network" className="min-h-0 flex-1">
            <Placeholder>Network · step 1d</Placeholder>
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
