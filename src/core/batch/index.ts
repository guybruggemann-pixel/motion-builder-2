/**
 * Data-driven batch, the source-independent part: rows of a sheet become renders of one template.
 * The doc stays a single template; a row only sets values on the motion asset instance's promoted
 * controls (params named after the promoted ids), so every render is template + row, reproducibly.
 */
import { evaluateFrame, type Drawable, type EvaluateOptions } from "../scene/evaluate";
import { applyMat } from "../scene/matrix";
import { approxMeasure, ASCENT, DESCENT, type MeasureText } from "../scene/text";
import { validateDoc } from "../scene/validate";
import type { SceneDoc } from "../scene/schema";

export type Row = Record<string, string>;

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes. First line = headers. */
export function parseCsv(text: string): { headers: string[]; rows: Row[] } {
  const records: string[][] = [];
  let field = "", rec: string[] = [], quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") rec.push(field), (field = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      rec.push(field), records.push(rec), (rec = []), (field = "");
    } else field += c;
  }
  if (field !== "" || rec.length) rec.push(field), records.push(rec);
  const [head = [], ...body] = records.filter((r) => r.some((x) => x.trim() !== ""));
  const headers = head.map((h) => h.trim());
  return { headers, rows: body.map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()]))) };
}

/** Where a row lands: the Subnet instance of the motion asset, and which column feeds which control. */
export interface BatchTarget {
  network: string;
  instance: string;
  /** Promoted control id -> column header. */
  mapping: Record<string, string>;
}

/** The template with this row's values on the instance. Throws if the result isn't a valid doc. */
export function applyRow(doc: SceneDoc, target: BatchTarget, row: Row): SceneDoc {
  const d: SceneDoc = structuredClone(doc);
  const node = d.networks.find((n) => n.id === target.network)?.nodes.find((n) => n.id === target.instance);
  if (!node) throw new Error(`instance ${target.network}/${target.instance} not found`);
  for (const [control, column] of Object.entries(target.mapping)) {
    const v = row[column];
    if (v !== undefined && v !== "") node.params[control] = { value: v };
  }
  const r = validateDoc(d);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.doc;
}

/** "{Name}_LT" with the row's values, made safe for file systems (no extension). */
export function fileName(template: string, row: Row, index: number): string {
  const raw = template.replace(/\{([^}]+)\}/g, (_, k: string) => (k === "#" ? String(index + 1).padStart(4, "0") : row[k.trim()] ?? ""));
  const safe = raw.normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").replace(/_+/g, "_").replace(/\s+/g, " ").trim();
  return safe || `row_${String(index + 1).padStart(4, "0")}`;
}

export interface QcIssue {
  row: number;
  kind: "empty" | "duplicate-name" | "outside-safe" | "invalid";
  message: string;
}

/** Comp-space box of a drawable (text measured with `measure`), for the safe-area check. */
function boxOf(d: Drawable, measure: MeasureText): [number, number, number, number] {
  const local: [number, number, number, number] =
    d.kind === "text"
      ? [0, -d.font.size * ASCENT, measure(d.text, d.font) + d.tracking * [...d.text].length, d.font.size * (ASCENT + DESCENT)]
      : d.kind === "shape"
        ? [Math.min(0, d.size[0]), Math.min(0, d.size[1]), Math.abs(d.size[0]), Math.abs(d.size[1])]
        : [0, 0, 0, 0];
  const [x, y, w, h] = local;
  const pts = [applyMat(d.matrix, [x, y]), applyMat(d.matrix, [x + w, y]), applyMat(d.matrix, [x, y + h]), applyMat(d.matrix, [x + w, y + h])];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export interface QcOptions extends EvaluateOptions {
  /** Moment to check layout at, seconds in the comp (when everything is in). */
  at: number;
  /** Safe area as a share of the frame (SMPTE action safe = 0.93). */
  safe?: number;
  /** Filename template, to catch duplicates. */
  fileTemplate?: string;
}

/**
 * Check every row before rendering: mapped cells that are empty, filenames that collide, rows that
 * don't produce a valid doc, and anything drawn outside the safe area at `opts.at`.
 */
export function qcRows(doc: SceneDoc, target: BatchTarget, rows: Row[], opts: QcOptions): QcIssue[] {
  const issues: QcIssue[] = [];
  const comp = doc.networks.find((n) => n.id === target.network)?.comp ?? doc.networks.find((n) => n.id === doc.root)!.comp!;
  const safe = opts.safe ?? 0.93;
  const [sx0, sy0] = [(comp.width * (1 - safe)) / 2, (comp.height * (1 - safe)) / 2];
  const [sx1, sy1] = [comp.width - sx0, comp.height - sy0];
  const measure = opts.measure ?? approxMeasure;
  const names = new Map<string, number>();

  rows.forEach((row, i) => {
    for (const [control, column] of Object.entries(target.mapping))
      if (!row[column]) issues.push({ row: i, kind: "empty", message: `"${column}" is empty (${control} keeps the template value)` });
    if (opts.fileTemplate) {
      const n = fileName(opts.fileTemplate, row, i).toLowerCase();
      const first = names.get(n);
      if (first !== undefined) issues.push({ row: i, kind: "duplicate-name", message: `same file name as row ${first + 1}` });
      else names.set(n, i);
    }
    let d: SceneDoc;
    try {
      d = applyRow(doc, target, row);
    } catch (e) {
      issues.push({ row: i, kind: "invalid", message: e instanceof Error ? e.message : String(e) });
      return;
    }
    for (const dr of evaluateFrame(d, target.network, opts.at, opts)) {
      if (dr.opacity <= 0) continue;
      const [x0, y0, x1, y1] = boxOf(dr, measure);
      if (x0 < sx0 - 0.5 || y0 < sy0 - 0.5 || x1 > sx1 + 0.5 || y1 > sy1 + 0.5)
        issues.push({ row: i, kind: "outside-safe", message: `${dr.node}${dr.kind === "text" ? ` "${dr.text}"` : ""} goes outside the safe area` });
    }
  });
  return issues;
}

/**
 * CSV address for a Google Sheet link. Accepts the normal share link
 * (…/spreadsheets/d/{id}/edit#gid={tab}), a "Publish to web" link (…/d/e/{pubId}/pubhtml) or a
 * CSV link as-is. The sheet must be shared as "anyone with the link can view" (or published).
 * Returns undefined when it isn't a Google Sheets link.
 */
export function sheetCsvUrl(link: string): string | undefined {
  let u: URL;
  try {
    u = new URL(link.trim());
  } catch {
    return undefined;
  }
  if (u.hostname !== "docs.google.com") return undefined;
  const gid = u.hash.match(/gid=(\d+)/)?.[1] ?? u.searchParams.get("gid") ?? undefined;
  const pub = u.pathname.match(/^\/spreadsheets\/d\/e\/([\w-]+)/);
  if (pub) return `https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub?output=csv${gid ? `&gid=${gid}` : ""}`;
  const id = u.pathname.match(/^\/spreadsheets\/d\/([\w-]+)/)?.[1];
  if (!id) return undefined;
  // gviz serves CSV with CORS headers, so the browser can read it directly
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv${gid ? `&gid=${gid}` : ""}`;
}

/** Stable hash of a string (FNV-1a, 32-bit, hex), to tell which rows changed since the last render. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
