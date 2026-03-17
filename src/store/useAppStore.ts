import { create } from "zustand";

export interface GraphNode {
  id: string;
  label: string;
  group: "core" | "memory" | "tool" | "agent" | "signal";
  x: number;
  y: number;
  size: number;
  intensity: number;
  detail: string;
}

export interface GraphLink {
  id: string;
  source: string;
  target: string;
  weight: number;
}

interface CursorPoint {
  x: number;
  y: number;
}

interface Viewport {
  x: number;
  y: number;
  scale: number;
}

interface AppState {
  nodes: GraphNode[];
  links: GraphLink[];
  hoveredNodeId: string | null;
  selectedNodeId: string | null;
  selectedSubsystemId: string | null;
  cursor: CursorPoint;
  viewport: Viewport;
  setHoveredNode: (nodeId: string | null) => void;
  setSelectedNode: (nodeId: string | null) => void;
  setSelectedSubsystem: (nodeId: string | null) => void;
  moveNode: (nodeId: string, x: number, y: number) => void;
  setCursor: (x: number, y: number) => void;
  panViewport: (dx: number, dy: number) => void;
  zoomViewport: (delta: number) => void;
  resetView: () => void;
}

const initialNodes: GraphNode[] = [
  {
    id: "orchestrator",
    label: "Orchestrator",
    group: "core",
    x: 0,
    y: 0,
    size: 24,
    intensity: 1,
    detail: "Primary routing hub coordinating memory, tools, and live inference.",
  },
  {
    id: "memory-cluster",
    label: "Memory Cluster",
    group: "memory",
    x: -260,
    y: -90,
    size: 18,
    intensity: 0.9,
    detail: "Semantic recall field with long-term retrieval threads.",
  },
  {
    id: "identity-mesh",
    label: "Identity Mesh",
    group: "memory",
    x: -320,
    y: 140,
    size: 14,
    intensity: 0.7,
    detail: "Preferences, profile fragments, and operator intent anchors.",
  },
  {
    id: "tool-router",
    label: "Tool Router",
    group: "tool",
    x: 250,
    y: -60,
    size: 17,
    intensity: 0.8,
    detail: "Dispatch node for local tools, commands, and execution surfaces.",
  },
  {
    id: "agent-swarm",
    label: "Agent Swarm",
    group: "agent",
    x: 325,
    y: 155,
    size: 20,
    intensity: 0.95,
    detail: "Delegated task threads with dynamic coordination paths.",
  },
  {
    id: "signal-01",
    label: "Signal 01",
    group: "signal",
    x: 115,
    y: -220,
    size: 10,
    intensity: 0.45,
    detail: "Live telemetry pulse.",
  },
  {
    id: "signal-02",
    label: "Signal 02",
    group: "signal",
    x: -110,
    y: -235,
    size: 11,
    intensity: 0.5,
    detail: "Ambient recall pulse.",
  },
  {
    id: "signal-03",
    label: "Signal 03",
    group: "signal",
    x: 80,
    y: 245,
    size: 12,
    intensity: 0.55,
    detail: "Execution readiness pulse.",
  },
  {
    id: "local-runtime",
    label: "Local Runtime",
    group: "tool",
    x: 430,
    y: -180,
    size: 12,
    intensity: 0.6,
    detail: "Sandbox and device-level execution path.",
  },
  {
    id: "archive",
    label: "Archive",
    group: "memory",
    x: -450,
    y: -210,
    size: 12,
    intensity: 0.65,
    detail: "Cold storage memory branch with compressed snapshots.",
  },
  {
    id: "planner",
    label: "Planner",
    group: "agent",
    x: 195,
    y: 55,
    size: 13,
    intensity: 0.72,
    detail: "Breaks large intent into execution-friendly micro-routes.",
  },
  {
    id: "monitor",
    label: "Monitor",
    group: "signal",
    x: -30,
    y: 335,
    size: 10,
    intensity: 0.4,
    detail: "Stability watcher observing activity across the graph.",
  },
];

const initialLinkTuples: Array<[string, string, number]> = [
  ["orchestrator", "memory-cluster", 1],
  ["orchestrator", "identity-mesh", 0.7],
  ["orchestrator", "tool-router", 0.9],
  ["orchestrator", "agent-swarm", 1],
  ["orchestrator", "signal-01", 0.4],
  ["orchestrator", "signal-02", 0.4],
  ["orchestrator", "signal-03", 0.45],
  ["memory-cluster", "archive", 0.5],
  ["memory-cluster", "identity-mesh", 0.55],
  ["tool-router", "local-runtime", 0.65],
  ["tool-router", "planner", 0.5],
  ["planner", "agent-swarm", 0.75],
  ["agent-swarm", "signal-03", 0.35],
  ["agent-swarm", "monitor", 0.35],
  ["identity-mesh", "monitor", 0.25],
  ["signal-02", "archive", 0.2],
];

const initialLinks: GraphLink[] = initialLinkTuples.map(([source, target, weight], index) => ({
  id: `link-${index}`,
  source,
  target,
  weight,
}));

const defaultViewport: Viewport = {
  x: 0,
  y: 0,
  scale: 1,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const useAppStore = create<AppState>((set) => ({
  nodes: initialNodes,
  links: initialLinks,
  hoveredNodeId: null,
  selectedNodeId: "orchestrator",
  selectedSubsystemId: "system-core",
  cursor: { x: 0, y: 0 },
  viewport: defaultViewport,
  setHoveredNode: (nodeId) => set({ hoveredNodeId: nodeId }),
  setSelectedNode: (nodeId) => set({ selectedNodeId: nodeId }),
  setSelectedSubsystem: (nodeId) => set({ selectedSubsystemId: nodeId }),
  moveNode: (nodeId, x, y) =>
    set((state) => ({
      nodes: state.nodes.map((node) => (node.id === nodeId ? { ...node, x, y } : node)),
    })),
  setCursor: (x, y) => set({ cursor: { x, y } }),
  panViewport: (dx, dy) =>
    set((state) => ({
      viewport: {
        ...state.viewport,
        x: state.viewport.x + dx,
        y: state.viewport.y + dy,
      },
    })),
  zoomViewport: (delta) =>
    set((state) => ({
      viewport: {
        ...state.viewport,
        scale: clamp(state.viewport.scale + delta, 0.68, 1.75),
      },
    })),
  resetView: () => set({ viewport: defaultViewport }),
}));
