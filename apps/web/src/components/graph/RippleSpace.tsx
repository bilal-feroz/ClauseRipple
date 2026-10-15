"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
import { Crosshair, Expand, Focus, RotateCcw } from "lucide-react";
import { LABEL_STYLE, STATUS_COLOR } from "@/lib/graph-style";
import { cn } from "@/lib/utils";
import type { CameraCommand, RippleSceneProps } from "./RippleScene";

const RippleScene = dynamic(() => import("./RippleScene"), {
  ssr: false,
  loading: () => <SceneMessage>Initialising RippleSpace…</SceneMessage>,
});

function SceneMessage({ children }: { children: ReactNode }) {
  return <div className="flex h-full items-center justify-center text-sm text-fog">{children}</div>;
}

function detectWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

type Props = Omit<RippleSceneProps, "cameraCommand" | "onContextLost" | "affectedOnly"> & {
  fallback: ReactNode;
  focusTarget: string | null;
  caption: string | null;
};

export function RippleSpace(props: Props) {
  const { fallback, focusTarget, caption, ...scene } = props;
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [lost, setLost] = useState(false);
  const [command, setCommand] = useState<CameraCommand | null>(null);
  const [affectedOnly, setAffectedOnly] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWebgl(detectWebGL());
  }, []);

  const cmd = (kind: CameraCommand["kind"], target?: string | null) =>
    setCommand({ kind, target, nonce: (command?.nonce ?? 0) + 1 });

  if (webgl === null) return <SceneMessage>Checking WebGL…</SceneMessage>;
  if (!webgl || lost) {
    return (
      <div className="flex h-full flex-col">
        <div role="status" className="border-b border-line bg-ink-850 px-4 py-2 text-xs text-mist">
          3D RippleSpace unavailable on this device. Using evidence graph.
        </div>
        <div className="min-h-0 flex-1">{fallback}</div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full" aria-label="RippleSpace: 3D view of the live FalkorDB company graph">
      <SceneBoundary
        fallback={
          <div className="flex h-full flex-col">
            <div role="status" className="border-b border-line bg-ink-850 px-4 py-2 text-xs text-mist">
              3D RippleSpace unavailable on this device. Using evidence graph.
            </div>
            <div className="min-h-0 flex-1">{fallback}</div>
          </div>
        }
      >
        <RippleScene {...scene} affectedOnly={affectedOnly} cameraCommand={command} onContextLost={() => setLost(true)} />
      </SceneBoundary>

      {caption && (
        <div className="pointer-events-none absolute left-3 top-3 max-w-[60%] rounded-md border border-change/40 bg-ink-900/85 px-2.5 py-1.5 text-[11px] text-snow shadow-lg">
          <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-change align-middle" />
          {caption}
        </div>
      )}

      <div className="absolute right-3 top-3 flex gap-1.5">
        <SceneButton label="Reset view" onClick={() => cmd("reset")}>
          <RotateCcw className="h-3.5 w-3.5" />
        </SceneButton>
        <SceneButton label="Focus changed vendor" onClick={() => cmd("focus", focusTarget ?? scene.rippleOrigin)}>
          <Crosshair className="h-3.5 w-3.5" />
        </SceneButton>
        <SceneButton label="Fit blast radius" onClick={() => cmd("fit")}>
          <Expand className="h-3.5 w-3.5" />
        </SceneButton>
        <SceneButton label={affectedOnly ? "Show all nodes" : "Show affected only"} active={affectedOnly} onClick={() => setAffectedOnly((v) => !v)}>
          <Focus className="h-3.5 w-3.5" />
        </SceneButton>
      </div>

      <Legend />
    </div>
  );
}

function SceneButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex h-7 items-center gap-1 rounded-md border border-line bg-ink-900/85 px-2 text-[11px] text-mist transition hover:border-line-strong hover:text-snow",
        active && "border-signal/60 text-snow",
      )}
    >
      {children}
    </button>
  );
}

function Legend() {
  const [open, setOpen] = useState(true);
  const shapes = ["Customer", "Product", "System", "Vendor", "DataRegion", "Contract", "Obligation", "Team", "Person", "Decision", "ImpactCase", "AgentRun"];
  const statuses: [string, string][] = [
    ["changed", "Changed fact"],
    ["impacted", "Impacted"],
    ["safe", "Not impacted"],
    ["owner", "Owner"],
    ["memory", "Memory"],
  ];
  return (
    <div className="absolute bottom-3 left-3 hidden max-w-[420px] rounded-lg border border-line bg-ink-900/85 text-[10px] text-fog backdrop-blur md:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-2 py-1 text-left"
      >
        <span className="eyebrow !text-[9.5px]">Legend</span>
        <span className="flex flex-wrap gap-x-2.5 gap-y-0.5">
          {statuses.map(([k, label]) => (
            <span key={k} className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[k as keyof typeof STATUS_COLOR] }} />
              {label}
            </span>
          ))}
        </span>
      </button>
      {open && (
        <div className="grid grid-cols-4 gap-x-2.5 gap-y-0.5 border-t border-line px-2 py-1.5">
          {shapes.map((s) => (
            <span key={s} className="flex items-center gap-1">
              <ShapeGlyph label={s} />
              {LABEL_STYLE[s].title}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ShapeGlyph({ label, color = "#94a3b8" }: { label: string; color?: string }) {
  const shape = LABEL_STYLE[label]?.shape ?? "box";
  const common = { fill: "none", stroke: color, strokeWidth: 1.4 } as const;
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      {shape === "sphere" || shape === "smallSphere" ? <circle cx="6" cy="6" r="4.2" {...common} /> : null}
      {shape === "dodeca" ? <polygon points="6,1.5 10.4,4.6 8.7,10 3.3,10 1.6,4.6" {...common} /> : null}
      {shape === "box" || shape === "ticket" ? <rect x="2" y="2" width="8" height="8" rx="1" {...common} /> : null}
      {shape === "hex" ? <polygon points="3.5,1.8 8.5,1.8 11,6 8.5,10.2 3.5,10.2 1,6" {...common} /> : null}
      {shape === "ring" || shape === "torus" ? <circle cx="6" cy="6" r="3.6" {...common} strokeWidth={2.2} /> : null}
      {shape === "slab" || shape === "slabSmall" ? <rect x="3" y="1.5" width="6" height="9" {...common} /> : null}
      {shape === "shield" ? <path d="M6 1.5 L10 3 L9.2 7.5 L6 10.5 L2.8 7.5 L2 3 Z" {...common} /> : null}
      {shape === "tetra" ? <polygon points="6,1.6 10.6,10 1.4,10" {...common} /> : null}
      {shape === "diamond" ? <polygon points="6,1.2 10.8,6 6,10.8 1.2,6" {...common} /> : null}
      {shape === "ico" || shape === "agent" ? <polygon points="6,1.5 10.4,4 10.4,8 6,10.5 1.6,8 1.6,4" {...common} /> : null}
      {shape === "prism" ? <polygon points="6,1.4 11,10.2 1,10.2" {...common} /> : null}
    </svg>
  );
}
