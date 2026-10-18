"use client";

import { useEffect, useRef, useState } from "react";

/** Eases the displayed number towards `value` so live graph stats visibly tick when they change. */
export function useCountUp(value: number | undefined, duration = 900): number | undefined {
  const [shown, setShown] = useState<number | undefined>(undefined);
  const shownRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (value === undefined) return;
    const start = shownRef.current ?? 0;
    if (start === value) return;
    const t0 = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const k = duration <= 0 ? 1 : Math.min(1, (now - t0) / duration);
      const v = k < 1 ? start + (value - start) * (1 - Math.pow(1 - k, 3)) : value;
      shownRef.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return value === undefined ? undefined : (shown ?? 0);
}
