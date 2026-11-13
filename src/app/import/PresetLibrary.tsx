/**
 * Import's preset library: ready-made starts, searchable by name, type or description; only the picked one plays. Pick one, optionally describe how to
 * enhance it, then go to Draft (the preset plays as its own card; the prompt becomes an AI take on
 * the preset's layers) or open it straight in Refine.
 */
import { useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { PRESET_CATEGORIES, PRESETS, type PresetCategory } from "@core/scene";
import { Button } from "@/app/design-system/motionbuilder---brandbook-c4b4eb";
import { cn } from "@/app/design-system/motionbuilder---brandbook-c4b4eb/lib/utils";
import { docStore, useUi } from "@/app/store";
import { useImport } from "./importStore";
import { MiniPlayer } from "./MiniPlayer";

const DOCS = new Map<string, ReturnType<(typeof PRESETS)[number]["build"]>>();
const docOf = (p: (typeof PRESETS)[number]) => DOCS.get(p.id) ?? (DOCS.set(p.id, p.build()), DOCS.get(p.id)!);

const ENHANCE = ["Make it faster and punchier", "Softer, slower and more elegant", "Add a bouncy spring feel", "Letters in one by one", "Add a blur focus pull"];

export function PresetLibrary() {
  const [cat, setCat] = useState<PresetCategory | "all">("all");
  const [id, setId] = useState<string>();
  const [query, setQuery] = useState("");
  const [prompt, setPrompt] = useState("");
  const preset = PRESETS.find((p) => p.id === id);
  const doc = useMemo(() => preset && docOf(preset), [preset]);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const list = PRESETS.filter((p) => {
    if (cat !== "all" && p.category !== cat) return false;
    const hay = `${p.name} ${p.desc} ${PRESET_CATEGORIES.find((c) => c.id === p.category)?.name ?? ""} ${p.id.replace(/-/g, " ")}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });

  const toDraft = () => {
    if (!preset || !doc) return;
    const p = prompt.trim();
    useImport.getState().set(doc, { prompt: p ? `Start from the "${preset.name}" preset (${preset.desc}) and enhance it: ${p}` : "", preset: { name: preset.name, desc: preset.desc, doc } });
    useUi.getState().setScreen("draft");
  };
  const openNow = () => {
    if (!doc || !docStore.getState().load(doc)) return;
    useUi.getState().setPath([]);
    useUi.getState().selectNodes([]);
    useUi.getState().setScreen("refine");
  };

  return (
    <section className="flex flex-col gap-3" aria-label="Preset library">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">Preset library</h2>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Preset categories">
          {[{ id: "all" as const, name: "All" }, ...PRESET_CATEGORIES].map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={cat === c.id} onClick={() => setCat(c.id)} className={cn("h-7 rounded-full px-3 text-xs", cat === c.id ? "bg-ink text-ink-foreground" : "bg-field hover:bg-line")}>
              {c.name}
            </button>
          ))}
        </div>
      </div>
      <div className={cn("grid items-start gap-4", preset && "lg:grid-cols-[minmax(0,1fr)_340px]")}>
      <div className="flex flex-col gap-2">
        <label className="flex h-9 items-center gap-2 rounded-full bg-field px-3 text-sm focus-within:ring-2 focus-within:ring-ink">
          <Search className="size-4 text-muted-foreground" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search presets: 3D, lower third, counter, glitch…" aria-label="Search presets" className="min-w-0 flex-1 bg-transparent outline-none" />
          <span className="text-xs text-muted-foreground">{list.length}</span>
        </label>
        <div className="grid max-h-[520px] grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2" role="radiogroup" aria-label="Presets">
          {list.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={id === p.id} onClick={() => setId(id === p.id ? undefined : p.id)} className={cn("flex flex-col gap-0.5 rounded-lg px-3 py-2 text-left", id === p.id ? "bg-ink text-ink-foreground" : "bg-card shadow-card hover:bg-field")}>
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{p.name}</span>
                <span className={cn("shrink-0 text-[10px] uppercase tracking-wide", id === p.id ? "opacity-70" : "text-muted-foreground")}>{PRESET_CATEGORIES.find((c) => c.id === p.category)!.name}</span>
              </span>
              <span className={cn("line-clamp-1 text-[11px]", id === p.id ? "opacity-70" : "text-muted-foreground")}>{p.desc}</span>
            </button>
          ))}
          {!list.length && <p className="p-3 text-xs text-muted-foreground">No presets match. Try another word.</p>}
        </div>
      </div>
      {preset && doc && (
        <aside className="sticky top-4 flex flex-col gap-3 rounded-xl bg-card p-4 shadow-card" aria-label="Preset preview">
          <MiniPlayer key={preset.id} doc={doc} width={320} />
          <div className="flex flex-col gap-2">
            <div className="font-medium">{preset.name}</div>
            <p className="text-xs text-muted-foreground">{preset.desc}</p>
            <label htmlFor="preset-prompt" className="mt-1 flex items-center gap-2 text-sm font-medium">
              <Sparkles className="size-4" /> Enhance it <span className="text-xs font-normal text-muted-foreground">optional</span>
            </label>
            <textarea id="preset-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} placeholder="Slower, with the title coming in letter by letter…" className="w-full resize-none rounded-md bg-field px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ink" />
            <div className="flex flex-wrap gap-1.5">
              {ENHANCE.map((e) => (
                <button key={e} type="button" onClick={() => setPrompt(e)} className={cn("h-7 rounded-full px-3 text-xs", prompt === e ? "bg-ink text-ink-foreground" : "bg-field hover:bg-line")}>{e}</button>
              ))}
            </div>
            <div className="mt-auto flex flex-wrap gap-2 pt-2">
              <Button onClick={toDraft}>{prompt.trim() ? "Enhance in Draft" : "Continue to Draft"}</Button>
              <Button variant="ghost" onClick={openNow}>Open as is</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Change the text in Refine. An enhance prompt uses AI credits. Opening replaces the open project.</p>
          </div>
        </aside>
      )}
      </div>
    </section>
  );
}
