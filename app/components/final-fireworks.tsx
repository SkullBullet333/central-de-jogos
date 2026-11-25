'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import confetti from 'canvas-confetti';

export function FinalFireworks() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!canvasRef.current || reducedMotion) return;
    const fireworks = confetti.create(canvasRef.current, { resize: true, disableForReducedMotion: true });
    const burst = () => {
      if (document.hidden) return;
      const origin = { x: 0.12 + Math.random() * 0.76, y: 0.12 + Math.random() * 0.45 };
      fireworks({
        particleCount: 85,
        spread: 360,
        startVelocity: 28,
        decay: 0.94,
        gravity: 0.25,
        ticks: 100,
        scalar: 0.65,
        shapes: ['circle'],
        colors: ['#00995D', '#006642', '#F47920', '#FFFFFF'],
        origin,
        flat: true,
      });
    };
    burst();
    const timer = setInterval(burst, 650);
    return () => {
      clearInterval(timer);
      fireworks.reset();
    };
  }, [reducedMotion]);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 h-full w-full" />;
}
