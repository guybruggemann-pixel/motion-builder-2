/**
 * Inspector: edits the selected node of the shown network (or the comp when nothing is selected),
 * ordered by intent (docs/ui-handover.md §2): title, promoted controls (on a Subnet: all a
 * designer touches), Motion, Look, then the layer's own params, and folded Transform, Modifiers
 * and Layer timing. Every animatable param has a key diamond (add/remove at the playhead),
 * previous/next key, the ease of the key under the playhead and its modifiers.
 */
import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, RotateCcw, X } from "lucide-react";
import {
  CATALOG,
  MATERIAL_KINDS,
  evaluateParam,
  phaseRanges,
  isNodeType,
  promotedSpecs,
  Role as RoleSchema,
  type Modifier,
  type Network,
  type Node,
  type Param,
  type ParamSpec,
  type SceneDoc,
  type Value,
} from "@core/scene";
import { Button, Label, Switch } from "@/design-system/motionbuilder---brandbook-c4b4eb";
import { cn } from "@/design-system/motionbuilder---brandbook-c4b4eb/lib/utils";
import { knownFamilies } from "@/render/fonts";
import { docStore, shownNetwork, useDocStore, useUi, viewComp } from "@/store";
import { ChoiceField, ColorField, EaseField, NumberField, TextField, ToggleField, Vec2Field, Vec3Field, type Change } from "./controls";
import {
  addModifier,
  DESIGNER_PARAMS,
  isDesignerEditable,
  keyAt,
  setDesignerEditable,
  removeModifier,
  resetParam,
  setComp,
  setKeyEase,
  setNodeProps,
  setValue,
  toggleKey,
  updateModifier,
  type ModifierKind,
} from "./edits";
import type { Draft } from "immer";
import { cssColor, layerFill, MiniCurve, roleLabel, Sphere } from "@/shell/look";
import { phaseOf } from "@/viewer/Selection";
import { setMaterialKind } from "@/panels/materials";
import { openSubnet } from "@/store/navigation";
import { takesMaterial } from "@/panels/materials";

/* ---------- helpers ---------- */

/** Apply an edit; intermediate changes (drag, typing) coalesce under `key`, the final one closes the step. */
function apply(label: string, recipe: (d: Draft<SceneDoc>) => void, final: boolean, key: string) {
  const s = docStore.getState();
  s.edit(label, recipe, { coalesce: key });
  if (final) s.commit();
}

const TRANSFORM = new Set(["position", "anchor", "scale", "rotation", "opacity", "blur"]);
const UNIT: Record<string, string> = {
  rotation: "°", offsetRotation: "°", opacity: "%", offsetOpacity: "%", scale: "%", offsetScale: "%",
  trimEnd: "%", start: "s", duration: "s", stagger: "s", leading: "×",
};
const STEP: Record<string, number> = { start: 0.01, duration: 0.01, stagger: 0.005, leading: 0.05 };
const LABEL: Record<string, string> = { offsetPosition: "Offset move", offsetScale: "Offset scale", offsetRotation: "Offset rotate", offsetOpacity: "Offset opacity", offsetBlur: "Offset blur", trimEnd: "Trim end", strokeWidth: "Stroke width", by: "Split by" };
const human = (name: string) => LABEL[name] ?? name.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

const asNum = (v: Value, d = 0) => (typeof v === "number" ? v : d);
const fmtValue = (v: Value) =>
  typeof v === "number" ? String(+v.toFixed(2)) : Array.isArray(v) ? v.map((x) => +x.toFixed(2)).join(" · ") : String(v);
const asVec = (v: Value): [number, number] => (Array.isArray(v) && v.length >= 2 ? [v[0]!, v[1]!] : [0, 0]);
const asVec3 = (v: Value): [number, number, number] => (Array.isArray(v) && v.length >= 3 ? [v[0]!, v[1]!, (v as number[])[2]!] : [0, 0, 0]);
const asStr = (v: Value) => (typeof v === "string" ? v : String(v));

/** A grouped section: field background, radius 16, sentence-case heading. */
function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2.5 rounded-lg bg-field p-3.5">
      <div className="flex items-center">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        {aside && <div className="ml-auto text-xs text-muted-foreground">{aside}</div>}
      </div>
      <div className="grid gap-1.5">{children}</div>
    </section>
  );
}

