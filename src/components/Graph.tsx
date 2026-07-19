import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { LinearFit, QuadraticFit } from "@/lib/regression";

export interface SeriesPoint {
  t: number;
  y: number;
}

export interface GraphProps {
  target: SeriesPoint[];
  user: SeriesPoint[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xLabel: string;
  yLabel: string;
  onSelectRegion?: (r: { t0: number; t1: number } | null) => void;
  selectedRegion?: { t0: number; t1: number } | null;
  linearFit?: LinearFit | null;
  quadraticFit?: QuadraticFit | null;
  globalLinearFit?: LinearFit | null;
  globalQuadraticFit?: QuadraticFit | null;
}

interface Readout {
  xPx: number;
  yPx: number;
  t: number;
  userY: number | null;
  targetY: number | null;
}

export function Graph(props: GraphProps) {
  const {
    target,
    user,
    xMin,
    xMax,
    yMin,
    yMax,
    xLabel,
    yLabel,
    onSelectRegion,
    selectedRegion,
    linearFit,
    quadraticFit,
    globalLinearFit,
    globalQuadraticFit,
  } = props;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 480 });
  const [readout, setReadout] = useState<Readout | null>(null);
  const [drag, setDrag] = useState<{ x0: number; x1: number } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(320, r.width), h: Math.max(320, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = { l: 60, r: 20, t: 20, b: 44 };
  const plotW = size.w - pad.l - pad.r;
  const plotH = size.h - pad.t - pad.b;

  const xToPx = (t: number) => pad.l + ((t - xMin) / (xMax - xMin)) * plotW;
  const yToPx = (y: number) => pad.t + (1 - (y - yMin) / (yMax - yMin)) * plotH;
  const pxToX = (px: number) => xMin + ((px - pad.l) / plotW) * (xMax - xMin);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size.w * dpr;
    c.height = size.h * dpr;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    // Background
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(pad.l, pad.t, plotW, plotH);

    // Grid
    ctx.strokeStyle = "rgba(148,163,184,0.15)";
    ctx.lineWidth = 1;
    ctx.font = "12px ui-sans-serif, system-ui";
    ctx.fillStyle = "#94a3b8";
    const xSteps = 8, ySteps = 6;
    for (let i = 0; i <= xSteps; i++) {
      const t = xMin + (i / xSteps) * (xMax - xMin);
      const x = xToPx(t);
      ctx.beginPath();
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, pad.t + plotH);
      ctx.stroke();
      ctx.fillText(t.toFixed(1), x - 10, pad.t + plotH + 16);
    }
    for (let i = 0; i <= ySteps; i++) {
      const y = yMin + (i / ySteps) * (yMax - yMin);
      const yPx = yToPx(y);
      ctx.beginPath();
      ctx.moveTo(pad.l, yPx);
      ctx.lineTo(pad.l + plotW, yPx);
      ctx.stroke();
      ctx.fillText(y.toFixed(2), 6, yPx + 4);
    }

    // Axis labels
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "13px ui-sans-serif, system-ui";
    ctx.fillText(xLabel, pad.l + plotW / 2 - 30, size.h - 8);
    ctx.save();
    ctx.translate(14, pad.t + plotH / 2 + 30);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();

    // Selected region
    if (selectedRegion) {
      const x0 = xToPx(selectedRegion.t0);
      const x1 = xToPx(selectedRegion.t1);
      ctx.fillStyle = "rgba(56,189,248,0.15)";
      ctx.fillRect(Math.min(x0, x1), pad.t, Math.abs(x1 - x0), plotH);
    }

    // Target curve
    if (target.length > 1) {
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      target.forEach((p, i) => {
        const x = xToPx(p.t);
        const y = yToPx(p.y);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // User trace
    if (user.length > 0) {
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      user.forEach((p, i) => {
        const x = xToPx(p.t);
        const y = yToPx(p.y);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      if (user.length === 1) {
        const p = user[0]!;
        ctx.fillStyle = "#38bdf8";
        ctx.beginPath();
        ctx.arc(xToPx(p.t), yToPx(p.y), 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Fits
    const drawFit = (fn: (t: number) => number, color: string, dash: number[]) => {
      ctx.strokeStyle = color;
      ctx.setLineDash(dash);
      ctx.lineWidth = 2;
      ctx.beginPath();
      const n = 120;
      for (let i = 0; i <= n; i++) {
        const t = xMin + (i / n) * (xMax - xMin);
        const x = xToPx(t);
        const y = yToPx(fn(t));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };
    if (linearFit) drawFit((t) => linearFit.m * t + linearFit.b, "#a3e635", [6, 4]);
    if (quadraticFit)
      drawFit(
        (t) => quadraticFit.a * t * t + quadraticFit.b * t + quadraticFit.c,
        "#f472b6",
        [4, 4],
      );
    if (globalLinearFit)
      drawFit((t) => globalLinearFit.m * t + globalLinearFit.b, "#22d3ee", [10, 4]);
    if (globalQuadraticFit)
      drawFit(
        (t) => globalQuadraticFit.a * t * t + globalQuadraticFit.b * t + globalQuadraticFit.c,
        "#c084fc",
        [2, 4],
      );

    // Drag rectangle
    if (drag) {
      const x0 = Math.min(drag.x0, drag.x1);
      const w = Math.abs(drag.x1 - drag.x0);
      ctx.fillStyle = "rgba(56,189,248,0.2)";
      ctx.strokeStyle = "#38bdf8";
      ctx.setLineDash([4, 3]);
      ctx.fillRect(x0, pad.t, w, plotH);
      ctx.strokeRect(x0, pad.t, w, plotH);
      ctx.setLineDash([]);
    }

    // Readout marker
    if (readout) {
      ctx.strokeStyle = "#e2e8f0";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(readout.xPx, pad.t);
      ctx.lineTo(readout.xPx, pad.t + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      if (readout.userY != null) {
        ctx.fillStyle = "#38bdf8";
        ctx.beginPath();
        ctx.arc(readout.xPx, yToPx(readout.userY), 4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (readout.targetY != null) {
        ctx.fillStyle = "#f59e0b";
        ctx.beginPath();
        ctx.arc(readout.xPx, yToPx(readout.targetY), 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Border
    ctx.strokeStyle = "rgba(148,163,184,0.5)";
    ctx.strokeRect(pad.l, pad.t, plotW, plotH);
  }, [
    size,
    target,
    user,
    xMin,
    xMax,
    yMin,
    yMax,
    xLabel,
    yLabel,
    selectedRegion,
    linearFit,
    quadraticFit,
    globalLinearFit,
    globalQuadraticFit,
    drag,
    readout,
    pad.l,
    pad.r,
    pad.t,
    pad.b,
    plotW,
    plotH,
  ]);

  const evtPx = (e: MouseEvent<HTMLCanvasElement>) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    const { x } = evtPx(e);
    if (x < pad.l || x > pad.l + plotW) return;
    if (e.shiftKey || e.button === 2) {
      setDrag({ x0: x, x1: x });
    } else {
      // Click readout: find nearest user point in time
      const t = pxToX(x);
      let nearest: SeriesPoint | null = null;
      let best = Infinity;
      for (const p of user) {
        const d = Math.abs(p.t - t);
        if (d < best) {
          best = d;
          nearest = p;
        }
      }
      let targetY: number | null = null;
      if (target.length) {
        // interpolate
        for (let i = 0; i < target.length - 1; i++) {
          const a = target[i]!;
          const b = target[i + 1]!;
          if (t >= a.t && t <= b.t) {
            const f = (t - a.t) / (b.t - a.t || 1);
            targetY = a.y + (b.y - a.y) * f;
            break;
          }
        }
      }
      setReadout({
        xPx: x,
        yPx: 0,
        t,
        userY: nearest?.y ?? null,
        targetY,
      });
    }
  };

  const onMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!drag) return;
    const { x } = evtPx(e);
    setDrag({ ...drag, x1: Math.max(pad.l, Math.min(pad.l + plotW, x)) });
  };

  const onMouseUp = () => {
    if (drag && onSelectRegion) {
      const t0 = pxToX(Math.min(drag.x0, drag.x1));
      const t1 = pxToX(Math.max(drag.x0, drag.x1));
      if (Math.abs(t1 - t0) > 0.05) onSelectRegion({ t0, t1 });
      else onSelectRegion(null);
    }
    setDrag(null);
  };

  return (
    <div ref={wrapRef} className="relative h-full min-h-[420px] w-full">
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h }}
        className="rounded-md bg-[#0b1220]"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onContextMenu={(e) => e.preventDefault()}
      />
      {readout && (
        <div className="pointer-events-none absolute right-4 top-4 rounded-md border border-slate-700 bg-slate-900/90 px-3 py-2 text-xs text-slate-100 shadow-lg">
          <div><span className="text-slate-400">t:</span> {readout.t.toFixed(2)} s</div>
          <div>
            <span className="text-sky-400">user:</span>{" "}
            {readout.userY != null ? readout.userY.toFixed(3) : "—"}
          </div>
          <div>
            <span className="text-amber-400">target:</span>{" "}
            {readout.targetY != null ? readout.targetY.toFixed(3) : "—"}
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-2 right-4 text-[10px] text-slate-500">
        click for readout · shift+drag or right-drag to select region
      </div>
    </div>
  );
}
