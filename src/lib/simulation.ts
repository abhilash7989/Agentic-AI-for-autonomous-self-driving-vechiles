// Agentic AI Sensor Failure Recovery — client-side simulation engine
// Mirrors the architecture diagram: Sensor Layer → Acquisition → Perception/Fusion
// + Health Monitoring → Agentic Decision → Recovery/Redundancy → Perception Output → Vehicle Control

export type SensorId = "camera" | "lidar" | "radar" | "gps" | "imu";

export interface SensorSpec {
  id: SensorId;
  name: string;
  subtitle: string;
  unit: string;
  // possible failures
  failures: string[];
}

export const SENSORS: SensorSpec[] = [
  { id: "camera", name: "Camera", subtitle: "RGB / Depth",       unit: "fps", failures: ["Black frames", "Frozen frames", "Motion blur", "Overexposure", "Underexposure", "Low visibility"] },
  { id: "lidar",  name: "LiDAR",  subtitle: "Point Cloud",       unit: "kpts", failures: ["Missing points", "Sparse cloud", "Noise corruption", "Sensor blackout"] },
  { id: "radar",  name: "Radar",  subtitle: "Object / Distance", unit: "Hz",  failures: ["Signal loss", "False reflections", "Noise spikes"] },
  { id: "gps",    name: "GPS",    subtitle: "Location",          unit: "m",   failures: ["Drift", "Position jump", "Signal loss"] },
  { id: "imu",    name: "IMU",    subtitle: "Accel / Orient.",   unit: "m/s²", failures: ["Sensor drift", "Invalid readings"] },
];

export interface SensorState {
  id: SensorId;
  health: number;        // 0..1
  anomaly: number;       // 0..1 (higher = more anomalous)
  confidence: number;    // 0..1
  signal: number;        // raw stream value
  status: "healthy" | "degraded" | "failed";
  failure: string | null;
  rul: number;           // remaining useful life %
}

export interface FusionWeights {
  camera: number; lidar: number; radar: number; gps: number; imu: number;
}

export interface PerceptionMode {
  name: string;
  active: SensorId[];
  fusion: "Early" | "Late" | "Weighted Deep";
  description: string;
}

export interface AgentDecision {
  t: number;
  phase: "Observe" | "Analyze" | "Diagnose" | "Reason" | "Plan" | "Act" | "Monitor" | "Learn";
  sensor?: SensorId;
  message: string;
  severity: "info" | "warn" | "critical" | "success";
}

export interface TelemetryPoint {
  t: number;
  camera: number; lidar: number; radar: number; gps: number; imu: number;
  fusion: number; safety: number; risk: number;
}

// --- Redundancy matrix (primary → ordered backups) ---
export const REDUNDANCY: Record<SensorId, SensorId[]> = {
  camera: ["lidar", "radar"],
  lidar:  ["camera", "radar"],
  radar:  ["lidar", "camera"],
  gps:    ["imu", "lidar"],
  imu:    ["gps", "lidar"],
};

// --- Perception pipelines selected by agent based on health ---
export function selectPipeline(states: Record<SensorId, SensorState>): PerceptionMode {
  const ok = (id: SensorId) => states[id].status !== "failed";
  if (ok("camera") && ok("lidar") && ok("radar") && ok("gps"))
    return { name: "Nominal Multimodal", active: ["camera","lidar","radar","gps","imu"], fusion: "Weighted Deep",
             description: "All sensors healthy — deep weighted fusion across full stack." };
  if (!ok("camera") && ok("lidar") && ok("radar"))
    return { name: "LiDAR-Radar Fallback", active: ["lidar","radar","gps","imu"], fusion: "Late",
             description: "Camera disabled. Geometry-first perception via LiDAR + Radar." };
  if (!ok("lidar") && ok("camera") && ok("radar"))
    return { name: "Vision-Radar Fallback", active: ["camera","radar","gps","imu"], fusion: "Late",
             description: "LiDAR disabled. Vision-led perception, radar for range." };
  if (!ok("gps") && ok("imu"))
    return { name: "Dead-Reckoning Localization", active: ["camera","lidar","radar","imu"], fusion: "Weighted Deep",
             description: "GPS lost — IMU + LiDAR odometry for localization." };
  if (!ok("radar") && ok("camera") && ok("lidar"))
    return { name: "Camera-LiDAR Fusion", active: ["camera","lidar","gps","imu"], fusion: "Early",
             description: "Radar disabled. Early fusion of camera depth + LiDAR." };
  // last-resort
  const surviving = (Object.keys(states) as SensorId[]).filter(ok);
  return { name: "Graceful Degradation", active: surviving, fusion: "Late",
           description: "Multiple failures — minimum-viable perception, reduce speed envelope." };
}

export function computeFusionWeights(states: Record<SensorId, SensorState>, mode: PerceptionMode): FusionWeights {
  const w: FusionWeights = { camera: 0, lidar: 0, radar: 0, gps: 0, imu: 0 };
  let sum = 0;
  for (const id of mode.active) {
    const c = states[id].confidence;
    w[id] = c;
    sum += c;
  }
  if (sum > 0) (Object.keys(w) as SensorId[]).forEach(k => (w[k] = +(w[k] / sum).toFixed(3)));
  return w;
}

