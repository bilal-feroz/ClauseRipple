export function Logo({ size = 22 }: { size?: number }) {
  // three ripple arcs emanating from one connected node
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="9" cy="16" r="3.2" fill="#f59e0b" />
      <path d="M14 10.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />
      <path d="M18.5 7a12 12 0 0 1 0 18" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" opacity="0.85" />
      <path d="M23 3.8a16.5 16.5 0 0 1 0 24.4" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
      <circle cx="27.5" cy="16" r="1.8" fill="#ef4444" />
      <path d="M12.2 16h13.6" stroke="#64748b" strokeWidth="1" strokeDasharray="1.5 2" />
    </svg>
  );
}
