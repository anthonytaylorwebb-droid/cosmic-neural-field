import { useSystemSnapshot } from "../hooks/useSystemSnapshot";
import { computeInfluenceGraph } from "../lib/influenceGraph";
import { useAppStore } from "../store/useAppStore";

function formatBytes(bytes: number | null) {
  if (bytes == null || Number.isNaN(bytes)) return "n/a";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function cleanProcessName(command: string): string {
  const parts = command.split(".");
  let name = parts.length > 1 ? parts[parts.length - 1] : command;
  name = name.replace(/\s*\([^)]+\)\s*$/, "").trim();
  return name;
}

interface MetricBarProps {
  label: string;
  value: number | null;
  unit?: string;
  warn?: number;
  crit?: number;
}

function MetricBar({ label, value, unit = "%", warn = 70, crit = 90 }: MetricBarProps) {
  const pct = value ?? 0;
  const isCrit = pct >= crit;
  const isWarn = pct >= warn;
  const isModerate = pct >= warn * 0.6;

  const barColor = isCrit
    ? "bg-red-500"
    : isWarn
      ? "bg-orange-400"
      : isModerate
        ? "bg-amber-400"
        : "bg-sky-400";

  const textColor = isCrit
    ? "text-red-400"
    : isWarn
      ? "text-orange-400"
      : isModerate
        ? "text-amber-300"
        : "text-slate-200";

  return (
    <div className="mt-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</span>
        <span className={`font-mono text-[11px] tabular-nums ${textColor}`}>
          {value != null ? `${pct.toFixed(0)}${unit}` : "—"}
        </span>
      </div>
      <div className="mt-1 h-[2px] w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-500`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}

export function SystemOverlay() {
  const snapshot = useSystemSnapshot();
  const selectedSubsystemId = useAppStore((state) => state.selectedSubsystemId);

  if (!snapshot) return null;

  const influenceGraph = computeInfluenceGraph(snapshot);
  const selectedId = selectedSubsystemId ?? "system-core";
  const subsystemLabels: Record<string, string> = {
    "system-core": "System Core",
    cpu: "CPU",
    memory: "Memory",
    gpu: "GPU",
    thermal: "Thermal",
    battery: "Battery",
    disk: "Disk",
    network: "Network",
    processes: "Processes",
  };
  const relatedEdges = influenceGraph.edges
    .filter((edge) => edge.sourceId === selectedId || edge.targetId === selectedId)
    .sort((a, b) => b.weight - a.weight);
  const outgoing = relatedEdges
    .filter((edge) => edge.sourceId === selectedId)
    .slice(0, 3)
    .map((edge) => ({ label: subsystemLabels[edge.targetId] ?? edge.targetId, weight: edge.weight }));
  const incoming = relatedEdges
    .filter((edge) => edge.targetId === selectedId)
    .slice(0, 3)
    .map((edge) => ({ label: subsystemLabels[edge.sourceId] ?? edge.sourceId, weight: edge.weight }));
  const strongest = relatedEdges.slice(0, 4).map((edge) => ({
    label: `${subsystemLabels[edge.sourceId] ?? edge.sourceId} -> ${subsystemLabels[edge.targetId] ?? edge.targetId}`,
    weight: edge.weight,
  }));

  const thermalHot = snapshot.thermal.state === "elevated";
  const thermalBadge = thermalHot
    ? "bg-orange-500 shadow-[0_0_6px_2px_rgba(249,115,22,0.5)]"
    : "bg-emerald-500 shadow-[0_0_6px_2px_rgba(52,211,153,0.3)]";

  const battPct = snapshot.battery.percent ?? null;
  const battLow = battPct != null && battPct < 20 && !snapshot.battery.charging;
  const battColor = battLow ? "text-red-400" : snapshot.battery.charging ? "text-emerald-400" : "text-slate-400";

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none font-['Space_Grotesk',sans-serif]">
      <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-3 xl:inset-x-5 xl:top-5">
        <div className="w-[216px] rounded-[24px] border border-white/[0.08] bg-slate-950/68 px-4 py-3.5 shadow-[0_18px_45px_rgba(2,6,23,0.32)] backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.28em] text-slate-500">System Vitals</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.18em] text-emerald-300">Live</span>
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${thermalBadge}`}
                title={`Thermal: ${snapshot.thermal.state}`}
              />
            </div>
          </div>

          <MetricBar label="CPU" value={snapshot.cpu.percent} warn={75} crit={92} />
          <MetricBar label="Memory" value={snapshot.memory.percent} warn={80} crit={92} />
          <MetricBar label="Disk" value={snapshot.disk.usedPercent} warn={85} crit={95} />

          <div className="mt-3.5 rounded-2xl border border-white/[0.05] bg-white/[0.03] px-3 py-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="uppercase tracking-[0.18em] text-slate-500">Power</span>
              <span className={`font-mono ${battColor}`}>
                {battPct != null ? `${snapshot.battery.charging ? "⚡ " : ""}${battPct}%` : "AC"}
              </span>
            </div>
            <div className="mt-1 text-[10px] text-slate-500">
              {snapshot.battery.estimate ?? (snapshot.battery.charging ? "charging" : snapshot.battery.source)}
            </div>
          </div>
        </div>

        <div className="w-[274px] rounded-[24px] border border-white/[0.08] bg-slate-950/68 p-3.5 shadow-[0_18px_45px_rgba(2,6,23,0.32)] backdrop-blur-xl">
          <span className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Hardware & I/O</span>
          <div className="mt-3 grid gap-1.5">
            {[
              { label: "GPU", value: snapshot.gpu.model },
              { label: "GPU Cores", value: snapshot.gpu.cores != null ? String(snapshot.gpu.cores) : "n/a" },
              { label: "Load Avg", value: snapshot.cpu.loadAverage.slice(0, 2).map((v) => v.toFixed(2)).join(" / ") },
              { label: "Network In", value: `${formatBytes(snapshot.network.inPerSec)}/s` },
              { label: "Network Out", value: `${formatBytes(snapshot.network.outPerSec)}/s` },
              { label: "Disk I/O", value: `${formatBytes(snapshot.disk.readPerSec + snapshot.disk.writePerSec)}/s` },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-2xl border border-white/[0.05] bg-white/[0.03] px-3 py-2 text-[11px]">
                <span className="uppercase tracking-[0.16em] text-slate-500">{item.label}</span>
                <span className="font-mono text-slate-200">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 left-4 max-w-[260px] rounded-[22px] border border-white/[0.08] bg-slate-950/64 px-3.5 py-3 shadow-[0_18px_45px_rgba(2,6,23,0.28)] backdrop-blur-xl xl:bottom-5 xl:left-5">
        <p className="text-[10px] uppercase tracking-[0.26em] text-slate-500">Legend</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-slate-300">
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-sky-400" /> nominal</span>
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-400" /> busy</span>
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-orange-500" /> hot</span>
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-red-500" /> critical</span>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">Keyboard: `P` pause, `R` reset, `N` reseed</p>
      </div>

      <div className="absolute left-4 top-[264px] w-[216px] rounded-[24px] border border-white/[0.08] bg-slate-950/68 px-4 py-3.5 shadow-[0_18px_45px_rgba(2,6,23,0.32)] backdrop-blur-xl xl:left-5 xl:top-[278px]">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Influence</span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-sky-300">{subsystemLabels[selectedId] ?? selectedId}</span>
        </div>

        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Drawing From</p>
          <div className="mt-1.5 space-y-1.5">
            {incoming.length > 0 ? incoming.map((edge) => (
              <div key={`in-${edge.label}`} className="rounded-2xl border border-white/[0.05] bg-white/[0.03] px-3 py-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300">{edge.label}</span>
                  <span className="font-mono text-slate-400">{Math.round(edge.weight * 100)}%</span>
                </div>
              </div>
            )) : <p className="text-[11px] text-slate-500">No major incoming paths.</p>}
          </div>
        </div>

        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Feeding Into</p>
          <div className="mt-1.5 space-y-1.5">
            {outgoing.length > 0 ? outgoing.map((edge) => (
              <div key={`out-${edge.label}`} className="rounded-2xl border border-white/[0.05] bg-white/[0.03] px-3 py-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300">{edge.label}</span>
                  <span className="font-mono text-slate-400">{Math.round(edge.weight * 100)}%</span>
                </div>
              </div>
            )) : <p className="text-[11px] text-slate-500">No major outgoing paths.</p>}
          </div>
        </div>

        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Strongest Paths</p>
          <div className="mt-1.5 space-y-1.5">
            {strongest.map((edge) => (
              <div key={edge.label} className="flex items-center justify-between text-[10px] text-slate-400">
                <span className="truncate pr-3 text-slate-500">{edge.label}</span>
                <span className="font-mono text-slate-300">{Math.round(edge.weight * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 right-4 w-[286px] rounded-[24px] border border-white/[0.08] bg-slate-950/68 p-3.5 shadow-[0_18px_45px_rgba(2,6,23,0.32)] backdrop-blur-xl xl:bottom-5 xl:right-5">
        <span className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Top Processes</span>
        <div className="mt-3 space-y-2">
          {snapshot.processes.slice(0, 4).map((proc) => {
            const cpuHigh = proc.cpu > 25;
            const cpuMed = proc.cpu > 8;
            const cpuColor = cpuHigh ? "text-orange-400" : cpuMed ? "text-amber-400" : "text-slate-400";
            const barColor = cpuHigh ? "bg-orange-400" : cpuMed ? "bg-amber-400" : "bg-slate-600";
            const name = cleanProcessName(proc.command).slice(0, 18);
            return (
              <div key={proc.pid} className="rounded-2xl border border-white/[0.05] bg-white/[0.03] px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] text-slate-300">{name}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">mem {proc.mem}</p>
                    <div className="mt-1.5 h-[3px] w-full rounded-full bg-white/[0.06]">
                      <div
                        className={`h-full rounded-full ${barColor} transition-all duration-500`}
                        style={{ width: `${Math.min(100, proc.cpu * 2)}%` }}
                      />
                    </div>
                  </div>
                  <span className={`shrink-0 font-mono text-[11px] tabular-nums ${cpuColor}`}>
                    {proc.cpu.toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