export function fusionConfidence(states: Record<SensorId, SensorState>, mode: PerceptionMode): number {
  if (mode.active.length === 0) return 0;
  const avg = mode.active.reduce((s, id) => s + states[id].confidence, 0) / mode.active.length;
  // diversity bonus
  const div = Math.min(1, mode.active.length / 4) * 0.1;
  return Math.min(1, avg + div);
}

export function safetyScore(fusion: number, failed: number): number {
  return Math.max(0, Math.min(1, fusion - failed * 0.18));
}

// --- Healthy baseline simulator ---
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

export function createInitialStates(): Record<SensorId, SensorState> {
  // Deterministic per-sensor RUL so SSR and client hydration match.
  const ruls: Record<SensorId, number> = { camera: 96, lidar: 94, radar: 92, gps: 98, imu: 95 };
  const mk = (id: SensorId): SensorState => ({
    id, health: 0.98, anomaly: 0.05, confidence: 0.95,
    signal: 0.5, status: "healthy", failure: null, rul: ruls[id],
  });
  return { camera: mk("camera"), lidar: mk("lidar"), radar: mk("radar"), gps: mk("gps"), imu: mk("imu") };
}

const rand = rng(7);

export function stepSensor(prev: SensorState, injected: string | null, t: number): SensorState {
  // baseline drift
  let signal = 0.5 + Math.sin(t / 7 + prev.id.length) * 0.15 + (rand() - 0.5) * 0.05;
  let anomaly = Math.max(0, prev.anomaly + (rand() - 0.55) * 0.04);
  let health = Math.min(1, prev.health + (rand() - 0.5) * 0.01);
  let failure = prev.failure;
  let status: SensorState["status"] = prev.status;
  let rul = Math.max(0, prev.rul - 0.02);

  if (injected) {
    failure = injected;
    status = "failed";
    anomaly = 0.85 + rand() * 0.1;
    health = Math.max(0.05, health - 0.6);
    signal = injected.toLowerCase().includes("freeze") ? prev.signal
           : injected.toLowerCase().includes("black") || injected.toLowerCase().includes("loss") ? 0
           : signal + (rand() - 0.5) * 0.8;
  } else if (prev.status === "failed") {
    // gradual recovery if injection cleared
    status = anomaly < 0.3 ? "healthy" : "degraded";
    if (status === "healthy") { failure = null; health = Math.min(1, health + 0.05); anomaly *= 0.7; }
  } else if (anomaly > 0.5) {
    status = "degraded";
  } else {
    status = "healthy";
  }

  const confidence = Math.max(0, Math.min(1, health * (1 - anomaly)));
  return { ...prev, signal, anomaly, health, confidence, failure, status, rul };
}

// --- Agentic AI controller ---
// Produces decisions explaining the OODA-style loop reactions to state changes.
export function agentReact(
  prev: Record<SensorId, SensorState>,
  next: Record<SensorId, SensorState>,
  t: number,
): AgentDecision[] {
  const out: AgentDecision[] = [];
  for (const id of Object.keys(next) as SensorId[]) {
    if (prev[id].status !== "failed" && next[id].status === "failed") {
      out.push({ t, phase: "Diagnose", sensor: id, severity: "critical",
        message: `Failure diagnosed on ${id.toUpperCase()}: "${next[id].failure}". Anomaly score ${next[id].anomaly.toFixed(2)}, confidence ${next[id].confidence.toFixed(2)}.` });
      const backups = REDUNDANCY[id].filter(b => next[b].status !== "failed");
      out.push({ t: t + 0.01, phase: "Reason", sensor: id, severity: "warn",
        message: `Impact assessment — ${id.toUpperCase()} contributes to perception. Healthy backups available: ${backups.map(b=>b.toUpperCase()).join(", ") || "none"}.` });
      out.push({ t: t + 0.02, phase: "Plan", sensor: id, severity: "info",
        message: backups.length
          ? `Plan: disable ${id.toUpperCase()}, activate ${backups[0].toUpperCase()} as primary, rebalance fusion weights, reconfigure inference pipeline.`
          : `Plan: enter graceful degradation, reduce speed envelope, raise risk threshold.` });
      out.push({ t: t + 0.03, phase: "Act", sensor: id, severity: "success",
        message: `Action executed: pipeline reconfigured, ${id.toUpperCase()} excluded from fusion. Perception continuity maintained.` });
    }
    if (prev[id].status === "failed" && next[id].status !== "failed") {
      out.push({ t, phase: "Learn", sensor: id, severity: "success",
        message: `${id.toUpperCase()} recovered. Knowledge base updated with failure pattern "${prev[id].failure}". Reintegrating with reduced initial weight.` });
    }
  }
  return out;
}

export function predictFailure(s: SensorState): { risk: number; eta: string } {
  // simple heuristic combining anomaly trend, RUL and confidence
  const risk = Math.min(1, s.anomaly * 0.6 + (1 - s.health) * 0.3 + (1 - s.rul / 100) * 0.4);
  const eta = risk > 0.7 ? "imminent" : risk > 0.45 ? "< 5 min" : risk > 0.25 ? "< 30 min" : "stable";
  return { risk, eta };
}
