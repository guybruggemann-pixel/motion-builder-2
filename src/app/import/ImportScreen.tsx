/**
 * 1 Import: drop an SVG, a picture or a reference video and/or type a headline and subline,
 * describe the motion (or pick a ready-made prompt), then go to Draft. Pictures and videos can be
 * rebuilt as layers by the AI. Nothing changes the open project until a draft is picked.
 */
import { useRef, useState } from "react";
import { FileUp, Loader2, Sparkles, X } from "lucide-react";
import { buildDesignDoc, buildPattern, buildSequence, checkDraftSpec, checkLowerThirdRecipe, checkSequenceRecipe, checkShowcaseRecipe, grungeLowerThird, checkPatternRecipe, checkCubeRecipe, typeCube, checkReferenceLayers, lowerThird, title3d, type ImportLayer, type SceneDoc } from "@core/scene";
import { Button, Input } from "@/app/design-system/motionbuilder---brandbook-c4b4eb";
import { cn } from "@/app/design-system/motionbuilder---brandbook-c4b4eb/lib/utils";
import { docStore, useUi } from "@/app/store";
import { analyzeReference } from "@/lib/ai/import.functions";
import { parseSvg, readImage, svgArtwork, type Parsed } from "./parseDesign";
import { useImport } from "./importStore";
import { STARTER_PROMPTS } from "./prompts";
import { PresetLibrary } from "./PresetLibrary";
import { pictureFrames, videoFrames } from "./reference";
import { pdfToPng } from "./pdf";
import { unzip } from "./zip";
import { designMotionContext } from "./motionContext";
import { embedDocFonts } from "@/app/render/fonts";

type Picked =
  | { kind: "svg"; name: string; parsed: Parsed; artwork: ImportLayer }
  | { kind: "picture"; name: string; file: File; layer: ImportLayer; pdf?: boolean }
  | { kind: "video"; name: string; file: File };
type Frames = { width: number; height: number; duration: number; frames: { t: number; image: string }[] };
type Result = { doc: SceneDoc; spec?: ReturnType<typeof checkDraftSpec>; summary?: string; preset?: { name: string; desc: string; doc: SceneDoc } };

/** Fit a reference's aspect into a comp: long side 1920, even numbers. */
const compFor = (w: number, h: number): [number, number] => {
  const s = 1920 / Math.max(w, h);
  return [Math.round((w * s) / 2) * 2, Math.round((h * s) / 2) * 2];
};

/** Every Text / Text 3D node in the doc set to this font family. */
const withFont = (doc: SceneDoc, family: string): SceneDoc => ({
  ...doc,
  networks: doc.networks.map((n) => ({ ...n, nodes: n.nodes.map((x) => (x.type === "Text" || x.type === "Text3D" ? { ...x, params: { ...x.params, font: { value: family } } } : x)) })),
});

