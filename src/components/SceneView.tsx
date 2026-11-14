import { useEffect, useRef, useState } from "react";
import type { ScenePlan } from "../types";
import { SceneEngine } from "../three/SceneEngine";

interface SceneViewProps {
  plan: ScenePlan;
  onEngine: (engine: SceneEngine | null) => void;
}

export function SceneView({ plan, onEngine }: SceneViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SceneEngine | null>(null);
  const planRef = useRef(plan);
  const onEngineRef = useRef(onEngine);
  const [failed, setFailed] = useState(false);

  planRef.current = plan;
  onEngineRef.current = onEngine;

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let engine: SceneEngine | null = null;
    try {
      engine = new SceneEngine(canvas, host);
      engineRef.current = engine;
      engine.setScene(planRef.current);
      onEngineRef.current(engine);
    } catch (error) {
      console.error("3D scene could not start", error);
      setFailed(true);
      onEngineRef.current(null);
    }
    return () => {
      engine?.dispose();
      engineRef.current = null;
      onEngineRef.current(null);
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setScene(plan);
  }, [plan]);

  return (
    <div className="scene-layer" ref={hostRef}>
      <canvas ref={canvasRef} className="scene-canvas" aria-hidden="true" />
      {failed && (
        <div className="scene-fallback" role="img" aria-label="A static star field stands in for the 3D scene.">
          <div className="fallback-stars" aria-hidden="true" />
          <p>
            This browser could not start the 3D view. The written scene description and all NASA information are still
            available in the result panel.
          </p>
        </div>
      )}
      <div className="scene-vignette" aria-hidden="true" />
    </div>
  );
}
