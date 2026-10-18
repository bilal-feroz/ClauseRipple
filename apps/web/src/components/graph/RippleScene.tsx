"use client";

import { Grid, Line, OrbitControls, QuadraticBezierLine, Sparkles, Stars } from "@react-three/drei";
import { Canvas, invalidate, useFrame, useThree } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
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
  autoRotate: boolean;
  animate: boolean;
  reducedMotion: boolean;
  cameraCommand: CameraCommand | null;
  onSelect: (node: GNode) => void;
  onContextLost: () => void;
};

type LabelRefs = MutableRefObject<Map<string, HTMLDivElement>>;
/** Shared, per-frame mutable effect state (bloom boost after the shockwave, camera shake). */
type Fx = { boost: number; shake: number };

const HIDDEN_LABELS = new Set(["Action", "Chunk", "Document", "ToolCall"]);
const ALWAYS_LABELLED = new Set(["Customer", "Vendor", "DataRegion", "ImpactCase", "ChangeEvent"]);
const LABELLED_STATUSES: NodeStatus[] = ["owner", "memory", "case", "impacted", "changed", "new", "traversed", "downstream", "safe"];
// Only labelled on hover / selection: they sit under the customers and would bury the story in text.
const QUIET_LABELS = new Set(["Contract", "Clause", "Obligation", "Control", "Team", "Ticket"]);
const HOT: NodeStatus[] = ["impacted", "case", "changed", "new", "traversed", "downstream"];
const SPIN_SHAPES = new Set<Shape>(["dodeca", "ico", "diamond", "box", "tetra", "agent", "prism"]);
const FLOW_TYPES = new Set(["USES", "POWERED_BY", "DEPENDS_ON", "PROCESSES_IN"]);
const DEFAULT_CAM: Vec3 = [-2.2, 10.5, 23];
const INTRO_CAM: Vec3 = [-30, 34, 62];
const DEFAULT_TARGET: Vec3 = [-2.6, -0.6, 0];
const SIZE_SCALE = 1.25;
const BG = "#030611";
const FLOORS: { key: string; y: number; label: string; color: string }[] = [
  { key: "floor:upper", y: FLOOR_Y.upper, label: "Organisation & memory", color: "#a78bfa" },
  { key: "floor:middle", y: FLOOR_Y.middle, label: "Dependency chain", color: "#38bdf8" },
  { key: "floor:lower", y: FLOOR_Y.lower, label: "Contracts & obligations", color: "#2dd4bf" },
];

// module-level scratch objects (the scene is client-only; frames run one at a time)
const TMP = new THREE.Object3D();
const V = new THREE.Vector3();

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

let glowTex: THREE.Texture | null = null;
/** Soft radial sprite used for node halos and floor glow (additive). */
function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.18, "rgba(255,255,255,0.7)");
  grd.addColorStop(0.45, "rgba(255,255,255,0.2)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

function bright(hex: string, k: number): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(k);
}

function geometryFor(shape: Shape, size: number): THREE.BufferGeometry {
  const s = size * SIZE_SCALE;
  switch (shape) {
    case "sphere":
      return new THREE.SphereGeometry(s, 40, 24);
    case "smallSphere":
      return new THREE.SphereGeometry(s, 24, 16);
    case "dodeca":
      return new THREE.DodecahedronGeometry(s, 0);
    case "box":
      return new THREE.BoxGeometry(s * 1.15, s * 1.15, s * 1.15);
    case "hex":
      return new THREE.CylinderGeometry(s, s, s * 0.8, 6);
    case "ring":
      return new THREE.TorusGeometry(s, s * 0.24, 16, 48);
    case "slab":
      return new THREE.BoxGeometry(s * 0.95, s * 1.25, s * 0.14);
    case "slabSmall":
      return new THREE.BoxGeometry(s * 0.8, s, s * 0.12);
    case "shield":
      return new THREE.ConeGeometry(s * 0.85, s * 1.35, 5);
    case "tetra":
      return new THREE.TetrahedronGeometry(s, 0);
    case "torus":
      return new THREE.TorusGeometry(s * 0.9, s * 0.2, 12, 40);
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

/** Colour of an edge given its endpoints' statuses (null = quiet/neutral). */
function edgeHot(e: GEdge, statuses: Map<string, NodeStatus>): { color: string | null; flowing: boolean; isNewFact: boolean } {
  const sa = statuses.get(e.source) ?? "neutral";
  const sb = statuses.get(e.target) ?? "neutral";
  const isNewFact = !!e.change_id && e.type === "PROCESSES_IN";
  let color: string | null = null;
  if (isNewFact && (sa !== "neutral" || sb !== "neutral")) color = STATUS_COLOR.changed;
  else if (sa !== "neutral" && sb !== "neutral") {
    const soft = [sa, sb].find((s) => s === "owner" || s === "memory");
    if (soft && [sa, sb].every((s) => ["owner", "memory", "case", "safe", "checked"].includes(s))) color = STATUS_COLOR[soft];
    else if ([sa, sb].includes("impacted") || [sa, sb].includes("case")) color = STATUS_COLOR.impacted;
    else if ([sa, sb].every((s) => s === "safe")) color = STATUS_COLOR.safe;
    else color = STATUS_COLOR[HOT.includes(sa) ? sa : sb];
  }
  const flowing = !!color && (sa === "impacted" || sb === "impacted" || isNewFact);
  return { color, flowing, isNewFact };
}

function midpoint(a: Vec3, b: Vec3): Vec3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2 + (a[2] >= b[2] ? 0.7 : -0.7)];
}

