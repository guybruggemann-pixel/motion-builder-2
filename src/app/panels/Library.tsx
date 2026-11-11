/** Left panel: node catalog, motion assets and brand kit. Read-only until drag-to-add lands. */
import { CATALOG, type Category } from "@core/scene";
import { useDocStore } from "@/store";

const GROUPS: [Category, string][] = [
  ["layer", "Layers"],
  ["split", "Split"],
  ["animate", "Animate"],
  ["utility", "Utility"],
];

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="px-3 pb-1.5 pt-4 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{children}</h2>;
}

export function Library() {
  const doc = useDocStore((s) => s.doc);
  const assets = doc.brand?.assets ?? [];
  return (
    <div className="min-h-0 overflow-y-auto pb-4 text-sm">
      {GROUPS.map(([cat, label]) => (
        <section key={cat} aria-label={label}>
          <Heading>{label}</Heading>
          <ul>
            {Object.entries(CATALOG)
              .filter(([, s]) => s.category === cat)
              .map(([type, s]) => (
                <li key={type} className="px-3 py-1 text-foreground">
                  {s.label}
                </li>
              ))}
          </ul>
        </section>
      ))}

      <Heading>Motion assets</Heading>
      <ul>
        {assets.map((id) => (
          <li key={id} className="px-3 py-1 text-foreground">
            {doc.networks.find((n) => n.id === id)?.name ?? id}
          </li>
        ))}
        {!assets.length && <li className="px-3 py-1 text-muted-foreground">None in this brand kit</li>}
      </ul>

      <Heading>Brand kit</Heading>
      {doc.brand ? (
        <ul className="grid gap-1 px-3">
          {doc.brand.colors.map((c) => (
            <li key={c.token} className="flex items-center gap-2">
              <span className="size-4 rounded-xs border border-border" style={{ background: c.value }} aria-hidden />
              <span className="font-mono text-xs">{c.token}</span>
              <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">{c.value}</span>
            </li>
          ))}
          {doc.brand.fonts.map((f) => (
            <li key={f.family} className="flex items-center gap-2 pt-1">
              <span className="text-xs">{f.family}</span>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">{f.weights.join(" ")}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3 text-muted-foreground">No brand kit</p>
      )}
    </div>
  );
}
