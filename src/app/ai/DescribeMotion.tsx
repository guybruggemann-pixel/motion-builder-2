/** "Describe the motion": a sentence in, editable keys out (one undo step). */
import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { Network, Node } from "@core/scene";
import { Button } from "@/app/design-system/motionbuilder---brandbook-c4b4eb";
import { docStore } from "@/app/store";
import { describeMotion } from "@/lib/ai/motion.functions";
import { applyTracks, checkProposal, motionContext, Proposal } from "./motionAi";

type State = { kind: "idle" } | { kind: "busy" } | { kind: "done"; text: string } | { kind: "error"; text: string };

export function DescribeMotion({ net, node, fps, span }: { net: Network; node: Node; fps: number; span: [number, number] }) {
  const [prompt, setPrompt] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const run = async () => {
    const ctx = motionContext(net, node, fps, span);
    if (!ctx.params.length) return setState({ kind: "error", text: "This layer has nothing that can be keyed." });
    setState({ kind: "busy" });
    try {
      const res = await describeMotion({ data: { prompt, context: ctx } });
      if (!res.ok) return setState({ kind: "error", text: res.error });
      let raw: unknown;
      try {
        raw = JSON.parse(res.json);
      } catch {
        raw = undefined;
      }
      const parsed = Proposal.safeParse(raw);
      if (!parsed.success) return setState({ kind: "error", text: "The answer wasn't usable. Try again." });
      const { tracks, skipped } = checkProposal(parsed.data, ctx);
      if (!tracks.length) return setState({ kind: "error", text: "No usable keys came back. Try describing it differently." });
      const ok = docStore.getState().edit(`AI motion · ${node.name}`, (d) => applyTracks(d, net.id, node.id, tracks));
      if (ok === false) return setState({ kind: "error", text: "Those keys didn't fit this layer." });
      const n = tracks.reduce((s, t) => s + t.keys.length, 0);
      setState({ kind: "done", text: `${parsed.data.summary} ${n} keys on ${tracks.map((t) => t.param).join(", ")}${skipped.length ? ` (skipped ${skipped.join(", ")})` : ""}. Undo with ⌘Z.` });
    } catch {
      setState({ kind: "error", text: "Couldn't reach the AI. Check your connection and try again." });
    }
  };
  return (
    <div className="grid gap-1.5 rounded-md bg-field p-2.5">
      <label htmlFor="describe-motion" className="flex items-center gap-1.5 text-[11px] font-medium">
        <Sparkles className="size-3.5" aria-hidden /> Describe the motion
      </label>
      <textarea
        id="describe-motion"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation(); // keep editor shortcuts (space, J, K) out of the text
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && prompt.trim()) void run();
        }}
        rows={2}
        placeholder="e.g. slides in from the left with a soft overshoot, then gently fades out"
        className="min-h-[52px] resize-y rounded-[8px] bg-card px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ink"
      />
      <Button size="sm" disabled={!prompt.trim() || state.kind === "busy"} onClick={() => void run()}>
        {state.kind === "busy" ? "Writing keys…" : "Generate keys"}
      </Button>
      {(state.kind === "done" || state.kind === "error") && (
        <p role="status" className={state.kind === "error" ? "text-[11px] text-destructive" : "text-[11px] text-muted-foreground"}>
          {state.text}
        </p>
      )}
    </div>
  );
}
