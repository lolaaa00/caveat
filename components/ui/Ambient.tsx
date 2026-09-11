'use client';

import { useEffect, useRef } from 'react';

/**
 * Ambient system field: two drifting colour masses, a cursor-tracking glow and a grain
 * overlay. Pure atmosphere — it renders behind everything, reacts to nothing, and carries
 * no information about any decision.
 */
export const Ambient = () => {
  const glow = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = glow.current;
    if (!node) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let targetX = x;
    let targetY = y;
    let frame = 0;

    const onMove = (event: MouseEvent) => {
      targetX = event.clientX;
      targetY = event.clientY;
    };

    const loop = () => {
      x += (targetX - x) * 0.08;
      y += (targetY - y) * 0.08;
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
      frame = requestAnimationFrame(loop);
    };

    window.addEventListener('mousemove', onMove);
    frame = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <div className="field" aria-hidden />
      <div className="cglow" ref={glow} aria-hidden />
      <div className="grain" aria-hidden />
    </>
  );
};
