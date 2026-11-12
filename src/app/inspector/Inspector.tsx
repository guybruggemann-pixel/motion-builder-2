/**
 * Inspector: edits the selected node of the shown network (or the comp when nothing is selected).
 * Every animatable param has a key diamond (add/remove at the playhead), previous/next key, the
 * ease of the key under the playhead, and its modifier list. A Subnet shows its promoted controls
 * first: that's all a designer needs to touch.
 */
import { ChevronLeft, ChevronRight, Plus, RotateCcw, X } from "lucide-react";
import {
  CATALOG,
  evaluateParam,
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
import { ChoiceField, ColorField, EaseField, NumberField, TextField, ToggleField, Vec2Field, type Change } from "./controls";
import {
  addModifier,
  keyAt,
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
const asStr = (v: Value) => (typeof v === "string" ? v : String(v));

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section aria-label={title} className="border-b border-border px-3 pb-3 pt-2.5">
      <div className="mb-2 flex items-center">
        <h3 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{title}</h3>
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      <div className="grid gap-1.5">{children}</div>
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
    <div className={cn("ml-[48px] grid gap-1 rounded-sm border border-border bg-background/60 p-2", !m.enabled && "opacity-60")}>
      <div className="flex items-center gap-1.5">
        <Switch aria-label={`${m.type} on`} checked={m.enabled} onCheckedChange={(v) => change({ enabled: v }, true)} />
        <span className="text-xs font-medium capitalize">{m.type}</span>
        {m.type !== "stagger" && (
          <select
            aria-label={`${m.type} blend`}
            value={m.blend}
            onChange={(e) => change({ blend: e.target.value as Modifier["blend"] }, true)}
            className="ml-auto h-6 rounded-sm border border-border bg-muted px-1 font-mono text-[11px]"
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
}: {
  net: Network;
  node: Node;
  name: string;
  spec: ParamSpec;
  label?: string;
  /** Value shown when the node doesn't carry the param (promoted controls: the subnet's own value). */
  fallback?: Value;
  onReset?: () => void;
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
  const canModify = animatable && (spec.kind === "number" || spec.kind === "vec2");
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
                "size-[9px] rotate-45 border",
                keyHere ? "border-primary bg-primary" : keys.length ? "border-primary bg-transparent" : "border-wire bg-transparent hover:border-foreground",
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
              className="h-6 w-6 shrink-0 cursor-pointer appearance-none rounded-sm bg-transparent text-center text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
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
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Ease out</span>
          <EaseField
            label={`${label} key ease`}
            value={keyHere.ease}
            extra={["hold"]}
            onChange={(e, fin) => apply("Key ease", (d) => setKeyEase(d, net.id, node.id, name, t, tol, e), fin, `ease-${ckey}`)}
          />
        </div>
      )}
      {mods.some((m) => m.enabled) && (
        <p className="ml-[48px] font-mono text-[10px] tabular-nums text-muted-foreground" aria-live="off">
          With modifiers: {fmtValue(evaluateParam(p, t))}
        </p>
      )}
      {mods.map((m) => (
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

function NodePanel({ doc, net, node }: { doc: SceneDoc; net: Network; node: Node }) {
  const comp = viewComp(doc, useUi((s) => s.path));
  const spec = isNodeType(node.type) ? CATALOG[node.type] : undefined;
  const params = Object.entries((spec?.params ?? {}) as Record<string, ParamSpec>);
  const isLayer = spec?.category === "layer";
  const step = 1 / comp.fps;
  const subnet = node.subnet ? doc.networks.find((n) => n.id === node.subnet) : undefined;
  const promoted = subnet?.promoted ?? [];
  const pSpecs = node.subnet ? promotedSpecs(doc.networks, node.subnet) : {};
  const k = `${net.id}/${node.id}`;

  return (
    <div className="min-h-0 overflow-y-auto">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Switch aria-label={`${node.name} enabled`} checked={node.enabled} onCheckedChange={(v) => apply(v ? "Enable" : "Disable", (d) => setNodeProps(d, net.id, node.id, { enabled: v }), true, `en-${k}`)} />
        <div className="min-w-0 flex-1">
          <TextField label="Node name" value={node.name} onChange={(v, fin) => fin && v.trim() && apply("Rename", (d) => setNodeProps(d, net.id, node.id, { name: v.trim() }), true, `name-${k}`)} />
        </div>
        <span className="shrink-0 font-mono text-[10px] uppercase text-muted-foreground">{spec?.label ?? node.type}</span>
      </div>

      {isLayer && (
        <Section title="Layer">
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
              className="h-7 rounded-sm border border-border bg-muted px-1.5 text-xs"
            >
              <option value="">Not set</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </Section>
      )}

      {promoted.length > 0 && (
        <Section title="Controls">
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

      {params.some(([n]) => !TRANSFORM.has(n)) && (
        <Section title={spec?.label ?? node.type}>
          {params.filter(([n]) => !TRANSFORM.has(n)).map(([n, s]) => (
            <ParamRow key={n} net={net} node={node} name={n} spec={s} />
          ))}
        </Section>
      )}
      {params.some(([n]) => TRANSFORM.has(n)) && (
        <Section title="Transform">
          {params.filter(([n]) => TRANSFORM.has(n)).map(([n, s]) => (
            <ParamRow key={n} net={net} node={node} name={n} spec={s} />
          ))}
        </Section>
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
    <div className="min-h-0 overflow-y-auto">
      <div className="border-b border-border px-3 py-2.5">
        <p className="text-sm">{net.name}</p>
        <p className="font-mono text-[11px] text-muted-foreground">Comp · select a layer in the timeline to edit it</p>
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
  return <p className="grid h-full place-items-center px-6 text-center font-mono text-xs text-muted-foreground">Select a layer in the timeline</p>;
}
