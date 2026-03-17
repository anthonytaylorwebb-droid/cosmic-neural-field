import { NeuralFieldCanvas } from "../components/NeuralFieldCanvas";
import { SystemOverlay } from "../components/SystemOverlay";

export default function App() {
  return (
    <div className="relative min-h-screen">
      <NeuralFieldCanvas />
      <SystemOverlay />
    </div>
  );
}
