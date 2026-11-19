import React, { useEffect, useRef } from 'react';

interface Dot {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  phase: number;
  size: number;
}

export function InteractiveDots() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
    active: false,
  });
  const offsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    // Respect user's motion preferences
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let dots: Dot[] = [];
    const spacing = 42;

    const initDots = () => {
      dots = [];
      const cols = Math.ceil(width / spacing) + 2;
      const rows = Math.ceil(height / spacing) + 2;
      const startX = (width - (cols - 1) * spacing) / 2;
      const startY = (height - (rows - 1) * spacing) / 2;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const bx = startX + c * spacing;
          const by = startY + r * spacing;
          dots.push({
            x: bx,
            y: by,
            baseX: bx,
            baseY: by,
            phase: (c * 0.4 + r * 0.6) % (Math.PI * 2),
            size: 1.25,
          });
        }
      }
    };

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
      initDots();
    };

    handleResize();

    const handlePointerMove = (e: PointerEvent | MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
      mouseRef.current.active = true;
    };

    const handlePointerLeave = () => {
      mouseRef.current.active = false;
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerleave', handlePointerLeave, { passive: true });
    window.addEventListener('resize', handleResize);

    let isDark = document.documentElement.classList.contains('dark');
    const observer = new MutationObserver(() => {
      isDark = document.documentElement.classList.contains('dark');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const render = (time: number) => {
      // Target collective offset based on mouse position relative to center
      const centerX = width / 2;
      const centerY = height / 2;
      const targetOffsetX = mouseRef.current.active
        ? ((mouseRef.current.x - centerX) / centerX) * 22
        : Math.sin(time * 0.0008) * 8;
      const targetOffsetY = mouseRef.current.active
        ? ((mouseRef.current.y - centerY) / centerY) * 22
        : Math.cos(time * 0.0008) * 8;

      // Smooth damping interpolation (all dots glide together)
      const lerpFactor = 0.06;
      offsetRef.current.x += (targetOffsetX - offsetRef.current.x) * lerpFactor;
      offsetRef.current.y += (targetOffsetY - offsetRef.current.y) * lerpFactor;

      ctx.clearRect(0, 0, width, height);

      const mouseX = mouseRef.current.x;
      const mouseY = mouseRef.current.y;
      const influenceRadius = 160;
      const influenceRadiusSq = influenceRadius * influenceRadius;

      // Colors
      const baseDotColor = isDark ? 'rgba(99, 102, 241, 0.22)' : 'rgba(37, 99, 235, 0.20)';
      const activeColorPrefix = isDark ? '129, 140, 248' : '37, 99, 235';
      const lineColorPrefix = isDark ? '99, 102, 241' : '59, 130, 246';

      // 1. Draw base dots batch
      ctx.beginPath();
      ctx.fillStyle = baseDotColor;

      const activeDots: { x: number; y: number; factor: number; size: number }[] = [];

      for (let i = 0; i < dots.length; i++) {
        const dot = dots[i];

        // Collective floating + cursor-driven offset
        const ambientX = Math.sin(time * 0.0012 + dot.phase) * 1.8;
        const ambientY = Math.cos(time * 0.0012 + dot.phase) * 1.8;

        let curX = dot.baseX + offsetRef.current.x + ambientX;
        let curY = dot.baseY + offsetRef.current.y + ambientY;

        // Local magnetic attraction / ripple near cursor
        if (mouseRef.current.active) {
          const dx = mouseX - curX;
          const dy = mouseY - curY;
          const distSq = dx * dx + dy * dy;

          if (distSq < influenceRadiusSq) {
            const dist = Math.sqrt(distSq);
            const factor = 1 - dist / influenceRadius;
            // Magnetic pull towards cursor
            curX += (dx / dist) * factor * 14;
            curY += (dy / dist) * factor * 14;

            activeDots.push({
              x: curX,
              y: curY,
              factor,
              size: dot.size + factor * 1.5,
            });
            continue; // Drawn in active pass with glow
          }
        }

        ctx.moveTo(curX + dot.size, curY);
        ctx.arc(curX, curY, dot.size, 0, Math.PI * 2);
      }
      ctx.fill();

      // 2. Draw connecting lines between active dots near the cursor
      if (activeDots.length > 1) {
        ctx.beginPath();
        for (let i = 0; i < activeDots.length; i++) {
          const a = activeDots[i];
          for (let j = i + 1; j < activeDots.length; j++) {
            const b = activeDots[j];
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            if (dist < 60) {
              const alpha = (1 - dist / 60) * Math.min(a.factor, b.factor) * 0.45;
              ctx.strokeStyle = `rgba(${lineColorPrefix}, ${alpha.toFixed(3)})`;
              ctx.lineWidth = 0.8;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
        }
      }

      // 3. Draw active dots with glowing highlights
      for (let i = 0; i < activeDots.length; i++) {
        const ad = activeDots[i];
        const alpha = 0.35 + ad.factor * 0.55;
        ctx.beginPath();
        ctx.fillStyle = `rgba(${activeColorPrefix}, ${alpha.toFixed(2)})`;
        ctx.arc(ad.x, ad.y, ad.size, 0, Math.PI * 2);
        ctx.fill();

        // Subtle soft outer halo for the closest dots
        if (ad.factor > 0.6) {
          ctx.beginPath();
          ctx.fillStyle = `rgba(${activeColorPrefix}, ${(ad.factor * 0.15).toFixed(2)})`;
          ctx.arc(ad.x, ad.y, ad.size * 2.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerleave', handlePointerLeave);
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-75 dark:opacity-85 transition-opacity duration-300"
    />
  );
}