/** A section folded to one line (its summary) until opened. */
function Fold({ title, summary, live, children, defaultOpen = false }: { title: string; summary: React.ReactNode; live?: boolean; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section aria-label={title} className="rounded-lg bg-field">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 rounded-lg px-3.5 py-3 text-left">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        {!open && <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">{summary}</span>}
        {live && !open && <span aria-label="keyed at the playhead" className="size-[9px] shrink-0 rotate-45 rounded-[2px] border-[1.5px] border-ink bg-volt" />}
        <ChevronDown aria-hidden className={cn("ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="grid gap-1.5 px-3.5 pb-3.5">{children}</div>}
    </section>
  );
}

/* ---------- a value control for any param kind ---------- */

function ValueControl({ name, spec, value, label, onChange, brand }: { name: string; spec: ParamSpec; value: Value; label: string; onChange: Change<Value>; brand: { token: string; value: string }[] }) {
  switch (spec.kind) {
    case "number":
      return <NumberField label={label} value={asNum(value)} min={spec.min} max={spec.max} step={STEP[name] ?? 1} unit={UNIT[name]} onChange={onChange} />;
    case "vec2":
      return <Vec2Field label={label} value={asVec(value)} step={STEP[name] ?? 1} unit={UNIT[name]} onChange={onChange} />;
    case "vec3":
      return <Vec3Field label={label} value={asVec3(value)} step={STEP[name] ?? 1} unit={UNIT[name]} onChange={onChange} />;
    case "color":
      return <ColorField label={label} value={asStr(value)} brand={brand} onChange={onChange} />;
    case "text":
      return <TextField label={label} value={asStr(value)} multiline={name === "text"} onChange={onChange} />;
    case "choice":
      return <ChoiceField label={label} value={asStr(value)} options={spec.options ?? []} onChange={(v) => onChange(v, true)} />;
    case "toggle":
      return <ToggleField label={label} value={value === true} onChange={(v) => onChange(v, true)} />;
    case "ease":
      return <EaseField label={label} value={asStr(value)} onChange={onChange} />;
    case "font":
      return <ChoiceField label={label} value={asStr(value)} options={[...new Set([...knownFamilies(), ...brandFonts()])]} onChange={(v) => onChange(v, true)} />;
    default:
      return <span className="font-mono text-xs text-muted-foreground">{JSON.stringify(value)}</span>;
  }
}

const brandFonts = () => docStore.getState().doc.brand?.fonts.map((f) => f.family) ?? [];

/* ---------- modifiers ---------- */

const MOD_FIELDS: Record<ModifierKind, { key: string; kind: "number" | "choice"; label: string; step?: number; unit?: string; options?: string[] }[]> = {
  wave: [
    { key: "amplitude", kind: "number", label: "Amplitude" },
    { key: "frequency", kind: "number", label: "Frequency", step: 0.05, unit: "Hz" },
    { key: "phase", kind: "number", label: "Phase", unit: "°" },
    { key: "shape", kind: "choice", label: "Shape", options: ["sine", "triangle", "square", "saw"] },
  ],
  noise: [
    { key: "amplitude", kind: "number", label: "Amplitude" },
    { key: "frequency", kind: "number", label: "Frequency", step: 0.05, unit: "Hz" },
    { key: "seed", kind: "number", label: "Seed" },
  ],
  stagger: [
    { key: "each", kind: "number", label: "Each", step: 0.005, unit: "s" },
    { key: "from", kind: "choice", label: "From", options: ["first", "last", "center", "random", "edges"] },
    { key: "seed", kind: "number", label: "Seed" },
  ],
  link: [],
};

/** Link: which node and param to follow, then scale, offset (padding) and an optional minimum. */
function LinkFields({ m, net, change }: { m: Modifier; net: Network; change: (patch: Parameters<typeof updateModifier>[5], final: boolean) => void }) {
  const target = net.nodes.find((n) => n.id === m.params.node);
  const params = ["bounds", ...(target && isNodeType(target.type) ? Object.keys(CATALOG[target.type].params) : [])];
  const row = (label: string, child: React.ReactNode) => (
    <div className="grid grid-cols-[72px_1fr] items-center gap-1.5">
      <Label>{label}</Label>
      {child}
    </div>
  );
  return (
    <>
      {row("Follow", <ChoiceField label="Link node" value={asStr(m.params.node ?? "")} options={net.nodes.map((n) => n.id)} onChange={(v) => change({ params: { node: v, param: "bounds" } }, true)} />)}
      {row("Param", <ChoiceField label="Link param" value={asStr(m.params.param ?? "bounds")} options={params} onChange={(v) => change({ params: { param: v } }, true)} />)}
      {row("Scale", <NumberField label="Link scale" value={asNum(m.params.scale ?? 1, 1)} step={0.01} onChange={(v, f) => change({ params: { scale: v } }, f)} />)}
      {row("Offset", <NumberField label="Link offset" value={asNum(m.params.offset ?? 0)} onChange={(v, f) => change({ params: { offset: v } }, f)} />)}
      {row("Min", <NumberField label="Link minimum" value={asNum(m.params.min ?? 0)} onChange={(v, f) => change({ params: { min: v } }, f)} />)}
    </>
  );
}

function ModifierCard({ m, isVec, net, change, remove }: { m: Modifier; isVec: boolean; net: Network; change: (patch: Parameters<typeof updateModifier>[5], final: boolean) => void; remove: () => void }) {
  const fields = m.type === "link" ? [] : MOD_FIELDS[m.type as ModifierKind] ?? [];
  return (
    <div className={cn("ml-[48px] grid gap-1 rounded-md bg-card p-2", !m.enabled && "opacity-60")}>
      <div className="flex items-center gap-1.5">
        <Switch aria-label={`${m.type} on`} checked={m.enabled} onCheckedChange={(v) => change({ enabled: v }, true)} />
        <span className="text-xs font-medium capitalize">{m.type}</span>
        {m.type !== "stagger" && (
          <select
            aria-label={`${m.type} blend`}
            value={m.blend}
            onChange={(e) => change({ blend: e.target.value as Modifier["blend"] }, true)}
            className="ml-auto h-6 rounded-[8px] bg-field px-1 font-mono text-[11px]"
          >
            <option value="add">add</option>
            <option value="multiply">multiply</option>
            <option value="replace">replace</option>
          </select>
        )}
        <Button variant="ghost" size="icon" className={cn("size-6", m.type === "stagger" && "ml-auto")} aria-label={`Remove ${m.type}`} onClick={remove}>
          <X />
        </Button>
      </div>
      {fields.map((f) => (
        <div key={f.key} className="grid grid-cols-[72px_1fr] items-center gap-1.5">
          <Label>{f.label}</Label>
          {f.kind === "number" ? (
            <NumberField label={`${m.type} ${f.label}`} value={asNum(m.params[f.key] ?? 0)} step={f.step ?? 1} unit={f.unit} onChange={(v, fin) => change({ params: { [f.key]: v } }, fin)} />
          ) : (
            <ChoiceField label={`${m.type} ${f.label}`} value={asStr(m.params[f.key] ?? f.options![0]!)} options={f.options!} onChange={(v) => change({ params: { [f.key]: v } }, true)} />
          )}
        </div>
      ))}
      {m.type === "link" && <LinkFields m={m} net={net} change={change} />}
      {isVec && m.type !== "stagger" && (
        <div className="grid grid-cols-[72px_1fr] items-center gap-1.5">
          <Label>Axis</Label>
          <ChoiceField label={`${m.type} axis`} value={asStr(m.params.axis ?? "all")} options={["all", "x", "y"]} onChange={(v) => change({ params: { axis: v === "all" ? undefined : v } }, true)} />
        </div>
      )}
    </div>
  );
}

/* ---------- one param row ---------- */

function ParamRow({
  net,
  node,
  name,
  spec,
  label = human(name),
  fallback,
  onReset,
  showMods = true,
}: {
  net: Network;
  node: Node;
  name: string;
  spec: ParamSpec;
  label?: string;
  /** Value shown when the node doesn't carry the param (promoted controls: the subnet's own value). */
  fallback?: Value;
  onReset?: () => void;
  /** Show the modifier cards here (off where the folded Modifiers section lists them). */
  showMods?: boolean;
}) {
  const doc = useDocStore((s) => s.doc);
  const path = useUi((s) => s.path);
  const frame = useUi((s) => s.frame);
  const fps = viewComp(doc, path).fps;
  const t = frame / fps, tol = 0.5 / fps;
  const brand = doc.brand?.colors ?? [];

  const own: Param | undefined = node.params[name];
  const p: Param = own ?? { value: fallback ?? spec.default };
  const keys = p.keys ?? [];
  const shown = keys.length ? evaluateParam({ value: p.value, keys }, t) : p.value;
  const keyHere = keyAt(keys, t, tol);
  const animatable = !!spec.animatable;
  const ckey = `${net.id}/${node.id}/${name}`;
  const go = (k: { t: number } | undefined) => k && useUi.getState().setFrame(Math.round(k.t * fps));
  const prev = [...keys].reverse().find((k) => k.t < t - tol);
  const next = keys.find((k) => k.t > t + tol);
  const canModify = animatable && (spec.kind === "number" || spec.kind === "vec2" || spec.kind === "vec3");
  const mods = p.modifiers ?? [];

  return (
    <div className="grid gap-1">
      <div className="grid grid-cols-[44px_80px_minmax(0,1fr)] items-center gap-1">
        {animatable ? (
          <div className="flex items-center">
          <button
            type="button"
            aria-label={`Previous ${label} key`}
            title="Previous key"
            disabled={!prev}
            onClick={() => go(prev)}
            className={cn("grid size-[13px] place-items-center text-muted-foreground hover:text-foreground disabled:opacity-0", !keys.length && "invisible")}
          >
            <ChevronLeft className="size-3" />
          </button>
          <button
            type="button"
            aria-label={keyHere ? `Remove ${label} key` : `Add ${label} key`}
            aria-pressed={!!keyHere}
            title={keyHere ? "Remove key at playhead" : "Add key at playhead"}
            onClick={() => apply(keyHere ? "Remove key" : "Add key", (d) => toggleKey(d, net.id, node.id, name, t, tol, shown), true, `key-${ckey}`)}
            className="grid size-[18px] place-items-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span
              className={cn(
                "size-[10px] rotate-45 rounded-[2px] border-[1.5px]",
                keyHere ? "border-ink bg-volt" : keys.length ? "border-ink bg-transparent" : "border-line2 bg-transparent hover:border-ink",
              )}
            />
          </button>
          <button
            type="button"
            aria-label={`Next ${label} key`}
            title="Next key"
            disabled={!next}
            onClick={() => go(next)}
            className={cn("grid size-[13px] place-items-center text-muted-foreground hover:text-foreground disabled:opacity-0", !keys.length && "invisible")}
          >
            <ChevronRight className="size-3" />
          </button>
          </div>
        ) : (
          <span />
        )}
        <label className={cn("truncate text-xs", own || !onReset ? "text-foreground" : "text-muted-foreground")} title={name}>
          {label}
        </label>
        <div className="flex min-w-0 items-center gap-0.5">
          <div className="min-w-0 flex-1">
            <ValueControl
              name={name}
              spec={spec}
              value={shown}
              label={label}
              brand={brand}
              onChange={(v, fin) => apply(`Change ${label}`, (d) => setValue(d, net.id, node.id, name, v, t, tol), fin, ckey)}
            />
          </div>
          {onReset && own && (
            <Button variant="ghost" size="icon" className="size-6" aria-label={`Reset ${label}`} title="Back to the asset's value" onClick={onReset}>
              <RotateCcw />
            </Button>
          )}
          {canModify && (
            <select
              aria-label={`Add modifier to ${label}`}
              title="Add modifier"
              value=""
              onChange={(e) => apply("Add modifier", (d) => void addModifier(d, net.id, node.id, name, e.target.value as ModifierKind), true, `mod-${ckey}`)}
              className="h-6 w-6 shrink-0 cursor-pointer appearance-none rounded-full bg-transparent text-center text-xs text-muted-foreground hover:bg-card hover:text-foreground"
            >
              <option value="" disabled>
                +
              </option>
              <option value="wave">Wave</option>
              <option value="noise">Noise</option>
              <option value="stagger">Stagger</option>
              <option value="link">Link</option>
            </select>
          )}
        </div>
      </div>
      {keyHere && (
        <div className="ml-[48px] grid grid-cols-[80px_minmax(0,1fr)] items-center gap-1">
          <span className="text-[11px] text-muted-foreground">Ease out</span>
          <EaseField
            label={`${label} key ease`}
            value={keyHere.ease}
            extra={["hold"]}
            onChange={(e, fin) => apply("Key ease", (d) => setKeyEase(d, net.id, node.id, name, t, tol, e), fin, `ease-${ckey}`)}
          />
        </div>
      )}
      {showMods && mods.some((m) => m.enabled) && (
        <p className="ml-[48px] font-mono text-[10px] tabular-nums text-muted-foreground" aria-live="off">
          With modifiers: {fmtValue(evaluateParam(p, t))}
        </p>
      )}
      {showMods && mods.map((m) => (
        <ModifierCard
          key={m.id}
          m={m}
          net={net}
          isVec={spec.kind === "vec2"}
          change={(patch, fin) => apply(`Edit ${m.type}`, (d) => updateModifier(d, net.id, node.id, name, m.id, patch), fin, `mod-${ckey}-${m.id}`)}
          remove={() => apply("Remove modifier", (d) => removeModifier(d, net.id, node.id, name, m.id), true, `rm-${ckey}-${m.id}`)}
        />
      ))}
    </div>
  );
}

/* ---------- panels ---------- */

const ROLES = RoleSchema.options;
const r2 = (v: number) => +v.toFixed(2);

/** Current value of a param at t (keys applied, modifiers not), or the catalog default. */
function valueNow(node: Node, name: string, spec: ParamSpec | undefined, t: number): Value | undefined {
  const p = node.params[name];
  if (!p) return spec?.default;
  return p.keys?.length ? evaluateParam({ value: p.value, keys: p.keys }, t) : p.value;
}

/** Motion: the layer's in / hold / out as a proportion bar, ease cards and one sentence. */
function MotionSection({ doc, net, node, span }: { doc: SceneDoc; net: Network; node: Node; span: [number, number] }) {
  const inP = phaseOf(net, node.id, "in"), outP = phaseOf(net, node.id, "out");
  const range = (p?: Node): [number, number] | undefined => {
    if (!p) return undefined;
    const rs = phaseRanges(doc, net.id, p.id).filter((r) => r.node === node.id);
    return rs.length ? [Math.min(...rs.map((r) => r.start)), Math.max(...rs.map((r) => r.end))] : undefined;
  };
  const ri = range(inP), ro = range(outP);
  const [a, b] = span;
  const total = Math.max(1e-6, b - a);
  const inLen = ri ? Math.max(0, ri[1] - a) : 0;
  const outLen = ro ? Math.max(0, b - ro[0]) : 0;
  const hold = Math.max(0, total - inLen - outLen);
  const keyed = Object.entries(node.params).filter(([, p]) => p.keys?.length).map(([n]) => human(n).toLowerCase());
  const open = (p?: Node) => {
    const ui = useUi.getState();
    if (p) ui.setBottomTab("graph");
  };
  const card = (label: string, p: Node | undefined) =>
    p ? (
      <button type="button" onClick={() => open(p)} aria-label={`Animate ${label.toLowerCase()}: ${String(p.params.ease?.value ?? "outExpo")}. Open in graph`} className="flex flex-col gap-1.5 rounded-md bg-card p-2.5 text-left hover:shadow-card">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <MiniCurve ease={String(p.params.ease?.value ?? "outExpo")} width="100%" height={26} strokeWidth={1.75} />
        <span className="truncate font-mono text-[11px] font-medium">{String(p.params.ease?.value ?? "outExpo")}</span>
      </button>
    ) : (
      <div className="flex flex-col justify-center gap-1 rounded-md border border-dashed border-line2 p-2.5 text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span>None yet</span>
      </div>
    );
  const sentence = (p: Node | undefined, verb: string, len: number) =>
    p ? `${verb} over ${r2(len)}s with ${String(p.params.ease?.value ?? "outExpo")}${asNum(p.params.stagger?.value ?? 0) > 0 ? `, parts ${r2(asNum(p.params.stagger?.value ?? 0))}s apart` : ""}.` : "";

  if (node.subnet)
    return (
      <Section title="Motion" aside={`${r2(a)}–${r2(b)}s`}>
        <p className="text-xs text-muted-foreground">The motion lives inside {doc.networks.find((n) => n.id === node.subnet)?.name ?? "the asset"}. Double-click the layer to open it.</p>
      </Section>
    );
  return (
    <Section title="Motion" aside={`${r2(a)}–${r2(b)}s`}>
      {(inP || outP) && (
        <div aria-hidden className="grid h-2 gap-[3px]" style={{ gridTemplateColumns: `${inLen || 0.0001}fr ${hold || 0.0001}fr ${outLen || 0.0001}fr` }}>
          <span className="rounded-l-full rounded-r-[2px] bg-ink" />
          <span className="rounded-[2px] bg-line2" />
          <span className="rounded-l-[2px] rounded-r-full bg-muted-foreground" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        {card("In", inP)}
        {card("Out", outP)}
      </div>
      <p className="text-xs text-muted-foreground">
        {inP || outP
          ? [sentence(inP, "Comes in", inLen), sentence(outP, "Leaves", outLen)].filter(Boolean).join(" ")
          : keyed.length
            ? `Animated with keys on ${keyed.join(", ")}.`
            : "No motion yet. Add Animate in / out from + Add, or key a value."}
      </p>
    </Section>
  );
}

/** A Material node: preview, kind (with that kind's defaults) and which objects use it. */
function MaterialHeader({ doc, net, node }: { doc: SceneDoc; net: Network; node: Node }) {
  const kind = String(node.params.kind?.value ?? "plastic");
  const users = net.wires.filter((w) => w.from.node === node.id && w.to.port === "material").map((w) => net.nodes.find((n) => n.id === w.to.node)).filter(Boolean) as Node[];
  return (
    <Section title="Material">
      <div className="flex items-center gap-3">
        <Sphere color={cssColor(doc, node.params.color?.value) ?? "#ffffff"} kind={kind} size={44} />
        <div role="radiogroup" aria-label="Material kind" className="grid flex-1 grid-cols-4 gap-1">
          {MATERIAL_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={k === kind}
              onClick={() => k !== kind && apply(`Material: ${k}`, (d) => setMaterialKind(d, net.id, node.id, k), true, `kind-${node.id}`)}
              className={cn("rounded-full px-1.5 py-1 text-[11px] capitalize", k === kind ? "bg-raised font-semibold shadow-card" : "text-muted-foreground hover:text-foreground")}
            >
              {k}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {users.length ? (
          <>
            Used by{" "}
            {users.map((u, i) => (
              <span key={u.id}>
                {i > 0 && ", "}
                <button type="button" className="font-medium text-foreground underline-offset-2 hover:underline" onClick={() => useUi.getState().selectNodes([u.id])}>
                  {u.name}
                </button>
              </span>
            ))}
            {users.length > 1 && " (shared: changes here change all of them)"}
          </>
        ) : (
          "Not used yet: wire it into an object's material input, or apply it from the Library."
        )}
      </p>
    </Section>
  );
}

/** On a 3D scene layer: what's inside, one click from editing it (opens the scene and selects it). */
function SceneContents({ doc, scene }: { doc: SceneDoc; scene: Node }) {
  const inner = doc.networks.find((n) => n.id === scene.subnet);
  if (!inner) return null;
  const items = inner.nodes.filter((n) => isNodeType(n.type) && (CATALOG[n.type].category === "3d" || CATALOG[n.type].category === "material"));
  return (
    <Section title="In this scene" aside={`(${items.length})`}>
      <p className="text-xs text-muted-foreground">Select the scene in the viewer and drag to turn its first object, or open one to edit it in 3D.</p>
      <div className="grid gap-1">
        {items.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => {
              openSubnet(scene);
              useUi.getState().selectNodes([n.id]);
            }}
            className="flex items-center gap-2 rounded-md bg-card px-2.5 py-1.5 text-left hover:shadow-card"
          >
            <span className="min-w-0 flex-1 truncate font-medium">{n.name}</span>
            <span className="text-[11px] text-muted-foreground">{CATALOG[n.type as keyof typeof CATALOG].label}</span>
          </button>
        ))}
      </div>
    </Section>
  );
}

function NodePanel({ doc, net, node }: { doc: SceneDoc; net: Network; node: Node }) {
  const path = useUi((s) => s.path);
  const frame = useUi((s) => s.frame);
  const comp = viewComp(doc, path);
  const t = frame / comp.fps, tol = 0.5 / comp.fps;
  const spec = isNodeType(node.type) ? CATALOG[node.type] : undefined;
  const params = Object.entries((spec?.params ?? {}) as Record<string, ParamSpec>);
  const isLayer = spec?.category === "layer";
  const step = 1 / comp.fps;
  const subnet = node.subnet ? doc.networks.find((n) => n.id === node.subnet) : undefined;
  const promoted = subnet?.promoted ?? [];
  const pSpecs = node.subnet ? promotedSpecs(doc.networks, node.subnet) : {};
  const k = `${net.id}/${node.id}`;
  const span: [number, number] = [node.timing?.in ?? 0, node.timing?.out ?? comp.duration];
  const role = roleLabel(node.role);
  const hasFill = takesMaterial(node.type);
  const fill = hasFill ? layerFill(doc, node, t) : undefined;
  const fillRaw = String(valueNow(node, "fill", params.find(([n]) => n === "fill")?.[1], t) ?? "");
  // a Material wired into this node's material input wins over its fill
  const matWire = net.wires.find((w) => w.to.node === node.id && w.to.port === "material");
  const material = matWire ? net.nodes.find((n) => n.id === matWire.from.node && n.type === "Material" && n.enabled) : undefined;
  const matColor = material ? cssColor(doc, valueNow(material, "color", CATALOG.Material.params.color, t)) : undefined;
  const matKind = material ? String(valueNow(material, "kind", CATALOG.Material.params.kind, t)) : undefined;
  const own = params.filter(([n]) => !TRANSFORM.has(n) && n !== "fill" && !(node.type === "Material" && n === "kind"));
  const xf = params.filter(([n]) => TRANSFORM.has(n) && n !== "opacity");
  const opacity = params.find(([n]) => n === "opacity");
  const modded = params.filter(([n]) => node.params[n]?.modifiers?.length);
  const xfKeyHere = xf.some(([n]) => keyAt(node.params[n]?.keys, t, tol));
  const fmt = (n: string, unit = "") => {
    const v = valueNow(node, n, params.find(([m]) => m === n)?.[1], t);
    return v === undefined ? "–" : `${Array.isArray(v) ? v.map(r2).join(", ") : typeof v === "number" ? r2(v) : String(v)}${unit}`;
  };
  const sc = valueNow(node, "scale", params.find(([n]) => n === "scale")?.[1], t);
  const scText = Array.isArray(sc) ? (sc.every((x) => r2(x) === r2(sc[0]!)) ? `${r2(sc[0]!)}%` : `${sc.map(r2).join("×")}%`) : "–";
  const xfSummary = `${fmt("position")} · ${scText} · ${fmt("rotation", "°")}`;
  const modSummary = modded.length ? modded.map(([n]) => `${(node.params[n]!.modifiers ?? []).map((m) => m.type).join(" + ")} on ${human(n).toLowerCase()}`).join(", ") : "None";
  const inAsset = net.id !== doc.root && !!DESIGNER_PARAMS[node.type];
  const editable = isDesignerEditable(net, node.id);

  return (
    <div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto p-3.5">
      <div className="flex items-start gap-2.5 px-0.5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <input
            aria-label="Layer name"
            defaultValue={node.name}
            key={node.name}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim();
              if (v && v !== node.name) apply("Rename", (d) => setNodeProps(d, net.id, node.id, { name: v }), true, `name-${k}`);
              else e.currentTarget.value = node.name;
            }}
            className="-ml-1 min-w-0 rounded-sm bg-transparent px-1 font-display text-[22px] font-semibold tracking-[-0.02em] hover:bg-field focus:bg-field"
          />
          <span className="text-xs text-muted-foreground">
            {spec?.label ?? node.type}
            {role && ` · ${role}`}
            {!node.enabled && " · off"}
          </span>
        </div>
        <Switch
          className="mt-2"
          aria-label={`${node.name} enabled`}
          title={node.enabled ? "On: click to switch this node off" : "Off: click to switch it on"}
          checked={node.enabled}
          onCheckedChange={(v) => apply(v ? "Enable" : "Disable", (d) => setNodeProps(d, net.id, node.id, { enabled: v }), true, `en-${k}`)}
        />
      </div>

      {promoted.length > 0 && (
        <Section title="Controls" aside={`(${promoted.length})`}>
          {promoted.map((c) => {
            const target = subnet!.nodes.find((n) => n.id === c.target.node);
            const tp = target?.params[c.target.param];
            const ps = pSpecs[c.id];
            if (!ps) return null;
            const fallback = tp ? evaluateParam({ value: tp.value, keys: tp.keys }, 0) : ps.default;
            return (
              <ParamRow
                key={c.id}
                net={net}
                node={node}
                name={c.id}
                label={c.label}
                spec={{ ...ps, min: c.min ?? ps.min, max: c.max ?? ps.max, options: c.options ?? ps.options }}
                fallback={fallback}
                onReset={() => apply(`Reset ${c.label}`, (d) => resetParam(d, net.id, node.id, c.id), true, `reset-${k}-${c.id}`)}
              />
            );
          })}
        </Section>
      )}

      {isLayer && <MotionSection doc={doc} net={net} node={node} span={span} />}
      {node.type === "Material" && <MaterialHeader doc={doc} net={net} node={node} />}

      {(isLayer || spec?.category === "3d") && (hasFill || opacity) && (
        <Section title="Look">
          {hasFill && material && (
            <div className="flex items-center gap-2.5 rounded-md bg-card px-2.5 py-2">
              <Sphere color={matColor} size={30} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-semibold">{material.name}</span>
                <span className="text-[11px] capitalize text-muted-foreground">{matKind} material</span>
              </span>
              <button type="button" onClick={() => useUi.getState().selectNodes([material.id])} className="ml-auto rounded-full px-2.5 py-1 text-xs hover:bg-field">
                Edit
              </button>
            </div>
          )}
          {hasFill && !material && (
            <div className="flex items-center gap-2.5 rounded-md bg-card px-2.5 py-2">
              <Sphere color={fill} size={30} />
              <span className="flex min-w-0 flex-col">
                <span className="text-[13px] font-semibold">Solid</span>
                <span className="truncate font-mono text-[11px] text-muted-foreground">{fillRaw.replace(/^brand:/, "brand · ")}</span>
              </span>
              <button type="button" onClick={() => useUi.getState().setLibraryOpen(true)} className="ml-auto rounded-full px-2.5 py-1 text-xs hover:bg-field">
                Library
              </button>
            </div>
          )}
          {hasFill && !material && <ParamRow net={net} node={node} name="fill" label="Colour" spec={params.find(([n]) => n === "fill")![1]} showMods={false} />}
          {opacity && <ParamRow net={net} node={node} name="opacity" spec={opacity[1]} showMods={false} />}
        </Section>
      )}

      {own.length > 0 && (
        <Section title={spec?.label ?? node.type}>
          {own.map(([n, s]) => (
            <ParamRow key={n} net={net} node={node} name={n} spec={s} showMods={false} />
          ))}
        </Section>
      )}

      {node.type === "Scene3D" && subnet && <SceneContents doc={doc} scene={node} />}

      {xf.length > 0 && (
        <Fold
          key={node.id}
          title={node.type === "Scene3D" ? "Placement in the comp (2D)" : spec?.category === "3d" ? "Transform 3D" : "Transform"}
          summary={xfSummary}
          live={xfKeyHere}
          defaultOpen={spec?.category === "3d"}
        >
          {xf.map(([n, s]) => (
            <ParamRow key={n} net={net} node={node} name={n} spec={s} showMods={false} />
          ))}
          {!isLayer && opacity && <ParamRow net={net} node={node} name="opacity" spec={opacity[1]} showMods={false} />}
        </Fold>
      )}

      {params.some(([, s]) => s.animatable && (s.kind === "number" || s.kind === "vec2" || s.kind === "vec3")) && (
        <Fold title="Modifiers" summary={modSummary}>
          {modded.length ? (
            modded.map(([n, s]) => <ParamRow key={n} net={net} node={node} name={n} spec={s} />)
          ) : (
            <p className="text-xs text-muted-foreground">Add wave, noise, stagger or link with the + next to any value.</p>
          )}
        </Fold>
      )}

      {isLayer && (
        <Fold title="Layer" summary={`${r2(span[0])}–${r2(span[1])}s${role ? ` · ${role}` : ""}`}>
          <div className="grid grid-cols-[44px_80px_minmax(0,1fr)] items-center gap-1">
            <span />
            <Label>In / out</Label>
            <div className="grid grid-cols-2 gap-1">
              <NumberField
                label="In point"
                unit="s"
                step={step}
                min={0}
                value={node.timing?.in ?? 0}
                onChange={(v, fin) => apply("Layer in", (d) => setNodeProps(d, net.id, node.id, { timing: { in: Math.min(v, (node.timing?.out ?? comp.duration) - step), out: node.timing?.out ?? comp.duration } }), fin, `in-${k}`)}
              />
              <NumberField
                label="Out point"
                unit="s"
                step={step}
                min={0}
                value={node.timing?.out ?? comp.duration}
                onChange={(v, fin) => apply("Layer out", (d) => setNodeProps(d, net.id, node.id, { timing: { in: node.timing?.in ?? 0, out: Math.max(v, (node.timing?.in ?? 0) + step) } }), fin, `out-${k}`)}
              />
            </div>
          </div>
          <div className="grid grid-cols-[44px_80px_minmax(0,1fr)] items-center gap-1">
            <span />
            <Label htmlFor={`role-${k}`}>Role</Label>
            <select
              id={`role-${k}`}
              value={node.role ?? ""}
              onChange={(e) => apply("Role", (d) => setNodeProps(d, net.id, node.id, { role: (e.target.value || null) as never }), true, `role-${k}`)}
              className="h-7 rounded-[8px] bg-card px-1.5 text-xs"
            >
              <option value="">Not set</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
          </div>
        </Fold>
      )}

      {inAsset && (
        <label className="flex items-center gap-2.5 rounded-lg bg-field px-3.5 py-3">
          <span className="flex flex-1 flex-col">
            <span className="text-[13px] font-semibold">Designers can edit</span>
            <span className="text-xs text-muted-foreground">Shows this layer's {DESIGNER_PARAMS[node.type]!.map((c) => (c.param === "fill" ? "colour" : c.param)).join(" and ")} as a control on every {net.name} instance.</span>
          </span>
          <Switch
            aria-label="Designers can edit this layer"
            checked={editable}
            onCheckedChange={(on) => apply(on ? "Let designers edit" : "Stop designer edits", (d) => setDesignerEditable(d, net.id, node.id, on), true, `designer-${k}`)}
          />
        </label>
      )}
    </div>
  );
}

