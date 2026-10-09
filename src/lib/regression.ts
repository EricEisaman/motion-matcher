export interface LinearFit {
  m: number;
  b: number;
  r2: number;
  formula: string;
}

export interface QuadraticFit {
  a: number;
  b: number;
  c: number;
  r2: number;
  formula: string;
}

export type RegressionSpec =
  | { kind: "linear" }
  | { kind: "piecewise"; breakpoints: number[] }
  | { kind: "sinusoidal"; cycles: number; duration: number };

export interface RegressionFit {
  kind: RegressionSpec["kind"];
  r2: number;
  formula: string;
  predict: (t: number) => number;
}

export function fitRegression(
  pts: { t: number; y: number }[],
  spec: RegressionSpec,
): RegressionFit | null {
  if (pts.length < 2) return null;

  const minTime = Math.min(...pts.map((point) => point.t));
  const maxTime = Math.max(...pts.map((point) => point.t));
  const breakpoints =
    spec.kind === "piecewise"
      ? spec.breakpoints.filter((point) => point > minTime && point < maxTime)
      : [];
  const omega = spec.kind === "sinusoidal" ? (2 * Math.PI * spec.cycles) / spec.duration : 0;
  const basis = (t: number): number[] => {
    if (spec.kind === "linear") return [t, 1];
    if (spec.kind === "piecewise") {
      const segment = breakpoints.filter((point) => t >= point).length;
      const terms = Array.from({ length: 2 * (breakpoints.length + 1) }, () => 0);
      terms[2 * segment] = 1;
      terms[2 * segment + 1] = t - (segment === 0 ? 0 : breakpoints[segment - 1]!);
      return terms;
    }
    return [Math.sin(omega * t), Math.cos(omega * t), 1];
  };
  const rows = pts.map((point) => basis(point.t));
  if (pts.length < rows[0]!.length) return null;

  const coefficients = leastSquares(
    rows,
    pts.map((point) => point.y),
  );
  if (!coefficients) return null;
  const predict = (t: number) =>
    basis(t).reduce((value, term, index) => value + term * coefficients[index]!, 0);
  const meanY = pts.reduce((sum, point) => sum + point.y, 0) / pts.length;
  const ssTot = pts.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0);
  const ssRes = pts.reduce((sum, point) => sum + (point.y - predict(point.t)) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;

  let formula: string;
  if (spec.kind === "linear") {
    const [slope, intercept] = coefficients;
    formula = `y = ${slope!.toFixed(4)}·t ${intercept! >= 0 ? "+" : "−"} ${Math.abs(intercept!).toFixed(4)}`;
  } else if (spec.kind === "piecewise") {
    const knots = breakpoints.map((point) => point.toFixed(2)).join(", ");
    formula = `piecewise linear fit${knots ? ` at ${knots} s` : ""}`;
  } else {
    const amplitude = Math.hypot(coefficients[0]!, coefficients[1]!);
    const phase = Math.atan2(coefficients[1]!, coefficients[0]!);
    formula = `y = ${amplitude.toFixed(4)}·sin(${omega.toFixed(4)}·t ${phase >= 0 ? "+" : "−"} ${Math.abs(phase).toFixed(4)}) ${coefficients[2]! >= 0 ? "+" : "−"} ${Math.abs(coefficients[2]!).toFixed(4)}`;
  }

  return { kind: spec.kind, r2, formula, predict };
}

function leastSquares(rows: number[][], values: number[]): number[] | null {
  const columnCount = rows[0]!.length;
  const matrix = Array.from({ length: columnCount }, (_, row) =>
    Array.from({ length: columnCount }, (_, column) =>
      rows.reduce((sum, terms) => sum + terms[row]! * terms[column]!, 0),
    ),
  );
  const result = Array.from({ length: columnCount }, (_, row) =>
    rows.reduce((sum, terms, index) => sum + terms[row]! * values[index]!, 0),
  );

  for (let pivot = 0; pivot < columnCount; pivot += 1) {
    let maxRow = pivot;
    for (let row = pivot + 1; row < columnCount; row += 1) {
      if (Math.abs(matrix[row]![pivot]!) > Math.abs(matrix[maxRow]![pivot]!)) maxRow = row;
    }
    [matrix[pivot], matrix[maxRow]] = [matrix[maxRow]!, matrix[pivot]!];
    [result[pivot], result[maxRow]] = [result[maxRow]!, result[pivot]!];
    const divisor = matrix[pivot]![pivot]!;
    if (Math.abs(divisor) < 1e-12) return null;
    for (let column = pivot; column < columnCount; column += 1) {
      matrix[pivot]![column]! /= divisor;
    }
    result[pivot]! /= divisor;
    for (let row = 0; row < columnCount; row += 1) {
      if (row === pivot) continue;
      const factor = matrix[row]![pivot]!;
      for (let column = pivot; column < columnCount; column += 1) {
        matrix[row]![column]! -= factor * matrix[pivot]![column]!;
      }
      result[row]! -= factor * result[pivot]!;
    }
  }
  return result;
}

export function linearRegression(pts: { t: number; y: number }[]): LinearFit | null {
  const fit = fitRegression(pts, { kind: "linear" });
  if (!fit || pts.length < 2) return null;
  const first = fit.predict(0);
  const second = fit.predict(1);
  return { m: second - first, b: first, r2: fit.r2, formula: fit.formula };
}

export function quadraticRegression(pts: { t: number; y: number }[]): QuadraticFit | null {
  if (pts.length < 3) return null;
  const rows = pts.map(({ t }) => [t * t, t, 1]);
  const coefficients = leastSquares(
    rows,
    pts.map(({ y }) => y),
  );
  if (!coefficients) return null;
  const [a, b, c] = coefficients;
  const meanY = pts.reduce((sum, point) => sum + point.y, 0) / pts.length;
  const ssTot = pts.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0);
  const ssRes = pts.reduce(
    (sum, point) => sum + (point.y - (a! * point.t ** 2 + b! * point.t + c!)) ** 2,
    0,
  );
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
  return {
    a: a!,
    b: b!,
    c: c!,
    r2,
    formula: `y = ${a!.toFixed(4)}·t² ${b! >= 0 ? "+" : "−"} ${Math.abs(b!).toFixed(4)}·t ${c! >= 0 ? "+" : "−"} ${Math.abs(c!).toFixed(4)}`,
  };
}
