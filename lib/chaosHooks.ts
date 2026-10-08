'use client';

/**
 * lib/chaosHooks.ts
 * ----------------------------------------------------------------------------
 * The client half of the design system. Split out of chaosTokens.ts so Server
 * Components can import tokens without pulling React and these hooks into the
 * client bundle.
 *
 * Import in client components only:
 *     import { usePrefersReducedMotion, useCountUp } from '@/lib/chaosHooks';
 */

import { useEffect, useRef, useState } from 'react';

/** True when the visitor has asked their OS to reduce motion. Respect it. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);
  return reduced;
}

/** Eased count-up from 0 → target on mount. Pass enabled=false to skip. */
export function useCountUp(target: number, duration = 1200, enabled = true): number {
  const [value, setValue] = useState(enabled ? 0 : target);
  const frame = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    };
  }, [target, duration, enabled]);

  // When disabled there is nothing to animate: show the target directly.
  return enabled ? value : target;
}
