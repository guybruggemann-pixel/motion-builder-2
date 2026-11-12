/**
 * Batch: render one file per sheet row through a motion asset instance.
 * The settings live in the doc (`doc.batches[0]`, undoable); the rows are fetched from the shared
 * Google Sheet link and polled while the panel is open, so the sheet stays live.
 * Rendering writes into a folder you pick and keeps a manifest there, so a re-run only renders
 * rows whose output would change.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { FolderOutput, RefreshCw, X } from "lucide-react";
import { applyRow, fileName, hash, parseCsv, qcRows, sheetCsvUrl, type QcIssue, type Row } from "@core/batch";
import { FrameCache, type Batch, type SceneDoc } from "@core/scene";
import { Button, Input, Label } from "@/design-system/motionbuilder---brandbook-c4b4eb";
import { canvasMeasure, drawFrame } from "@/render/canvas2d";
import { loadFonts } from "@/render/fonts";
import { renderToBlob } from "@/render/renderJob";
import { docStore, useDocStore } from "@/store";

const POLL_MS = 30_000;
const MANIFEST = ".motionbuilder-batch.json";

/** Subnet instances in the root comp that have promoted controls: what a row can fill. */
function instances(doc: SceneDoc) {
  const root = doc.networks.find((n) => n.id === doc.root)!;
  return root.nodes.filter((n) => n.subnet && doc.networks.find((x) => x.id === n.subnet)?.promoted?.length);
}

function newBatch(doc: SceneDoc): Batch | undefined {
  const inst = instances(doc)[0];
  if (!inst) return undefined;
  return {
    id: "batch",
    name: "Batch",
    source: { kind: "sheet-link", url: "" },
    target: { network: doc.root, instance: inst.id, mapping: {} },
    fileTemplate: "{#}",
    format: "prores",
    qcAt: (inst.timing?.in ?? 0) + 2,
  };
}

function setBatch(label: string, patch: (b: Batch) => void, coalesce?: string) {
  docStore.getState().edit(
    label,
    (d) => {
      const b = d.batches[0];
      if (b) patch(b as Batch);
    },
    coalesce ? { coalesce } : undefined,
  );
}

/** Match columns to controls by name: "Naam"/"Name" → name, "Functie"/"Title" → title. */
function autoMap(headers: string[], controls: { id: string; label: string }[]): Record<string, string> {
  const alias: Record<string, string[]> = { name: ["naam", "name", "full name"], title: ["functie", "title", "job", "role"], accent: ["kleur", "colour", "color", "accent"] };
  const out: Record<string, string> = {};
  for (const c of controls) {
    const want = [c.id.toLowerCase(), c.label.toLowerCase(), ...(alias[c.id] ?? [])];
    const hit = headers.find((h) => want.includes(h.toLowerCase().trim()));
    if (hit) out[c.id] = hit;
  }
  return out;
}

function Preview({ doc, batch, row }: { doc: SceneDoc; batch: Batch; row: Row | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !row) return;
    let alive = true;
    loadFonts().then(() => {
      if (!alive) return;
      const g = cv.getContext("2d")!;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cv.width, cv.height);
      try {
        const d = applyRow(doc, batch.target, row);
        const comp = d.networks.find((n) => n.id === batch.target.network)!.comp!;
        const k = cv.width / comp.width;
        g.fillStyle = "#1a1d22";
        g.fillRect(0, 0, cv.width, cv.height);
        const frames = new FrameCache({ measure: canvasMeasure() }).frame(d, batch.target.network, Math.round(batch.qcAt * comp.fps));
        drawFrame(g, frames, [k, 0, 0, k, 0, 0]);
      } catch {
        /* an invalid row shows up in QC */
      }
    });
    return () => {
      alive = false;
    };
  }, [doc, batch, row]);
  return <canvas ref={ref} width={384} height={216} className="w-full rounded-sm border border-border" aria-label="Preview of the selected row" />;
}