// ── Post-processing: real bloom (three.js addons, no extra dependency) ───────
function Bloom({ fxRef }: { fxRef: MutableRefObject<Fx> }) {
  const { gl, scene, camera, size } = useThree();
  const pipe = useRef<{ composer: EffectComposer; bloom: UnrealBloomPass } | null>(null);
  useEffect(() => {
    const target = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(gl, target);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.75, 0.5, 0.92);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    pipe.current = { composer, bloom };
    return () => {
      pipe.current = null;
      composer.dispose();
    };
  }, [gl, scene, camera]);
  useEffect(() => {
    const p = pipe.current;
    if (!p) return;
    p.composer.setPixelRatio(gl.getPixelRatio());
    p.composer.setSize(size.width, size.height);
  }, [gl, size]);
  useFrame((_, delta) => {
    const p = pipe.current;
    if (!p) {
      gl.render(scene, camera);
      return;
    }
    if (p.composer.renderTarget1.width !== Math.floor(size.width * gl.getPixelRatio())) {
      p.composer.setPixelRatio(gl.getPixelRatio());
      p.composer.setSize(size.width, size.height);
    }
    p.bloom.strength = 0.75 + fxRef.current.boost;
    fxRef.current.boost = Math.max(0, fxRef.current.boost - delta * 1.3);
    p.composer.render(delta);
  }, 1);
  return null;
}

// ── Backdrop: nebula dome + stars + drifting dust ───────────────────────────
const NEBULA_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const NEBULA_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec3 vDir;
  float lobe(vec3 d, vec3 axis, float p) { return pow(max(0.0, dot(d, normalize(axis))), p); }
  void main() {
    vec3 d = normalize(vDir);
    float t = uTime * 0.03;
    vec3 col = vec3(0.004, 0.006, 0.016);
    col += vec3(0.32, 0.12, 0.62) * lobe(d, vec3(0.6 + sin(t) * 0.1, 0.35, -0.7), 4.0) * 0.16;
    col += vec3(0.02, 0.34, 0.48) * lobe(d, vec3(-0.85, -0.15, -0.45), 4.5) * 0.14;
    col += vec3(0.48, 0.07, 0.32) * lobe(d, vec3(0.15, -0.55, 0.8 + cos(t) * 0.1), 6.0) * 0.08;
    col += vec3(0.05, 0.18, 0.55) * lobe(d, vec3(-0.2, 0.9, 0.3), 5.0) * 0.08;
    gl_FragColor = vec4(col, 1.0);
  }
