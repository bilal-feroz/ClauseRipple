"use client";

import { Line, OrbitControls, QuadraticBezierLine } from "@react-three/drei";
import { Canvas, invalidate, useFrame, useThree } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { LABEL_STYLE, STATUS_COLOR, type NodeStatus, type Shape } from "@/lib/graph-style";
import { FLOOR_Y, boundsOf, layoutGraph, type Vec3 } from "@/lib/layout3d";
import type { Reveal } from "@/lib/status";
import type { GEdge, GNode, GraphSnapshot } from "@/lib/types";

export type CameraCommand = { kind: "reset" | "focus" | "fit"; target?: string | null; nonce: number };

export type RippleSceneProps = {
  graph: GraphSnapshot;
  statuses: Map<string, NodeStatus>;
  reveals: Map<string, Reveal> | null;
  rippleOrigin: string | null;
  rippleKey: number;
  selectedId: string | null;
  affectedOnly: boolean;
  animate: boolean;
  reducedMotion: boolean;
  cameraCommand: CameraCommand | null;
  onSelect: (node: GNode) => void;
  onContextLost: () => void;
};

type LabelRefs = MutableRefObject<Map<string, HTMLDivElement>>;

const HIDDEN_LABELS = new Set(["Action", "Chunk", "Document", "ToolCall"]);
const ALWAYS_LABELLED = new Set(["Customer", "Product", "System", "Vendor", "DataRegion", "ImpactCase", "ChangeEvent"]);
const HOT: NodeStatus[] = ["impacted", "case", "changed", "new", "traversed", "downstream"];
const DEFAULT_CAM: Vec3 = [-2.2, 11, 22];
const DEFAULT_TARGET: Vec3 = [-2.6, -0.6, 0];
const SIZE_SCALE = 1.25;
const FLOORS: { key: string; y: number; label: string }[] = [
  { key: "floor-upper", y: FLOOR_Y.upper, label: "Organisation & memory" },
  { key: "floor-middle", y: FLOOR_Y.middle, label: "Dependency chain" },
  { key: "floor-lower", y: FLOOR_Y.lower, label: "Contracts & obligations" },
];

function geometryFor(shape: Shape, size: number): THREE.BufferGeometry {
  const s = size * SIZE_SCALE;
  switch (shape) {
    case "sphere":
      return new THREE.SphereGeometry(s, 32, 20);
    case "smallSphere":
      return new THREE.SphereGeometry(s, 20, 14);
    case "dodeca":
      return new THREE.DodecahedronGeometry(s, 0);
    case "box":
      return new THREE.BoxGeometry(s * 1.15, s * 1.15, s * 1.15);
    case "hex":
      return new THREE.CylinderGeometry(s, s, s * 0.8, 6);
    case "ring":
      return new THREE.TorusGeometry(s, s * 0.24, 12, 40);
    case "slab":
      return new THREE.BoxGeometry(s * 0.95, s * 1.25, s * 0.14);
    case "slabSmall":
      return new THREE.BoxGeometry(s * 0.8, s, s * 0.12);
    case "shield":
      return new THREE.ConeGeometry(s * 0.85, s * 1.35, 5);
    case "tetra":
      return new THREE.TetrahedronGeometry(s, 0);
    case "torus":
      return new THREE.TorusGeometry(s * 0.9, s * 0.2, 10, 36);
    case "diamond":
      return new THREE.OctahedronGeometry(s, 0);
    case "ticket":
      return new THREE.BoxGeometry(s * 1.3, s * 0.85, s * 0.12);
    case "ico":
      return new THREE.IcosahedronGeometry(s, 0);
    case "prism":
      return new THREE.CylinderGeometry(s, s, s * 0.7, 3);
    case "agent":
      return new THREE.DodecahedronGeometry(s, 0);
  }
}

