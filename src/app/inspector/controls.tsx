/**
 * Inspector value controls. Each reports changes through `onChange(value, final)`: `final` is
 * false while dragging or typing (the caller coalesces those into one undo step) and true on release.
 */
import { useEffect, useRef, useState } from "react";
import { AMOUNT_EASES, easeChoice, easeString, MENU_EASES, type EaseChoice, type MenuEase } from "@core/motion";
import { Input, Switch } from "@/design-system/motionbuilder---brandbook-c4b4eb";
import { cn } from "@/design-system/motionbuilder---brandbook-c4b4eb/lib/utils";

export type Change<T> = (value: T, final: boolean) => void;

const fmt = (v: number, step: number) => {
  const dec = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  return String(+v.toFixed(Math.max(dec, Number.isInteger(v) ? 0 : 2)));
};

const selectCls =
  "h-7 w-full min-w-0 rounded-[8px] bg-card px-1.5 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ink";

/**
 * Number field you can type into or drag: drag the field sideways to scrub (Shift ×10, Alt ×0.1),
 * click to type, Enter or blur to commit, Escape to cancel, ↑/↓ to nudge.
 */
export function NumberField({
  value,
  onChange,
  step = 1,
  min,
  max,
  unit,
  label,
  className,
}: {
  value: number;
  onChange: Change<number>;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  label: string;
  className?: string;
}) {
  const [text, setText] = useState<string>();
  const ref = useRef<HTMLInputElement>(null);
  const clampV = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const round = (v: number) => Math.round(v / step) * step;

  const onPointerDown = (e: React.PointerEvent<HTMLInputElement>) => {
    if (document.activeElement === e.currentTarget) return; // already typing: let the caret work
    e.preventDefault();
    const x0 = e.clientX, v0 = value, el = e.currentTarget;
    let moved = false;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 3) return;
      moved = true;
      const mul = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1;
      onChange(clampV(round(v0 + dx * step * mul)), false);
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      if (moved) {
        const dx = ev.clientX - x0;
        onChange(clampV(round(v0 + dx * step * (ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1))), true);
      } else {
        el.focus();
        el.select();
      }
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const commit = () => {
    if (text === undefined) return;
    const v = Number(text.replace(",", "."));
    setText(undefined);
    if (Number.isFinite(v)) onChange(clampV(v), true);
  };

  return (
    <div className={cn("relative min-w-0", className)}>
      <Input
        ref={ref}
        variant="mono"
        size="sm"
        aria-label={label}
        inputMode="decimal"
        value={text ?? fmt(value, step)}
        onPointerDown={onPointerDown}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") ref.current?.blur();
          else if (e.key === "Escape") {
            setText(undefined);
            requestAnimationFrame(() => ref.current?.blur());
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const dir = e.key === "ArrowUp" ? 1 : -1;
            setText(undefined);
            onChange(clampV(round(value + dir * step * (e.shiftKey ? 10 : 1))), true);
          }
        }}
        className={cn("cursor-ew-resize rounded-[8px] bg-card pr-5 text-right focus:cursor-text", unit && "pr-6")}
      />
      {unit && <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 font-mono text-[10px] text-muted-foreground">{unit}</span>}
    </div>
  );
}

export function Vec3Field({ value, onChange, step, unit, label }: { value: [number, number, number]; onChange: Change<[number, number, number]>; step?: number; unit?: string; label: string }) {
  const set = (i: number) => (v: number, f: boolean) => onChange(value.map((x, j) => (j === i ? v : x)) as [number, number, number], f);
  return (
    <div className="grid grid-cols-3 gap-1">
      <NumberField label={`${label} x`} value={value[0]} step={step} unit={unit} onChange={set(0)} />
      <NumberField label={`${label} y`} value={value[1]} step={step} unit={unit} onChange={set(1)} />
      <NumberField label={`${label} z`} value={value[2]} step={step} unit={unit} onChange={set(2)} />
    </div>
  );
}

export function Vec2Field({ value, onChange, step, unit, label, min }: { value: [number, number]; onChange: Change<[number, number]>; step?: number; unit?: string; label: string; min?: number }) {
  return (
    <div className="grid grid-cols-2 gap-1">
      <NumberField label={`${label} x`} value={value[0]} step={step} unit={unit} min={min} onChange={(x, f) => onChange([x, value[1]], f)} />
      <NumberField label={`${label} y`} value={value[1]} step={step} unit={unit} min={min} onChange={(y, f) => onChange([value[0], y], f)} />
    </div>
  );
}

