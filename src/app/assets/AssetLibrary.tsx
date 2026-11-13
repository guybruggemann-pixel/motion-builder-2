import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { sceneOwner } from "@core/scene";
import { Button } from "@/app/design-system/motionbuilder---brandbook-c4b4eb";
import { docStore, shownNetwork, useDocStore, useUi } from "@/app/store";
import tablerLicense from "@/assets/library/TABLER-LICENSE.txt?raw";
import { CURATED_ASSETS, type CuratedAsset } from "./catalog";
import { insertAsset } from "./insertAsset";

async function embedded(src: string): Promise<string> {
  const response = await fetch(src);
  if (!response.ok) throw new Error("Couldn't load this artwork. Please try again.");
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn't read this artwork."));
    reader.readAsDataURL(blob);
  });
}

export function AssetLibrary() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<CuratedAsset>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const doc = useDocStore((s) => s.doc);
  const path = useUi((s) => s.path);
  const net = shownNetwork(doc, path);
  const in3D = !!sceneOwner(doc, net.id);
  const assets = CURATED_ASSETS.filter((a) => (category === "all" || a.category === category) && `${a.name} ${a.tags} ${a.source}`.toLowerCase().includes(query.trim().toLowerCase()));
  const add = async () => {
    if (!selected || busy || in3D) return;
    setBusy(true); setError("");
    try {
      const src = await embedded(selected.src);
      const current = shownNetwork(docStore.getState().doc, useUi.getState().path);
      if (current.id !== net.id) throw new Error("The composition changed. Select the artwork again.");
      let id = "";
      const ok = docStore.getState().edit(`Add ${selected.name}`, (d) => {
        id = insertAsset(d, current.id, { ...selected, src, attribution: selected.license === "MIT" ? tablerLicense : undefined });
      });
      if (!ok) throw new Error("Couldn't add this artwork to the composition.");
      useUi.getState().selectNodes([id]);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't add this artwork."); }
    finally { setBusy(false); }
  };
  return <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3">
    <label className="flex h-[34px] shrink-0 items-center gap-2 rounded-sm bg-field px-2.5">
      <Search className="size-4 text-muted-foreground" aria-hidden />
      <span className="sr-only">Search assets</span>
      <input className="min-w-0 flex-1 bg-transparent text-xs outline-none" placeholder="Search assets" value={query} onChange={(e) => setQuery(e.target.value)} />
    </label>
    <div className="flex shrink-0 flex-wrap gap-1" role="group" aria-label="Asset categories">
      {([ ["all", "All"], ["icons", "Icons"], ["textures", "Textures"] ] as const).map(([value, label]) => <Button key={value} size="sm" variant={category === value ? "primary" : "ghost"} aria-pressed={category === value} onClick={() => setCategory(value)}>{label}</Button>)}
    </div>
    <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-2 overflow-y-auto">
      {assets.map((a) => <Button key={a.id} variant="ghost" aria-label={`Preview ${a.name}`} aria-pressed={selected?.id === a.id} onClick={() => { setSelected(a); setError(""); }} className={`h-auto min-w-0 flex-col gap-1 rounded-lg p-2 ${selected?.id === a.id ? "bg-raised ring-1 ring-line2" : "bg-field"}`}>
        <img src={a.src} alt="" loading="lazy" width={a.width} height={a.height} className="aspect-square w-full rounded-sm object-contain" />
        <span className="w-full truncate text-center text-[11px]">{a.name}</span>
      </Button>)}
      {!assets.length && <p className="col-span-2 py-6 text-center text-xs text-muted-foreground">No matching assets</p>}
    </div>
    {selected && <div className="shrink-0 border-t border-line pt-2">
      <div className="flex items-center gap-2"><img src={selected.src} alt={selected.name} width={selected.width} height={selected.height} className="size-12 rounded-sm bg-field object-contain" /><div className="min-w-0"><p className="truncate text-xs font-medium">{selected.name}</p><p className="text-[11px] text-muted-foreground">{selected.source} · {selected.license}</p><p className="text-[11px] text-muted-foreground">{selected.category === "icons" ? "Image artwork · 512 × 512" : "Image texture · 1024 × 1024"}</p></div></div>
      <Button size="sm" className="mt-2 w-full" disabled={busy || in3D} onClick={add}><Plus className="size-4" />{busy ? "Adding…" : "Add to composition"}</Button>
      {in3D && <p className="mt-1 text-xs text-muted-foreground">Available in a 2D composition</p>}
      {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
    </div>}
  </div>;
}