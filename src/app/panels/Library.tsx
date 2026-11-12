/**
 * Library (opens from the rail): Materials, Presets, Brand. Materials are Solid colours for now
 * (the brand kit's colours); click applies to the selected layer, drag drops onto a layer in the
 * viewer or the timeline. Physical materials (glass, metal…) come with material nodes (phase D).
 * The node catalog moved to "+ Add" in the timeline card.
 */
import { useState } from "react";
import { Search } from "lucide-react";
import { lowerThird, lowerThirdFit, type SceneDoc } from "@core/scene";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/design-system/motionbuilder---brandbook-c4b4eb";
import { docStore, shownNetwork, useDocStore, useUi } from "@/store";
import { Sphere } from "@/shell/look";
import { applySolid, SOLID_MIME, takesMaterial } from "./materials";

interface Solid {
  name: string;
  value: string;
  css: string;
}

function Materials() {
  const doc = useDocStore((s) => s.doc);
  const [q, setQ] = useState("");
  const sel = useUi((s) => s.selectedNodes[0]);
  const path = useUi((s) => s.path);
  const node = shownNetwork(doc, path).nodes.find((n) => n.id === sel);
  const target = node && takesMaterial(node.type) ? node : undefined;
  const solids: Solid[] = [
    ...(doc.brand?.colors ?? []).map((c) => ({ name: c.token.replace(/^./, (x) => x.toUpperCase()), value: `brand:${c.token}`, css: c.value })),
    { name: "White", value: "#ffffff", css: "#ffffff" },
    { name: "Black", value: "#000000", css: "#000000" },
  ].filter((m) => m.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <label className="mx-3 mb-2 flex h-[34px] items-center gap-2 rounded-sm bg-field px-2.5 text-muted-foreground">
        <Search className="size-[15px]" aria-hidden />
        <span className="sr-only">Search materials</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search materials" className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground" />
      </label>
      <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-2 overflow-y-auto px-3">
        {solids.map((m) => (
          <button
            key={m.value}
            type="button"
            draggable
            aria-label={`${m.name}, solid${target ? `: apply to ${target.name}` : ""}`}
            onDragStart={(e) => {
              e.dataTransfer.setData(SOLID_MIME, JSON.stringify({ value: m.value, name: m.name }));
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => target && applySolid(target.id, m.value, m.name)}
            className="flex cursor-grab flex-col items-center gap-2 rounded-[14px] bg-field px-1.5 pb-2.5 pt-3 hover:bg-line2/50"
          >
            <Sphere color={m.css} size={44} />
            <span className="text-xs font-medium">{m.name}</span>
          </button>
        ))}
        {!solids.length && <p className="col-span-2 py-6 text-center text-xs text-muted-foreground">No material matches “{q}”</p>}
      </div>
      <p className="px-3.5 pb-3 pt-2.5 text-xs leading-snug text-muted-foreground">
        {target ? (
          <>
            Drag onto a layer, or click to apply to <strong className="font-semibold text-foreground">{target.name}</strong>.
          </>
        ) : (
          "Drag onto a layer, or select a text or shape layer and click."
        )}
        <span className="mt-1 block text-faint">Glass, metal and other physical materials come later.</span>
      </p>
    </div>
  );
}

function Presets() {
  const doc = useDocStore((s) => s.doc);
  const assets = doc.brand?.assets ?? [];
  const row = "w-full rounded-md px-2.5 py-2 text-left hover:bg-field";
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
      <h3 className="px-1 pb-1 pt-1 text-[13px] font-semibold">
        Examples <span className="font-normal text-faint">(2)</span>
      </h3>
      {([["Lower third", lowerThird], ["Lower third, fits any name", lowerThirdFit]] as [string, SceneDoc][]).map(([label, ex]) => (
        <button
          key={label}
          type="button"
          title="Open this example (replaces the current doc and clears undo)"
          onClick={() => {
            if (!window.confirm(`Open "${label}"? This replaces the current doc and clears undo.`)) return;
            if (docStore.getState().load(ex)) useUi.getState().setPath([], 0);
          }}
          className={row}
        >
          {label}
          <span className="block text-[11px] text-muted-foreground">Test content · 16:9</span>
        </button>
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