// ── Nodes ─────────────────────────────────────────────────────────────────────
type NodeProps = {
  node: GNode;
  position: Vec3;
  status: NodeStatus;
  revealAt: number | null;
  dimmed: boolean;
  selected: boolean;
  reducedMotion: boolean;
  onSelect: (n: GNode) => void;
  onHover: (id: string | null) => void;
};

const NodeMesh = memo(function NodeMesh(props: NodeProps) {
  const { node, position, status, revealAt, dimmed, selected, reducedMotion, onSelect, onHover } = props;
  const style = LABEL_STYLE[node.label] ?? LABEL_STYLE.System;
  const geometry = useMemo(() => geometryFor(style.shape, style.size), [style.shape, style.size]);
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const tone = useMemo(() => new THREE.Color(style.tone), [style.tone]);
  const target = useMemo(() => new THREE.Color(status === "neutral" ? style.tone : STATUS_COLOR[status]), [status, style.tone]);
  const hot = status !== "neutral";
  const changedAt = useRef<number>(0);

  useEffect(() => {
    changedAt.current = performance.now();
    invalidate();
  }, [status, dimmed, selected]);

  useFrame((state, delta) => {
    const m = mat.current;
    const g = mesh.current;
    if (!m || !g) return;
    const now = performance.now();
    const waiting = revealAt !== null && now < revealAt;
    const goal = waiting ? tone : target;
    let animating = waiting;
    if (!m.color.equals(goal)) {
      if (reducedMotion) m.color.copy(goal);
      else m.color.lerp(goal, Math.min(1, delta * 7));
      if (Math.abs(m.color.r - goal.r) + Math.abs(m.color.g - goal.g) + Math.abs(m.color.b - goal.b) < 0.004) m.color.copy(goal);
      else animating = true;
      m.emissive.copy(m.color);
    }
    const opacity = dimmed ? 0.12 : 1;
    if (Math.abs(m.opacity - opacity) > 0.01) {
      m.opacity = reducedMotion ? opacity : THREE.MathUtils.lerp(m.opacity, opacity, Math.min(1, delta * 6));
      animating = true;
    }
    const base = waiting || !hot ? 0.16 : status === "impacted" || status === "case" ? 0.95 : 0.6;
    const since = (now - Math.max(changedAt.current, revealAt ?? 0)) / 1000;
    const flash = !reducedMotion && hot && !waiting && since < 1.2 ? (1 - since / 1.2) * 1.6 : 0;
    m.emissiveIntensity = base + flash + (selected ? 0.4 : 0);
    g.scale.setScalar(1 + flash * 0.16 + (selected ? 0.14 : 0));
    if (node.label === "AgentRun" && !reducedMotion) {
      g.rotation.y += delta * 0.6;
      animating = true;
    }
    if (animating || flash > 0) state.invalidate();
  });

  const tilt = style.shape === "ring" || style.shape === "torus" ? Math.PI / 2.3 : 0;
  return (
    <group position={position}>
      <mesh
        ref={mesh}
        geometry={geometry}
        rotation={[tilt, 0, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(node);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(node.id);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = "";
        }}
      >
        <meshStandardMaterial
          ref={mat}
          color={style.tone}
          emissive={style.tone}
          emissiveIntensity={0.16}
          roughness={0.4}
          metalness={0.15}
          transparent
          opacity={1}
          wireframe={node.label === "AgentRun"}
        />
      </mesh>
      {selected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[style.size * SIZE_SCALE * 1.9, 0.04, 8, 64]} />
          <meshBasicMaterial color="#e0f2fe" transparent opacity={0.9} />
        </mesh>
      )}
    </group>
  );
});

// ── Edges ─────────────────────────────────────────────────────────────────────
type EdgeProps = {
  a: Vec3;
  b: Vec3;
  hotColor: string | null;
  flowing: boolean;
  dimmed: boolean;
  isNewFact: boolean;
  animate: boolean;
};

