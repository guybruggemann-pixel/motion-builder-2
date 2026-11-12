/**
 * Refine screen (docs/ui-handover.md §2): floating cards on a soft canvas. Top bar, icon rail,
 * Library (collapsible), viewer with floating transport, inspector, and the timeline card with
 * Timeline / Graph / Network tabs below.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/design-system/motionbuilder---brandbook-c4b4eb";
import { Library } from "@/panels/Library";
import { fullPath, useDocStore, useUi } from "@/store";
import { openDepth } from "@/store/navigation";
import { Timeline } from "@/timeline/Timeline";
import { Inspector } from "@/inspector/Inspector";
import { NetworkView } from "@/network/NetworkView";
import { GraphEditor } from "@/timeline/GraphEditor";
import { useShortcuts } from "@/useShortcuts";
import { Viewer } from "@/viewer/Viewer";
import { Rail } from "@/shell/Rail";
import { TopBar } from "@/shell/TopBar";

/** Why the last edit was refused (it failed validateDoc), until the next edit goes through. */
function EditErrors() {
  const errors = useDocStore((s) => s.errors);
  if (!errors.length) return null;
  return (
    <div role="alert" className="mx-3 mb-3 mt-auto rounded-md bg-warn-bg px-3 py-2 text-xs text-warn-ink">
      Edit refused: {errors[0]}
      {errors.length > 1 && ` (+${errors.length - 1} more)`}
    </div>
  );
}

/** Where you are inside subnets: Main › Lower third. Earlier crumbs jump back up. */
function Breadcrumb() {
  const doc = useDocStore((s) => s.doc);
  const path = useUi((s) => s.path);
  return (
    <nav aria-label="Open networks" className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      {fullPath(doc, path).map((c, i, all) => {
        const name = doc.networks.find((n) => n.id === c.network)?.name ?? c.network;
        const last = i === all.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5 whitespace-nowrap">
            {i > 0 && <span aria-hidden>›</span>}
            {last ? (
              <span aria-current="page" className="font-medium text-foreground">
                {name}
              </span>
            ) : (
              <button type="button" className="rounded-xs hover:text-foreground" onClick={() => openDepth(i)}>
                {name}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

const card = "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl bg-card shadow-card";

export function App() {
  useShortcuts();
  const libraryOpen = useUi((s) => s.libraryOpen);

  return (
    <div className="shell bg-canvas text-[13px] text-foreground" data-library={libraryOpen ? "open" : "closed"}>
      <TopBar />
      <Rail />
      {libraryOpen && (
        <aside aria-label="Library" className={`${card} [grid-area:lib]`}>
          <Library />
        </aside>
      )}
      <main aria-label="Viewer" className="relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl bg-stage bg-dots [grid-area:view]">
        <Viewer />
      </main>
      <aside aria-label="Inspector" className={`${card} [grid-area:insp]`}>
        <Inspector />
        <EditErrors />
      </aside>
      <section aria-label="Timeline and network" className={`${card} [grid-area:tl]`}>
        <Tabs defaultValue="timeline" className="flex h-full min-h-0 flex-col gap-0">
          <div className="flex items-center gap-2.5 px-3 pb-1.5 pt-2.5">
            <TabsList aria-label="Bottom panel">
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="graph">Graph</TabsTrigger>
              <TabsTrigger value="network">Network</TabsTrigger>
            </TabsList>
            <Breadcrumb />
          </div>
          <TabsContent value="timeline" className="min-h-0 flex-1">
            <Timeline />
          </TabsContent>
          <TabsContent value="graph" className="min-h-0 flex-1">
            <GraphEditor />
          </TabsContent>
          <TabsContent value="network" className="min-h-0 flex-1">
            <NetworkView />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