type Run = { kind: "idle" } | { kind: "busy"; row: number; rows: number; frame: number; frames: number; skipped: number } | { kind: "done"; rendered: number; skipped: number; seconds: number } | { kind: "error"; message: string };

export function BatchPanel({ onClose }: { onClose: () => void }) {
  const doc = useDocStore((s) => s.doc);
  const batch = doc.batches[0];
  const [rows, setRows] = useState<Row[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<{ at: Date; error?: string }>();
  const [rowIx, setRowIx] = useState(0);
  const [issues, setIssues] = useState<QcIssue[]>();
  const [run, setRun] = useState<Run>({ kind: "idle" });
  const cancel = useRef(false);

  const inst = batch && doc.networks.find((n) => n.id === batch.target.network)?.nodes.find((n) => n.id === batch.target.instance);
  const subnet = inst?.subnet ? doc.networks.find((n) => n.id === inst.subnet) : undefined;
  const controls = useMemo(() => (subnet?.promoted ?? []).map((p) => ({ id: p.id, label: p.label })), [subnet]);

  const load = async (url = batch?.source.url ?? "") => {
    const csvUrl = sheetCsvUrl(url);
    if (!csvUrl) return setLoaded({ at: new Date(), error: "Not a Google Sheets link" });
    try {
      const res = await fetch(csvUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(`the sheet answered ${res.status}; is it shared as "anyone with the link can view"?`);
      const text = await res.text();
      if (/^\s*<!DOCTYPE html/i.test(text)) throw new Error("got a web page instead of the sheet; share it as \"anyone with the link can view\"");
      const parsed = parseCsv(text);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setLoaded({ at: new Date() });
      setIssues(undefined);
      if (batch && !Object.keys(batch.target.mapping).length) {
        const mapping = autoMap(parsed.headers, controls);
        if (Object.keys(mapping).length) setBatch("Map columns", (b) => void (b.target.mapping = mapping));
      }
    } catch (e) {
      setLoaded({ at: new Date(), error: e instanceof Error ? e.message : String(e) });
    }
  };

  // Live: re-read the sheet while the panel is open.
  useEffect(() => {
    if (!batch?.source.url) return;
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [batch?.source.url]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!batch) {
    const fresh = newBatch(doc);
    return (
      <Shell onClose={onClose}>
        {fresh ? (
          <>
            <p className="text-xs text-muted-foreground">Render one file per row of a Google Sheet, through a motion asset's controls.</p>
            <Button className="mt-3 w-full" onClick={() => docStore.getState().edit("New batch", (d) => void d.batches.push(fresh))}>
              New batch
            </Button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Add a motion asset (a Subnet with promoted controls) to the main comp first.</p>
        )}
      </Shell>
    );
  }

  const comp = doc.networks.find((n) => n.id === batch.target.network)?.comp;
  const runQc = async () => {
    await loadFonts();
    setIssues(qcRows(doc, batch.target, rows, { at: batch.qcAt, fileTemplate: batch.fileTemplate, measure: canvasMeasure() }));
  };

  const renderAll = async () => {
    const pick = (window as unknown as { showDirectoryPicker?: (o?: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
    if (!pick) return setRun({ kind: "error", message: "Rendering to a folder needs Chrome or Edge (File System Access)." });
    cancel.current = false;
    let dir: FileSystemDirectoryHandle;
    try {
      dir = await pick({ mode: "readwrite" });
    } catch {
      return; // picker closed
    }
    const started = performance.now();
    try {
      await loadFonts();
      let manifest: Record<string, string> = {};
      try {
        manifest = JSON.parse(await (await (await dir.getFileHandle(MANIFEST)).getFile()).text());
      } catch {
        /* first run */
      }
      const ext = batch.format === "mp4" ? "mp4" : "mov";
      let rendered = 0, skipped = 0;
      for (let i = 0; i < rows.length && !cancel.current; i++) {
        const name = `${fileName(batch.fileTemplate, rows[i]!, i)}.${ext}`;
        let d: SceneDoc;
        try {
          d = applyRow(doc, batch.target, rows[i]!);
        } catch {
          continue; // invalid rows are listed by QC
        }
        const key = hash(JSON.stringify([d.networks, d.brand, batch.format]));
        const exists = await dir.getFileHandle(name).then(() => true, () => false);
        if (exists && manifest[name] === key) {
          skipped++;
          continue;
        }
        const out = await renderToBlob(d, batch.target.network, { format: batch.format, width: comp!.width, height: comp!.height, motionBlur: true }, (frame, frames) => setRun({ kind: "busy", row: i + 1, rows: rows.length, frame, frames, skipped }), () => cancel.current);
        if (!out) break;
        const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
        await w.write(out.blob);
        await w.close();
        manifest[name] = key;
        rendered++;
        const mw = await (await dir.getFileHandle(MANIFEST, { create: true })).createWritable();
        await mw.write(JSON.stringify(manifest, null, 2));
        await mw.close();
      }
      setRun({ kind: "done", rendered, skipped, seconds: (performance.now() - started) / 1000 });
    } catch (e) {
      setRun({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const row = rows[Math.min(rowIx, rows.length - 1)];
  const sel = "h-7 w-full rounded-sm border border-border bg-muted px-1.5 text-xs";

  return (
    <Shell onClose={onClose}>
      <div className="grid gap-2 text-xs">
        <Label htmlFor="b-url">Google Sheet link</Label>
        <div className="flex gap-1">
          <Input
            id="b-url"
            size="sm"
            placeholder="https://docs.google.com/spreadsheets/d/…"
            defaultValue={batch.source.url}
            onBlur={(e) => e.target.value !== batch.source.url && setBatch("Sheet link", (b) => void (b.source = { kind: "sheet-link", url: e.target.value.trim() }))}
          />
          <Button variant="secondary" size="icon" className="size-7" aria-label="Reload the sheet" onClick={() => void load()}>
            <RefreshCw />
          </Button>
        </div>
        <p className={loaded?.error ? "font-mono text-[11px] text-destructive" : "font-mono text-[11px] text-muted-foreground"}>
          {loaded?.error ? loaded.error : loaded ? `Live · ${rows.length} rows · read ${loaded.at.toLocaleTimeString()} · every ${POLL_MS / 1000}s` : "Share the sheet as “anyone with the link can view”."}
        </p>

        {headers.length > 0 && (
          <>
            <Label>Columns → controls of {inst?.name}</Label>
            {controls.map((c) => (
              <div key={c.id} className="grid grid-cols-[96px_1fr] items-center gap-1.5">
                <span>{c.label}</span>
                <select
                  aria-label={`Column for ${c.label}`}
                  className={sel}
                  value={batch.target.mapping[c.id] ?? ""}
                  onChange={(e) =>
                    setBatch("Map column", (b) => {
                      if (e.target.value) b.target.mapping[c.id] = e.target.value;
                      else delete b.target.mapping[c.id];
                    })
                  }
                >
                  <option value="">Keep the template value</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <div className="grid grid-cols-[96px_1fr] items-center gap-1.5">
              <Label htmlFor="b-file">File name</Label>
              <Input id="b-file" size="sm" defaultValue={batch.fileTemplate} onBlur={(e) => setBatch("File name", (b) => void (b.fileTemplate = e.target.value || "{#}"))} />
            </div>
            <p className="font-mono text-[10px] text-muted-foreground">
              {"{#}"} row number{headers.map((h) => ` · {${h}}`).join("")}
            </p>
            <div className="grid grid-cols-[96px_1fr] items-center gap-1.5">
              <Label htmlFor="b-fmt">Format</Label>
              <select id="b-fmt" className={sel} value={batch.format} onChange={(e) => setBatch("Batch format", (b) => void (b.format = e.target.value as Batch["format"]))}>
                <option value="prores">ProRes 4444 with alpha (.mov)</option>
                <option value="mp4">H.264 MP4 (no alpha)</option>
              </select>
            </div>
            <div className="grid grid-cols-[96px_1fr] items-center gap-1.5">
              <Label htmlFor="b-qc">Check at</Label>
              <Input id="b-qc" size="sm" variant="mono" type="number" step={0.1} min={0} defaultValue={batch.qcAt} onBlur={(e) => setBatch("QC time", (b) => void (b.qcAt = Math.max(0, +e.target.value || 0)))} />
            </div>

            {rows.length > 0 && (
              <>
                <div className="flex items-center gap-2 pt-1">
                  <Label htmlFor="b-row">Row</Label>
                  <Input id="b-row" size="sm" variant="mono" type="number" min={1} max={rows.length} value={Math.min(rowIx, rows.length - 1) + 1} onChange={(e) => setRowIx(Math.max(0, Math.min(rows.length - 1, +e.target.value - 1)))} className="w-20" />
                  <span className="truncate font-mono text-[11px] text-muted-foreground">{row && fileName(batch.fileTemplate, row, rowIx)}</span>
                </div>
                <Preview doc={doc} batch={batch} row={row} />
              </>
            )}

            <div className="flex gap-1 pt-1">
              <Button variant="secondary" size="sm" onClick={() => void runQc()} disabled={!rows.length}>
                Check {rows.length} rows
              </Button>
              <Button size="sm" className="flex-1" onClick={() => void renderAll()} disabled={!rows.length || run.kind === "busy"}>
                <FolderOutput /> Render to folder
              </Button>
            </div>
            {issues && (
              <div className="max-h-32 overflow-y-auto rounded-sm border border-border p-1.5 font-mono text-[11px]">
                {issues.length === 0 ? (
                  <p className="text-success">All {rows.length} rows pass.</p>
                ) : (
                  issues.slice(0, 100).map((x, i) => (
                    <p key={i} className={x.kind === "empty" ? "text-warning" : "text-destructive"}>
                      Row {x.row + 1}: {x.message}
                    </p>
                  ))
                )}
              </div>
            )}
            {run.kind === "busy" && (
              <div className="grid gap-1">
                <div className="h-2 rounded-full bg-field">
                  <div className="h-2 rounded-full bg-volt shadow-[inset_0_0_0_1.5px_var(--ink)]" style={{ width: `${((run.row - 1 + run.frame / run.frames) / run.rows) * 100}%` }} />
                </div>
                <div className="flex items-center font-mono text-[11px] text-muted-foreground">
                  Row {run.row}/{run.rows} · frame {run.frame}/{run.frames}
                  {run.skipped ? ` · ${run.skipped} unchanged` : ""}
                  <Button variant="ghost" size="sm" className="ml-auto" onClick={() => (cancel.current = true)}>
                    Stop
                  </Button>
                </div>
              </div>
            )}
            {run.kind === "done" && (
              <p className="font-mono text-[11px] text-success">
                Rendered {run.rendered}, {run.skipped} unchanged, in {run.seconds.toFixed(0)}s.
              </p>
            )}
            {run.kind === "error" && <p className="font-mono text-[11px] text-destructive">{run.message}</p>}
          </>
        )}
      </div>
    </Shell>
  );
}

function Shell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div role="dialog" aria-label="Batch" className="absolute right-1 top-[52px] z-50 max-h-[85vh] w-[420px] overflow-y-auto rounded-xl bg-card p-4 shadow-float">
      <div className="mb-3 flex items-center">
        <h2 className="font-display text-sm font-semibold">Batch from a sheet</h2>
        <Button variant="ghost" size="icon" className="ml-auto size-6" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
      </div>
      {children}
    </div>
  );
}

/** Exposed for tests. */
export { autoMap, newBatch };