export function ImportScreen() {
  const [design, setDesign] = useState<Picked>();
  const [motion, setMotion] = useState<Picked>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [loading, setLoading] = useState<string>();
  const [over, setOver] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [fonts, setFonts] = useState<string[]>([]);
  const [font, setFont] = useState<string>();
  const [rebuild, setRebuild] = useState(false);
  const [preserveSvg, setPreserveSvg] = useState(true);
  const input = useRef<HTMLInputElement>(null);

  const read = async (f: File): Promise<Picked> => {
    if (/\.svg$/i.test(f.name) || f.type === "image/svg+xml") {
      const text = await f.text();
      const parsed = parseSvg(text);
      const artwork = await svgArtwork(text, f.name, parsed.width, parsed.height);
      return { kind: "svg", name: f.name, parsed, artwork };
    }
    if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
      const png = await pdfToPng(f);
      return { kind: "picture", name: f.name, file: png, layer: await readImage(png, [1920, 1080]), pdf: true };
    }
    if (/^image\/(png|jpe?g|webp)$/.test(f.type)) return { kind: "picture", name: f.name, file: f, layer: await readImage(f, [1920, 1080]) };
    if (f.type.startsWith("video/")) return { kind: "video", name: f.name, file: f };
    throw new Error(`${f.name} isn't supported. Use SVG, PDF, PNG, JPG or a video.`);
  };

  const takeAll = async (list: FileList | null) => {
    if (!list?.length) return;
    setError(undefined);
    let d = design, m = motion;
    const all: File[] = [];
    for (const f of Array.from(list)) {
      if (!/\.zip$/i.test(f.name) && f.type !== "application/zip") { all.push(f); continue; }
      try {
        setLoading(f.name);
        const z = await unzip(f);
        all.push(...z.files);
        if (z.fonts.length) (setFonts((o) => [...new Set([...o, ...z.fonts])]), setFont((o) => o ?? z.fonts[0]));
        if (!z.files.length && !z.fonts.length) setError(`Nothing usable in ${f.name}. Zips can hold fonts, SVG, PDF, PNG, JPG or videos.`);
      } catch {
        setError(`Couldn't open ${f.name}.`);
      }
    }
    for (const f of all) {
      try {
        setLoading(f.name);
        const p = await read(f);
        // videos are motion references; SVG/PDF are designs; a picture fills the design slot first
        if (p.kind === "video") m = p;
        else if (p.kind === "svg" || ("pdf" in p && p.pdf) || !d) d = p;
        else m = p;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    setLoading(undefined);
    setDesign(d);
    setMotion(m);
  };

  const ready = !!design || !!motion;
  const name = (design ?? motion)?.name.replace(/\.\w+$/, "") ?? "New comp";
  const framesOf = async (p: Picked): Promise<Frames> =>
    p.kind === "video" ? videoFrames(p.file) : { ...(await pictureFrames(p.kind === "picture" && p.layer.kind === "image" ? p.layer.src : "")), duration: 5 };

  /** Rebuild a picture or video reference into a doc (patterns, sequences, titles or flat layers). */
  const rebuildFrom = async (p: Picked, ref: Frames, retry = false): Promise<Result> => {
    const [W, H] = compFor(ref.width, ref.height);
    const strict = retry && "Your previous answer had no usable pattern or layers. Set pattern.kind = \"none\" and list the flat layers (at least the background and every visible word or shape) with their motion in draft.";
    const res = await analyzeReference({ data: { width: W, height: H, frames: ref.frames, duration: ref.duration, prompt: [strict, prompt.trim(), font && `The user supplied the font "${font}"; it will be applied to all text.`].filter(Boolean).join(" ") || undefined } });
    if (!res.ok) throw new Error(res.error);
    const raw = JSON.parse(res.json) as { summary?: string; photo?: boolean; pattern?: unknown; layers?: unknown; draft?: unknown };
    const showcase = checkShowcaseRecipe(raw.pattern, { width: W, height: H, duration: ref.duration }, name);
    if (showcase) return { doc: showcase, summary: raw.summary, preset: { name: "Rebuilt layout", desc: raw.summary ?? "Rebuilt from cards, tiles, words or boxes.", doc: showcase } };
    const sequence = checkSequenceRecipe(raw.pattern);
    const title = checkLowerThirdRecipe(raw.pattern);
    if (sequence || title) {
      const doc = sequence ? buildSequence({ name, width: W, height: H, ...sequence }) : grungeLowerThird({ ...title, width: W, height: H }, name);
      return { doc, summary: raw.summary, preset: { name: sequence ? "Rebuilt sequence" : "Rebuilt title", desc: raw.summary ?? (sequence ? "Type scenes end to end, joined by cuts and pushes." : "A name that glitches in over paint."), doc } };
    }
    const cube = checkCubeRecipe(raw.pattern);
    if (cube) {
      const doc = typeCube({ ...cube, width: W, height: H }, name);
      return { doc, summary: raw.summary, preset: { name: "Rebuilt type cube", desc: raw.summary ?? "Words on the faces of a box, rows turning one by one.", doc } };
    }
    const pattern = checkPatternRecipe(raw.pattern);
    if (pattern) {
      const doc = buildPattern(pattern, { width: W, height: H, duration: ref.duration }, name);
      return { doc, summary: raw.summary, preset: { name: "Rebuilt pattern", desc: raw.summary ?? "A wall of 3D type, built from cloners, a wave field and a deformer.", doc } };
    }
    const rebuilt = checkReferenceLayers(raw.layers, W, H);
    if (!rebuilt.length && !retry) {
      console.warn("Reference rebuild had no usable pattern or layers; asking again for flat layers.", raw.pattern);
      return rebuildFrom(p, ref, true);
    }
    if (!rebuilt.length) throw new Error("The AI couldn't find layers to rebuild. Try another reference, or turn off rebuilding.");
    const under: ImportLayer[] =
      p.kind === "picture" ? [{ kind: "image", name: "Reference", src: p.layer.kind === "image" ? p.layer.src : ref.frames[0]!.image, scale: W / ref.width, size: [W, H], position: [0, 0], role: "background", hidden: !raw.photo }] : [];
    const doc = buildDesignDoc({ name, width: W, height: H, duration: ref.duration, layers: [...under, ...rebuilt], source: "image" });
    const spec = raw.draft ? checkDraftSpec(raw.draft) : undefined;
    return { doc, spec: spec && { ...spec, name: p.kind === "video" ? "From your video" : spec.name }, summary: raw.summary };
  };

  /** Read only the motion from a reference, as a draft spec for a separate design. */
  const motionFrom = async (ref: Frames, designDoc: SceneDoc) => {
    const [W, H] = compFor(ref.width, ref.height);
    const note = "The layout comes from a separate design file; only the motion of this reference matters for the draft.";
    const res = await analyzeReference({ data: { width: W, height: H, frames: ref.frames, duration: ref.duration, design: designMotionContext(designDoc), prompt: [note, prompt.trim()].filter(Boolean).join(" ") } });
    if (!res.ok) throw new Error(res.error);
    const raw = JSON.parse(res.json) as { draft?: unknown; summary?: string };
    const spec = raw.draft ? checkDraftSpec(raw.draft) : undefined;
    if (!spec) throw new Error("No usable motion came back. Your design is unchanged.");
    return { spec: { ...spec, name: "From your reference" }, summary: raw.summary };
  };

  const go = async () => {
    setError(undefined);
    try {
      let out: Result;
      if (!design && motion) {
        setBusy(motion.kind === "video" ? "Watching your video…" : "Reading your picture…");
        out = await rebuildFrom(motion, await framesOf(motion));
      } else if (design) {
        if (design.kind === "picture" && rebuild) {
          setBusy("Reading your design…");
          out = await rebuildFrom(design, await framesOf(design));
        } else {
          const [W, H] = design.kind === "svg" ? [design.parsed.width, design.parsed.height] : design.kind === "picture" && design.layer.kind === "image" ? design.layer.size : [1920, 1080];
          const layers = design.kind === "svg" ? preserveSvg && design.parsed.skipped.length ? [design.artwork] : design.parsed.layers : design.kind === "picture" ? [{ ...design.layer, scale: 1, position: [0, 0] as [number, number] }] : [];
          out = { doc: buildDesignDoc({ name, width: W, height: H, layers, source: design.kind === "svg" ? "svg" : "image" }) };
        }
        if (motion) {
          setBusy("Reading the motion from your reference…");
          const ref = await framesOf(motion);
          out = { ...out, doc: { ...out.doc, networks: out.doc.networks.map((n) => n.id === out.doc.root && n.comp ? { ...n, comp: { ...n.comp, duration: ref.duration } } : n) } };
          if (font) out = { ...out, doc: withFont(out.doc, font) };
          const result = await motionFrom(ref, out.doc);
          out = { ...out, ...result, preset: undefined };
        }
      } else return;
      if (font) out = { ...out, doc: withFont(out.doc, font) };
      out = { ...out, doc: embedDocFonts(out.doc) };
      const flattened = design?.kind === "svg" && preserveSvg && design.parsed.skipped.length > 0;
      useImport.getState().set(out.doc, { skipped: design?.kind === "svg" && !flattened ? design.parsed.skipped : [], prompt: prompt.trim(), spec: out.spec, summary: [flattened ? "SVG appearance preserved as one artwork layer; individual shapes are not editable." : "", out.summary].filter(Boolean).join(" ") || undefined, preset: out.preset });
      useUi.getState().setScreen("draft");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
    }
  };
  const open = (doc: SceneDoc) => {
    docStore.getState().load(doc);
    useUi.getState().setPath([]);
    useUi.getState().selectNodes([]);
    useUi.getState().setScreen("refine");
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Start with a design</h1>
        <p className="mt-1 text-muted-foreground">Drop a design and a motion reference, describe the motion. Then pick a first animation.</p>
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => (e.preventDefault(), setOver(false), void takeAll(e.dataTransfer.files))}
          className={cn("flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line2 bg-card p-6 text-center", over && "border-ink bg-field")}
        >
          <FileUp className="size-6" />
          <span className="font-medium">{design || motion ? "Drop more files, or click to add" : "Drop your files here"}</span>
          <span className="text-xs text-muted-foreground">A design (SVG, PDF, PNG or JPG), a motion reference (a video), or a .zip with fonts and files</span>
          <span className="text-xs underline">Browse files</span>
        </button>
        {loading && <p className="text-xs text-muted-foreground"><Loader2 className="mr-1 inline size-3 animate-spin" />Reading {loading}…</p>}
        {[design && { slot: "design" as const, p: design }, motion && { slot: "motion" as const, p: motion }].filter(Boolean).map((it) => {
          const { slot, p } = it as { slot: "design" | "motion"; p: Picked };
          return (
            <div key={slot} className="flex items-center gap-3 rounded-lg bg-card p-3 text-xs shadow-card">
              <span className="rounded-full bg-field px-2 py-0.5 font-medium">{slot === "design" ? "Design" : "Motion reference"}</span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{p.name}</span>
                <span className="ml-2 text-muted-foreground">
                  {p.kind === "svg" ? `${p.parsed.layers.length} layers · ${p.parsed.width}×${p.parsed.height}${p.parsed.skipped.length ? ` · not imported yet: ${p.parsed.skipped.join(", ")}` : ""}` : p.kind === "video" ? "Video" : p.pdf ? "PDF, first page" : "Picture"}
                </span>
              </span>
              {p.kind === "picture" && (
                <button type="button" className="underline" onClick={() => (slot === "design" ? (setMotion(p), setDesign(motion)) : (setDesign(p), setMotion(design)))}>
                  Use as {slot === "design" ? "motion reference" : "design"}
                </button>
              )}
              <button type="button" aria-label={`Remove ${p.name}`} onClick={() => (slot === "design" ? setDesign(undefined) : setMotion(undefined))}>
                <X className="size-4" />
              </button>
            </div>
          );
        })}
        {fonts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-card p-3 text-xs shadow-card">
            <span className="mr-1 font-medium">Your fonts</span>
            {fonts.map((f) => (
              <button key={f} type="button" onClick={() => setFont(font === f ? undefined : f)} style={{ fontFamily: `"${f}"` }} className={cn("h-7 rounded-full px-3 text-[13px]", font === f ? "bg-ink text-ink-foreground" : "bg-field hover:bg-line")}>
                {f}
              </button>
            ))}
            <span className="basis-full text-muted-foreground">{font ? `All text will use ${font}. Click it again to keep the original fonts.` : "Pick one to use for all text."} Used fonts are included in your saved project.</span>
          </div>
        )}
        {design?.kind === "picture" && (
          <label className="flex items-start gap-2 rounded-lg bg-card p-3 text-xs shadow-card">
            <input type="checkbox" checked={rebuild} onChange={(e) => setRebuild(e.target.checked)} className="mt-0.5" />
            <span>
              <span className="font-medium">Rebuild the design with Motion Builder</span>
              <span className="block text-muted-foreground">The AI rebuilds the picture as shapes and text you can animate. The picture stays underneath as a guide.</span>
            </span>
          </label>
        )}
        {design?.kind === "svg" && design.parsed.skipped.length > 0 && <label className="flex items-start gap-2 rounded-lg bg-card p-3 text-xs shadow-card"><input type="checkbox" checked={preserveSvg} onChange={(e) => setPreserveSvg(e.target.checked)} /><span><span className="font-medium">Preserve SVG appearance</span><span className="block text-muted-foreground">Keep the complete artwork as one layer. Uncheck to import only supported editable shapes; {design.parsed.skipped.join(", ")} won't match.</span></span></label>}
        {motion && design && <p className="text-xs text-muted-foreground">The AI copies the motion from your reference onto your design, as a draft called "From your reference".</p>}
      </div>
      <input ref={input} type="file" multiple accept=".zip,application/zip,.svg,image/svg+xml,.pdf,application/pdf,image/png,image/jpeg,image/webp,video/*" className="hidden" onChange={(e) => (void takeAll(e.target.files), (e.target.value = ""))} />

      <section className="flex flex-col gap-2 rounded-xl bg-card p-4 shadow-card" aria-label="Describe the motion">
        <label htmlFor="motion-prompt" className="flex items-center gap-2 font-medium">
          <Sparkles className="size-4" /> Describe the motion <span className="text-xs font-normal text-muted-foreground">optional</span>
        </label>
        <textarea
          id="motion-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          placeholder="The panel wipes open, then the name types on letter by letter…"
          className="w-full resize-none rounded-md bg-field px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ink"
        />
        <div className="flex flex-wrap gap-1.5">
          {STARTER_PROMPTS.map((p) => (
            <button key={p.label} type="button" onClick={() => setPrompt(p.prompt)} title={p.prompt} className={cn("h-7 rounded-full px-3 text-xs", prompt === p.prompt ? "bg-ink text-ink-foreground" : "bg-field hover:bg-line")}>
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">Draft turns this into a fourth option next to Smooth, Punchy and Playful. Uses AI credits.</p>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="lg" disabled={!ready || !!busy || !!loading} onClick={() => void go()}>
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" /> {busy}
            </>
          ) : (
            "Continue to Draft"
          )}
        </Button>
        <Button variant="ghost" size="lg" disabled={!!busy} onClick={() => (useImport.getState().set(undefined, { prompt: prompt.trim() }), useUi.getState().setScreen("draft"))}>
          Draft the open project instead
        </Button>
        {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Or start from</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => open(lowerThird)}>Lower third</Button>
          <Button variant="secondary" onClick={() => open(title3d)}>3D title</Button>
          <Button variant="secondary" onClick={() => open(buildDesignDoc({ name: "New comp", width: 1920, height: 1080, layers: [], source: "blank" }))}>Blank</Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Starting from one of these replaces the open project. Save it first if you want to keep it.</p>
      </section>
      <PresetLibrary />
    </div>
  );
}
