export type MotionMode = "position" | "velocity" | "acceleration";
export type Difficulty = "easy" | "medium" | "hard";

export interface TargetGraph {
  id: string;
  name: string;
  mode: MotionMode;
  difficulty: Difficulty;
  duration: number; // seconds
  // Returns the target value at time t (meters, m/s, m/s^2)
  fn: (t: number) => number;
  // Suggested y-axis range in position-space (m). Non-position modes still show
  // this range for context on their own units.
  yMin: number;
  yMax: number;
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function makePositionTarget(diff: Difficulty): TargetGraph {
  const duration = 15;
  const yMin = 0.5;
  const yMax = 2.5;
  const kind = Math.floor(Math.random() * (diff === "easy" ? 2 : diff === "medium" ? 4 : 5));
  let fn: (t: number) => number;
  let name = "";
  switch (kind) {
    case 0: {
      // Linear ramp
      const a = rand(yMin + 0.2, 1.2);
      const b = rand(yMax - 1.2, yMax - 0.2);
      fn = (t) => a + ((b - a) * t) / duration;
      name = "Constant velocity ramp";
      break;
    }
    case 1: {
      // Flat then ramp
      const a = rand(0.8, 1.4);
      const b = rand(1.8, 2.3);
      const t1 = duration / 2;
      fn = (t) => (t < t1 ? a : a + ((b - a) * (t - t1)) / (duration - t1));
      name = "Hold, then move away";
      break;
    }
    case 2: {
      // Triangle
      const lo = rand(0.7, 1.0);
      const hi = rand(1.8, 2.3);
      fn = (t) => {
        const half = duration / 2;
        return t < half
          ? lo + ((hi - lo) * t) / half
          : hi - ((hi - lo) * (t - half)) / half;
      };
      name = "Move away then return";
      break;
    }
    case 3: {
      // Sine wave
      const mid = rand(1.2, 1.6);
      const amp = rand(0.3, 0.6);
      const cycles = rand(1, 2);
      fn = (t) => mid + amp * Math.sin((2 * Math.PI * cycles * t) / duration);
      name = "Oscillating position";
      break;
    }
    default: {
      // Multi-segment
      const pts = [rand(0.8, 1.2), rand(1.6, 2.2), rand(0.8, 1.2), rand(1.6, 2.2), rand(0.8, 1.2)];
      const seg = duration / (pts.length - 1);
      fn = (t) => {
        const i = Math.min(pts.length - 2, Math.floor(t / seg));
        const local = (t - i * seg) / seg;
        return pts[i]! + (pts[i + 1]! - pts[i]!) * local;
      };
      name = "Multi-segment path";
      break;
    }
  }
  return {
    id: crypto.randomUUID(),
    name,
    mode: "position",
    difficulty: diff,
    duration,
    fn,
    yMin,
    yMax,
  };
}

function makeVelocityTarget(diff: Difficulty): TargetGraph {
  const duration = 15;
  const kind = Math.floor(Math.random() * (diff === "easy" ? 2 : 3));
  let fn: (t: number) => number;
  let name = "";
  switch (kind) {
    case 0: {
      const v = rand(-0.15, 0.15);
      fn = () => v;
      name = `Constant velocity ${v.toFixed(2)} m/s`;
      break;
    }
    case 1: {
      const a = rand(-0.2, 0.2);
      const b = rand(-0.2, 0.2);
      fn = (t) => a + ((b - a) * t) / duration;
      name = "Linearly changing velocity";
      break;
    }
    default: {
      const amp = rand(0.1, 0.25);
      const cycles = rand(1, 2);
      fn = (t) => amp * Math.sin((2 * Math.PI * cycles * t) / duration);
      name = "Oscillating velocity";
      break;
    }
  }
  return {
    id: crypto.randomUUID(),
    name,
    mode: "velocity",
    difficulty: diff,
    duration,
    fn,
    yMin: -0.4,
    yMax: 0.4,
  };
}

function makeAccelerationTarget(diff: Difficulty): TargetGraph {
  const duration = 15;
  const kind = Math.floor(Math.random() * (diff === "easy" ? 2 : 3));
  let fn: (t: number) => number;
  let name = "";
  switch (kind) {
    case 0: {
      const a = rand(-0.08, 0.08);
      fn = () => a;
      name = `Constant acceleration ${a.toFixed(2)} m/s²`;
      break;
    }
    case 1: {
      fn = (t) => (t < duration / 2 ? 0.08 : -0.08);
      name = "Step acceleration";
      break;
    }
    default: {
      const amp = rand(0.05, 0.12);
      fn = (t) => amp * Math.sin((2 * Math.PI * t) / duration);
      name = "Sinusoidal acceleration";
      break;
    }
  }
  return {
    id: crypto.randomUUID(),
    name,
    mode: "acceleration",
    difficulty: diff,
    duration,
    fn,
    yMin: -0.2,
    yMax: 0.2,
  };
}

export function generateTarget(mode: MotionMode, diff: Difficulty): TargetGraph {
  if (mode === "position") return makePositionTarget(diff);
  if (mode === "velocity") return makeVelocityTarget(diff);
  return makeAccelerationTarget(diff);
}

export function sampleTarget(t: TargetGraph, n = 200): { t: number; y: number }[] {
  const out: { t: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const time = (i / n) * t.duration;
    out.push({ t: time, y: t.fn(time) });
  }
  return out;
}
