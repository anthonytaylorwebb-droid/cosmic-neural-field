import { useEffect, useMemo, useRef } from "react";
import { useAnimationLoop } from "../hooks/useAnimationLoop";
import { useInteraction } from "../hooks/useInteraction";
import { useSystemSnapshot } from "../hooks/useSystemSnapshot";
import { computeInfluenceGraph, edgeKey, resourceConnections } from "../lib/influenceGraph";
import { useAppStore } from "../store/useAppStore";
import type { SystemSnapshot } from "../types/system-monitor";

type Group = "core" | "compute" | "memory" | "io" | "thermal" | "power" | "processes";

interface AnchorConfig {
  id: string;
  label: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  group: Group;
}

interface AnchorState extends AnchorConfig {
  homeX: number;
  homeY: number;
}

interface ClusterParticle {
  anchorId: string;
  angle: number;
  orbitRadius: number;
  speed: number;
  size: number;
  alpha: number;
  wobble: number;
  wobbleSpeed: number;
}

interface AmbientParticle {
  x: number;
  y: number;
  depth: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
}

interface StreamParticle {
  sourceId: string;
  targetId: string;
  t: number;
  speed: number;
  size: number;
  alpha: number;
}

interface PulseParticle {
  anchorId: string;
  radius: number;
  speed: number;
  alpha: number;
}

interface TrailParticle {
  x: number;
  y: number;
  color: string;
  size: number;
  alpha: number;
  life: number;
  decay: number;
}

interface RenderAnchor extends AnchorState {
  energy: number;
  heatColor: string;
  fieldRadius: number;
}