`;

function Backdrop({ reducedMotion }: { reducedMotion: boolean }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const dome = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  useFrame((state, delta) => {
    if (reducedMotion) return;
    if (mat.current) mat.current.uniforms.uTime.value = state.clock.elapsedTime;
    if (dome.current) dome.current.rotation.y += delta * 0.004;
  });
  return (
    <>
      <mesh ref={dome} renderOrder={-10}>
        <sphereGeometry args={[160, 48, 32]} />
        <shaderMaterial ref={mat} side={THREE.BackSide} depthWrite={false} uniforms={uniforms} vertexShader={NEBULA_VERT} fragmentShader={NEBULA_FRAG} />
      </mesh>
      <Stars radius={110} depth={50} count={reducedMotion ? 1800 : 4200} factor={3.4} saturation={0.55} fade speed={reducedMotion ? 0 : 0.6} />
      {!reducedMotion && <Sparkles count={140} scale={[46, 22, 34]} position={[-2.6, 0, 0]} size={2.4} speed={0.28} opacity={0.55} color="#93c5fd" />}
    </>
  );
}

// ── Floors: holographic grids, glow discs and a scanner sweep ───────────────
function Floors({ reducedMotion }: { reducedMotion: boolean }) {
  const tex = useMemo(() => glowTexture(), []);
  return (
    <>
      {FLOORS.map((f) => (
        <group key={f.key} position={[-2.6, f.y - 1.1, 0]}>
          <Grid
            args={[30, 22]}
            cellSize={1}
            cellThickness={0.55}
            cellColor={new THREE.Color(f.color).multiplyScalar(0.2)}
            sectionSize={4}
            sectionThickness={1.1}
            sectionColor={new THREE.Color(f.color).multiplyScalar(0.6)}
            fadeDistance={15}
            fadeStrength={2.6}
            fadeFrom={0}
            side={THREE.DoubleSide}
          />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
            <planeGeometry args={[34, 26]} />
            <meshBasicMaterial map={tex} color={bright(f.color, 0.34)} transparent opacity={0.22} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        </group>
      ))}
      {!reducedMotion && <Scanner />}
    </>
  );
}

function Scanner() {
  const bar = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((state) => {
    if (!bar.current || !mat.current) return;
    const t = (state.clock.elapsedTime % 7) / 7;
    bar.current.position.x = -17.5 + t * 30;
    mat.current.opacity = Math.sin(t * Math.PI) * 0.5;
  });
  return (
    <mesh ref={bar} position={[-17.5, FLOOR_Y.middle - 1.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[0.05, 21]} />
      <meshBasicMaterial ref={mat} color={bright("#7dd3fc", 2)} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
  );
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
  const tex = useMemo(() => glowTexture(), []);
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const halo = useRef<THREE.Sprite>(null);
  const haloMat = useRef<THREE.SpriteMaterial>(null);
  const ring = useRef<THREE.Mesh>(null);
  const tone = useMemo(() => new THREE.Color(style.tone), [style.tone]);
  const target = useMemo(() => new THREE.Color(status === "neutral" ? style.tone : STATUS_COLOR[status]), [status, style.tone]);
  const hot = status !== "neutral";
  const alarm = status === "impacted" || status === "case";
  const phase = useMemo(() => hash01(node.id) * Math.PI * 2, [node.id]);
  const spin = SPIN_SHAPES.has(style.shape);
  const changedAt = useRef<number>(0);

  useEffect(() => {
    changedAt.current = performance.now();
    invalidate();
  }, [status, dimmed, selected]);

  useFrame((state, delta) => {
    const m = mat.current;
    const g = mesh.current;
    const grp = group.current;
    if (!m || !g || !grp) return;
    const now = performance.now();
    const t = state.clock.elapsedTime;
    const waiting = revealAt !== null && now < revealAt;
    const goal = waiting ? tone : target;
    if (!m.color.equals(goal)) {
      if (reducedMotion) m.color.copy(goal);
      else m.color.lerp(goal, Math.min(1, delta * 7));
      if (Math.abs(m.color.r - goal.r) + Math.abs(m.color.g - goal.g) + Math.abs(m.color.b - goal.b) < 0.004) m.color.copy(goal);
      m.emissive.copy(m.color);
    }
    const opacity = dimmed ? 0.08 : 1;
    m.opacity = reducedMotion ? opacity : THREE.MathUtils.lerp(m.opacity, opacity, Math.min(1, delta * 6));
    const since = (now - Math.max(changedAt.current, revealAt ?? 0)) / 1000;
    const flash = !reducedMotion && hot && !waiting && since < 1.4 ? 1 - since / 1.4 : 0;
    const pulse = alarm && !waiting && !reducedMotion ? Math.sin(t * 5 + phase) * 0.5 + 0.5 : 0;
    const base = waiting || !hot ? 0.3 : alarm ? 2.4 : status === "safe" ? 1.3 : status === "owner" || status === "memory" ? 1.1 : 1.7;
    m.emissiveIntensity = (base + flash * 3.2 + pulse * 1.3 + (selected ? 0.9 : 0)) * (dimmed ? 0.3 : 1);
    g.scale.setScalar(1 + flash * 0.38 + (selected ? 0.16 : 0) + pulse * 0.07);
    if (!reducedMotion) {
      grp.position.y = position[1] + Math.sin(t * 0.9 + phase) * 0.09;
      if (spin) g.rotation.y += delta * (hot ? 0.9 : 0.22);
    }
    const h = halo.current;
    const hm = haloMat.current;
    if (h && hm) {
      const show = hot && !waiting && !dimmed;
      const soft = status === "owner" || status === "memory" || status === "checked";
      const want = show ? (alarm ? 0.45 + pulse * 0.45 : status === "safe" ? 0.3 : soft ? 0.16 : 0.4) + flash * 0.6 : selected ? 0.35 : 0;
      hm.opacity = reducedMotion ? want : THREE.MathUtils.lerp(hm.opacity, want, Math.min(1, delta * 6));
      hm.color.copy(m.color).multiplyScalar(2.2);
      const s = style.size * SIZE_SCALE * (3.6 + flash * 3.4 + pulse * 1.1);
      h.scale.set(s, s, 1);
      h.visible = hm.opacity > 0.01;
    }
    if (ring.current) ring.current.rotation.z += delta * 1.4;
  });

  const tilt = style.shape === "ring" || style.shape === "torus" ? Math.PI / 2.3 : 0;
  return (
    <group ref={group} position={position}>
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
          emissiveIntensity={0.14}
          roughness={0.3}
          metalness={0.45}
          transparent
          opacity={1}
          wireframe={node.label === "AgentRun"}
        />
      </mesh>
      <sprite ref={halo} visible={false}>
        <spriteMaterial ref={haloMat} map={tex} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      {selected && (
        <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[style.size * SIZE_SCALE * 1.9, 0.035, 8, 80]} />
          <meshBasicMaterial color={bright("#e0f2fe", 2.2)} transparent opacity={0.95} toneMapped={false} />
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
  useFrame((_, delta) => {
    if (!flowing || !animate || !ref.current) return;
    ref.current.material.dashOffset -= delta * 2.2;
  });
  const soft = hotColor === STATUS_COLOR.owner || hotColor === STATUS_COLOR.memory;
  const color = useMemo(
    () => (hotColor ? bright(hotColor, isNewFact ? 3.2 : soft ? 1.15 : 2.4) : new THREE.Color("#4d78ad")),
    [hotColor, isNewFact, soft],
  );
  const width = hotColor ? (isNewFact ? 3.4 : soft ? 1.6 : 2.6) : 1.1;
  const opacity = dimmed ? 0.04 : hotColor ? (soft ? 0.75 : 1) : 0.42;
  const common = {
    color,
    lineWidth: width,
    transparent: true,
    opacity,
    dashed: flowing || isNewFact,
    dashSize: 0.55,
    gapSize: 0.3,
    depthWrite: false,
    toneMapped: false,
  };
  if (crossFloor) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <QuadraticBezierLine ref={ref as any} start={a} end={b} mid={midpoint(a, b)} {...common} />;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <Line ref={ref as any} points={[a, b]} {...common} />;
});

type PacketSpec = { a: Vec3; b: Vec3; mid: Vec3 | null; speed: number; phase: number; size: number; color: THREE.Color; visible: boolean };

/** Data packets streaming along every dependency edge (one instanced draw call). */
function Packets({ specs }: { specs: PacketSpec[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    specs.forEach((s, i) => m.setColorAt(i, s.color));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    (m.material as THREE.Material).needsUpdate = true;
  }, [specs]);
  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < specs.length; i++) {
      const s = specs[i];
      const k = (t * s.speed + s.phase) % 1;
      if (s.mid) {
        const u = 1 - k;
        TMP.position.set(
          u * u * s.a[0] + 2 * u * k * s.mid[0] + k * k * s.b[0],
          u * u * s.a[1] + 2 * u * k * s.mid[1] + k * k * s.b[1],
          u * u * s.a[2] + 2 * u * k * s.mid[2] + k * k * s.b[2],
        );
      } else {
        TMP.position.set(s.a[0] + (s.b[0] - s.a[0]) * k, s.a[1] + (s.b[1] - s.a[1]) * k, s.a[2] + (s.b[2] - s.a[2]) * k);
      }
      TMP.scale.setScalar(s.visible ? s.size * (0.35 + 0.65 * Math.sin(k * Math.PI)) : 0);
      TMP.updateMatrix();
      m.setMatrixAt(i, TMP.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  if (!specs.length) return null;
  return (
    <instancedMesh key={specs.length} ref={mesh} args={[undefined, undefined, specs.length]} frustumCulled={false}>
      <sphereGeometry args={[1, 10, 8]} />
      <meshBasicMaterial toneMapped={false} transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} />
    </instancedMesh>
  );
}

// ── Ripple effects ────────────────────────────────────────────────────────────
function Shockwave({
  originRef,
  rippleKey,
  reducedMotion,
  fxRef,
}: {
  originRef: MutableRefObject<Vec3 | null>;
  rippleKey: number;
  reducedMotion: boolean;
  fxRef: MutableRefObject<Fx>;
}) {
  const group = useRef<THREE.Group>(null);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const shell = useRef<THREE.Mesh>(null);
  const beam = useRef<THREE.Mesh>(null);
  const core = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const start = useRef<number | null>(null);
  const amber = useMemo(() => bright("#fbbf24", 3), []);
  // Fires ONLY when a new inspect_change event arrives (rippleKey), never on graph refetches.
  useEffect(() => {
    if (rippleKey === 0 || reducedMotion || !originRef.current) return;
    start.current = performance.now();
    fxRef.current.boost = 1.1;
    fxRef.current.shake = 1;
    invalidate();
  }, [rippleKey, reducedMotion, originRef, fxRef]);
  useFrame(() => {
    const g = group.current;
    if (start.current === null || !g) return;
    const t = (performance.now() - start.current) / 3200;
    if (t >= 1) {
      start.current = null;
      g.visible = false;
      if (light.current) light.current.intensity = 0;
      return;
    }
    const o = originRef.current ?? [0, 0, 0];
    g.visible = true;
    FLOORS.forEach((f, i) => {
      const r = rings.current[i];
      if (!r) return;
      const ti = Math.min(1, Math.max(0, (t - i * 0.07) / 0.78));
      const ease = 1 - Math.pow(1 - ti, 3);
      r.position.set(o[0], f.y - 1.04, o[2]);
      r.scale.setScalar(0.4 + ease * 26);
      (r.material as THREE.MeshBasicMaterial).opacity = ti > 0 && ti < 1 ? 0.95 * (1 - ti) : 0;
    });
    const ease = 1 - Math.pow(1 - Math.min(1, t / 0.7), 3);
    if (shell.current) {
      shell.current.position.set(o[0], o[1], o[2]);
      shell.current.scale.setScalar(0.5 + ease * 15);
      shell.current.rotation.y += 0.01;
      (shell.current.material as THREE.MeshBasicMaterial).opacity = 0.28 * (1 - Math.min(1, t / 0.75));
    }
    if (beam.current) {
      beam.current.position.set(o[0], 0, o[2]);
      const a = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
      beam.current.scale.set(1 + Math.sin(t * 40) * 0.15, 1, 1 + Math.sin(t * 40) * 0.15);
      (beam.current.material as THREE.MeshBasicMaterial).opacity = 0.85 * Math.max(0, a);
    }
    if (core.current) {
      core.current.position.set(o[0], o[1], o[2]);
      const c = Math.max(0, 1 - t / 0.35);
      core.current.scale.setScalar(0.3 + (1 - c) * 1.8);
      (core.current.material as THREE.MeshBasicMaterial).opacity = c;
    }
    if (light.current) {
      light.current.position.set(o[0], o[1] + 1, o[2]);
      light.current.intensity = 90 * Math.pow(1 - t, 2);
    }
  });
  return (
    <group ref={group} visible={false}>
      {FLOORS.map((f, i) => (
        <mesh
          key={f.key}
          ref={(m) => {
            rings.current[i] = m;
          }}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.9, 1, 128]} />
          <meshBasicMaterial color={i === 1 ? amber : bright(f.color, 2.4)} transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      ))}
      <mesh ref={shell}>
        <icosahedronGeometry args={[1, 2]} />
        <meshBasicMaterial color={amber} transparent opacity={0} wireframe depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <mesh ref={beam}>
        <cylinderGeometry args={[0.16, 0.16, 26, 24, 1, true]} />
        <meshBasicMaterial color={amber} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh ref={core}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshBasicMaterial color={bright("#fff7ed", 2.6)} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <pointLight ref={light} color="#fbbf24" intensity={0} distance={30} />
    </group>
  );
}

type Ping = { id: string; pos: Vec3; at: number; color: string };

function Pings({ points, reducedMotion }: { points: Ping[]; reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = group.current;
    if (!g || reducedMotion) return;
    const now = performance.now();
    g.children.forEach((child, i) => {
      const p = points[i];
      if (!p) return;
      const t = (now - p.at) / 1200;
      const mesh = child as THREE.Mesh;
      if (t < 0 || t > 1) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      mesh.scale.setScalar(0.5 + t * 3.4);
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - t);
    });
  });
  if (reducedMotion) return null;
  return (
    <group ref={group}>
      {points.map((p) => (
        <mesh key={`${p.id}-${p.at}`} position={p.pos} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
          <ringGeometry args={[0.85, 1, 64]} />
          <meshBasicMaterial color={bright(p.color, 2.6)} transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Jitters the whole world for a moment after the shockwave. */
function Shaker({ fxRef, children }: { fxRef: MutableRefObject<Fx>; children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    const grp = g.current;
    if (!grp) return;
    const s = fxRef.current.shake;
    if (s > 0) {
      const a = 0.26 * s * s;
      grp.position.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
      fxRef.current.shake = Math.max(0, s - delta * 1.5);
    } else if (grp.position.lengthSq() > 0) {
      grp.position.set(0, 0, 0);
    }
  });
  return <group ref={g}>{children}</group>;
}

/** Projects 3D anchor points to screen space and moves the DOM label overlay (no React re-renders).
 *  Visible labels that would overlap are nudged upwards so names never sit on top of each other. */
function LabelProjector({ anchors, labelRefs }: { anchors: Map<string, Vec3>; labelRefs: LabelRefs }) {
  const { camera, size } = useThree();
  useFrame(() => {
    const items: { el: HTMLDivElement; x: number; y: number; scale: number; fade: number; w: number; h: number; solid: boolean; pin: boolean }[] = [];
    labelRefs.current.forEach((el, id) => {
      const p = anchors.get(id);
      if (!p) return;
      V.set(p[0], p[1], p[2]);
      const dist = camera.position.distanceTo(V);
      V.project(camera);
      if (V.z > 1 || V.z < -1) {
        el.style.visibility = "hidden";
        return;
      }
      const scale = Math.min(1.15, Math.max(0.82, 24 / dist));
      items.push({
        el,
        x: (V.x * 0.5 + 0.5) * size.width,
        y: (-V.y * 0.5 + 0.5) * size.height,
        scale,
        fade: Math.min(1, Math.max(0.3, (64 - dist) / 30)),
        w: el.offsetWidth * scale,
        h: el.offsetHeight * scale,
        solid: el.dataset.visible === "1",
        pin: el.dataset.floor === "1",
      });
    });
    items.sort((a, b) => b.y - a.y);
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    for (const it of items) {
      let y = it.y;
      // floor captions stay readable while the camera orbits: keep them inside the canvas
      if (it.pin) {
        it.x = Math.min(size.width - it.w / 2 - 10, Math.max(it.w / 2 + 10, it.x));
        y = Math.min(size.height - 58, Math.max(it.h + 44, y));
      }
      if (it.solid) {
        for (let pass = 0; pass < 3; pass++) {
          let moved = false;
          for (const q of placed) {
            const overlapX = Math.abs(q.x - it.x) < (q.w + it.w) / 2 + 2;
            const overlapY = y > q.y - q.h - 1 && y - it.h < q.y + 1;
            if (overlapX && overlapY) {
              y = q.y - q.h - 2;
              moved = true;
            }
          }
          if (!moved) break;
        }
        placed.push({ x: it.x, y, w: it.w, h: it.h });
      }
      it.el.style.visibility = "";
      it.el.style.setProperty("--fade", it.fade.toFixed(2));
      it.el.style.transform = `translate3d(${it.x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${it.scale.toFixed(3)})`;
    }
  });
  return null;
}

function CameraRig({
  command,
  positions,
  hotIds,
  reducedMotion,
}: {
  command: CameraCommand | null;
  positions: Map<string, Vec3>;
  hotIds: string[];
  reducedMotion: boolean;
}) {
  const { camera, controls } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera;
    controls: { target: THREE.Vector3; update: () => void } | null;
  };
  const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3; speed: number; until: number } | null>(null);
  // Cinematic fly-in from deep space on first mount.
  useEffect(() => {
    if (reducedMotion) return;
    goal.current = { pos: new THREE.Vector3(...DEFAULT_CAM), target: new THREE.Vector3(...DEFAULT_TARGET), speed: 1.3, until: performance.now() + 4200 };
  }, [reducedMotion]);
  useEffect(() => {
    if (!command) return;
    if (command.kind === "reset") {
      goal.current = { pos: new THREE.Vector3(...DEFAULT_CAM), target: new THREE.Vector3(...DEFAULT_TARGET), speed: 3.2, until: performance.now() + 2200 };
    } else if (command.kind === "focus" && command.target && positions.get(command.target)) {
      const p = new THREE.Vector3(...positions.get(command.target)!);
      goal.current = { pos: p.clone().add(new THREE.Vector3(2.5, 7, 12)), target: p, speed: 3.2, until: performance.now() + 2200 };
    } else if (command.kind === "fit") {
      const pts = hotIds.map((id) => positions.get(id)).filter((p): p is Vec3 => !!p);
      const { center, radius } = boundsOf(pts.length ? pts : [...positions.values()]);
      const c = new THREE.Vector3(...center);
      goal.current = { pos: c.clone().add(new THREE.Vector3(radius * 0.15, radius * 0.75 + 4, radius * 1.7 + 5)), target: c, speed: 3.2, until: performance.now() + 2200 };
    }
    invalidate();
  }, [command, positions, hotIds]);
  useFrame((state, delta) => {
    const g = goal.current;
    if (!g || !controls) return;
    const k = reducedMotion ? 1 : Math.min(1, delta * g.speed);
    camera.position.lerp(g.pos, k);
    controls.target.lerp(g.target, k);
    controls.update();
    // auto-rotate keeps nudging the camera, so a move also ends at its deadline
    if ((camera.position.distanceTo(g.pos) < 0.03 && controls.target.distanceTo(g.target) < 0.03) || performance.now() > g.until) goal.current = null;
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
  const fxRef = useRef<Fx>({ boost: 0, shake: 0 });
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

  const edgeInfo = useMemo(
    () =>
      edges.map((e) => {
        const a = positions.get(e.source);
        const b = positions.get(e.target);
        const hot = edgeHot(e, statuses);
        const dimmedByFocus = focus ? !(focus.has(e.source) && focus.has(e.target)) : false;
        const dimmedBySel = neighbours ? !(neighbours.has(e.source) && neighbours.has(e.target)) : false;
        return { e, a, b, ...hot, dimmed: dimmedByFocus || (dimmedBySel && !hot.color) };
      }),
    [edges, positions, statuses, focus, neighbours],
  );

  const packets = useMemo<PacketSpec[]>(() => {
    if (reducedMotion) return [];
    const out: PacketSpec[] = [];
    for (const x of edgeInfo) {
      if (!x.a || !x.b || !(FLOW_TYPES.has(x.e.type) || x.color)) continue;
      const mid = Math.abs(x.a[1] - x.b[1]) > 1 ? midpoint(x.a, x.b) : null;
      const n = x.color ? 3 : 1;
      const base = hash01(x.e.id);
      for (let i = 0; i < n; i++) {
        out.push({
          a: x.a,
          b: x.b,
          mid,
          speed: x.color ? 0.42 : 0.13 + base * 0.05,
          phase: base + i / n,
          size: x.color ? 0.12 : 0.095,
          color: x.color ? bright(x.color, 3.4) : bright("#7dd3fc", 2.6),
          visible: !x.dimmed,
        });
      }
    }
    return out;
  }, [edgeInfo, reducedMotion]);

  return (
    <>
      <color attach="background" args={[BG]} />
      <fogExp2 attach="fog" args={[BG, 0.0125]} />
      <ambientLight intensity={0.2} />
      <directionalLight position={[8, 18, 12]} intensity={0.75} />
      <pointLight position={[-14, 6, -10]} intensity={22} color="#38bdf8" distance={44} />
      <pointLight position={[10, -4, 10]} intensity={14} color="#a78bfa" distance={40} />
      <Backdrop reducedMotion={reducedMotion} />
      <Shaker fxRef={fxRef}>
        <Floors reducedMotion={reducedMotion} />
        {edgeInfo.map((x) =>
          x.a && x.b ? (
            <EdgeLine
              key={x.e.id}
              a={x.a}
              b={x.b}
              hotColor={x.color}
              flowing={x.flowing}
              isNewFact={x.isNewFact}
              dimmed={x.dimmed}
              animate={animate && !reducedMotion}
            />
          ) : null,
        )}
        <Packets specs={packets} />
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
        <Shockwave originRef={originRef} rippleKey={rippleKey} reducedMotion={reducedMotion} fxRef={fxRef} />
        <Pings points={revealState.pings} reducedMotion={reducedMotion} />
      </Shaker>
      <LabelProjector anchors={props.anchors} labelRefs={props.labelRefs} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        target={DEFAULT_TARGET}
        minDistance={6}
        maxDistance={70}
        autoRotate={props.autoRotate && !reducedMotion}
        autoRotateSpeed={0.42}
      />
      <CameraRig command={props.cameraCommand} positions={positions} hotIds={props.hotIds} reducedMotion={reducedMotion} />
      <Bloom fxRef={fxRef} />
    </>
  );
}

export default function RippleScene(props: RippleSceneProps) {
  const { graph, statuses, selectedId, affectedOnly, reducedMotion } = props;
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

  // Label anchors: just above each node, plus the three floor captions.
  const anchors = useMemo(() => {
    const m = new Map<string, Vec3>();
    for (const n of nodes) {
      const p = positions.get(n.id);
      if (p) m.set(n.id, [p[0], p[1] + (LABEL_STYLE[n.label]?.size ?? 0.5) * SIZE_SCALE + 0.45, p[2]]);
    }
    for (const f of FLOORS) m.set(f.key, [-16.2, f.y - 1.1, 10.2]);
    return m;
  }, [nodes, positions]);

  const labels = nodes.map((n) => {
    const status = statuses.get(n.id) ?? "neutral";
    const hot = status !== "neutral";
    const dimmed = (focus ? !focus.has(n.id) : false) || (neighbours ? !neighbours.has(n.id) && status === "neutral" : false);
    const visible =
      !dimmed &&
      (ALWAYS_LABELLED.has(n.label) ||
        hovered === n.id ||
        selectedId === n.id ||
        (!QUIET_LABELS.has(n.label) && (LABELLED_STATUSES.includes(status) || (neighbours?.has(n.id) ?? false))));
    const text = n.label === "DataRegion" ? n.code ?? n.name : n.ref && !["Contract", "Clause"].includes(n.label) ? n.ref : n.name;
    return { id: n.id, text, status, hot, visible, emphasis: selectedId === n.id || hovered === n.id };
  });

  return (
    <div className="relative h-full w-full">
      <Canvas
        frameloop={reducedMotion ? "demand" : "always"}
        dpr={[1, 1.5]}
        camera={{ position: reducedMotion ? DEFAULT_CAM : INTRO_CAM, fov: 44, near: 0.1, far: 420 }}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 0.95;
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
        {FLOORS.map((f) => (
          <div
            key={f.key}
            ref={(el) => {
              if (el) labelRefs.current.set(f.key, el);
              else labelRefs.current.delete(f.key);
            }}
            data-floor="1"
            className="absolute left-0 top-0 origin-bottom whitespace-nowrap text-[10.5px] font-semibold uppercase tracking-[0.2em]"
            style={{ visibility: "hidden", color: f.color, opacity: "calc(var(--fade, 1) * 0.85)", textShadow: `0 0 12px ${f.color}` }}
          >
            {f.label}
          </div>
        ))}
        {labels.map((l) => (
          <div
            key={l.id}
            ref={(el) => {
              if (el) labelRefs.current.set(l.id, el);
              else labelRefs.current.delete(l.id);
            }}
            data-visible={l.visible ? "1" : "0"}
            className="absolute left-0 top-0 origin-bottom whitespace-nowrap rounded-lg border px-1.5 py-[1px] text-[11px] font-medium leading-4 shadow-[0_6px_18px_-8px_rgba(0,0,0,0.9)] backdrop-blur-sm transition-opacity duration-300"
            style={{
              visibility: "hidden",
              opacity: l.visible ? "var(--fade, 1)" : 0,
              background: "rgba(5,9,22,0.72)",
              borderColor: l.hot ? `${STATUS_COLOR[l.status]}aa` : l.emphasis ? "rgba(125,211,252,0.7)" : "rgba(148,190,255,0.18)",
              color: l.hot || l.emphasis ? "#f8fafc" : "#c7d2e1",
              boxShadow: l.hot ? `0 0 14px -4px ${STATUS_COLOR[l.status]}` : undefined,
            }}
          >
            {l.hot && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: STATUS_COLOR[l.status], boxShadow: `0 0 6px ${STATUS_COLOR[l.status]}` }} />}
            {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}
