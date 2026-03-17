import { useEffect, useRef } from "react";

type FrameHandler = (deltaMs: number, elapsedMs: number) => void;

export function useAnimationLoop(handler: FrameHandler) {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    let frameId = 0;
    let lastTime = performance.now();
    const startTime = lastTime;

    const loop = (time: number) => {
      const delta = time - lastTime;
      lastTime = time;
      handlerRef.current(delta, time - startTime);
      frameId = window.requestAnimationFrame(loop);
    };

    frameId = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frameId);
  }, []);
}
