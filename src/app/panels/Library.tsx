/**
 * Library (opens from the rail): Materials, Presets, Brand. Materials: the materials already in
 * the open 3D scene (shared when applied), starter materials and brand colours; click applies to
 * the selection, drag drops onto a layer in the viewer or the timeline. 2D layers take the colour.
 * The node catalog moved to "+ Add" in the timeline card.
 */
import { useState } from "react";
import { Search } from "lucide-react";
import { lowerThird, lowerThirdFit, MATERIAL_PRESETS, sceneOwner, title3d, uniqueGrid, type SceneDoc } from "@core/scene";
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@/design-system/motionbuilder---brandbook-c4b4eb";
import { docStore, shownNetwork, useDocStore, useUi } from "@/store";
import { cssColor, Sphere } from "@/shell/look";
import { applyItem, libraryTarget, SOLID_MIME, type LibraryItem } from "./materials";

function Tile({ label, item, sphere, onApply }: { label: string; item: LibraryItem; sphere: React.ReactNode; onApply: () => void }) {
  return (
    <button
      type="button"
      draggable
      aria-label={label}
      onDragStart={(e) => {
        e.dataTransfer.setData(SOLID_MIME, JSON.stringify(item));
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={onApply}
      className="flex cursor-grab flex-col items-center gap-2 rounded-[14px] bg-field px-1.5 pb-2.5 pt-3 hover:bg-line2/50"
    >
      {sphere}
      <span className="max-w-full truncate text-xs font-medium">{label}</span>
    </button>
  );
}

function Materials() {
  const doc = useDocStore((s) => s.doc);
  const [q, setQ] = useState("");
  const sel = useUi((s) => s.selectedNodes[0]);
  const path = useUi((s) => s.path);
  const net = shownNetwork(doc, path);
  const node = net.nodes.find((n) => n.id === sel);
  const target = node && libraryTarget(doc, net, node, 0);
  const match = (name: string) => name.toLowerCase().includes(q.trim().toLowerCase());
  const apply = (item: LibraryItem) => node && target && applyItem(node.id, item);
  const presets = MATERIAL_PRESETS.filter((p) => match(p.name));
  const inScene = sceneOwner(doc, net.id) ? net.nodes.filter((n) => n.type === "Material" && match(n.name)) : [];
  const colours = [
    ...(doc.brand?.colors ?? []).map((c) => ({ name: c.token.replace(/^./, (x) => x.toUpperCase()), value: `brand:${c.token}`, css: c.value })),
    { name: "White", value: "#ffffff", css: "#ffffff" },
    { name: "Black", value: "#000000", css: "#000000" },
  ].filter((c) => match(c.name));
  const heading = (t: string, n: number) => (
    <h3 className="col-span-2 px-1 pt-2 text-[13px] font-semibold">
      {t} <span className="font-normal text-faint">({n})</span>
    </h3>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <label className="mx-3 mb-2 flex h-[34px] items-center gap-2 rounded-sm bg-field px-2.5 text-muted-foreground">
        <Search className="size-[15px]" aria-hidden />
        <span className="sr-only">Search materials</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search materials" className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground" />
      </label>
      <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-2 overflow-y-auto px-3">
        {inScene.length > 0 && heading("In this scene", inScene.length)}
        {inScene.map((m) => (
          <Tile
            key={m.id}
            label={m.name}
            item={{ kind: "node", network: net.id, node: m.id, name: m.name }}
            sphere={<Sphere color={cssColor(doc, m.params.color?.value) ?? "#ffffff"} kind={String(m.params.kind?.value ?? "plastic")} size={44} />}
            onApply={() => apply({ kind: "node", network: net.id, node: m.id, name: m.name })}
          />
        ))}
        {presets.length > 0 && heading("Materials", presets.length)}
        {presets.map((p) => (
          <Tile key={p.id} label={p.name} item={{ kind: "preset", preset: p }} sphere={<Sphere color={p.color} kind={p.kind} size={44} />} onApply={() => apply({ kind: "preset", preset: p })} />
        ))}
        {colours.length > 0 && heading("Colours", colours.length)}
        {colours.map((c) => (
          <Tile key={c.value} label={c.name} item={{ kind: "colour", value: c.value, name: c.name }} sphere={<Sphere color={c.css} kind="solid" size={44} />} onApply={() => apply({ kind: "colour", value: c.value, name: c.name })} />
        ))}
        {!presets.length && !colours.length && !inScene.length && <p className="col-span-2 py-6 text-center text-xs text-muted-foreground">No material matches “{q}”</p>}
      </div>
      <p className="px-3.5 pb-3 pt-2.5 text-xs leading-snug text-muted-foreground">
        {target ? (
          <>
            Drag onto a layer, or click to apply to <strong className="font-semibold text-foreground">{node!.name}</strong>
            {target.is3D ? "." : " (2D layers take the colour)."}
          </>
        ) : (
          "Select a layer or 3D object, then click a material; or drag one onto it."
        )}
      </p>
    </div>
  );
}

function Presets() {
  const doc = useDocStore((s) => s.doc);
  const edits = useDocStore((s) => s.past.length);
  const [asking, setAsking] = useState<string>();
  const open = (ex: SceneDoc) => {
    setAsking(undefined);
    if (docStore.getState().load(ex)) useUi.getState().setPath([], 0);
  };
  const assets = doc.brand?.assets ?? [];
  const row = "w-full rounded-md px-2.5 py-2 text-left hover:bg-field";
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
      <h3 className="px-1 pb-1 pt-1 text-[13px] font-semibold">
        Examples <span className="font-normal text-faint">(4)</span>
      </h3>
      {([["Lower third", lowerThird], ["Lower third, fits any name", lowerThirdFit], ["3D title", title3d], ["Cloner grid", uniqueGrid]] as [string, SceneDoc][]).map(([label, ex]) => (
        <div key={label}>
          <button
            type="button"
            title="Open this example (replaces the current doc)"
            aria-expanded={asking === label}
            onClick={() => (edits ? setAsking(asking === label ? undefined : label) : open(ex))}
            className={row}
          >
            {label}
            <span className="block text-[11px] text-muted-foreground">Test content · {ex.networks[0]!.comp ? `${ex.networks[0]!.comp.width}×${ex.networks[0]!.comp.height}` : ""}</span>
          </button>
          {asking === label && (
            // in-app confirm: the browser's confirm() is blocked in some embedded views
            <div role="alertdialog" aria-label={`Open ${label}?`} className="mx-1 mb-2 rounded-md bg-field p-2.5 text-xs">
              <p className="mb-2">
                Replace the current doc? Your {edits} {edits === 1 ? "edit" : "edits"} can't be undone after.
              </p>
              <div className="flex gap-1.5">
                <Button size="sm" onClick={() => open(ex)}>
                  Open {label}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAsking(undefined)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
      <h3 className="px-1 pb-1 pt-4 text-[13px] font-semibold">
        Motion assets <span className="font-normal text-faint">({assets.length})</span>
      </h3>
      {assets.map((id) => (
        <p key={id} className="px-2.5 py-1.5">
          {doc.networks.find((n) => n.id === id)?.name ?? id}
        </p>
      ))}
      {!assets.length && <p className="px-2.5 text-xs text-muted-foreground">None in this brand kit</p>}
    </div>
  );
}

function Brand() {
  const doc = useDocStore((s) => s.doc);
  if (!doc.brand) return <p className="px-4 text-xs text-muted-foreground">No brand kit</p>;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
      <h3 className="px-1 pb-1.5 pt-1 text-[13px] font-semibold">
        Colours <span className="font-normal text-faint">({doc.brand.colors.length})</span>
      </h3>
      <ul className="grid gap-1">
        {doc.brand.colors.map((c) => (
          <li key={c.token} className="flex items-center gap-2 rounded-md px-2 py-1.5">
            <Sphere color={c.value} size={14} />
            <span className="text-xs">{c.token}</span>
            <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">{c.value}</span>
          </li>
        ))}
      </ul>
      <h3 className="px-1 pb-1.5 pt-4 text-[13px] font-semibold">
        Fonts <span className="font-normal text-faint">({doc.brand.fonts.length})</span>
      </h3>
      <ul className="grid gap-1">
        {doc.brand.fonts.map((f) => (
          <li key={f.family} className="flex items-center gap-2 rounded-md px-2 py-1.5">
            <span style={{ fontFamily: f.family }}>{f.family}</span>
            <span className="ml-auto font-mono text-[11px] text-muted-foreground">{f.weights.join(" ")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Library() {
  return (
    <Tabs defaultValue="materials" className="flex min-h-0 flex-1 flex-col gap-0">
      <div className="p-3 pb-2">
        <TabsList aria-label="Library" className="grid w-full grid-cols-3">
          <TabsTrigger value="materials">Materials</TabsTrigger>
          <TabsTrigger value="presets">Presets</TabsTrigger>
          <TabsTrigger value="brand">Brand</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="materials" className="flex min-h-0 flex-1 flex-col">
        <Materials />
      </TabsContent>
      <TabsContent value="presets" className="flex min-h-0 flex-1 flex-col">
        <Presets />
      </TabsContent>
      <TabsContent value="brand" className="flex min-h-0 flex-1 flex-col">
        <Brand />
      </TabsContent>
    </Tabs>
  );
}