function CompPanel({ doc, net }: { doc: SceneDoc; net: Network }) {
  const comp = net.comp!;
  const brand = doc.brand?.colors ?? [];
  const set = (label: string, patch: Parameters<typeof setComp>[2], fin: boolean, key: string) => apply(label, (d) => setComp(d, net.id, patch), fin, `comp-${net.id}-${key}`);
  const row = (label: string, child: React.ReactNode) => (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-1.5">
      <Label>{label}</Label>
      {child}
    </div>
  );
  return (
    <div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto p-3.5">
      <div className="flex flex-col gap-0.5 px-0.5">
        <h2 className="font-display text-[22px] font-semibold tracking-[-0.02em]">{net.name}</h2>
        <p className="text-xs text-muted-foreground">Comp · select a layer to edit it</p>
      </div>
      <Section title="Comp">
        {row(
          "Size",
          <Vec2Field label="Size" value={[comp.width, comp.height]} min={1} onChange={([w, h], fin) => set("Comp size", { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) }, fin, "size")} />,
        )}
        {row("Frame rate", <NumberField label="Frame rate" value={comp.fps} min={1} max={120} step={1} unit="fps" onChange={(v, fin) => set("Frame rate", { fps: Math.max(1, v) }, fin, "fps")} />)}
        {row("Duration", <NumberField label="Duration" value={comp.duration} min={1 / comp.fps} step={1 / comp.fps} unit="s" onChange={(v, fin) => set("Duration", { duration: Math.max(1 / comp.fps, v) }, fin, "dur")} />)}
        {row(
          "Background",
          <div className="flex items-center gap-1.5">
            <Switch aria-label="Background on" checked={!!comp.background} onCheckedChange={(on) => set("Background", { background: on ? "#000000" : null }, true, "bgon")} />
            {comp.background && (
              <div className="min-w-0 flex-1">
                <ColorField label="Background" value={comp.background} brand={brand} onChange={(v, fin) => set("Background", { background: v }, fin, "bg")} />
              </div>
            )}
          </div>,
        )}
      </Section>
      <Section title="Motion blur">
        {row(
          "On",
          <Switch
            aria-label="Motion blur on"
            checked={!!comp.motionBlur}
            onCheckedChange={(on) => set("Motion blur", { motionBlur: on ? { shutter: 180, samples: 8 } : null }, true, "mbon")}
          />,
        )}
        {comp.motionBlur && (
          <>
            {row("Shutter", <NumberField label="Shutter angle" value={comp.motionBlur.shutter} min={0} max={720} unit="°" onChange={(v, fin) => set("Shutter", { motionBlur: { ...comp.motionBlur!, shutter: v } }, fin, "sh")} />)}
            {row("Samples", <NumberField label="Samples" value={comp.motionBlur.samples} min={2} max={64} onChange={(v, fin) => set("Samples", { motionBlur: { ...comp.motionBlur!, samples: Math.round(v) } }, fin, "sa")} />)}
          </>
        )}
      </Section>
    </div>
  );
}

export function Inspector() {
  const doc = useDocStore((s) => s.doc);
  const path = useUi((s) => s.path);
  const selected = useUi((s) => s.selectedNodes);
  const net = shownNetwork(doc, path);
  const node = net.nodes.find((n) => n.id === selected[0]);
  if (node) return <NodePanel key={node.id} doc={doc} net={net} node={node} />;
  if (net.comp) return <CompPanel doc={doc} net={net} />;
  return <p className="grid h-full place-items-center px-6 text-center text-xs text-muted-foreground">Select a layer in the viewer or the timeline</p>;
}
