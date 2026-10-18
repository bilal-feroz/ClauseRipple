/** The living backdrop behind the whole app: drifting nebulae, two parallax star layers,
 *  twinkling flares and the occasional shooting star. Pure CSS/SVG, GPU-composited. */

// Seeded PRNG so server and client render the same sky (no hydration mismatch).
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20261018);
const round = (n: number) => Math.round(n * 10) / 10;

const FAR_STARS = Array.from({ length: 300 }, () => ({
  x: round(rand() * 1600),
  y: round(rand() * 900),
  r: round(0.35 + rand() * 0.6),
  o: round(0.2 + rand() * 0.5),
}));

const NEAR_STARS = Array.from({ length: 90 }, () => ({
  x: round(rand() * 1600),
  y: round(rand() * 900),
  r: round(0.8 + rand() * 1.1),
  o: round(0.45 + rand() * 0.5),
  tw: rand() < 0.35,
  d: round(rand() * 4),
  hue: rand() < 0.2 ? "#fde68a" : rand() < 0.5 ? "#bae6fd" : "#e2ecff",
}));

const FLARES = Array.from({ length: 8 }, (_, i) => ({
  x: round(60 + rand() * 1480),
  y: round(40 + rand() * 820),
  s: round(4 + rand() * 6),
  hue: i % 3 === 0 ? "#fde68a" : "#e0f2fe",
  delay: round(rand() * 3.6),
}));

const NEBULAE = [
  { left: "52%", top: "-18%", w: "58vw", h: "62vh", c: "rgba(124, 58, 237, 0.42)", dur: 46, delay: 0 },
  { left: "-12%", top: "48%", w: "52vw", h: "64vh", c: "rgba(8, 145, 178, 0.36)", dur: 54, delay: -12 },
  { left: "2%", top: "-20%", w: "46vw", h: "52vh", c: "rgba(37, 99, 235, 0.32)", dur: 40, delay: -20 },
  { left: "36%", top: "42%", w: "34vw", h: "38vh", c: "rgba(219, 39, 119, 0.16)", dur: 60, delay: -6 },
  { left: "70%", top: "58%", w: "44vw", h: "56vh", c: "rgba(20, 184, 166, 0.22)", dur: 50, delay: -30 },
];

const SHOOTING = [
  { left: "8%", top: "12%", angle: "22deg", tx: "620px", ty: "250px", delay: "1.5s", dur: "11s" },
  { left: "58%", top: "6%", angle: "28deg", tx: "540px", ty: "290px", delay: "6.2s", dur: "13s" },
  { left: "30%", top: "64%", angle: "16deg", tx: "700px", ty: "200px", delay: "9.4s", dur: "17s" },
];

export function Cosmos() {
  return (
    <div aria-hidden className="cosmos">
      {NEBULAE.map((n, i) => (
        <div
          key={i}
          className="nebula"
          style={{
            left: n.left,
            top: n.top,
            width: n.w,
            height: n.h,
            background: `radial-gradient(closest-side, ${n.c}, transparent)`,
            animationDuration: `${n.dur}s`,
            animationDelay: `${n.delay}s`,
          }}
        />
      ))}

      <svg className="star-layer" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        {FAR_STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#cfe0ff" opacity={s.o} />
        ))}
      </svg>

      <svg className="star-layer" style={{ animationDuration: "90s", animationDirection: "alternate-reverse" }} viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="cosmos-flare">
            <stop offset="0" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        {NEAR_STARS.map((s, i) => (
          <circle
            key={i}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill={s.hue}
            opacity={s.o}
            className={s.tw ? "twinkle" : undefined}
            style={s.tw ? { animationDelay: `${s.d}s` } : undefined}
          />
        ))}
        {FLARES.map((f, i) => (
          <g key={i} transform={`translate(${f.x} ${f.y})`} className="twinkle" style={{ animationDelay: `${f.delay}s` }}>
            <circle r={f.s * 1.8} fill="url(#cosmos-flare)" opacity="0.3" />
            <path
              d={`M0 ${-f.s * 2.2} L${f.s * 0.16} 0 L0 ${f.s * 2.2} L${-f.s * 0.16} 0 Z M${-f.s * 2.2} 0 L0 ${f.s * 0.16} L${f.s * 2.2} 0 L0 ${-f.s * 0.16} Z`}
              fill={f.hue}
              opacity="0.85"
            />
            <circle r={f.s * 0.26} fill="#fff" />
          </g>
        ))}
      </svg>

      {SHOOTING.map((s, i) => (
        <span
          key={i}
          className="shooting-star"
          style={
            {
              left: s.left,
              top: s.top,
              animationDelay: s.delay,
              animationDuration: s.dur,
              "--angle": s.angle,
              "--travel-x": s.tx,
              "--travel-y": s.ty,
            } as React.CSSProperties
          }
        />
      ))}

      <div className="vignette" />
    </div>
  );
}
