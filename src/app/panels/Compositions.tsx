import { useState } from "react";
import { Check, CopyPlus, Plus } from "lucide-react";
import { buildDesignDoc } from "@core/scene";
import { Button, Input } from "@/app/design-system/motionbuilder---brandbook-c4b4eb";
import { docStore, useDocStore, useUi } from "@/app/store";
import { nextVersionName, saveAsNewVersion, switchComp } from "@/app/file/versions";

/** Composition edits use the same validated document and undo history as layer edits. */
export function Compositions() {
  const doc = useDocStore((s) => s.doc);
  const [name, setName] = useState("New comp");
  const reset = () => { useUi.getState().setPlaying(false); useUi.getState().setPath([], 0); };
  const open = (id: string) => {
    if (docStore.getState().edit("Open composition", (d) => switchComp(d, id))) reset();
  };
  const add = () => {
    const title = name.trim();
    if (!title) return;
    if (docStore.getState().edit("New composition", (d) => {
      let i = 1;
      while (d.networks.some((n) => n.id === `comp-${i}`)) i++;
      const net = buildDesignDoc({ name: title, width: 1920, height: 1080, source: "blank", layers: [] }).networks[0];
      if (!net) return;
      d.networks.push({ ...net, id: `comp-${i}`, name: title });
      d.root = `comp-${i}`;
    })) reset();
  };
  return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3">
    <h3 className="text-sm font-semibold">Compositions</h3>
    {doc.networks.filter((n) => n.comp).map((n) => <Button key={n.id} variant={n.id === doc.root ? "secondary" : "ghost"} className="h-auto justify-start py-2" onClick={() => open(n.id)} aria-pressed={n.id === doc.root}>
      <span className="flex min-w-0 flex-1 flex-col items-start"><span className="max-w-full truncate">{n.name}</span><span className="text-xs font-normal text-muted-foreground">{n.comp?.width}×{n.comp?.height} · {n.comp?.duration}s</span></span>
      {n.id === doc.root && <Check className="size-4 shrink-0" />}
    </Button>)}
    <Button variant="secondary" className="h-auto whitespace-normal" onClick={() => { if (docStore.getState().edit("New version", saveAsNewVersion)) reset(); }}><CopyPlus className="size-4 shrink-0" /> Save as {nextVersionName(doc, doc.root)}</Button>
    <div className="mt-2 flex gap-1"><Input aria-label="New composition name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} className="min-w-0" /><Button size="icon" variant="secondary" aria-label="Create composition" title="Create composition" disabled={!name.trim()} onClick={add}><Plus /></Button></div>
  </div>;
}