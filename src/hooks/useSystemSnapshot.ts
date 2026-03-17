import { useEffect, useState } from "react";
import type { SystemSnapshot } from "../types/system-monitor";

let snapshotCache: SystemSnapshot | null = null;
let pollHandle: number | null = null;
const listeners = new Set<(snapshot: SystemSnapshot) => void>();

async function pollSnapshot() {
  if (!window.systemMonitor?.getSnapshot) {
    return;
  }

  try {
    const next = await window.systemMonitor.getSnapshot();
    snapshotCache = next;
    listeners.forEach((listener) => listener(next));
  } catch {
    // Keep the last successful snapshot if polling fails.
  }
}

function startPolling() {
  if (pollHandle != null) {
    return;
  }

  void pollSnapshot();
  pollHandle = window.setInterval(() => {
    void pollSnapshot();
  }, 1800);
}

function stopPolling() {
  if (pollHandle == null || listeners.size > 0) {
    return;
  }

  window.clearInterval(pollHandle);
  pollHandle = null;
}

export function useSystemSnapshot() {
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(snapshotCache);

  useEffect(() => {
    const listener = (next: SystemSnapshot) => setSnapshot(next);
    listeners.add(listener);
    startPolling();

    if (snapshotCache) {
      setSnapshot(snapshotCache);
    }

    return () => {
      listeners.delete(listener);
      stopPolling();
    };
  }, []);

  return snapshot;
}
