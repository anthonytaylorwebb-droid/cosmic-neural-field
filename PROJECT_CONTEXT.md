# Signal Field Context

This project is a local macOS desktop app built with:

- React
- Vite
- TypeScript
- TailwindCSS
- Zustand
- Electron

## Current Product Direction

The app is no longer just a visual neural network. It is a local-first cosmic system monitor where the particle field and node wells represent live machine resources.

## Main Behavior

- Single canvas renderer for the field
- Cosmic particle background with flowing connection streams
- Persistent labeled wells for system resources
- Focus, drag, zoom, pulse, pause, reset, and reseed interactions
- Local system metrics drive node/link energy

## Resource Mapping

The canvas currently maps these wells:

- System Core
- CPU
- Memory
- GPU
- Thermal
- Battery
- Disk
- Network
- Processes

## Important Files

- `src/components/NeuralFieldCanvas.tsx`
  Main canvas renderer and simulation

- `src/components/SystemOverlay.tsx`
  Supporting monitor UI overlay

- `src/hooks/useAnimationLoop.ts`
  RequestAnimationFrame loop hook

- `src/hooks/useInteraction.ts`
  Pointer, drag, zoom, selection, pause/reset/reseed interaction state

- `electron/main.cjs`
  Electron main process and local system metric collection

- `electron/preload.cjs`
  Safe bridge exposing system snapshot data to the renderer

- `src/types/system-monitor.d.ts`
  Shared snapshot typing for the renderer

## Current Local Metrics

Using local machine data with no login/API setup:

- CPU load
- Memory usage
- Battery state
- Disk usage
- Disk IO
- Network IO
- Top processes
- GPU hardware info
- Thermal state

## Current Limitations

- True GPU utilization is not directly available here
- Fan RPM / deep thermal sensors are limited on macOS without more invasive tooling
- Some values are inferred from available local metrics

## Good Next Improvements

- Add per-process satellites with app names/icons
- Add timeline/history mode for resource spikes
- Add hardware-focused panel for pressure, swap, battery health, and thermal events
- Improve app icon / window chrome / installer polish
- Add alert thresholds and visual incident states