const EdgeLine = memo(function EdgeLine({ a, b, hotColor, flowing, dimmed, isNewFact, animate }: EdgeProps) {
  const ref = useRef<{ material: { dashOffset: number } } | null>(null);
  const crossFloor = Math.abs(a[1] - b[1]) > 1;
  useFrame((state, delta) => {
    if (!flowing || !animate || !ref.current) return;
    ref.current.material.dashOffset -= delta * 1.6;
    state.invalidate();
  });
  const color = hotColor ?? "#3d4c61";
  const width = hotColor ? (isNewFact ? 3.4 : 2.4) : 1;
  const opacity = dimmed ? 0.04 : hotColor ? 0.95 : 0.3;
  const common = {
    color,
    lineWidth: width,
    transparent: true,
    opacity,
    dashed: flowing || isNewFact,
    dashSize: 0.5,
    gapSize: 0.3,
    depthWrite: false,
  };
  if (crossFloor) {
    const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2 + (a[2] >= b[2] ? 0.7 : -0.7)];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <QuadraticBezierLine ref={ref as any} start={a} end={b} mid={mid} {...common} />;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <Line ref={ref as any} points={[a, b]} {...common} />;
});

// ── Ripple effects ────────────────────────────────────────────────────────────
function Shockwave({ originRef, rippleKey, reducedMotion }: { originRef: MutableRefObject<Vec3 | null>; rippleKey: number; reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  const sphere = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const start = useRef<number | null>(null);
  // Fires ONLY when a new inspect_change event arrives (rippleKey), never on graph refetches.
  useEffect(() => {
    if (rippleKey === 0 || reducedMotion || !originRef.current) return;
    start.current = performance.now();
    invalidate();
  }, [rippleKey, reducedMotion, originRef]);
  useFrame((state) => {
    if (start.current === null || !group.current || !sphere.current || !ring.current) return;
    const t = (performance.now() - start.current) / 2600;
    if (t >= 1) {
      start.current = null;
      group.current.visible = false;
      state.invalidate();
      return;
    }
    const o = originRef.current;
    if (o) group.current.position.set(o[0], o[1], o[2]);
    const ease = 1 - Math.pow(1 - t, 3);
    group.current.visible = true;
    sphere.current.scale.setScalar(0.6 + ease * 20);
    ring.current.scale.setScalar(0.6 + ease * 24);
    (sphere.current.material as THREE.MeshBasicMaterial).opacity = 0.12 * (1 - t);
    (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - t);
    state.invalidate();
  });
  return (
    <group ref={group} visible={false}>
      <mesh ref={sphere}>
        <sphereGeometry args={[1, 40, 24]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} wireframe />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.95, 1, 96]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

type Ping = { id: string; pos: Vec3; at: number; color: string };

function Pings({ points, reducedMotion }: { points: Ping[]; reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    const g = group.current;
    if (!g || reducedMotion) return;
    const now = performance.now();
    let active = false;
    g.children.forEach((child, i) => {
      const p = points[i];
      if (!p) return;
      const t = (now - p.at) / 1100;
      const mesh = child as THREE.Mesh;
      if (t < 0 || t > 1) {
        mesh.visible = false;
        if (t < 0) active = true;
        return;
      }
      active = true;
      mesh.visible = true;
      mesh.scale.setScalar(0.5 + t * 2.6);
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - t);
    });
    if (active) state.invalidate();
  });
  if (reducedMotion) return null;
  return (
    <group ref={group}>
      {points.map((p) => (
        <mesh key={`${p.id}-${p.at}`} position={p.pos} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
          <ringGeometry args={[0.85, 1, 48]} />
          <meshBasicMaterial color={p.color} transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function Floors() {
  const outline = useMemo(() => new THREE.EdgesGeometry(new THREE.PlaneGeometry(27, 19)), []);
  return (
    <>
      {FLOORS.map((f) => (
        <group key={f.key} position={[-2.6, f.y - 1.1, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[27, 19]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={0.014} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <lineSegments rotation={[-Math.PI / 2, 0, 0]} geometry={outline}>
            <lineBasicMaterial color="#1e3a5f" transparent opacity={0.45} />
          </lineSegments>
        </group>
      ))}
    </>
  );
}

/** Projects 3D anchor points to screen space and moves the DOM label overlay (no React re-renders). */
function LabelProjector({ anchors, labelRefs }: { anchors: Map<string, Vec3>; labelRefs: LabelRefs }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    labelRefs.current.forEach((el, id) => {
      const p = anchors.get(id);
      if (!p) return;
      v.set(p[0], p[1], p[2]);
      const dist = camera.position.distanceTo(v);
      v.project(camera);
      if (v.z > 1 || v.z < -1) {
        el.style.visibility = "hidden";
        return;
      }
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      const scale = Math.min(1.2, Math.max(0.72, 24 / dist));
      el.style.visibility = "";
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
    });
  });
  return null;
}

function CameraRig({ command, positions, hotIds, reducedMotion }: { command: CameraCommand | null; positions: Map<string, Vec3>; hotIds: string[]; reducedMotion: boolean }) {
  const { camera, controls } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera;
    controls: { target: THREE.Vector3; update: () => void } | null;
  };
  const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  useEffect(() => {
    if (!command) return;
    if (command.kind === "reset") {
      goal.current = { pos: new THREE.Vector3(...DEFAULT_CAM), target: new THREE.Vector3(...DEFAULT_TARGET) };
    } else if (command.kind === "focus" && command.target && positions.get(command.target)) {
      const p = new THREE.Vector3(...positions.get(command.target)!);
      goal.current = { pos: p.clone().add(new THREE.Vector3(2.5, 7, 12)), target: p };
    } else if (command.kind === "fit") {
      const pts = hotIds.map((id) => positions.get(id)).filter((p): p is Vec3 => !!p);
      const { center, radius } = boundsOf(pts.length ? pts : [...positions.values()]);
      const c = new THREE.Vector3(...center);
      goal.current = { pos: c.clone().add(new THREE.Vector3(radius * 0.15, radius * 0.75 + 4, radius * 1.7 + 5)), target: c };
    }
    invalidate();
  }, [command, positions, hotIds]);
  useFrame((state, delta) => {
    const g = goal.current;
    if (!g || !controls) return;
    const k = reducedMotion ? 1 : Math.min(1, delta * 3.2);
    camera.position.lerp(g.pos, k);
    controls.target.lerp(g.target, k);
    controls.update();
    if (camera.position.distanceTo(g.pos) < 0.02 && controls.target.distanceTo(g.target) < 0.02) goal.current = null;
    state.invalidate();
  });
  return null;
}

// ── Scene ─────────────────────────────────────────────────────────────────────
type SceneProps = RippleSceneProps & {
  nodes: GNode[];
  edges: GEdge[];
  positions: Map<string, Vec3>;
  anchors: Map<string, Vec3>;
  labelRefs: LabelRefs;
  focus: Set<string> | null;
  neighbours: Set<string> | null;
  hotIds: string[];
  setHovered: (id: string | null) => void;
};

function Scene(props: SceneProps) {
  const { nodes, edges, positions, statuses, reveals, rippleOrigin, rippleKey, selectedId, animate, reducedMotion, focus, neighbours } = props;
  const [revealState, setRevealState] = useState<{ times: Map<string, number>; pings: Ping[] }>(() => ({ times: new Map(), pings: [] }));
  const seen = useRef(new Set<string>());
  useEffect(() => {
    if (!reveals) {
      seen.current.clear();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRevealState((prev) => (prev.times.size || prev.pings.length ? { times: new Map(), pings: [] } : prev));
      return;
    }
    const now = performance.now();
    const fresh = [...reveals.entries()].filter(([id, r]) => !seen.current.has(`${id}:${r.status}`));
    if (!fresh.length) return;
    const minDepth = Math.min(...fresh.map(([, r]) => r.depth));
    const updates: [string, number][] = [];
    const newPings: Ping[] = [];
    for (const [id, r] of fresh) {
      seen.current.add(`${id}:${r.status}`);
      const at = now + (reducedMotion ? 0 : (r.depth - minDepth) * 170);
      updates.push([id, at]);
      const pos = positions.get(id);
      if (pos && r.status !== "neutral") newPings.push({ id, pos, at, color: STATUS_COLOR[r.status] });
    }
    setRevealState((prev) => ({
      times: new Map([...prev.times, ...updates]),
      pings: [...prev.pings.filter((p) => now - p.at < 1500), ...newPings].slice(-40),
    }));
    invalidate();
  }, [reveals, positions, reducedMotion]);

  const originRef = useRef<Vec3 | null>(null);
  useEffect(() => {
    originRef.current = rippleOrigin ? positions.get(rippleOrigin) ?? null : null;
  }, [rippleOrigin, positions]);

  return (
    <>
      <color attach="background" args={["#05070a"]} />
      <fog attach="fog" args={["#05070a", 36, 72]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[8, 18, 12]} intensity={1.15} />
      <pointLight position={[-14, 6, -10]} intensity={30} color="#38bdf8" distance={40} />
      <Floors />
      {edges.map((e) => {
        const a = positions.get(e.source);
        const b = positions.get(e.target);
        if (!a || !b) return null;
        const sa = statuses.get(e.source) ?? "neutral";
        const sb = statuses.get(e.target) ?? "neutral";
        const isNewFact = !!e.change_id && e.type === "PROCESSES_IN";
        let hotColor: string | null = null;
        if (isNewFact && (sa !== "neutral" || sb !== "neutral")) hotColor = STATUS_COLOR.changed;
        else if (sa !== "neutral" && sb !== "neutral") {
          const soft = [sa, sb].find((s) => s === "owner" || s === "memory");
          if (soft && [sa, sb].every((s) => ["owner", "memory", "case", "safe", "checked"].includes(s))) hotColor = STATUS_COLOR[soft];
          else if ([sa, sb].includes("impacted") || [sa, sb].includes("case")) hotColor = STATUS_COLOR.impacted;
          else if ([sa, sb].every((s) => s === "safe")) hotColor = STATUS_COLOR.safe;
          else hotColor = STATUS_COLOR[HOT.includes(sa) ? sa : sb];
        }
        const flowing = !!hotColor && (sa === "impacted" || sb === "impacted" || isNewFact);
        const dimmedByFocus = focus ? !(focus.has(e.source) && focus.has(e.target)) : false;
        const dimmedBySel = neighbours ? !(neighbours.has(e.source) && neighbours.has(e.target)) : false;
        return (
          <EdgeLine
            key={e.id}
            a={a}
            b={b}
            hotColor={hotColor}
            flowing={flowing}
            isNewFact={isNewFact}
            dimmed={dimmedByFocus || (dimmedBySel && !hotColor)}
            animate={animate && !reducedMotion}
          />
        );
      })}
      {nodes.map((n) => {
        const pos = positions.get(n.id);
        if (!pos) return null;
        const status = statuses.get(n.id) ?? "neutral";
        const dimmed = (focus ? !focus.has(n.id) : false) || (neighbours ? !neighbours.has(n.id) && status === "neutral" : false);
        return (
          <NodeMesh
            key={n.id}
            node={n}
            position={pos}
            status={status}
            revealAt={revealState.times.get(n.id) ?? null}
            dimmed={dimmed}
            selected={selectedId === n.id}
            reducedMotion={reducedMotion}
            onSelect={props.onSelect}
            onHover={props.setHovered}
          />
        );
      })}
      <Shockwave originRef={originRef} rippleKey={rippleKey} reducedMotion={reducedMotion} />
      <Pings points={revealState.pings} reducedMotion={reducedMotion} />
      <LabelProjector anchors={props.anchors} labelRefs={props.labelRefs} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} target={DEFAULT_TARGET} minDistance={6} maxDistance={60} />
      <CameraRig command={props.cameraCommand} positions={positions} hotIds={props.hotIds} reducedMotion={reducedMotion} />
    </>
  );
}

export default function RippleScene(props: RippleSceneProps) {
  const { graph, statuses, selectedId, affectedOnly } = props;
  const [hovered, setHovered] = useState<string | null>(null);
  const labelRefs = useRef(new Map<string, HTMLDivElement>());

  const nodes = useMemo(() => graph.nodes.filter((n) => !HIDDEN_LABELS.has(n.label)), [graph.nodes]);
  const nodeIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const edges = useMemo(() => graph.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target)), [graph.edges, nodeIds]);
  const positions = useMemo(() => layoutGraph(nodes, edges), [nodes, edges]);

  const hotIds = useMemo(
    () => [...statuses.entries()].filter(([, s]) => HOT.includes(s) || s === "owner" || s === "memory").map(([id]) => id),
    [statuses],
  );
  const focus = useMemo(() => (affectedOnly && hotIds.length ? new Set(hotIds) : null), [affectedOnly, hotIds]);
  const neighbours = useMemo(() => {
    if (!selectedId) return null;
    const set = new Set<string>([selectedId]);
    for (const e of edges) {
      if (e.source === selectedId) set.add(e.target);
      if (e.target === selectedId) set.add(e.source);
    }
    return set;
  }, [selectedId, edges]);

  // Label anchors: just above each node.
  const anchors = useMemo(() => {
    const m = new Map<string, Vec3>();
    for (const n of nodes) {
      const p = positions.get(n.id);
      if (p) m.set(n.id, [p[0], p[1] + (LABEL_STYLE[n.label]?.size ?? 0.5) * SIZE_SCALE + 0.45, p[2]]);
    }
    return m;
  }, [nodes, positions]);

  const labels = nodes.map((n) => {
    const status = statuses.get(n.id) ?? "neutral";
    const hot = status !== "neutral";
    const dimmed = (focus ? !focus.has(n.id) : false) || (neighbours ? !neighbours.has(n.id) && status === "neutral" : false);
    const visible =
      !dimmed &&
      (ALWAYS_LABELLED.has(n.label) || hovered === n.id || selectedId === n.id || ["owner", "memory", "case", "impacted"].includes(status) || (neighbours?.has(n.id) ?? false));
    const text = n.label === "DataRegion" ? n.code ?? n.name : n.ref && !["Contract", "Clause"].includes(n.label) ? n.ref : n.name;
    return { id: n.id, text, status, hot, visible, emphasis: selectedId === n.id || hovered === n.id };
  });

  return (
    <div className="relative h-full w-full">
      <Canvas
        frameloop="demand"
        dpr={[1, 1.75]}
        camera={{ position: DEFAULT_CAM, fov: 44, near: 0.1, far: 200 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            props.onContextLost();
          });
        }}
        onPointerMissed={() => (document.body.style.cursor = "")}
      >
        <Scene
          {...props}
          nodes={nodes}
          edges={edges}
          positions={positions}
          anchors={anchors}
          labelRefs={labelRefs}
          focus={focus}
          neighbours={neighbours}
          hotIds={hotIds}
          setHovered={setHovered}
        />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {labels.map((l) => (
          <div
            key={l.id}
            ref={(el) => {
              if (el) labelRefs.current.set(l.id, el);
              else labelRefs.current.delete(l.id);
            }}
            className="absolute left-0 top-0 origin-bottom whitespace-nowrap rounded-md border px-1.5 py-[1px] text-[11px] font-medium leading-4 shadow-lg transition-opacity duration-200"
            style={{
              visibility: "hidden",
              opacity: l.visible ? 1 : 0,
              background: "rgba(8,11,16,0.86)",
              borderColor: l.hot ? `${STATUS_COLOR[l.status]}99` : l.emphasis ? "rgba(125,211,252,0.6)" : "rgba(40,52,69,0.9)",
              color: l.hot || l.emphasis ? "#f8fafc" : "#b9c4d2",
            }}
          >
            {l.hot && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: STATUS_COLOR[l.status] }} />}
            {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}
