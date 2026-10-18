/** Decorative deep-space backdrop for the impact map: nebula (CSS), a seeded starfield and a glowing galaxy arm. */

// Seeded PRNG so server and client render the same stars (no hydration mismatch).
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
const STARS = Array.from({ length: 220 }, () => ({
  x: round(rand() * 1600),
  y: round(rand() * 900),
  r: round(rand() < 0.86 ? 0.5 + rand() * 0.7 : 1.2 + rand() * 0.9),
  o: round(0.25 + rand() * 0.7),
}));
const FLARES = Array.from({ length: 9 }, (_, i) => ({
  x: round(80 + rand() * 1440),
  y: round(40 + rand() * 820),
  s: round(5 + rand() * 7),
  hue: i % 3 === 0 ? "#fde68a" : "#e0f2fe",
  delay: round(rand() * 3.6),
}));

export function SpaceBackdrop() {
  return (
    <div aria-hidden className="space-backdrop pointer-events-none absolute inset-0 overflow-hidden">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="sb-arm" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#38bdf8" stopOpacity="0" />
            <stop offset="0.25" stopColor="#38bdf8" stopOpacity="0.9" />
            <stop offset="0.6" stopColor="#818cf8" stopOpacity="0.75" />
            <stop offset="1" stopColor="#c084fc" stopOpacity="0" />
          </linearGradient>
          <filter id="sb-soft" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          <filter id="sb-glow" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="2.5" />
          </filter>
          <radialGradient id="sb-flare">
            <stop offset="0" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* galaxy arm sweeping along the bottom */}
        <path d="M-40 820 C 260 700, 520 900, 860 790 S 1380 640, 1660 700" fill="none" stroke="url(#sb-arm)" strokeWidth="46" opacity="0.28" filter="url(#sb-soft)" />
        <path d="M-40 820 C 260 700, 520 900, 860 790 S 1380 640, 1660 700" fill="none" stroke="url(#sb-arm)" strokeWidth="5" opacity="0.7" filter="url(#sb-glow)" />
        <path d="M80 880 C 340 790, 600 940, 940 850" fill="none" stroke="url(#sb-arm)" strokeWidth="2" opacity="0.45" filter="url(#sb-glow)" />

        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#e2ecff" opacity={s.o} />
        ))}

        {FLARES.map((f, i) => (
          <g key={i} transform={`translate(${f.x} ${f.y})`} className="twinkle" style={{ animationDelay: `${f.delay}s` }}>
            <circle r={f.s * 1.6} fill="url(#sb-flare)" opacity="0.35" />
            <path
              d={`M0 ${-f.s * 2.2} L${f.s * 0.18} 0 L0 ${f.s * 2.2} L${-f.s * 0.18} 0 Z M${-f.s * 2.2} 0 L0 ${f.s * 0.18} L${f.s * 2.2} 0 L0 ${-f.s * 0.18} Z`}
              fill={f.hue}
              opacity="0.9"
            />
            <circle r={f.s * 0.28} fill="#fff" />
          </g>
        ))}
      </svg>
    </div>
  );
}
