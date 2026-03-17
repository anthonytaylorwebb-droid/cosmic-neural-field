import { useEffect, useMemo, useRef } from "react";

interface Vec2 {
  x: number;
  y: number;
}

export interface InteractionState {
  pointer: Vec2;
  worldPointer: Vec2;
  pointerDown: boolean;
  hoverAnchorId: string | null;
  selectedAnchorId: string | null;
  draggingAnchorId: string | null;
  camera: {
    x: number;
    y: number;
    zoom: number;
    targetX: number;
    targetY: number;
    targetZoom: number;
    velocityX: number;
    velocityY: number;
  };
  ripple: {
    x: number;
    y: number;
    strength: number;
    at: number;
  } | null;
  command: {
    resetAt: number;
    reseedAt: number;
    pauseToggledAt: number;
  };
  paused: boolean;
}

interface AnchorLike {
  id: string;
  x: number;
  y: number;
  radius: number;
}

export function useInteraction(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  anchorsRef: React.RefObject<AnchorLike[]>,
) {
  const interactionRef = useRef<InteractionState>({
    pointer: { x: 0, y: 0 },
    worldPointer: { x: 0, y: 0 },
    pointerDown: false,
    hoverAnchorId: null,
    selectedAnchorId: "system-core",
    draggingAnchorId: null,
    camera: {
      x: 0,
      y: 0,
      zoom: 1,
      targetX: 0,
      targetY: 0,
      targetZoom: 1,
      velocityX: 0,
      velocityY: 0,
    },
    ripple: null,
    command: {
      resetAt: 0,
      reseedAt: 0,
      pauseToggledAt: 0,
    },
    paused: false,
  });

  const dragRef = useRef<{
    active: boolean;
    x: number;
    y: number;
  }>({
    active: false,
    x: 0,
    y: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const toWorld = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const camera = interactionRef.current.camera;
      const x = clientX - rect.left - rect.width / 2;
      const y = clientY - rect.top - rect.height / 2;

      return {
        x: (x - camera.x) / camera.zoom,
        y: (y - camera.y) / camera.zoom,
      };
    };

    const findHoverAnchor = (worldX: number, worldY: number) => {
      const anchors = anchorsRef.current ?? [];
      let nearest: string | null = null;
      let nearestDistance = Infinity;

      for (const anchor of anchors) {
        const dx = worldX - anchor.x;
        const dy = worldY - anchor.y;
        const distance = Math.hypot(dx, dy);
        if (distance < anchor.radius * 1.9 && distance < nearestDistance) {
          nearest = anchor.id;
          nearestDistance = distance;
        }
      }

      return nearest;
    };

    const handlePointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const world = toWorld(event.clientX, event.clientY);
      const interaction = interactionRef.current;

      interaction.pointer = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      interaction.worldPointer = world;
      interaction.hoverAnchorId = findHoverAnchor(world.x, world.y);

      if (interaction.draggingAnchorId) {
        const anchors = anchorsRef.current ?? [];
        const anchor = anchors.find((item) => item.id === interaction.draggingAnchorId);
        if (anchor) {
          anchor.x = world.x;
          anchor.y = world.y;
        }
      }

      if (dragRef.current.active) {
        interaction.camera.targetX += event.clientX - dragRef.current.x;
        interaction.camera.targetY += event.clientY - dragRef.current.y;
        dragRef.current.x = event.clientX;
        dragRef.current.y = event.clientY;
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      const world = toWorld(event.clientX, event.clientY);
      const interaction = interactionRef.current;

      interaction.pointerDown = true;
      interaction.worldPointer = world;
      interaction.hoverAnchorId = findHoverAnchor(world.x, world.y);
      interaction.selectedAnchorId = interaction.hoverAnchorId;
      interaction.ripple = {
        x: world.x,
        y: world.y,
        strength: interaction.hoverAnchorId ? 1 : 0.55,
        at: performance.now(),
      };
      interaction.draggingAnchorId = interaction.hoverAnchorId;

      dragRef.current = {
        active: !interaction.hoverAnchorId,
        x: event.clientX,
        y: event.clientY,
      };
    };

    const handlePointerUp = () => {
      interactionRef.current.pointerDown = false;
       interactionRef.current.draggingAnchorId = null;
      dragRef.current.active = false;
    };

    const handlePointerLeave = () => {
      interactionRef.current.pointerDown = false;
      interactionRef.current.hoverAnchorId = null;
      interactionRef.current.draggingAnchorId = null;
      dragRef.current.active = false;
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const camera = interactionRef.current.camera;
      const nextZoom = Math.min(1.85, Math.max(0.72, camera.targetZoom + (event.deltaY > 0 ? -0.08 : 0.08)));
      camera.targetZoom = nextZoom;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const interaction = interactionRef.current;

      if (event.key === "Escape") {
        interaction.selectedAnchorId = null;
      }

      if (event.key.toLowerCase() === "r") {
        interaction.command.resetAt = performance.now();
      }

      if (event.key.toLowerCase() === "n") {
        interaction.command.reseedAt = performance.now();
      }

      if (event.key.toLowerCase() === "p") {
        event.preventDefault();
        interaction.paused = !interaction.paused;
        interaction.command.pauseToggledAt = performance.now();
      }
    };

    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      canvas.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorsRef, canvasRef]);

  return useMemo(() => ({ interactionRef }), []);
}
