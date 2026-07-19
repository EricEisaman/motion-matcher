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

export function linearRegression(pts: { t: number; y: number }[]): LinearFit | null {
  const n = pts.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of pts) {
    sx += p.t;
    sy += p.y;
    sxx += p.t * p.t;
    sxy += p.t * p.y;
  }
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-12) return null;
  const m = (n * sxy - sx * sy) / denom;
  const b = (sy - m * sx) / n;
  const meanY = sy / n;
  let ssTot = 0, ssRes = 0;
  for (const p of pts) {
    ssTot += (p.y - meanY) ** 2;
    ssRes += (p.y - (m * p.t + b)) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
  return {
    m,
    b,
    r2,
    formula: `y = ${m.toFixed(4)}·t ${b >= 0 ? "+" : "−"} ${Math.abs(b).toFixed(4)}`,
  };
}

// Solve 3x3 normal equations for quadratic y = a t^2 + b t + c
export function quadraticRegression(pts: { t: number; y: number }[]): QuadraticFit | null {
  const n = pts.length;
  if (n < 3) return null;
  let S0 = n, S1 = 0, S2 = 0, S3 = 0, S4 = 0;
  let T0 = 0, T1 = 0, T2 = 0;
  for (const p of pts) {
    const x = p.t;
    const y = p.y;
    const x2 = x * x;
    S1 += x;
    S2 += x2;
    S3 += x2 * x;
    S4 += x2 * x2;
    T0 += y;
    T1 += x * y;
    T2 += x2 * y;
  }
  // Matrix M * [a,b,c]^T = R with M = [[S4,S3,S2],[S3,S2,S1],[S2,S1,S0]], R=[T2,T1,T0]
  const M: number[][] = [
    [S4, S3, S2],
    [S3, S2, S1],
    [S2, S1, S0],
  ];
  const R = [T2, T1, T0];
  const sol = solve3(M, R);
  if (!sol) return null;
  const [a, b, c] = sol;
  const meanY = T0 / n;
  let ssTot = 0, ssRes = 0;
  for (const p of pts) {
    ssTot += (p.y - meanY) ** 2;
    ssRes += (p.y - (a * p.t * p.t + b * p.t + c)) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
  return {
    a,
    b,
    c,
    r2,
    formula: `y = ${a.toFixed(4)}·t² ${b >= 0 ? "+" : "−"} ${Math.abs(b).toFixed(4)}·t ${
      c >= 0 ? "+" : "−"
    } ${Math.abs(c).toFixed(4)}`,
  };
}

function solve3(M: number[][], R: number[]): [number, number, number] | null {
  // Gaussian elimination
  const A = M.map((row, i) => [...row, R[i]!]);
  for (let i = 0; i < 3; i++) {
    let maxRow = i;
    for (let k = i + 1; k < 3; k++) {
      if (Math.abs(A[k]![i]!) > Math.abs(A[maxRow]![i]!)) maxRow = k;
    }
    [A[i], A[maxRow]] = [A[maxRow]!, A[i]!];
    const piv = A[i]![i]!;
    if (Math.abs(piv) < 1e-12) return null;
    for (let k = i + 1; k < 3; k++) {
      const f = A[k]![i]! / piv;
      for (let j = i; j < 4; j++) A[k]![j]! -= f * A[i]![j]!;
    }
  }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let s = A[i]![3]!;
    for (let j = i + 1; j < 3; j++) s -= A[i]![j]! * x[j]!;
    x[i] = s / A[i]![i]!;
  }
  return [x[0]!, x[1]!, x[2]!];
}
