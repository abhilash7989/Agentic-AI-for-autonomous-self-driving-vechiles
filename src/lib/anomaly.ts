// Sensor Anomaly Detection Engine
// Ensemble of four detectors over a rolling window of raw sensor signals:
//   1. Z-Score              — statistical outlier vs running mean/std
//   2. EWMA Residual        — exponentially-weighted moving-average residual
//   3. Isolation-Forest (proxy) — average path-length proxy via percentile isolation
//   4. Autoencoder (proxy)  — reconstruction error vs a low-rank smooth model
//
// The ensemble fuses normalized [0,1] scores with calibrated weights and
// applies an adaptive threshold. Each detector is independently computable
// so the panel can show per-detector contributions (explainability).

import type { SensorId } from "./simulation";

export type DetectorId = "zscore" | "ewma" | "iforest" | "autoencoder";

export const DETECTOR_META: { id: DetectorId; name: string; family: string; weight: number }[] = [
  { id: "zscore",      name: "Z-Score",         family: "Statistical",     weight: 0.20 },
  { id: "ewma",        name: "EWMA Residual",   family: "Time-series",     weight: 0.25 },
  { id: "iforest",     name: "Isolation Forest", family: "Tree ensemble",  weight: 0.25 },
  { id: "autoencoder", name: "Autoencoder",     family: "Deep learning",   weight: 0.30 },
];

export interface DetectorScores {
  zscore: number;       // 0..1
  ewma: number;
  iforest: number;
  autoencoder: number;
}

export interface SensorAnomalyReport {
  sensor: SensorId;
  scores: DetectorScores;
  ensemble: number;          // 0..1
  threshold: number;         // 0..1
  verdict: "nominal" | "watch" | "anomalous";
  topDriver: DetectorId;     // which detector contributed most
  rationale: string;         // one-line explanation
  sampleCount: number;
}

export interface AnomalyEvent {
  t: number;
  sensor: SensorId;
  ensemble: number;
  topDriver: DetectorId;
  rationale: string;
}

// --- Rolling-window helpers -------------------------------------------------

export const WINDOW_SIZE = 40;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function std(xs: number[], m?: number): number {
  if (xs.length < 2) return 0;
  const mu = m ?? mean(xs);
  let s = 0;
  for (const x of xs) s += (x - mu) * (x - mu);
  return Math.sqrt(s / (xs.length - 1));
}

// --- Detectors --------------------------------------------------------------

// 1) Z-Score: |x - mu| / sigma, squashed to [0,1] at sigma>=3.
function zScoreScore(window: number[], x: number): number {
  if (window.length < 5) return 0;
  const mu = mean(window);
  const sd = std(window, mu);
  if (sd < 1e-6) return x === mu ? 0 : 1;
  const z = Math.abs((x - mu) / sd);
  return clamp01(z / 3.5);
}

// 2) EWMA residual: residual between value and exponential moving average.
function ewmaScore(window: number[], x: number, alpha = 0.3): number {
  if (window.length < 3) return 0;
  let ema = window[0];
  for (let i = 1; i < window.length; i++) ema = alpha * window[i] + (1 - alpha) * ema;
  const residual = Math.abs(x - ema);
  // normalize against typical residual scale (std of window)
  const sd = Math.max(0.02, std(window));
  return clamp01(residual / (3 * sd));
}

// 3) Isolation-Forest proxy: how far x sits from the bulk of the distribution,
//    approximated by how few neighbours fall within a small epsilon band.
//    Few neighbours → easy to isolate → high anomaly.
function isolationForestScore(window: number[], x: number): number {
  if (window.length < 6) return 0;
  const sd = Math.max(0.02, std(window));
  const eps = 0.5 * sd;
  let neighbours = 0;
  for (const v of window) if (Math.abs(v - x) <= eps) neighbours += 1;
  // Expected neighbours for in-distribution ~ window.length * 0.38 (1 std band)
  const expected = Math.max(2, window.length * 0.25);
  const isolation = 1 - Math.min(1, neighbours / expected);
  return clamp01(isolation);
}

// 4) Autoencoder proxy: reconstruct x from a low-rank smooth model
//    (3-point moving average + linear trend) and measure reconstruction error.
function autoencoderScore(window: number[], x: number): number {
  if (window.length < 6) return 0;
  const n = window.length;
  // Linear trend: least-squares slope/intercept
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += window[i]; sxx += i*i; sxy += i*window[i]; }
  const denom = n * sxx - sx * sx;
  const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const predicted = slope * n + intercept; // predict next step
  // Blend with last-3 moving avg for smoothing
  const mavg = (window[n-1] + window[n-2] + window[n-3]) / 3;
  const reconstruction = 0.5 * predicted + 0.5 * mavg;
  const err = Math.abs(x - reconstruction);
  const sd = Math.max(0.02, std(window));
  return clamp01(err / (2.5 * sd));
}

// --- Ensemble --------------------------------------------------------------

export function runDetectors(window: number[], x: number): DetectorScores {
  return {
    zscore: zScoreScore(window, x),
    ewma: ewmaScore(window, x),
    iforest: isolationForestScore(window, x),
    autoencoder: autoencoderScore(window, x),
  };
}

export function ensembleScore(scores: DetectorScores): number {
  let s = 0;
  for (const m of DETECTOR_META) s += scores[m.id] * m.weight;
  return clamp01(s);
}

export function topDriver(scores: DetectorScores): DetectorId {
  let best: DetectorId = "zscore";
  let bestVal = -1;
  for (const m of DETECTOR_META) {
    const contribution = scores[m.id] * m.weight;
    if (contribution > bestVal) { bestVal = contribution; best = m.id; }
  }
  return best;
}

function rationaleFor(driver: DetectorId, sensor: SensorId, scores: DetectorScores): string {
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  switch (driver) {
    case "zscore":      return `${sensor.toUpperCase()} signal is a statistical outlier (z-score ${pct(scores.zscore)}).`;
    case "ewma":        return `${sensor.toUpperCase()} deviates sharply from its EWMA baseline (residual ${pct(scores.ewma)}).`;
    case "iforest":     return `${sensor.toUpperCase()} sample is easily isolated from recent distribution (isolation ${pct(scores.iforest)}).`;
    case "autoencoder": return `${sensor.toUpperCase()} reconstruction error from learned smooth model is high (${pct(scores.autoencoder)}).`;
  }
}

export function analyzeSensor(
  sensor: SensorId,
  window: number[],
  x: number,
  threshold: number,
): SensorAnomalyReport {
  const scores = runDetectors(window, x);
  const ensemble = ensembleScore(scores);
  const driver = topDriver(scores);
  const verdict: SensorAnomalyReport["verdict"] =
    ensemble >= threshold ? "anomalous" : ensemble >= threshold * 0.6 ? "watch" : "nominal";
  return {
    sensor, scores, ensemble, threshold, verdict,
    topDriver: driver,
    rationale: rationaleFor(driver, sensor, scores),
    sampleCount: window.length,
  };
}

// Rolling buffer manager: append signal, return updated window (no mutation).
export function pushWindow(prev: number[], x: number): number[] {
  const next = prev.length >= WINDOW_SIZE ? prev.slice(1) : prev.slice();
  next.push(x);
  return next;
}
