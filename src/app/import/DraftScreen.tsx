/**
 * 2 Draft: check the layer roles and fonts, then pick one of three first animations (smooth,
 * punchy, playful) playing side by side in sync. Picking loads the drafted doc and opens Refine.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { draftFromPrompt } from "@/lib/ai/import.functions";
import { applyDraft, applyDraftSpec, checkDraftSpec, DRAFTS, type DraftCharacter, type Role, type SceneDoc } from "@core/scene";
import { Button } from "@/app/design-system/motionbuilder---brandbook-c4b4eb";
import { cn } from "@/app/design-system/motionbuilder---brandbook-c4b4eb/lib/utils";
import { fontFiles } from "@/app/render/fonts";
import { docStore, useDocStore, useUi } from "@/app/store";
import { useImport } from "./importStore";
import { MiniPlayer } from "./MiniPlayer";
import { designMotionContext } from "./motionContext";

const ROLES: Role[] = ["background", "panel", "image", "logo", "accent", "title", "subtitle", "body", "decoration"];
const LAYERS = new Set(["Text", "Shape", "Image", "Group", "Subnet", "Scene3D"]);

export function DraftScreen() {
  const imported = useImport((s) => s.base);
  const skipped = useImport((s) => s.skipped);
  const open = useDocStore((s) => s.doc);
  const [base, setBase] = useState<SceneDoc>(() => imported ?? open);
  const prompt = useImport((s) => s.prompt);
  const spec = useImport((s) => s.spec);
  const summary = useImport((s) => s.summary);
  const preset = useImport((s) => s.preset);
  const [pick, setPick] = useState<DraftCharacter | "custom" | "preset">(() => (useImport.getState().spec || useImport.getState().prompt ? "custom" : useImport.getState().preset ? "preset" : "smooth"));
  const [aiState, setAiState] = useState<{ busy?: boolean; error?: string }>({});
  const net = base.networks.find((n) => n.id === base.root)!;
  const layers = net.nodes.filter((n) => LAYERS.has(n.type));
  const drafts = useMemo(() => Object.fromEntries((Object.keys(DRAFTS) as DraftCharacter[]).map((c) => [c, applyDraft(base, c)])) as Record<DraftCharacter, SceneDoc>, [base]);
  const custom = useMemo(() => (spec ? applyDraftSpec(base, spec) : undefined), [base, spec]);

  // A prompt without an AI draft yet (no reference): ask once for this design's layers.
  const askPrompt = async () => {
    setAiState({ busy: true });
    try {
      const res = await draftFromPrompt({ data: { prompt, ...designMotionContext(base) } });
      if (!res.ok) return setAiState({ error: res.error });
      useImport.getState().setSpec(checkDraftSpec(JSON.parse(res.json)));
      setAiState({});
    } catch {
      setAiState({ error: "The AI answer couldn't be read. Try again." });
    }
  };
  useEffect(() => {
    if (prompt && !spec && layers.length) void askPrompt();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fonts = [...new Set(layers.filter((n) => n.type === "Text").map((n) => String(n.params.font?.value ?? "Inter")))];

  const setRole = (id: string, role: Role) => {
    const d = structuredClone(base);
    const n = d.networks.find((x) => x.id === d.root)!.nodes.find((x) => x.id === id)!;
    n.role = role;
    setBase(d);
  };
  const go = () => {
    const chosen = pick === "custom" ? custom : pick === "preset" ? preset?.doc : drafts[pick];
    if (!chosen || !docStore.getState().load(chosen)) return;
    useImport.getState().set(undefined);
    useUi.getState().setPath([]);
    useUi.getState().selectNodes([]);
    useUi.getState().setScreen("refine");
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl gap-6 p-6 max-[900px]:flex-col">
      <aside className="flex w-64 shrink-0 flex-col gap-4">
        <div className="rounded-xl bg-card p-4 shadow-card">
          <div className="text-xs text-muted-foreground">{imported ? "Imported" : "Open project"}</div>
          <div className="font-medium">{base.name}</div>
          <div className="text-xs text-muted-foreground">
            {net.comp?.width}×{net.comp?.height} · {layers.length} layer{layers.length === 1 ? "" : "s"}
          </div>
          {summary && <p className="mt-2 text-[11px] text-muted-foreground">{summary}</p>}
          {skipped.length > 0 && <p className="mt-2 text-[11px] text-muted-foreground">Not imported: {skipped.join(", ")}.</p>}
        </div>
        <div className="flex flex-col gap-2 rounded-xl bg-card p-4 shadow-card">
          <div className="flex items-baseline justify-between">
            <span className="font-medium">Layer roles</span>
            <span className="text-[11px] text-muted-foreground">drives the drafts</span>
          </div>
          {layers.length === 0 && <p className="text-xs text-muted-foreground">No layers yet. Go back to Import and add a file or text.</p>}
          {layers.map((n) => (
            <label key={n.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate">{n.name}</span>
              <select aria-label={`Role of ${n.name}`} value={n.role ?? "decoration"} onChange={(e) => setRole(n.id, e.target.value as Role)} className="h-7 rounded-md bg-field px-1.5 text-xs">
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {fonts.length > 0 && (
          <div className="flex flex-col gap-1 rounded-xl bg-card p-4 shadow-card">
            <span className="font-medium">Fonts</span>
            {fonts.map((f) => (
              <div key={f} className="flex justify-between text-xs">
                <span>{f}</span>
                <span className={fontFiles(f).length ? "text-muted-foreground" : "font-medium"}>{fontFiles(f).length ? "bundled" : "missing, shown in a fallback"}</span>
              </div>
            ))}
          </div>
        )}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Pick a first animation</h1>
          <p className="mt-1 text-muted-foreground">{prompt || spec ? "Your take and three others" : "Three takes"} on the same layers, playing in sync. All of them stay fully editable.</p>
        </div>
        <div className={cn("grid gap-3", (prompt || spec ? 1 : 0) + (preset ? 1 : 0) ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3")} role="radiogroup" aria-label="Drafts">
          {preset && (
            <button type="button" role="radio" aria-checked={pick === "preset"} onClick={() => setPick("preset")} className={cn("flex flex-col gap-2 rounded-xl bg-card p-3 text-left shadow-card", pick === "preset" && "ring-2 ring-ink")}>
              <MiniPlayer doc={preset.doc} width={300} />
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">Preset: {preset.name}</span>
                {pick === "preset" && <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] text-ink-foreground">Selected</span>}
              </div>
              <p className="text-xs text-muted-foreground">{preset.desc} As it comes, unchanged.</p>
            </button>
          )}
          {(prompt || spec) && (
            <button type="button" role="radio" aria-checked={pick === "custom"} disabled={!custom} onClick={() => setPick("custom")} className={cn("flex flex-col gap-2 rounded-xl bg-card p-3 text-left shadow-card", pick === "custom" && "ring-2 ring-ink")}>
              {custom ? (
                <MiniPlayer doc={custom} width={300} />
              ) : (
                <div className="grid aspect-video w-full place-items-center rounded-md bg-field p-3 text-center text-xs text-muted-foreground">
                  {aiState.busy ? (
                    <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Drafting your prompt…</span>
                  ) : aiState.error ? (
                    <span className="flex flex-col items-center gap-2">
                      {aiState.error}
                      <span role="button" tabIndex={0} className="underline" onClick={(e) => (e.stopPropagation(), void askPrompt())}>Try again</span>
                    </span>
                  ) : (
                    "Waiting for the AI…"
                  )}
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 truncate font-medium"><Sparkles className="size-3.5 shrink-0" /> {spec?.name ?? "Your prompt"}</span>
                {pick === "custom" && custom && <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] text-ink-foreground">Selected</span>}
              </div>
              <p className="line-clamp-3 text-xs text-muted-foreground">{spec?.desc || prompt}</p>
              {spec && (
                <dl className="grid grid-cols-3 gap-1 font-mono text-[11px] text-muted-foreground">
                  <div><dt>In</dt><dd className="text-foreground">{spec.motion.duration}s</dd></div>
                  <div><dt>Ease</dt><dd className="truncate text-foreground" title={spec.motion.ease}>{spec.motion.ease}</dd></div>
                  <div><dt>Stagger</dt><dd className="text-foreground">{spec.motion.stagger}s</dd></div>
                </dl>
              )}
            </button>
          )}
          {(Object.keys(DRAFTS) as DraftCharacter[]).map((c) => {
            const d = DRAFTS[c];
            return (
              <button key={c} type="button" role="radio" aria-checked={pick === c} onClick={() => setPick(c)} className={cn("flex flex-col gap-2 rounded-xl bg-card p-3 text-left shadow-card", pick === c && "ring-2 ring-ink")}>
                <MiniPlayer doc={drafts[c]} width={300} />
                <div className="flex items-center justify-between">
                  <span className="font-medium">{d.name}</span>
                  {pick === c && <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] text-ink-foreground">Selected</span>}
                </div>
                <p className="text-xs text-muted-foreground">{d.desc}</p>
                <dl className="grid grid-cols-3 gap-1 font-mono text-[11px] text-muted-foreground">
                  <div><dt>In</dt><dd className="text-foreground">{d.duration}s</dd></div>
                  <div><dt>Ease</dt><dd className="truncate text-foreground" title={d.ease}>{c === "playful" ? "Bouncy" : d.ease}</dd></div>
                  <div><dt>Stagger</dt><dd className="text-foreground">{d.stagger}s</dd></div>
                </dl>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <Button size="lg" disabled={!layers.length || (pick === "custom" && !custom)} onClick={go}>
            Continue with {pick === "custom" ? (spec?.name ?? "your prompt") : pick === "preset" ? preset?.name : DRAFTS[pick].name}
          </Button>
          <Button variant="ghost" size="lg" onClick={() => useUi.getState().setScreen("import")}>Back to Import</Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {imported ? "Continuing replaces the open project with this design. Save first if you want to keep it." : "Continuing replaces the animations on the main comp; one ⌘Z won't undo it, so save first if unsure."}
        </p>
      </section>
    </div>
  );
}
