export function Logo({ size = 22, animated = false }: { size?: number; animated?: boolean }) {
  // three ripple arcs emanating from one connected node; when animated the arcs pulse outward in turn
  const arc = (delay: number) => (animated ? { className: "logo-arc", style: { animationDelay: `${delay}s` } } : {});
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden style={animated ? { filter: "drop-shadow(0 0 6px rgba(56,189,248,0.45))" } : undefined}>
      <circle cx="9" cy="16" r="3.2" fill="#f59e0b" />
      <path d="M14 10.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" {...arc(0)} />
      <path d="M18.5 7a12 12 0 0 1 0 18" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" opacity="0.85" {...arc(0.3)} />
      <path d="M23 3.8a16.5 16.5 0 0 1 0 24.4" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" opacity="0.45" {...arc(0.6)} />
      <circle cx="27.5" cy="16" r="1.8" fill="#ef4444" />
      <path d="M12.2 16h13.6" stroke="#64748b" strokeWidth="1" strokeDasharray="1.5 2" />
    </svg>
  );
}
