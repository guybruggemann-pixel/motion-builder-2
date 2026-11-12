/** Left panel: node catalog (click to add to the open network), motion assets and brand kit. */
import { CATALOG, lowerThird, lowerThirdFit, type Category, type NodeType, type SceneDoc } from "@core/scene";
import { docStore, shownNetwork, useDocStore, useUi } from "@/store";
import { addNode } from "@/network/edits";

/** Add a node to the open network, right of everything already there, and select it. */
function add(type: NodeType) {
  const ui = useUi.getState();
  const net = shownNetwork(docStore.getState().doc, ui.path);
  const x = net.nodes.length ? Math.max(...net.nodes.map((n) => n.ui.x)) + 240 : 0;
  const y = net.nodes.length ? Math.min(...net.nodes.map((n) => n.ui.y)) : 0;
  let id = "";
  if (docStore.getState().edit(`Add ${CATALOG[type].label}`, (d) => void (id = addNode(d, net.id, type, { x, y })))) ui.selectNodes([id]);
}

const GROUPS: [Category, string][] = [
  ["layer", "Layers"],
  ["split", "Split"],
  ["animate", "Animate"],
  ["utility", "Utility"],
];

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="px-3 pb-1.5 pt-4 text-[13px] font-semibold">{children}</h2>;
}

export function Library() {
  const doc = useDocStore((s) => s.doc);
  const assets = doc.brand?.assets ?? [];
  return (
    <div className="min-h-0 overflow-y-auto px-1.5 pb-4 text-[13px]">
      {GROUPS.map(([cat, label]) => (
        <section key={cat} aria-label={label}>
          <Heading>{label}</Heading>
          <ul>
            {Object.entries(CATALOG)
              .filter(([, s]) => s.category === cat)
              .map(([type, s]) => (
                <li key={type}>
                  <button
                    type="button"
                    disabled={type === "Output"}
                    title={type === "Output" ? "Every network has one output" : `Add ${s.label} to the open network`}
                    onClick={() => add(type as NodeType)}
                    className="w-full rounded-md px-3 py-1.5 text-left text-foreground hover:bg-field focus-visible:bg-field disabled:text-muted-foreground disabled:hover:bg-transparent"
                  >
                    {s.label}
                  </button>
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

      <Heading>Examples</Heading>
      <ul>
        {([["Lower third", lowerThird], ["Lower third, fits any name", lowerThirdFit]] as [string, SceneDoc][]).map(([label, ex]) => (
          <li key={label}>
            <button
              type="button"
              title="Open this example (replaces the current doc and clears undo)"
              onClick={() => {
                if (!window.confirm(`Open "${label}"? This replaces the current doc and clears undo.`)) return;
                if (docStore.getState().load(ex)) useUi.getState().setPath([], 0);
              }}
              className="w-full px-3 py-1 text-left text-foreground hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              {label}
            </button>
          </li>
        ))}
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
