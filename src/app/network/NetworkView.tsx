/**
 * Network view: the shown network as a node graph (@xyflow/react), driven entirely by the doc.
 * Drag nodes, draw wires from an output to an input, Delete removes nodes or wires, double-click a
 * Subnet to dive in (the breadcrumb goes back up). Every change is a doc edit with undo.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type NodeProps,
  type Node as FlowNode,
} from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import { Layers } from "lucide-react";
import { CATALOG, isNodeType, type Category, type Node } from "@core/scene";
import { NodeCard } from "@/design-system/motionbuilder---brandbook-c4b4eb";
import { cn } from "@/design-system/motionbuilder---brandbook-c4b4eb/lib/utils";
import { docStore, shownNetwork, useDocStore, useUi } from "@/store";
import { openSubnet } from "@/store/navigation";
import { connect, deleteNodes, disconnect, moveNodes } from "./edits";

const CATEGORY: Record<Category, "generator" | "cloner" | "effector" | "field" | "math"> = {
  layer: "generator",
  split: "cloner",
  animate: "effector",
  field: "field",
  utility: "math",
};

type CardData = { node: Node; isOutput: boolean; summary: string };

/** One-line summary under the title: what the node is set to, in the designer's terms. */
function summary(n: Node): string {
  const v = (k: string) => n.params[k]?.value;
  switch (n.type) {
    case "Text":
      return `“${String(v("text") ?? "Text").split("\n")[0]!.slice(0, 22)}”`;
    case "Shape":
      return String(v("shape") ?? "rect");
    case "Split":
      return `by ${String(v("by") ?? "words")}`;
    case "Phase":
      return `${String(v("mode") ?? "in")} · ${String(v("ease") ?? "outExpo")} · ${v("duration") ?? 0.6}s`;
    default:
      return n.timing ? `${n.timing.in}–${n.timing.out}s` : "";
  }
}

function CardNode({ data, selected }: NodeProps<FlowNode<CardData>>) {
  const { node, isOutput } = data;
  const spec = isNodeType(node.type) ? CATALOG[node.type] : undefined;
  return (
    <NodeCard
      title={node.name}
      nodeId={spec?.label ?? node.type}
      icon={node.subnet ? <Layers /> : undefined}
      category={CATEGORY[spec?.category ?? "utility"]}
      state={!node.enabled ? "bypassed" : selected ? "selected" : "idle"}
      className={cn("w-48", isOutput && "ring-1 ring-primary/40")}
    >
      {(spec?.inputs ?? 0) > 0 && <Handle type="target" position={Position.Left} className="!size-2.5 !rotate-45 !rounded-none !border !border-wire !bg-background" />}
      <div className="px-2.5 font-mono text-[11px] text-muted-foreground">{data.summary || (isOutput ? "network output" : " ")}</div>
      {!isOutput && <Handle type="source" position={Position.Right} className="!size-2.5 !rotate-45 !rounded-none !border !border-wire !bg-background" />}
    </NodeCard>
  );
}

const nodeTypes = { card: CardNode };

function Graph() {
  const doc = useDocStore((s) => s.doc);
  const path = useUi((s) => s.path);
  const selected = useUi((s) => s.selectedNodes);
  const net = shownNetwork(doc, path);
  const flow = useReactFlow();
  const dragKey = useRef<string | undefined>(undefined);

  // xyflow's controlled pattern: a local node list that takes xyflow's own changes (measured
  // sizes, drag positions) and is re-synced from the doc on every edit, keeping what xyflow measured.
  // Rebuilding nodes without their sizes would hide the wires until re-measured.
  const [nodes, setNodes] = useState<FlowNode<CardData>[]>([]);
  useEffect(() => {
    setNodes((prev) => {
      const old = new Map(prev.map((n) => [n.id, n]));
      return net.nodes.map((n) => ({
        ...old.get(n.id),
        id: n.id,
        type: "card",
        position: { x: n.ui.x, y: n.ui.y },
        selected: selected.includes(n.id),
        deletable: n.id !== net.output,
        data: { node: n, isOutput: n.id === net.output, summary: summary(n) },
      }));
    });
  }, [net, selected]);
  const edges = useMemo<Edge[]>(
    () =>
      net.wires.map((w, i) => ({
        id: `${w.from.node}>${w.to.node}#${i}`,
        source: w.from.node,
        target: w.to.node,
        type: "default",
        className: "[&_path]:!stroke-wire [&.selected_path]:!stroke-primary",
      })),
    [net],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode<CardData>>[]) => {
      setNodes((ns) => applyNodeChanges(changes.filter((c) => c.type !== "select" && c.type !== "remove"), ns));
      const moves = changes.flatMap((c) => (c.type === "position" && c.position ? [{ id: c.id, ...c.position, dragging: c.dragging }] : []));
      if (moves.length) {
        dragKey.current ??= `move-${Date.now()}`;
        docStore.getState().edit("Move nodes", (d) => moveNodes(d, net.id, moves), { coalesce: dragKey.current });
        if (moves.every((m) => m.dragging === false)) {
          docStore.getState().commit();
          dragKey.current = undefined;
        }
      }
      const sel = changes.filter((c) => c.type === "select");
      if (sel.length) {
        const cur = new Set(useUi.getState().selectedNodes);
        for (const c of sel) if (c.type === "select") (c.selected ? cur.add(c.id) : cur.delete(c.id));
        useUi.getState().selectNodes([...cur]);
      }
    },
    [net.id],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const gone = changes.flatMap((c) => (c.type === "remove" ? [c.id] : []));
      if (!gone.length) return;
      const wires = gone.map((id) => ({ from: id.split(">")[0]!, to: id.split(">")[1]!.split("#")[0]! }));
      docStore.getState().edit(gone.length > 1 ? "Delete wires" : "Delete wire", (d) => disconnect(d, net.id, wires));
    },
    [net.id],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) docStore.getState().edit("Connect", (d) => connect(d, net.id, c.source, c.target));
    },
    [net.id],
  );

  const onNodesDelete = useCallback(
    (gone: FlowNode[]) => {
      docStore.getState().edit(gone.length > 1 ? "Delete nodes" : "Delete node", (d) => void deleteNodes(d, net.id, gone.map((n) => n.id)));
      useUi.getState().selectNodes([]);
    },
    [net.id],
  );

  return (
    <ReactFlow
      key={net.id}
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      colorMode="dark"
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodesDelete={onNodesDelete}
      onNodeDoubleClick={(_, n) => n.data.node.subnet && openSubnet(n.data.node)}
      onPaneClick={() => useUi.getState().selectNodes([])}
      deleteKeyCode={["Delete", "Backspace"]}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      className="bg-background"
      onInit={() => flow.fitView({ padding: 0.25 })}
    >
      <Background variant={BackgroundVariant.Lines} gap={24} color="var(--grid)" />
      <Controls showInteractive={false} className="[&_button]:!border-border [&_button]:!bg-surface [&_button]:!fill-foreground" />
    </ReactFlow>
  );
}

export function NetworkView() {
  return (
    <ReactFlowProvider>
      <div className="h-full w-full" data-network-view>
        <Graph />
      </div>
    </ReactFlowProvider>
  );
}