/** Text that commits on blur or ⌘Enter, with live preview while typing (coalesced). */
export function TextField({ value, onChange, label, multiline }: { value: string; onChange: Change<string>; label: string; multiline?: boolean }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const cls =
    "w-full min-w-0 rounded-[8px] bg-card px-2 py-1 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ink";
  const props = {
    "aria-label": label,
    value: text,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setText(e.target.value);
      onChange(e.target.value, false);
    },
    onBlur: () => onChange(text, true),
    className: cls,
  };
  return multiline ? <textarea rows={Math.min(4, Math.max(1, text.split("\n").length))} {...props} /> : <input {...props} />;
}

export function ChoiceField({ value, options, onChange, label }: { value: string; options: readonly string[]; onChange: (v: string) => void; label: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
      {!options.includes(value) && <option value={value}>{value}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function ToggleField({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return <Switch aria-label={label} checked={value} onCheckedChange={onChange} />;
}

/** Colour: a brand token or a custom hex. */
export function ColorField({ value, onChange, label, brand }: { value: string; onChange: Change<string>; label: string; brand: { token: string; value: string }[] }) {
  const token = value.startsWith("brand:") ? value.slice(6) : undefined;
  const hex = token ? brand.find((c) => c.token === token)?.value ?? "#FF00FF" : value;
  return (
    <div className="flex min-w-0 items-center gap-1">
      <label className="relative size-7 shrink-0 cursor-pointer rounded-full shadow-[inset_0_0_0_1px_rgba(16,17,20,0.12)]" style={{ background: hex }}>
        <span className="sr-only">{label} picker</span>
        <input
          type="color"
          value={hex.slice(0, 7)}
          onChange={(e) => onChange(e.target.value.toUpperCase(), false)}
          onBlur={(e) => onChange(e.target.value.toUpperCase(), true)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <select
        aria-label={`${label} source`}
        value={token ?? ""}
        onChange={(e) => onChange(e.target.value ? `brand:${e.target.value}` : hex, true)}
        className={cn(selectCls, "w-auto flex-1")}
      >
        <option value="">Custom {hex}</option>
        {brand.map((c) => (
          <option key={c.token} value={c.token}>
            Brand · {c.token}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Ease picker in Motion Builder v1's vocabulary: the menu names, the "Overshoot / bounce" amount
 * for back/elastic/spring, and x1 y1 x2 y2 for custom. `extra` adds non-menu options (e.g. "hold").
 */
export function EaseField({ value, onChange, label, extra = [] }: { value: string; onChange: Change<string>; label: string; extra?: string[] }) {
  const choice = easeChoice(value);
  const set = (c: EaseChoice, final: boolean) => onChange(easeString(c), final);
  const name = choice?.ease ?? value;
  return (
    <div className="grid min-w-0 gap-1">
      <select
        aria-label={label}
        value={name}
        onChange={(e) => {
          const v = e.target.value;
          if (extra.includes(v)) onChange(v, true);
          else set({ ease: v as MenuEase, amount: choice?.amount, bezier: choice?.bezier }, true);
        }}
        className={selectCls}
      >
        {!choice && !extra.includes(value) && <option value={value}>{value}</option>}
        {extra.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
        {MENU_EASES.map((e) => (
          <option key={e} value={e}>
            {e}
          </option>
        ))}
      </select>
      {choice && AMOUNT_EASES.has(choice.ease) && (
        <div className="grid grid-cols-[1fr_64px] items-center gap-1">
          <span className="text-[11px] text-muted-foreground">Overshoot / bounce</span>
          <NumberField label={`${label} amount`} value={choice.amount ?? 40} min={0} max={100} step={1} onChange={(a, f) => set({ ...choice, amount: a }, f)} />
        </div>
      )}
      {choice?.ease === "custom" && (
        <div className="grid grid-cols-4 gap-1">
          {(["x1", "y1", "x2", "y2"] as const).map((k, i) => (
            <NumberField
              key={k}
              label={`${label} ${k}`}
              value={(choice.bezier ?? [0.2, 0, 0, 1])[i]!}
              step={0.01}
              min={i % 2 === 0 ? 0 : -1}
              max={i % 2 === 0 ? 1 : 2}
              onChange={(v, f) => {
                const b = [...(choice.bezier ?? [0.2, 0, 0, 1])] as [number, number, number, number];
                b[i] = v;
                set({ ...choice, bezier: b }, f);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