const anchors: AnchorConfig[] = [
  { id: "system-core", label: "System Core", x: 0, y: 0, radius: 44, color: "#e0f9ff", group: "core" },
  { id: "cpu", label: "CPU", x: -310, y: -165, radius: 34, color: "#00d4ff", group: "compute" },
  { id: "memory", label: "Memory", x: -355, y: 145, radius: 36, color: "#aa44ff", group: "memory" },
  { id: "gpu", label: "GPU", x: 300, y: -170, radius: 34, color: "#9933ff", group: "compute" },
  { id: "thermal", label: "Thermal", x: 348, y: 138, radius: 30, color: "#ff2222", group: "thermal" },
  { id: "battery", label: "Battery", x: -30, y: 315, radius: 28, color: "#00ff88", group: "power" },
  { id: "disk", label: "Disk", x: 140, y: 255, radius: 28, color: "#ffcc00", group: "io" },
  { id: "network", label: "Network", x: 445, y: -10, radius: 28, color: "#0099ff", group: "io" },
  { id: "processes", label: "Processes", x: -452, y: -240, radius: 30, color: "#8ab8d4", group: "processes" },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

function hexToRgb(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function rgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function blendColor(hex: string, target: [number, number, number], t: number) {
  const { r, g, b } = hexToRgb(hex);
  const nr = Math.round(lerp(r, target[0], t));
  const ng = Math.round(lerp(g, target[1], t));
  const nb = Math.round(lerp(b, target[2], t));
  return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
}

function formatProcessName(command: string) {
  const tail = command.split("/").pop() ?? command;
  return tail.split(".").pop() ?? tail;
}

function metricEnergy(id: string, metrics: SystemSnapshot | null) {
  if (!metrics) return 0.25;

  switch (id) {
    case "system-core":
      return clamp((metrics.cpu.percent * 0.45 + metrics.memory.percent * 0.35 + ((metrics.network.inPerSec + metrics.network.outPerSec) / (1024 * 1024)) * 10) / 100, 0.2, 1);
    case "cpu":
      return clamp(metrics.cpu.percent / 100, 0.12, 1);
    case "memory":
      return clamp(metrics.memory.percent / 100, 0.12, 1);
    case "gpu":
      return clamp(((metrics.gpu.cores ?? 0) / 12) * 0.5 + metrics.cpu.percent / 250, 0.18, 0.95);
    case "thermal":
      return metrics.thermal.state === "elevated" ? 0.96 : metrics.thermal.state === "nominal" ? 0.34 : 0.52;
    case "battery":
      return clamp(metrics.battery.charging ? 0.2 : 1 - (metrics.battery.percent ?? 55) / 100, 0.12, 1);
    case "disk":
      return clamp(((metrics.disk.usedPercent ?? 35) / 100) * 0.55 + Math.min(0.45, (metrics.disk.readPerSec + metrics.disk.writePerSec) / (55 * 1024 * 1024)), 0.12, 1);
    case "network":
      return clamp((metrics.network.inPerSec + metrics.network.outPerSec) / (4 * 1024 * 1024), 0.12, 1);
    case "processes":
      return clamp(metrics.processes.slice(0, 8).reduce((sum, process) => sum + process.cpu, 0) / 120, 0.14, 1);
    default:
      return 0.2;
  }
}

function metricSignature(id: string, energy: number, metrics: SystemSnapshot | null) {
  switch (id) {
    case "cpu":
      return {
        agitation: 1.6 + energy * 1.4,
        swirl: 1.55,
        fog: 0.16 + energy * 0.22,
        branch: 1.2 + energy * 0.55,
        stream: 1.15 + energy * 1.2,
      };
    case "memory":
      return {
        agitation: 0.74 + energy * 0.45,
        swirl: 0.72,
        fog: 0.22 + energy * 0.18,
        branch: 0.9 + energy * 0.25,
        stream: 0.84 + energy * 0.55,
      };
    case "gpu":
      return {
        agitation: 1.3 + energy * 1.1,
        swirl: 1.9,
        fog: 0.18 + energy * 0.2,
        branch: 1.12 + energy * 0.42,
        stream: 1.05 + energy * 1.05,
      };
    case "thermal":
      return {
        agitation: 1.2 + energy * 1.3,
        swirl: 0.94,
        fog: 0.2 + energy * 0.28,
        branch: 1.3 + energy * 0.72,
        stream: 0.95 + energy * 0.8,
      };
    case "network":
      return {
        agitation: 0.95 + energy * 0.62,
        swirl: 1.24,
        fog: 0.1 + energy * 0.14,
        branch: 1.16 + energy * 0.75,
        stream: 1.3 + energy * 1.35,
      };
    case "disk":
      return {
        agitation: 0.9 + energy * 0.58,
        swirl: 1.05,
        fog: 0.12 + energy * 0.12,
        branch: 0.98 + energy * 0.35,
        stream: 0.92 + energy * 0.72,
      };
    case "battery":
      return {
        agitation: 0.7 + energy * 0.4,
        swirl: metrics?.battery.charging ? 1.32 : 0.82,
        fog: 0.14 + energy * 0.12,
        branch: 0.86 + energy * 0.2,
        stream: metrics?.battery.charging ? 1.12 : 0.8,
      };
    case "processes":
      return {
        agitation: 1.05 + energy * 0.88,
        swirl: 1.12,
        fog: 0.16 + energy * 0.16,
        branch: 1.08 + energy * 0.4,
        stream: 1.0 + energy * 0.82,
      };
    default:
      return {
        agitation: 1 + energy * 0.7,
        swirl: 1,
        fog: 0.14 + energy * 0.14,
        branch: 1 + energy * 0.3,
        stream: 1 + energy * 0.8,
      };
  }
}

function createFieldRadius(anchor: AnchorConfig, energy: number) {
  return anchor.radius * (2.2 + energy * 1.9);
}

function quadraticPoint(
  a: { x: number; y: number },
  b: { x: number; y: number },
  curve: number,
  t: number,
) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length;
  const ny = dx / length;
  const cx = mx + nx * curve;
  const cy = my + ny * curve;

  return {
    x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * cx + t * t * b.x,
    y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * cy + t * t * b.y,
    cx,
    cy,
  };
}

function drawLabelPill(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, active: boolean) {
  ctx.save();
  ctx.font = active ? "600 12px 'Space Grotesk', sans-serif" : "500 11px 'Space Grotesk', sans-serif";
  const width = ctx.measureText(text).width + 18;
  const height = active ? 25 : 22;
  const radius = 11;
  ctx.fillStyle = active ? "rgba(2,6,23,0.82)" : "rgba(15,23,42,0.62)";
  ctx.strokeStyle = active ? "rgba(226,232,240,0.26)" : "rgba(148,163,184,0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = active ? "rgba(248,250,252,0.98)" : "rgba(203,213,225,0.88)";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 9, y + height / 2 + 0.5);
  ctx.restore();
}

function getLabelOffset(x: number, y: number) {
  const horizontal = x >= 0 ? -1 : 1;
  const vertical = y >= 0 ? -1 : 1;
  return {
    x: horizontal,
    y: vertical,
  };
}

export function NeuralFieldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glowCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const selectedSubsystemRef = useRef<string>("system-core");
  const anchorsRef = useRef<AnchorState[]>(
    anchors.map((anchor) => ({
      ...anchor,
      homeX: anchor.x,
      homeY: anchor.y,
    })),
  );
  const metrics = useSystemSnapshot();
  const setSelectedSubsystem = useAppStore((state) => state.setSelectedSubsystem);
  const simulationRef = useRef<{
    time: number;
    ambient: AmbientParticle[];
    clusters: ClusterParticle[];
    streams: StreamParticle[];
    pulses: PulseParticle[];
    trails: TrailParticle[];
  }>({
    time: 0,
    ambient: [],
    clusters: [],
    streams: [],
    pulses: [],
    trails: [],
  });

  const { interactionRef } = useInteraction(canvasRef, anchorsRef);

  const connectionPairs = useMemo(
    () => resourceConnections.map(([sourceId, targetId]) => ({ sourceId, targetId })),
    [],
  );

  const initializeSimulation = (width: number, height: number) => {
    const worldWidth = Math.max(1400, width * 1.4);
    const worldHeight = Math.max(980, height * 1.35);
    const ambientCount = Math.min(420, Math.max(180, Math.round((width * height) / 5200)));

    simulationRef.current.time = 0;
    simulationRef.current.ambient = Array.from({ length: ambientCount }, (_, index) => ({
      x: ((index * 103) % worldWidth) - worldWidth / 2,
      y: ((index * 79) % worldHeight) - worldHeight / 2,
      depth: 0.28 + (index % 8) * 0.08,
      vx: (((index * 17) % 11) - 5) * 0.0022,
      vy: (((index * 29) % 13) - 6) * 0.0022,
      size: 0.7 + (index % 5) * 0.52,
      alpha: 0.06 + (index % 7) * 0.028,
    }));

    simulationRef.current.clusters = anchors.flatMap((anchor, anchorIndex) => {
      const count = anchor.id === "system-core" ? 320 : anchor.id === "processes" ? 220 : 165;
      return Array.from({ length: count }, (_, particleIndex) => ({
        anchorId: anchor.id,
        angle: (Math.PI * 2 * particleIndex) / count,
        orbitRadius: anchor.radius * (0.6 + ((particleIndex * 17) % 100) / 42),
        speed: 0.12 + ((particleIndex + anchorIndex * 11) % 13) * 0.024,
        size: 0.8 + ((particleIndex + anchorIndex) % 4) * 0.42,
        alpha: 0.18 + ((particleIndex + anchorIndex) % 5) * 0.055,
        wobble: 0.8 + ((particleIndex * 13) % 9) * 0.48,
        wobbleSpeed: 0.7 + ((particleIndex + anchorIndex) % 7) * 0.12,
      }));
    });

    simulationRef.current.streams = connectionPairs.flatMap(({ sourceId, targetId }, pairIndex) =>
      Array.from({ length: 28 }, (_, streamIndex) => ({
        sourceId,
        targetId,
        t: (streamIndex / 28 + pairIndex * 0.083) % 1,
        speed: 0.05 + (streamIndex % 5) * 0.012,
        size: 1.2 + (streamIndex % 3) * 0.6,
        alpha: 0.12 + (streamIndex % 4) * 0.035,
      })),
    );

    simulationRef.current.pulses = anchors.map((anchor, index) => ({
      anchorId: anchor.id,
      radius: anchor.radius * 1.25,
      speed: 12 + (index % 5) * 2.4,
      alpha: 0.2,
    }));
    simulationRef.current.trails = [];
  };

  useEffect(() => {
    initializeSimulation(window.innerWidth, window.innerHeight);
  }, []);

  useEffect(() => {
    setSelectedSubsystem("system-core");
    selectedSubsystemRef.current = "system-core";
  }, [setSelectedSubsystem]);

  useAnimationLoop((deltaMs) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const glowCanvas = glowCanvasRef.current ?? document.createElement("canvas");
    glowCanvasRef.current = glowCanvas;
    const glowCtx = glowCanvas.getContext("2d");
    if (!ctx || !glowCtx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      glowCanvas.width = width * dpr;
      glowCanvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      glowCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initializeSimulation(width, height);
    }

    const interaction = interactionRef.current;
    const simulation = simulationRef.current;
    const camera = interaction.camera;

    if (interaction.command.resetAt) {
      interaction.command.resetAt = 0;
      camera.x = 0;
      camera.y = 0;
      camera.targetX = 0;
      camera.targetY = 0;
      camera.zoom = 1;
      camera.targetZoom = 1;
      setSelectedSubsystem("system-core");
      selectedSubsystemRef.current = "system-core";
      anchorsRef.current = anchors.map((anchor) => ({
        ...anchor,
        homeX: anchor.x,
        homeY: anchor.y,
      }));
    }

    if (interaction.command.reseedAt) {
      interaction.command.reseedAt = 0;
      initializeSimulation(width, height);
    }

    if (interaction.paused) {
      return;
    }

    const nextSelectedSubsystem = interaction.selectedAnchorId ?? "system-core";
    if (selectedSubsystemRef.current !== nextSelectedSubsystem) {
      selectedSubsystemRef.current = nextSelectedSubsystem;
      setSelectedSubsystem(nextSelectedSubsystem);
    }

    simulation.time += deltaMs;
    const time = simulation.time;

    camera.velocityX += (camera.targetX - camera.x) * 0.055;
    camera.velocityY += (camera.targetY - camera.y) * 0.055;
    camera.velocityX *= 0.88;
    camera.velocityY *= 0.88;
    camera.x += camera.velocityX;
    camera.y += camera.velocityY;
    camera.zoom = lerp(camera.zoom, camera.targetZoom, 0.1);

    const renderAnchors: RenderAnchor[] = anchorsRef.current.map((anchor, index) => {
      const energy = metricEnergy(anchor.id, metrics);
      const heatT = clamp((energy - 0.45) / 0.55, 0, 1);
      const heatTarget: [number, number, number] =
        energy > 0.9 ? [255, 20, 20] : energy > 0.72 ? [255, 85, 0] : [255, 200, 0];

      const pulseDrift = 1 + Math.sin(time * 0.002 + index * 0.8) * (0.04 + energy * 0.05);
      const fieldRadius = createFieldRadius(anchor, energy) * pulseDrift;

      return {
        ...anchor,
        energy,
        heatColor: heatT > 0.04 ? blendColor(anchor.color, heatTarget, heatT) : anchor.color,
        fieldRadius,
      };
    });

    const anchorMap = new Map(renderAnchors.map((anchor) => [anchor.id, anchor]));
    const signatureMap = new Map(
      renderAnchors.map((anchor) => [anchor.id, metricSignature(anchor.id, anchor.energy, metrics)]),
    );
    const influenceGraph = computeInfluenceGraph(metrics);

    const toScreen = (x: number, y: number, depth = 1) => {
      const parallaxX = (interaction.pointer.x - width / 2) * 0.03 * (1 - depth);
      const parallaxY = (interaction.pointer.y - height / 2) * 0.03 * (1 - depth);
      return {
        x: width / 2 + (x * camera.zoom + camera.x) * depth + parallaxX,
        y: height / 2 + (y * camera.zoom + camera.y) * depth + parallaxY,
      };
    };

    ctx.clearRect(0, 0, width, height);
    glowCtx.clearRect(0, 0, width, height);

    const background = ctx.createRadialGradient(width * 0.46, height * 0.44, 0, width * 0.5, height * 0.5, width * 0.78);
    background.addColorStop(0, "#07101f");
    background.addColorStop(0.52, "#04080f");
    background.addColorStop(1, "#010306");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    const cursorGlow = ctx.createRadialGradient(
      interaction.pointer.x || width / 2,
      interaction.pointer.y || height / 2,
      0,
      interaction.pointer.x || width / 2,
      interaction.pointer.y || height / 2,
      280,
    );
    cursorGlow.addColorStop(0, "rgba(0,212,255,0.16)");
    cursorGlow.addColorStop(0.5, "rgba(0,153,255,0.07)");
    cursorGlow.addColorStop(1, "rgba(0,212,255,0)");
    ctx.fillStyle = cursorGlow;
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = "screen";
    glowCtx.globalCompositeOperation = "screen";

    for (const particle of simulation.ambient) {
      const pointerDx = interaction.worldPointer.x - particle.x;
      const pointerDy = interaction.worldPointer.y - particle.y;
      const pointerDist = Math.max(80, Math.hypot(pointerDx, pointerDy));
      const pointerForce = 16 / pointerDist;
      particle.vx += (pointerDx / pointerDist) * pointerForce * 0.00018 * deltaMs;
      particle.vy += (pointerDy / pointerDist) * pointerForce * 0.00018 * deltaMs;
      particle.x += particle.vx * deltaMs;
      particle.y += particle.vy * deltaMs;
      particle.vx *= 0.996;
      particle.vy *= 0.996;

      if (particle.x < -760) particle.x = 760;
      if (particle.x > 760) particle.x = -760;
      if (particle.y < -560) particle.y = 560;
      if (particle.y > 560) particle.y = -560;

      const screen = toScreen(particle.x, particle.y, particle.depth);
      ctx.fillStyle = `rgba(220,235,255,${particle.alpha})`;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, particle.size * camera.zoom * particle.depth, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const trail of simulation.trails) {
      trail.life -= trail.decay * (deltaMs / 16);
      if (trail.life <= 0) continue;
      const screen = toScreen(trail.x, trail.y, 0.99);
      const alpha = trail.alpha * trail.life;
      ctx.fillStyle = rgba(trail.color, alpha);
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, trail.size * (0.7 + trail.life * 0.6), 0, Math.PI * 2);
      ctx.fill();
      glowCtx.fillStyle = rgba(trail.color, alpha * 0.65);
      glowCtx.beginPath();
      glowCtx.arc(screen.x, screen.y, trail.size * 4.8, 0, Math.PI * 2);
      glowCtx.fill();
    }
    simulation.trails = simulation.trails.filter((trail) => trail.life > 0);

    for (const { sourceId, targetId } of influenceGraph.edges) {
      const source = anchorMap.get(sourceId);
      const target = anchorMap.get(targetId);
      if (!source || !target) continue;

      const sourceSignature = signatureMap.get(source.id);
      const targetSignature = signatureMap.get(target.id);
      const screenA = toScreen(source.x, source.y);
      const screenB = toScreen(target.x, target.y);
      const active =
        interaction.hoverAnchorId === source.id ||
        interaction.hoverAnchorId === target.id ||
        interaction.selectedAnchorId === source.id ||
        interaction.selectedAnchorId === target.id;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const influence = influenceGraph.edgeWeights.get(edgeKey(sourceId, targetId)) ?? 0.18;
      const branchIntensity = ((sourceSignature?.branch ?? 1) + (targetSignature?.branch ?? 1)) / 2;
      const baseCurve = Math.sin(time * 0.0007 + distance * 0.003) * (12 + branchIntensity * 14 + influence * 12);

      for (let branch = 0; branch < 3; branch += 1) {
        const branchCurve = baseCurve + (branch - 1) * 18 * branchIntensity;
        const mid = quadraticPoint(source, target, branchCurve, 0.5);
        const control = toScreen(mid.cx, mid.cy);
        const pathGradient = ctx.createLinearGradient(screenA.x, screenA.y, screenB.x, screenB.y);
        pathGradient.addColorStop(0, rgba(source.heatColor, active ? 0.1 + influence * 0.22 : 0.04 + influence * 0.08));
        pathGradient.addColorStop(0.5, `rgba(255,255,255,${0.05 + influence * 0.18})`);
        pathGradient.addColorStop(1, rgba(target.heatColor, active ? 0.1 + influence * 0.22 : 0.04 + influence * 0.08));
        ctx.strokeStyle = pathGradient;
        ctx.lineWidth = branch === 1 ? (active ? 0.95 + influence * 1.2 : 0.55 + influence * 0.78) : active ? 0.5 + influence * 0.48 : 0.28 + influence * 0.26;
        ctx.beginPath();
        ctx.moveTo(screenA.x, screenA.y);
        ctx.quadraticCurveTo(control.x, control.y, screenB.x, screenB.y);
        ctx.stroke();

        if (branch === 1 && influence > 0.14) {
          for (let twig = 0; twig < 2; twig += 1) {
            const t = 0.28 + twig * 0.26;
            const point = quadraticPoint(source, target, branchCurve, t);
            const tipAngle = Math.atan2(dy, dx) + (twig === 0 ? -1 : 1) * (0.55 + branchIntensity * 0.12);
            const tipLength = 12 + branchIntensity * 7 + influence * 10;
            const twigStart = toScreen(point.x, point.y);
            const twigEnd = toScreen(
              point.x + Math.cos(tipAngle) * tipLength,
              point.y + Math.sin(tipAngle) * tipLength,
            );
            ctx.strokeStyle = rgba(source.heatColor, active ? 0.05 + influence * 0.16 : 0.03 + influence * 0.08);
            ctx.lineWidth = 0.25 + influence * 0.45;
            ctx.beginPath();
            ctx.moveTo(twigStart.x, twigStart.y);
            ctx.lineTo(twigEnd.x, twigEnd.y);
            ctx.stroke();
          }
        }
      }
    }

    for (const stream of simulation.streams) {
      const source = anchorMap.get(stream.sourceId);
      const target = anchorMap.get(stream.targetId);
      if (!source || !target) continue;

      const sourceSignature = signatureMap.get(source.id);
      const targetSignature = signatureMap.get(target.id);
      const activity = (source.energy + target.energy) / 2;
      const influence = influenceGraph.edgeWeights.get(edgeKey(stream.sourceId, stream.targetId)) ?? 0;
      if (influence < 0.08) continue;
      const flowBoost = ((sourceSignature?.stream ?? 1) + (targetSignature?.stream ?? 1)) / 2;
      stream.t = (stream.t + stream.speed * (0.45 + activity * 1.2 + influence * 1.3) * flowBoost * (deltaMs / 1000)) % 1;

      const curve = Math.sin(time * 0.001 + activity * 2 + stream.size) * (10 + activity * 18 + influence * 16) * ((sourceSignature?.branch ?? 1) * 0.5 + 0.5);
      const point = quadraticPoint(source, target, curve, stream.t);
      const prevPoint = quadraticPoint(source, target, curve, (stream.t - 0.018 + 1) % 1);
      const screen = toScreen(point.x, point.y);
      const tail = toScreen(prevPoint.x, prevPoint.y);
      const radius = stream.size * (0.52 + activity * 0.2 + influence * 0.34);

      ctx.strokeStyle = rgba(source.heatColor, 0.03 + activity * 0.04 + influence * 0.08);
      ctx.lineWidth = stream.size * (0.32 + influence * 0.18);
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(screen.x, screen.y);
      ctx.stroke();

      const gradient = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, 8 + activity * 4 + influence * 4);
      gradient.addColorStop(0, `rgba(255,255,255,${0.22 + influence * 0.34})`);
      gradient.addColorStop(0.42, rgba(source.heatColor, 0.08 + influence * 0.16));
      gradient.addColorStop(1, rgba(source.heatColor, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
      ctx.fill();

      if (Math.random() < 0.1 + influence * 0.18) {
        simulation.trails.push({
          x: point.x,
          y: point.y,
          color: source.heatColor,
          size: radius,
          alpha: 0.04 + activity * 0.04 + influence * 0.06,
          life: 1,
          decay: 0.03 + activity * 0.02 + (1 - influence) * 0.02,
        });
      }
    }
    if (simulation.trails.length > 1200) {
      simulation.trails.splice(0, simulation.trails.length - 1200);
    }

    for (const particle of simulation.clusters) {
      const anchor = anchorMap.get(particle.anchorId);
      if (!anchor) continue;

      const selected = interaction.selectedAnchorId === anchor.id;
      const hovered = interaction.hoverAnchorId === anchor.id;
      const signature = signatureMap.get(anchor.id);
      const pointerDx = interaction.worldPointer.x - anchor.x;
      const pointerDy = interaction.worldPointer.y - anchor.y;
      const pointerDist = Math.max(1, Math.hypot(pointerDx, pointerDy));
      const pointerInfluence = clamp(1 - pointerDist / (anchor.fieldRadius * 2.1), 0, 1);

      particle.angle += particle.speed * (0.34 + anchor.energy * 0.9) * (signature?.swirl ?? 1) * (deltaMs / 1000);
      const radialPulse = 1 + Math.sin(time * 0.0012 * particle.wobbleSpeed + particle.angle * 2.2) * (0.1 + (signature?.agitation ?? 1) * 0.03);
      const orbitRadius = particle.orbitRadius * (1 + anchor.energy * 0.85) * radialPulse;
      const wobbleX = Math.cos(time * 0.0014 * particle.wobbleSpeed + particle.angle * 3) * particle.wobble * (signature?.agitation ?? 1);
      const wobbleY = Math.sin(time * 0.0017 * particle.wobbleSpeed + particle.angle * 2) * particle.wobble * (signature?.agitation ?? 1);
      const x = anchor.x + Math.cos(particle.angle) * orbitRadius + wobbleX;
      const y = anchor.y + Math.sin(particle.angle) * orbitRadius * 0.82 + wobbleY;
      const screen = toScreen(x, y, 0.98);
      const alpha = particle.alpha + anchor.energy * 0.16 + pointerInfluence * 0.16 + (selected ? 0.12 : 0) + (hovered ? 0.1 : 0);
      const size = particle.size * (1 + anchor.energy * 0.45 + pointerInfluence * 0.28);

      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.98, alpha)})`;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, size, 0, Math.PI * 2);
      ctx.fill();

      if (particle.size > 1.35) {
        glowCtx.fillStyle = rgba(anchor.heatColor, 0.05 + anchor.energy * 0.08);
        glowCtx.beginPath();
        glowCtx.arc(screen.x, screen.y, size * 5.2, 0, Math.PI * 2);
        glowCtx.fill();
      }
    }

    for (const anchor of renderAnchors) {
      const screen = toScreen(anchor.x, anchor.y);
      const selected = interaction.selectedAnchorId === anchor.id;
      const hovered = interaction.hoverAnchorId === anchor.id;
      const signature = signatureMap.get(anchor.id);

      for (let fogLayer = 0; fogLayer < 4; fogLayer += 1) {
        const fogRadius = anchor.fieldRadius * (0.64 + fogLayer * 0.16);
        const fogOffsetX = Math.cos(time * 0.00048 * (fogLayer + 1) + anchor.radius) * anchor.fieldRadius * 0.08 * (signature?.agitation ?? 1);
        const fogOffsetY = Math.sin(time * 0.00058 * (fogLayer + 1) + anchor.radius * 0.4) * anchor.fieldRadius * 0.06 * (signature?.agitation ?? 1);
        const fog = ctx.createRadialGradient(
          screen.x + fogOffsetX,
          screen.y + fogOffsetY,
          0,
          screen.x,
          screen.y,
          fogRadius,
        );
        fog.addColorStop(0, rgba(anchor.heatColor, (signature?.fog ?? 0.15) * 0.32));
        fog.addColorStop(0.42, rgba(anchor.heatColor, (signature?.fog ?? 0.15) * 0.16));
        fog.addColorStop(1, rgba(anchor.heatColor, 0));
        ctx.fillStyle = fog;
        ctx.beginPath();
        ctx.arc(screen.x + fogOffsetX * 0.25, screen.y + fogOffsetY * 0.25, fogRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let shell = 0; shell < 3; shell += 1) {
        const shellRadius = anchor.fieldRadius * (0.58 + shell * 0.18);
        const shellAlpha = 0.05 + anchor.energy * 0.08 + shell * 0.015 + (hovered ? 0.04 : 0);
        const startAngle = time * 0.00045 * (shell + 1) + shell * 1.7 + anchor.radius * 0.03;

        ctx.strokeStyle = rgba(anchor.heatColor, shellAlpha);
        ctx.lineWidth = 0.8 + shell * 0.26;
        ctx.beginPath();

        for (let step = 0; step <= 56; step += 1) {
          const t = step / 56;
          const angle = startAngle + t * Math.PI * (1.35 + shell * 0.16);
          const turbulence = Math.sin(time * 0.0013 + angle * (2.4 + shell) + anchor.energy * 2.6) * anchor.fieldRadius * 0.06;
          const ripple = Math.cos(time * 0.0009 + angle * 1.7 + shell) * anchor.fieldRadius * 0.035;
          const radius = shellRadius + turbulence + ripple;
          const px = screen.x + Math.cos(angle) * radius;
          const py = screen.y + Math.sin(angle) * radius * 0.82;

          if (step === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }

        ctx.stroke();
      }

      const halo = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, anchor.fieldRadius * 1.35);
      halo.addColorStop(0, rgba(anchor.heatColor, selected ? 0.16 : 0.1));
      halo.addColorStop(0.45, rgba(anchor.heatColor, 0.08 + anchor.energy * 0.12));
      halo.addColorStop(1, rgba(anchor.heatColor, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, anchor.fieldRadius * 1.35, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = rgba(anchor.heatColor, hovered || selected ? 0.55 : 0.3);
      ctx.lineWidth = hovered || selected ? 1.4 : 0.9;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, anchor.fieldRadius * 0.74, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = anchor.heatColor;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, anchor.radius * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const pulse of simulation.pulses) {
      const anchor = anchorMap.get(pulse.anchorId);
      if (!anchor) continue;

      pulse.radius += pulse.speed * (0.65 + anchor.energy * 0.9) * (deltaMs / 16);
      if (pulse.radius > anchor.fieldRadius * 1.15) {
        pulse.radius = anchor.radius * 1.05;
      }

      const screen = toScreen(anchor.x, anchor.y);
      const alpha = clamp((1 - pulse.radius / (anchor.fieldRadius * 1.15)) * (0.18 + anchor.energy * 0.2), 0, 0.3);
      ctx.strokeStyle = rgba(anchor.heatColor, alpha);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, pulse.radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (interaction.ripple) {
      const age = performance.now() - interaction.ripple.at;
      if (age < 1400) {
        const screen = toScreen(interaction.ripple.x, interaction.ripple.y);
        const radius = age * 0.18;
        ctx.strokeStyle = `rgba(255,255,255,${0.24 - age / 7600})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, radius * camera.zoom, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.save();
    ctx.filter = "blur(26px)";
    ctx.globalAlpha = 0.94;
    ctx.drawImage(glowCanvas, 0, 0, width, height);
    ctx.restore();
    ctx.drawImage(glowCanvas, 0, 0, width, height);

    ctx.globalCompositeOperation = "source-over";
    glowCtx.globalCompositeOperation = "source-over";

    for (const anchor of renderAnchors) {
      const screen = toScreen(anchor.x, anchor.y);
      const offset = getLabelOffset(anchor.x, anchor.y);
      const labelX = screen.x + offset.x * (anchor.fieldRadius * 0.34 + 18);
      const labelY = screen.y + offset.y * (anchor.fieldRadius * 0.16 + 10);
      drawLabelPill(
        ctx,
        labelX,
        labelY,
        anchor.label.toUpperCase(),
        interaction.selectedAnchorId === anchor.id,
      );
    }

    if (metrics?.processes.length) {
      const processAnchor = anchorMap.get("processes");
      if (processAnchor) {
        const processes = metrics.processes.slice(0, 8);
        processes.forEach((process, index) => {
          const ring = Math.floor(index / 3);
          const angle = time * (0.00056 + ring * 0.00008) + index * 0.92;
          const orbit = processAnchor.fieldRadius + 46 + ring * 30 + (index % 3) * 15;
          const x = processAnchor.x + Math.cos(angle) * orbit;
          const y = processAnchor.y + Math.sin(angle) * orbit * 0.72;
          const screen = toScreen(x, y);
          const color = process.cpu > 25 ? "#fb923c" : process.cpu > 10 ? "#fbbf24" : "#94a3b8";
          const size = 2.8 + process.cpu / 20 + process.memPercent / 18;

          ctx.strokeStyle = rgba(color, 0.18);
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          const hub = toScreen(processAnchor.x, processAnchor.y);
          ctx.moveTo(hub.x, hub.y);
          ctx.lineTo(screen.x, screen.y);
          ctx.stroke();

          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(screen.x, screen.y, size, 0, Math.PI * 2);
          ctx.fill();

          glowCtx.fillStyle = rgba(color, 0.12 + process.cpu / 260);
          glowCtx.beginPath();
          glowCtx.arc(screen.x, screen.y, size * 5.5, 0, Math.PI * 2);
          glowCtx.fill();

          for (let micro = 0; micro < Math.min(3, 1 + Math.floor(process.cpu / 12)); micro += 1) {
            const microAngle = -time * 0.0012 * (micro + 1) + index * 1.7 + micro * 2.1;
            const microOrbit = 10 + micro * 5 + process.memPercent * 0.35;
            const mx = x + Math.cos(microAngle) * microOrbit;
            const my = y + Math.sin(microAngle) * microOrbit * 0.72;
            const microScreen = toScreen(mx, my);
            ctx.strokeStyle = rgba(color, 0.1);
            ctx.lineWidth = 0.45;
            ctx.beginPath();
            ctx.moveTo(screen.x, screen.y);
            ctx.lineTo(microScreen.x, microScreen.y);
            ctx.stroke();
            ctx.fillStyle = rgba(color, 0.9);
            ctx.beginPath();
            ctx.arc(microScreen.x, microScreen.y, 1.1 + micro * 0.4, 0, Math.PI * 2);
            ctx.fill();
          }

          drawLabelPill(
            ctx,
            screen.x + 10,
            screen.y - 10,
            `${formatProcessName(process.command).slice(0, 14)} ${process.cpu.toFixed(0)}%`,
            process.cpu > 10,
          );
        });
      }
    }

  });

  return <canvas ref={canvasRef} className="block h-screen w-screen cursor-crosshair bg-transparent" />;
}
