export interface SystemSnapshot {
  timestamp: number;
  cpu: {
    percent: number;
    user: number | null;
    system: number | null;
    cores: number;
    loadAverage: number[];
  };
  memory: {
    percent: number;
    usedBytes: number;
    totalBytes: number;
  };
  battery: {
    percent: number | null;
    charging: boolean;
    source: string;
    estimate: string | null;
  };
  thermal: {
    state: "nominal" | "elevated" | "unknown";
    summary: string;
  };
  gpu: {
    model: string;
    cores: number | null;
    metal: string | null;
  };
  disk: {
    usedPercent: number | null;
    freeBytes: number | null;
    readPerSec: number;
    writePerSec: number;
  };
  network: {
    inPerSec: number;
    outPerSec: number;
  };
  processes: Array<{
    pid: number;
    command: string;
    cpu: number;
    memPercent: number;
    mem: string;
  }>;
}

declare global {
  interface Window {
    systemMonitor?: {
      getSnapshot: () => Promise<SystemSnapshot>;
    };
  }
}

export {};
