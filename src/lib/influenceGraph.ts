import type { SystemSnapshot } from "../types/system-monitor";

export interface InfluenceEdge {
  sourceId: string;
  targetId: string;
  weight: number;
}

export const resourceConnections = [
  ["system-core", "cpu"],
  ["system-core", "memory"],
  ["system-core", "gpu"],
  ["system-core", "thermal"],
  ["system-core", "battery"],
  ["system-core", "disk"],
  ["system-core", "network"],
  ["system-core", "processes"],
  ["cpu", "thermal"],
  ["gpu", "thermal"],
  ["cpu", "processes"],
  ["memory", "processes"],
  ["disk", "processes"],
  ["network", "processes"],
  ["disk", "memory"],
  ["disk", "network"],
  ["battery", "cpu"],
  ["battery", "gpu"],
] as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function edgeKey(a: string, b: string) {
  return `${a}->${b}`;
}

export function computeInfluenceGraph(metrics: SystemSnapshot | null) {
  const weights = new Map<string, number>();

  const add = (sourceId: string, targetId: string, weight: number) => {
    const normalized = clamp(weight, 0, 1);
    if (normalized <= 0.03) return;
    weights.set(edgeKey(sourceId, targetId), normalized);
  };

  if (!metrics) {
    for (const [sourceId, targetId] of resourceConnections) {
      add(sourceId, targetId, 0.18);
    }
  } else {
    const cpu = clamp(metrics.cpu.percent / 100, 0, 1);
    const memory = clamp(metrics.memory.percent / 100, 0, 1);
    const diskIo = clamp((metrics.disk.readPerSec + metrics.disk.writePerSec) / (36 * 1024 * 1024), 0, 1);
    const networkIo = clamp((metrics.network.inPerSec + metrics.network.outPerSec) / (3 * 1024 * 1024), 0, 1);
    const processCpu = clamp(metrics.processes.slice(0, 8).reduce((sum, process) => sum + process.cpu, 0) / 100, 0, 1);
    const processMemory = clamp(metrics.processes.slice(0, 8).reduce((sum, process) => sum + process.memPercent, 0) / 100, 0, 1);
    const gpu = clamp(((metrics.gpu.cores ?? 0) / 12) * 0.55 + cpu * 0.35, 0, 1);
    const thermal = metrics.thermal.state === "elevated" ? 1 : metrics.thermal.state === "nominal" ? 0.34 : 0.52;
    const battery = clamp((metrics.battery.percent ?? 55) / 100, 0, 1);
    const discharge = metrics.battery.charging ? 0.16 : 1 - battery;

    add("system-core", "cpu", 0.3 + cpu * 0.7);
    add("system-core", "memory", 0.28 + memory * 0.68);
    add("system-core", "gpu", 0.2 + gpu * 0.72);
    add("system-core", "thermal", 0.18 + thermal * 0.82);
    add("system-core", "battery", 0.12 + discharge * 0.7);
    add("system-core", "disk", 0.18 + diskIo * 0.64);
    add("system-core", "network", 0.18 + networkIo * 0.7);
    add("system-core", "processes", 0.26 + Math.max(processCpu, processMemory) * 0.72);

    add("cpu", "memory", cpu * 0.38 + memory * 0.24);
    add("cpu", "thermal", cpu * 0.72 + thermal * 0.22);
    add("gpu", "thermal", gpu * 0.66 + thermal * 0.28);
    add("cpu", "processes", processCpu * 0.72 + cpu * 0.24);
    add("memory", "processes", processMemory * 0.72 + memory * 0.2);
    add("disk", "processes", diskIo * 0.64 + processMemory * 0.12);
    add("network", "processes", networkIo * 0.72 + processCpu * 0.12);
    add("disk", "memory", diskIo * 0.34 + memory * 0.18);
    add("disk", "network", diskIo * 0.3 + networkIo * 0.46);
    add("battery", "cpu", discharge * 0.3 + cpu * 0.18);
    add("battery", "gpu", discharge * 0.24 + gpu * 0.16);
  }

  const edges: InfluenceEdge[] = [];
  for (const [sourceId, targetId] of resourceConnections) {
    const weight = weights.get(edgeKey(sourceId, targetId));
    if (weight != null) {
      edges.push({ sourceId, targetId, weight });
    }
  }

  return {
    edges,
    edgeWeights: new Map(edges.map((edge) => [edgeKey(edge.sourceId, edge.targetId), edge.weight])),
  };
}
