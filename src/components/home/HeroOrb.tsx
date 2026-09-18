"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A wire orb: stacked latitude rings whose radius is modulated by a few slow
 * travelling waves, so the sphere looks like it is turning and breathing.
 * Pure 2D canvas, one path per ring, no dependencies.
 */
export function HeroOrb({
  size = 640,
  slices = 60,
  stroke = "#3D3B4F",
  lineWidth = 0.7,
  opacity = 0.8,
  speed = 1,
  className,
}: {
  size?: number;
  slices?: number;
  stroke?: string;
  lineWidth?: number;
  opacity?: number;
  speed?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [px, setPx] = useState(size);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => {
      const w = box.clientWidth;
      if (w > 0) setPx(Math.max(160, Math.min(size, w)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [size]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = px * dpr;
    canvas.height = px * dpr;
    ctx.scale(dpr, dpr);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    // Wave set: four lobes with two overtones, a gentle lean to the right.
    const lobes = 4;
    const amps = [0.13, 0.06, 0.035];
    const lean = 0.12;
    const cx = px / 2;
    const R = px * 0.42;
    const squash = 0.3;
    const steps = 120;

    let phase = 0;
    let tilt = 0;
    let raf = 0;
    let alive = true;

    const draw = () => {
      if (!alive) return;
      ctx.clearRect(0, 0, px, px);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      const wobble = Math.sin(tilt) * 0.06;
      for (let g = 0; g < slices; g++) {
        const lat = -1 + (2 * g) / (slices - 1);
        const ring = Math.sqrt(Math.max(0, 1 - lat * lat));
        if (ring < 0.02) continue;
        ctx.beginPath();
        for (let k = 0; k <= steps; k++) {
          const a = (k / steps) * Math.PI * 2;
          let q = 1;
          for (let l = 0; l < amps.length; l++) q += amps[l] * Math.cos((lobes + l) * a + phase * (1 + l * 0.14) + lat * 1.5);
          q *= ring;
          const x = cx + q * R * Math.cos(a) + lean * R * lat;
          const y = cx + lat * R * (0.92 + wobble) + q * R * squash * Math.sin(a);
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.globalAlpha = opacity * (0.35 + 0.65 * ring);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (!reduced) {
        phase += 0.0032 * speed;
        tilt += 0.004 * speed;
        raf = requestAnimationFrame(draw);
      }
    };
    draw();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [px, slices, stroke, lineWidth, opacity, speed]);

  return (
    <div ref={boxRef} className={className}>
      <canvas ref={canvasRef} style={{ width: px, height: px }} aria-hidden="true" />
    </div>
  );
}
