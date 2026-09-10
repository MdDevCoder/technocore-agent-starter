"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Custom interactive cyber cursor.
 *
 * Implements a dual-layer hardware-accelerated cursor:
 * 1. Inner precision dot (instant response with zero transform latency).
 * 2. Outer follower ring with fluid linear interpolation (LERP) physics.
 * 3. Interactive state transitions (expands & magnetizes over interactive targets, contracts cleanly on click).
 *
 * Guaranteed zero offset drift on click by synchronizing center coordinates and removing CSS transform transitions.
 */
export function CustomCursor() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isClicking, setIsClicking] = useState(false);
  const [isInput, setIsInput] = useState(false);

  // Raw mouse coordinates (for inner dot)
  const mousePos = useRef({ x: -100, y: -100 });
  // Interpolated coordinates (for trailing follower ring)
  const followerPos = useRef({ x: -100, y: -100 });
  const animFrameId = useRef<number | null>(null);

  const dotRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Only render on desktop pointers
    if (typeof window === "undefined") return;
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (isTouch || prefersReducedMotion) {
      return;
    }

    setMounted(true);

    const onMouseMove = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
      setVisible(true);

      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`;
      }

      // Check if hovering over interactive element
      const target = e.target as HTMLElement | null;
      if (target) {
        const isInteractive = Boolean(
          target.closest("a, button, [role='button'], .clickable, .cyber-card, summary, input[type='submit'], input[type='button']")
        );
        const isTextEntry = Boolean(
          target.closest("input[type='text'], input[type='url'], input[type='password'], input[type='email'], textarea, select")
        );

        setIsHovered(isInteractive);
        setIsInput(isTextEntry);
      }
    };

    const onMouseDown = () => {
      setIsClicking(true);
      // Instantly snap follower ring to mouse center on click to eliminate offset drift
      followerPos.current.x = mousePos.current.x;
      followerPos.current.y = mousePos.current.y;
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${mousePos.current.x}px, ${mousePos.current.y}px, 0) translate(-50%, -50%)`;
      }
    };

    const onMouseUp = () => setIsClicking(false);

    const onMouseEnter = () => setVisible(true);
    const onMouseLeave = () => {
      setVisible(false);
      setIsHovered(false);
      setIsClicking(false);
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    document.addEventListener("mouseenter", onMouseEnter);
    document.addEventListener("mouseleave", onMouseLeave);

    // Smooth LERP animation loop for outer ring
    const renderLoop = () => {
      const ease = 0.25; // responsive smoothness factor
      followerPos.current.x += (mousePos.current.x - followerPos.current.x) * ease;
      followerPos.current.y += (mousePos.current.y - followerPos.current.y) * ease;

      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${followerPos.current.x}px, ${followerPos.current.y}px, 0) translate(-50%, -50%)`;
      }

      animFrameId.current = requestAnimationFrame(renderLoop);
    };

    animFrameId.current = requestAnimationFrame(renderLoop);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("mouseenter", onMouseEnter);
      document.removeEventListener("mouseleave", onMouseLeave);
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
    };
  }, []);

  if (!mounted) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[99999] overflow-hidden select-none">
      {/* Precision Inner Dot (zero transform transition to maintain perfect pointer tracking) */}
      <div
        ref={dotRef}
        aria-hidden="true"
        style={{ willChange: "transform" }}
        className={`pointer-events-none fixed top-0 left-0 rounded-full transition-[width,height,background-color,opacity,box-shadow] duration-100 ease-out ${
          visible ? "opacity-100" : "opacity-0"
        } ${
          isClicking
            ? "size-2 bg-signal shadow-[0_0_10px_rgba(79,227,193,1)]"
            : isHovered
              ? "size-3 bg-signal shadow-[0_0_14px_rgba(79,227,193,0.9)]"
              : isInput
                ? "h-4 w-1 rounded-xs bg-signal"
                : "size-2 bg-signal shadow-[0_0_8px_rgba(79,227,193,0.7)]"
        }`}
      />

      {/* Trailing Outer Ring (centered on followerPos) */}
      <div
        ref={ringRef}
        aria-hidden="true"
        style={{ willChange: "transform" }}
        className={`pointer-events-none fixed top-0 left-0 rounded-full border transition-[width,height,border-color,background-color,opacity,box-shadow] duration-150 ease-out ${
          visible ? "opacity-100" : "opacity-0"
        } ${
          isClicking
            ? "size-7 border-signal bg-signal/30 shadow-[0_0_15px_rgba(79,227,193,0.4)]"
            : isHovered
              ? "size-11 border-signal/90 bg-signal/15 shadow-[0_0_20px_rgba(79,227,193,0.25)]"
              : isInput
                ? "size-7 border-hairline-bright bg-transparent opacity-40"
                : "size-8 border-signal/40 bg-signal/5"
        }`}
      />
    </div>
  );
}
