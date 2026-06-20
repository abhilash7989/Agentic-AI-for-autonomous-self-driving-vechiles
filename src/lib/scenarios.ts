// Scripted multi-sensor failure scenarios for the Agentic AI demonstrator.
// A scenario is a timeline (in simulation ticks, relative to scenario start)
// of inject / recover events applied to the live simulation. The runner
// records per-tick safety/fusion telemetry and emits a ScenarioRun summary.

import type { SensorId } from "./simulation";

export type ScenarioAction = "fail" | "recover";

export interface ScenarioEvent {
  at: number;                 // tick offset from scenario start
  sensor: SensorId;
  action: ScenarioAction;
  failure?: string;           // required when action === "fail"
  note?: string;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  durationTicks: number;
  events: ScenarioEvent[];
}

export const SCENARIOS: Scenario[] = [
  {
    id: "urban-night",
    name: "Urban Night · Camera Blackout",
    description:
      "Camera fails under low-light driving; agent must fall back to LiDAR+Radar geometry without losing perception.",
    durationTicks: 30,
    events: [
      { at: 4,  sensor: "camera", action: "fail", failure: "Underexposure" },
      { at: 18, sensor: "camera", action: "recover" },
    ],
  },
  {
    id: "tunnel-gps",
    name: "Tunnel · GPS Loss",
    description:
      "Vehicle enters a tunnel — GPS drops. Agent must switch to dead-reckoning via IMU + LiDAR odometry.",
    durationTicks: 28,
    events: [
      { at: 3,  sensor: "gps", action: "fail", failure: "Signal loss" },
      { at: 22, sensor: "gps", action: "recover" },
    ],
  },
  {
    id: "rain-storm",
    name: "Rainstorm · LiDAR + Radar Noise",
    description:
      "Heavy rain corrupts LiDAR point cloud while radar suffers false reflections. Cascading fault recovery.",
    durationTicks: 36,
    events: [
      { at: 4,  sensor: "lidar", action: "fail", failure: "Noise corruption" },
      { at: 10, sensor: "radar", action: "fail", failure: "False reflections" },
      { at: 22, sensor: "lidar", action: "recover" },
      { at: 28, sensor: "radar", action: "recover" },
    ],
  },
  {
    id: "highway-cascade",
    name: "Highway · Cascading Triple Fault",
    description:
      "Camera blur → LiDAR blackout → IMU drift in quick succession. Stress test for graceful degradation.",
    durationTicks: 40,
    events: [
      { at: 3,  sensor: "camera", action: "fail", failure: "Motion blur" },
      { at: 9,  sensor: "lidar",  action: "fail", failure: "Sensor blackout" },
      { at: 15, sensor: "imu",    action: "fail", failure: "Sensor drift" },
      { at: 24, sensor: "camera", action: "recover" },
      { at: 30, sensor: "lidar",  action: "recover" },
      { at: 34, sensor: "imu",    action: "recover" },
    ],
  },
  {
    id: "intermittent-radar",
    name: "Intermittent Radar Glitch",
    description:
      "Radar drops in and out — tests the agent's ability to avoid pipeline thrash and stabilize fusion weights.",
    durationTicks: 32,
    events: [
      { at: 4,  sensor: "radar", action: "fail", failure: "Signal loss" },
      { at: 9,  sensor: "radar", action: "recover" },
      { at: 14, sensor: "radar", action: "fail", failure: "Noise spikes" },
      { at: 19, sensor: "radar", action: "recover" },
      { at: 24, sensor: "radar", action: "fail", failure: "Signal loss" },
      { at: 28, sensor: "radar", action: "recover" },
    ],
  },
];

export type ScenarioVerdict = "pass" | "degraded" | "fail";

export interface ScenarioRun {
  id: string;                 // unique run id
  scenarioId: string;
  scenarioName: string;
  startedAtTick: number;
  finishedAtTick: number;
  durationTicks: number;
  failuresInjected: number;
  recoveriesObserved: number;
  pipelineSwitches: number;
  minSafety: number;
  avgSafety: number;
  maxRisk: number;
  finalSafety: number;
  finalFusion: number;
  verdict: ScenarioVerdict;
  modesVisited: string[];
}

export function verdictFor(minSafety: number, finalSafety: number): ScenarioVerdict {
  if (minSafety >= 0.55 && finalSafety >= 0.8) return "pass";
  if (minSafety >= 0.3) return "degraded";
  return "fail";
}
