import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, Brain, Cpu, GitBranch, Layers, RefreshCw, Shield, Siren, TrendingUp,
  Workflow, Sparkles, Gauge, FileText, Eye, FlaskConical, ShieldCheck, BarChart3, GitCompare, Route as RouteIcon,
  History,
} from "lucide-react";
import {
  Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Area, AreaChart, CartesianGrid, BarChart, Bar,
} from "recharts";
import {
  SENSORS, createInitialStates, stepSensor, selectPipeline, computeFusionWeights,
  fusionConfidence, safetyScore, agentReact, predictFailure,
  type SensorId, type SensorState, type AgentDecision, type TelemetryPoint,
} from "@/lib/simulation";
import { SCENARIOS, verdictFor, type ScenarioRun } from "@/lib/scenarios";
import { computeSafetyVector, computeResearchMetrics, extractRecoveryFlows } from "@/lib/metrics";
import { SensorCard } from "@/components/dashboard/sensor-card";
import { DigitalTwin } from "@/components/dashboard/digital-twin";
import { ScenarioRunner } from "@/components/dashboard/scenario-runner";
import { SafetyEngine } from "@/components/dashboard/safety-engine";
import { ResearchMetricsPanel, BaselineComparison } from "@/components/dashboard/research-metrics";
import { RecoveryWorkflow } from "@/components/dashboard/recovery-workflow";
import { ReplayControl, type ReplayFrame } from "@/components/dashboard/replay-control";
import { AnomalyEngine } from "@/components/dashboard/anomaly-engine";
import {
  analyzeSensor, pushWindow, type SensorAnomalyReport, type AnomalyEvent,
} from "@/lib/anomaly";
import { InferenceReconfiguration } from "@/components/dashboard/inference-reconfiguration";
import { RedundancyManager } from "@/components/dashboard/redundancy-manager";
import { DiagnosticsDashboard } from "@/components/dashboard/diagnostics-dashboard";
import { Stethoscope, ShieldHalf } from "lucide-react";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Agentic AI for Autonomous Sensor Failure Recovery" },
      { name: "description", content: "Research-grade simulation of an agentic AI framework that detects sensor failures, diagnoses faults, and autonomously reconfigures perception pipelines in self-driving vehicles." },
      { property: "og:title", content: "Agentic AI for Autonomous Sensor Failure Recovery" },
      { property: "og:description", content: "Live cockpit dashboard: anomaly detection, agentic reasoning, redundancy management, fusion reconfiguration, predictive failure analysis." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const [states, setStates] = useState(() => createInitialStates());
  const [injections, setInjections] = useState<Record<SensorId, string | null>>({
    camera: null, lidar: null, radar: null, gps: null, imu: null,
  });
  const [decisions, setDecisions] = useState<AgentDecision[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryPoint[]>([]);
  const [running, setRunning] = useState(true);
  const [stats, setStats] = useState({ failuresTotal: 0, recoveries: 0, uptime: 0 });
  const tRef = useRef(0);

  // Replay buffer
  const [frames, setFrames] = useState<ReplayFrame[]>([]);
  const [replayIdx, setReplayIdx] = useState<number | null>(null); // null = live
  const REPLAY_LIMIT = 240;

  // Anomaly Detection Engine state
  const [anomalyThreshold, setAnomalyThreshold] = useState(0.55);
  const [anomalyReports, setAnomalyReports] = useState<Record<SensorId, SensorAnomalyReport> | null>(null);
  const [anomalyEvents, setAnomalyEvents] = useState<AnomalyEvent[]>([]);
  const [scoreHistory, setScoreHistory] = useState<{ t: number; scores: Record<SensorId, number> }[]>([]);
  const signalWindowsRef = useRef<Record<SensorId, number[]>>({
    camera: [], lidar: [], radar: [], gps: [], imu: [],
  });
  const lastEventTickRef = useRef<Record<SensorId, number>>({
    camera: -10, lidar: -10, radar: -10, gps: -10, imu: -10,
  });

  // Scenario runner state
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [scenarioProgress, setScenarioProgress] = useState<{ current: number; total: number; scenarioName?: string } | null>(null);
  const [runs, setRuns] = useState<ScenarioRun[]>([]);
  const scenarioRef = useRef<{
    id: string; name: string; startTick: number; duration: number;
    events: { at: number; sensor: SensorId; action: "fail"|"recover"; failure?: string }[];
    appliedIdx: number;
    minSafety: number; maxRisk: number; safetySum: number; ticks: number;
    failuresInjected: number; recoveriesObserved: number;
    pipelineSwitches: number; lastMode: string; modesVisited: string[];
  } | null>(null);

  const startScenario = (id: string) => {
    const sc = SCENARIOS.find(s => s.id === id);
    if (!sc) return;
    // Reset baseline so the run is reproducible
    setInjections({ camera: null, lidar: null, radar: null, gps: null, imu: null });
    setStates(createInitialStates());
    const startTick = tRef.current + 1;
    const initialMode = selectPipeline(createInitialStates()).name;
    scenarioRef.current = {
      id: sc.id, name: sc.name, startTick, duration: sc.durationTicks,
      events: sc.events.map(e => ({ at: e.at, sensor: e.sensor, action: e.action, failure: e.failure })),
      appliedIdx: 0,
      minSafety: 1, maxRisk: 0, safetySum: 0, ticks: 0,
      failuresInjected: 0, recoveriesObserved: 0,
      pipelineSwitches: 0, lastMode: initialMode, modesVisited: [initialMode],
    };
    setActiveScenarioId(sc.id);
    setScenarioProgress({ current: 0, total: sc.durationTicks, scenarioName: sc.name });
    setRunning(true);
  };

  const finalizeScenario = (final: { fconf: number; safe: number }) => {
    const acc = scenarioRef.current;
    if (!acc) return;
    const avg = acc.ticks > 0 ? acc.safetySum / acc.ticks : 0;
    const verdict = verdictFor(acc.minSafety, final.safe);
    const run: ScenarioRun = {
      id: `${acc.id}-${acc.startTick}`,
      scenarioId: acc.id, scenarioName: acc.name,
      startedAtTick: acc.startTick, finishedAtTick: acc.startTick + acc.duration,
      durationTicks: acc.duration,
      failuresInjected: acc.failuresInjected,
      recoveriesObserved: acc.recoveriesObserved,
      pipelineSwitches: acc.pipelineSwitches,
      minSafety: acc.minSafety, avgSafety: avg, maxRisk: acc.maxRisk,
      finalSafety: final.safe, finalFusion: final.fconf,
      verdict, modesVisited: acc.modesVisited,
    };
    setRuns(r => [run, ...r].slice(0, 20));
    scenarioRef.current = null;
    setActiveScenarioId(null);
    setScenarioProgress(null);
    setInjections({ camera: null, lidar: null, radar: null, gps: null, imu: null });
  };

  const stopScenario = () => {
    if (!scenarioRef.current) return;
    const mode = selectPipeline(states);
    const fconf = fusionConfidence(states, mode);
    const failedCount = (Object.values(states) as SensorState[]).filter(s => s.status === "failed").length;
    finalizeScenario({ fconf, safe: safetyScore(fconf, failedCount) });
  };

  // simulation tick
  useEffect(() => {
    if (!running || replayIdx !== null) return;
    const id = setInterval(() => {
      tRef.current += 1;
      const t = tRef.current;

      // Apply scheduled scenario events before stepping
      const acc = scenarioRef.current;
      if (acc) {
        const rel = t - acc.startTick;
        let pendingInj: Partial<Record<SensorId, string | null>> | null = null;
        while (acc.appliedIdx < acc.events.length && acc.events[acc.appliedIdx].at <= rel) {
          const ev = acc.events[acc.appliedIdx++];
          pendingInj = pendingInj ?? {};
          if (ev.action === "fail") {
            pendingInj[ev.sensor] = ev.failure ?? "Scripted failure";
            acc.failuresInjected += 1;
          } else {
            pendingInj[ev.sensor] = null;
          }
        }
        if (pendingInj) setInjections(s => ({ ...s, ...pendingInj }));
        setScenarioProgress({ current: Math.max(0, rel), total: acc.duration, scenarioName: acc.name });
      }

      setStates(prev => {
        const next = { ...prev };
        (Object.keys(prev) as SensorId[]).forEach(s => { next[s] = stepSensor(prev[s], injections[s], t); });
        const newDecisions = agentReact(prev, next, t);
        if (newDecisions.length) {
          setDecisions(d => [...newDecisions.reverse(), ...d].slice(0, 80));
          setStats(st => ({
            ...st,
            failuresTotal: st.failuresTotal + newDecisions.filter(x => x.phase === "Diagnose").length,
            recoveries:    st.recoveries    + newDecisions.filter(x => x.phase === "Learn").length,
          }));
        }
        const mode = selectPipeline(next);
        const fconf = fusionConfidence(next, mode);
        const failedCount = (Object.values(next) as SensorState[]).filter(s => s.status === "failed").length;
        const safe = safetyScore(fconf, failedCount);
        setTelemetry(tl => [...tl, {
          t,
          camera: next.camera.confidence, lidar: next.lidar.confidence, radar: next.radar.confidence,
          gps: next.gps.confidence, imu: next.imu.confidence,
          fusion: fconf, safety: safe, risk: 1 - safe,
        }].slice(-60));
        setStats(s => ({ ...s, uptime: s.uptime + 1 }));

        // Record replay frame
        const tickWeights = computeFusionWeights(next, mode);
        const failedIds = (Object.keys(next) as SensorId[]).filter(id => next[id].status === "failed");
        const frame: ReplayFrame = {
          t, modeName: mode.name, fusion: mode.fusion, active: mode.active,
          weights: tickWeights, fusionConfidence: fconf, safety: safe,
          failed: failedIds, decisions: newDecisions,
        };
        setFrames(fr => [...fr, frame].slice(-REPLAY_LIMIT));

        // --- Sensor Anomaly Detection Engine: per-sensor ensemble over rolling window ---
        const reports: Record<SensorId, SensorAnomalyReport> = {} as Record<SensorId, SensorAnomalyReport>;
        const ensembleSnap: Record<SensorId, number> = {} as Record<SensorId, number>;
        (Object.keys(next) as SensorId[]).forEach(sid => {
          const win = signalWindowsRef.current[sid];
          const x = next[sid].signal;
          const report = analyzeSensor(sid, win, x, anomalyThreshold);
          reports[sid] = report;
          ensembleSnap[sid] = report.ensemble;
          signalWindowsRef.current[sid] = pushWindow(win, x);
          if (report.verdict === "anomalous" && t - lastEventTickRef.current[sid] >= 3) {
            lastEventTickRef.current[sid] = t;
            setAnomalyEvents(ev => [{
              t, sensor: sid, ensemble: report.ensemble,
              topDriver: report.topDriver, rationale: report.rationale,
            }, ...ev].slice(0, 40));
          }
        });
        setAnomalyReports(reports);
        setScoreHistory(h => [...h, { t, scores: ensembleSnap }].slice(-120));



        // Scenario accumulators
        const acc2 = scenarioRef.current;
        if (acc2) {
          acc2.ticks += 1;
          acc2.safetySum += safe;
          if (safe < acc2.minSafety) acc2.minSafety = safe;
          const risk = 1 - safe;
          if (risk > acc2.maxRisk) acc2.maxRisk = risk;
          if (mode.name !== acc2.lastMode) {
            acc2.pipelineSwitches += 1;
            acc2.lastMode = mode.name;
            if (!acc2.modesVisited.includes(mode.name)) acc2.modesVisited.push(mode.name);
          }
          acc2.recoveriesObserved += newDecisions.filter(x => x.phase === "Learn").length;
          if (t - acc2.startTick >= acc2.duration) {
            // finalize after this tick
            setTimeout(() => finalizeScenario({ fconf, safe }), 0);
          }
        }
        return next;
      });
    }, 800);
    return () => clearInterval(id);
  }, [running, injections, replayIdx, anomalyThreshold]);

  const mode = useMemo(() => selectPipeline(states), [states]);
  const weights = useMemo(() => computeFusionWeights(states, mode), [states, mode]);
  const fconf = useMemo(() => fusionConfidence(states, mode), [states, mode]);
  const failedCount = (Object.values(states) as SensorState[]).filter(s => s.status === "failed").length;
  const safe = safetyScore(fconf, failedCount);

  const safetyVec = useMemo(() => computeSafetyVector(states, telemetry, decisions), [states, telemetry, decisions]);
  const metrics   = useMemo(() => computeResearchMetrics(states, telemetry, decisions), [states, telemetry, decisions]);
  const flows     = useMemo(() => extractRecoveryFlows(decisions), [decisions]);


  const inject = (id: SensorId, f: string) => setInjections(s => ({ ...s, [id]: f }));
  const recover = (id: SensorId) => setInjections(s => ({ ...s, [id]: null }));
  const reset = () => {
    scenarioRef.current = null;
    setActiveScenarioId(null);
    setScenarioProgress(null);
    setInjections({ camera: null, lidar: null, radar: null, gps: null, imu: null });
    setStates(createInitialStates());
    setDecisions([]); setTelemetry([]); setFrames([]); setReplayIdx(null); tRef.current = 0;
    setAnomalyReports(null); setAnomalyEvents([]); setScoreHistory([]);
    signalWindowsRef.current = { camera: [], lidar: [], radar: [], gps: [], imu: [] };
    lastEventTickRef.current = { camera: -10, lidar: -10, radar: -10, gps: -10, imu: -10 };
    setStats({ failuresTotal: 0, recoveries: 0, uptime: 0 });
  };

  const stepReplay = (delta: number) => {
    setReplayIdx(idx => {
      const base = idx ?? Math.max(0, frames.length - 1);
      const next = Math.min(Math.max(0, base + delta), Math.max(0, frames.length - 1));
      return next;
    });
  };

  const recoveryRate = stats.failuresTotal === 0 ? 1 : Math.min(1, stats.recoveries / stats.failuresTotal);

  return (
    <main className="min-h-screen text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-30 glass border-b border-border">
        <div className="mx-auto max-w-[1600px] px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/15 p-2 border border-primary/30 glow-cyan">
              <Brain className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-semibold tracking-tight">
                Agentic AI · Autonomous Sensor Failure Recovery
              </h1>
              <p className="text-[11px] text-muted-foreground mono">
                Self-Driving Vehicle Safety Platform · IEEE Research Demonstrator
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <KPIBadge icon={Gauge}    label="SAFETY"  value={(safe * 100).toFixed(0) + "%"} tone={safe > 0.7 ? "green" : safe > 0.4 ? "amber" : "red"} />
            <KPIBadge icon={Activity} label="FUSION"  value={(fconf * 100).toFixed(0) + "%"} tone="cyan" />
            <KPIBadge icon={Siren}    label="FAILED"  value={String(failedCount)}            tone={failedCount ? "red" : "green"} />
            <button onClick={() => setRunning(r => !r)}
              className="mono text-[11px] rounded-md border border-border bg-secondary/60 hover:bg-secondary px-3 py-1.5">
              {running ? "PAUSE" : "RESUME"}
            </button>
            <button onClick={reset}
              className="mono text-[11px] rounded-md border border-accent/40 bg-accent/10 hover:bg-accent/20 px-3 py-1.5 text-accent inline-flex items-center gap-1">
              <RefreshCw className="size-3" /> RESET SIM
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-6 py-6 space-y-6">
        {/* Row 1: Sensor Layer + Digital Twin + Agentic loop */}
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <Panel title="1 · Sensor Layer" subtitle="Data Acquisition & Synchronization" icon={Layers} className="xl:col-span-7">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {SENSORS.map(spec => (
                <SensorCard key={spec.id} spec={spec} state={states[spec.id]} failures={spec.failures}
                  onFail={f => inject(spec.id, f)} onRecover={() => recover(spec.id)} />
              ))}
              <div className="glass rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Failure Injection</div>
                  <div className="text-sm font-semibold mt-0.5">Simulation Controls</div>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Inject realistic faults per sensor. The agent will observe, diagnose, reason, plan and act autonomously.
                  </p>
                </div>
                <div className="mono text-[10px] text-muted-foreground mt-3">
                  TICK <span className="text-primary">{tRef.current}</span> · UPTIME <span className="text-primary">{stats.uptime}</span>s
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Digital Twin" subtitle="Live Vehicle Sensor Map" icon={Cpu} className="xl:col-span-5">
            <DigitalTwin states={states} mode={mode} />
            <div className="mt-3 grid grid-cols-3 gap-2 mono text-[11px]">
              <MiniStat label="ACTIVE PIPELINE" value={mode.name} />
              <MiniStat label="FUSION MODE"     value={mode.fusion} />
              <MiniStat label="SENSORS"         value={`${mode.active.length}/5`} />
            </div>
          </Panel>
        </section>

        {/* Row 2: Agentic decisions + Inference reconfiguration */}
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <Panel title="5 · Agentic AI Decision Module" subtitle="Observe → Analyze → Diagnose → Reason → Plan → Act → Monitor → Learn"
                 icon={Brain} className="xl:col-span-7">
            <div className="h-[340px] overflow-y-auto pr-1 space-y-2">
              {decisions.length === 0 && (
                <div className="text-[12px] text-muted-foreground mono px-3 py-6 text-center border border-dashed border-border rounded-lg">
                  Agent idle · system nominal. Inject a failure to observe autonomous reasoning.
                </div>
              )}
              {decisions.map((d, i) => (
                <DecisionRow key={i} d={d} />
              ))}
            </div>
          </Panel>

          <Panel title="3 · Perception & Sensor Fusion" subtitle="Active Inference Pipeline" icon={Workflow} className="xl:col-span-5">
            <div className="space-y-3">
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="text-[10px] uppercase tracking-widest text-primary mono">ACTIVE MODE</div>
                <div className="text-sm font-semibold mt-1">{mode.name}</div>
                <p className="text-[11px] text-muted-foreground mt-1">{mode.description}</p>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mono mb-2">Fusion Weights</div>
                <div className="space-y-1.5">
                  {(Object.keys(weights) as SensorId[]).map(k => (
                    <div key={k} className="flex items-center gap-2">
                      <span className="mono text-[10px] w-14 text-muted-foreground uppercase">{k}</span>
                      <div className="flex-1 h-2 rounded-full bg-secondary/60 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-primary to-accent transition-all"
                             style={{ width: `${weights[k] * 100}%` }} />
                      </div>
                      <span className="mono text-[10px] w-12 text-right">{(weights[k] * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <PipelineFlow active={mode.active} />
            </div>
          </Panel>
        </section>

        {/* Row 3: Telemetry */}
        <Panel title="Sensor Confidence Telemetry" subtitle="Per-sensor confidence streams · 60-tick rolling window" icon={Activity}>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={telemetry}>
                <CartesianGrid stroke="oklch(0.35 0.03 250 / 0.3)" strokeDasharray="2 4" />
                <XAxis dataKey="t" stroke="oklch(0.68 0.03 230)" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 1]} stroke="oklch(0.68 0.03 230)" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "oklch(0.21 0.025 250)", border: "1px solid oklch(0.35 0.03 250)", borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="camera" stroke="var(--color-chart-1)" dot={false} strokeWidth={1.6} />
                <Line type="monotone" dataKey="lidar"  stroke="var(--color-chart-2)" dot={false} strokeWidth={1.6} />
                <Line type="monotone" dataKey="radar"  stroke="var(--color-chart-3)" dot={false} strokeWidth={1.6} />
                <Line type="monotone" dataKey="gps"    stroke="var(--color-chart-4)" dot={false} strokeWidth={1.6} />
                <Line type="monotone" dataKey="imu"    stroke="var(--color-chart-5)" dot={false} strokeWidth={1.6} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* Row 4: Safety + Redundancy + Predictive */}
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <Panel title="Safety & Risk" subtitle="Fusion confidence vs. risk score" icon={Shield} className="xl:col-span-5">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={telemetry}>
                  <defs>
                    <linearGradient id="safeG" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%"   stopColor="var(--color-success)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="var(--color-success)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="riskG" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%"   stopColor="var(--color-destructive)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="var(--color-destructive)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="oklch(0.35 0.03 250 / 0.3)" strokeDasharray="2 4" />
                  <XAxis dataKey="t" stroke="oklch(0.68 0.03 230)" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 1]} stroke="oklch(0.68 0.03 230)" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "oklch(0.21 0.025 250)", border: "1px solid oklch(0.35 0.03 250)", borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="safety" stroke="var(--color-success)" fill="url(#safeG)" strokeWidth={1.6} />
                  <Area type="monotone" dataKey="risk"   stroke="var(--color-destructive)" fill="url(#riskG)" strokeWidth={1.6} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <BigStat label="UPTIME"        value={`${stats.uptime}s`}              tone="cyan" />
              <BigStat label="FAILURES"      value={String(stats.failuresTotal)}     tone={stats.failuresTotal ? "amber" : "green"} />
              <BigStat label="RECOVERY RATE" value={`${(recoveryRate * 100).toFixed(0)}%`} tone="green" />
            </div>
          </Panel>

          <Panel title="7 · Redundancy & Resilience" subtitle="Primary → backup failover matrix" icon={GitBranch} className="xl:col-span-4">
            <div className="space-y-2">
              {SENSORS.map(spec => {
                const s = states[spec.id];
                const chain: SensorId[] = [spec.id, ...((["lidar","camera","radar","gps","imu"] as SensorId[]).filter(x => x !== spec.id)).slice(0, 2)];
                return (
                  <div key={spec.id} className="rounded-lg border border-border bg-background/30 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="mono text-[11px] uppercase text-muted-foreground">{spec.name}</span>
                      <span className={`text-[10px] mono ${s.status === "failed" ? "text-destructive" : "text-success"}`}>
                        {s.status === "failed" ? "FAILOVER ACTIVE" : "PRIMARY OK"}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      {chain.map((c, i) => {
                        const cs = states[c];
                        const active = i === 0 ? cs.status !== "failed" : i === 1 && states[chain[0]].status === "failed";
                        return (
                          <span key={c} className={`mono text-[10px] px-1.5 py-0.5 rounded border ${
                            active ? "border-primary/50 bg-primary/10 text-primary" :
                            cs.status === "failed" ? "border-destructive/40 bg-destructive/10 text-destructive line-through" :
                            "border-border bg-secondary/40 text-muted-foreground"
                          }`}>
                            {i === 0 ? "P:" : "B:"}{c.toUpperCase()}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Predictive Failure Analysis" subtitle="Probabilistic forecasting · RUL estimation" icon={TrendingUp} className="xl:col-span-3">
            <div className="space-y-2">
              {SENSORS.map(spec => {
                const s = states[spec.id]; const p = predictFailure(s);
                const tone = p.risk > 0.7 ? "text-destructive" : p.risk > 0.45 ? "text-accent" : "text-success";
                return (
                  <div key={spec.id} className="rounded-lg border border-border bg-background/30 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="mono text-[11px] uppercase">{spec.name}</span>
                      <span className={`mono text-[10px] ${tone}`}>{(p.risk * 100).toFixed(0)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                      <div className="h-full transition-all"
                           style={{ width: `${p.risk * 100}%`,
                                    background: p.risk > 0.7 ? "var(--color-destructive)"
                                              : p.risk > 0.45 ? "var(--color-accent)"
                                              : "var(--color-success)" }} />
                    </div>
                    <div className="flex justify-between mt-1 mono text-[10px] text-muted-foreground">
                      <span>RUL {s.rul.toFixed(0)}%</span>
                      <span>{p.eta}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </section>

        {/* Sensor Anomaly Detection Engine — 4-detector ensemble */}
        <Panel title="4 · Sensor Anomaly Detection Engine"
               subtitle="Z-Score · EWMA · Isolation Forest · Autoencoder — weighted ensemble with adaptive threshold"
               icon={Sparkles}>
          {anomalyReports ? (
            <AnomalyEngine
              reports={anomalyReports}
              events={anomalyEvents}
              threshold={anomalyThreshold}
              onThresholdChange={setAnomalyThreshold}
              scoreHistory={scoreHistory}
            />
          ) : (
            <div className="text-[12px] text-muted-foreground mono px-3 py-6 text-center border border-dashed border-border rounded-lg">
              Warming up detectors — collecting baseline signal windows…
            </div>
          )}
        </Panel>

        {/* Row 5: Anomaly bars + Explainability + Event log */}
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">

          <Panel title="4 · Anomaly Detection Scores" subtitle="Autoencoder + Isolation Forest + Statistical ensemble"
                 icon={Sparkles} className="xl:col-span-5">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={SENSORS.map(s => ({ name: s.name, anomaly: states[s.id].anomaly, health: states[s.id].health }))}>
                  <CartesianGrid stroke="oklch(0.35 0.03 250 / 0.3)" strokeDasharray="2 4" />
                  <XAxis dataKey="name" stroke="oklch(0.68 0.03 230)" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 1]} stroke="oklch(0.68 0.03 230)" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "oklch(0.21 0.025 250)", border: "1px solid oklch(0.35 0.03 250)", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="anomaly" fill="var(--color-destructive)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="health"  fill="var(--color-success)"     radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Explainable AI" subtitle="Human-readable reasoning chain" icon={Eye} className="xl:col-span-4">
            <ExplainPanel states={states} mode={mode} weights={weights} />
          </Panel>

          <Panel title="Event Timeline" subtitle="Failures · Recoveries · Reconfigurations" icon={FileText} className="xl:col-span-3">
            <div className="h-[220px] overflow-y-auto space-y-1.5 pr-1">
              {decisions.filter(d => ["Diagnose","Act","Learn"].includes(d.phase)).slice(0, 30).map((d, i) => (
                <div key={i} className="flex gap-2 text-[11px]">
                  <span className="mono text-muted-foreground w-10 shrink-0">t+{d.t}</span>
                  <span className={`mono shrink-0 ${
                    d.severity === "critical" ? "text-destructive" :
                    d.severity === "success"  ? "text-success" :
                    d.severity === "warn"     ? "text-accent" : "text-info"
                  }`}>● {d.phase}</span>
                  <span className="text-muted-foreground truncate">{d.sensor?.toUpperCase()}</span>
                </div>
              ))}
              {decisions.length === 0 && (
                <div className="text-[11px] text-muted-foreground mono text-center pt-6">No events yet.</div>
              )}
            </div>
          </Panel>
        </section>

        {/* Safety Engine */}
        <Panel title="Safety Assessment Engine" subtitle="Real-time vehicle safety vector · five-axis evaluation" icon={ShieldCheck}>
          <SafetyEngine vec={safetyVec} />
        </Panel>

        {/* Safety-Critical Diagnostics Dashboard (Deliverable 4) */}
        <Panel title="Safety-Critical Diagnostics Dashboard"
               subtitle="DTCs · ASIL severity · fail-safe operating state · root-cause analysis"
               icon={Stethoscope}>
          <DiagnosticsDashboard
            states={states} decisions={decisions}
            safety={safetyVec} failedCount={failedCount}
          />
        </Panel>

        {/* Autonomous Inference Reconfiguration Framework (Deliverable 2) */}
        <Panel title="Autonomous Inference Reconfiguration Framework"
               subtitle="Pipeline transition graph · fusion-weight rebalance · reconfiguration latency budget"
               icon={Workflow}>
          <InferenceReconfiguration
            frames={frames} currentMode={mode}
            currentWeights={weights} currentTick={tRef.current}
          />
        </Panel>

        {/* Multi-Sensor Redundancy Management System (Deliverable 3) */}
        <Panel title="Multi-Sensor Redundancy Management System"
               subtitle="Failover chains · role assignment · coverage & single-point-of-failure tracking"
               icon={ShieldHalf}>
          <RedundancyManager states={states} activeSensors={mode.active} />
        </Panel>


        {/* Replay control */}
        <Panel title="Replay & Time-Travel Inspector"
               subtitle="Scrub through ticks · inspect pipeline switches, fusion weight changes and agent explanations at each step"
               icon={History}>
          <ReplayControl
            frames={frames}
            replayIdx={replayIdx}
            onScrub={(i) => setReplayIdx(i)}
            onStep={stepReplay}
            onResumeLive={() => setReplayIdx(null)}
          />
        </Panel>


        {/* Recovery Workflow + Scenario Runner */}
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <Panel title="6 · Autonomous Recovery Workflow"
                 subtitle="Detect → Diagnose → Plan → Backup → Reconfigure → Validate → Outcome"
                 icon={RouteIcon} className="xl:col-span-7">
            <RecoveryWorkflow flows={flows} />
          </Panel>

          <Panel title="Scenario Runner" subtitle="Scripted multi-sensor failure timelines · recovery outcomes per run" icon={FlaskConical} className="xl:col-span-5">
            <ScenarioRunner
              scenarios={SCENARIOS}
              activeId={activeScenarioId}
              progress={scenarioProgress}
              runs={runs}
              onStart={startScenario}
              onStop={stopScenario}
            />
          </Panel>
        </section>

        {/* Research metrics */}
        <Panel title="Research Metrics" subtitle="Anomaly · Recovery · Fusion · Agent · Predictive — IEEE evaluation suite" icon={BarChart3}>
          <ResearchMetricsPanel m={metrics} />
        </Panel>

        {/* Baseline comparison */}
        <Panel title="Comparison vs. Literature Baselines"
               subtitle="Differentiating contributions over static fusion, rule-based FTM, and Kalman+health-monitor systems"
               icon={GitCompare}>
          <BaselineComparison m={metrics} />
        </Panel>

        {/* Footer note */}
        <section className="glass rounded-xl p-5">
          <p className="text-[11px] text-muted-foreground">
            This interactive cockpit is the frontend simulation layer of the full research stack
            (FastAPI · PyTorch · PostgreSQL · WebSockets · Docker). Sensor streams, anomaly detectors,
            agentic reasoning, redundancy and fusion are simulated client-side; the data contracts mirror the
            production backend so the UI is drop-in ready for live integration with nuScenes, A2D2 or CARLA.
          </p>
        </section>
      </div>
    </main>
  );
}

/* ---------- presentational helpers ---------- */

function Panel({ title, subtitle, icon: Icon, className = "", children }: {
  title: string; subtitle?: string; icon: React.ComponentType<{ className?: string }>;
  className?: string; children: React.ReactNode;
}) {
  return (
    <section className={`glass rounded-xl p-4 ${className}`}>
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-primary" />
          <div>
            <h2 className="text-sm font-semibold leading-tight">{title}</h2>
            {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
      </header>
      {children}
    </section>
  );
}

function KPIBadge({ icon: Icon, label, value, tone }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string;
  tone: "cyan" | "green" | "amber" | "red";
}) {
  const cls = tone === "green" ? "border-success/40 text-success"
            : tone === "amber" ? "border-accent/40 text-accent"
            : tone === "red"   ? "border-destructive/40 text-destructive"
            : "border-primary/40 text-primary";
  return (
    <div className={`hidden md:flex items-center gap-2 rounded-md border ${cls} bg-background/40 px-2.5 py-1.5`}>
      <Icon className="size-3.5" />
      <span className="mono text-[10px] tracking-widest text-muted-foreground">{label}</span>
      <span className="mono text-xs font-semibold">{value}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/40 px-2 py-1.5">
      <div className="text-[9px] tracking-widest text-muted-foreground">{label}</div>
      <div className="text-[11px] font-semibold truncate">{value}</div>
    </div>
  );
}

function BigStat({ label, value, tone }: { label: string; value: string; tone: "cyan"|"green"|"amber"|"red" }) {
  const cls = tone === "green" ? "text-success" : tone === "amber" ? "text-accent" : tone === "red" ? "text-destructive" : "text-primary";
  return (
    <div className="rounded-lg border border-border bg-background/30 p-3">
      <div className="mono text-[10px] tracking-widest text-muted-foreground">{label}</div>
      <div className={`mono text-lg font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

function DecisionRow({ d }: { d: AgentDecision }) {
  const tone = d.severity === "critical" ? "border-destructive/40 bg-destructive/5"
             : d.severity === "warn"     ? "border-accent/40 bg-accent/5"
             : d.severity === "success"  ? "border-success/40 bg-success/5"
             : "border-info/40 bg-info/5";
  const dot = d.severity === "critical" ? "bg-destructive" : d.severity === "warn" ? "bg-accent" : d.severity === "success" ? "bg-success" : "bg-info";
  return (
    <div className={`rounded-lg border ${tone} p-2.5`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`size-1.5 rounded-full ${dot}`} />
        <span className="mono text-[10px] tracking-widest text-foreground">{d.phase.toUpperCase()}</span>
        {d.sensor && <span className="mono text-[10px] text-muted-foreground">· {d.sensor.toUpperCase()}</span>}
        <span className="ml-auto mono text-[10px] text-muted-foreground">t+{d.t}</span>
      </div>
      <p className="text-[12px] leading-snug text-foreground/90">{d.message}</p>
    </div>
  );
}

function PipelineFlow({ active }: { active: SensorId[] }) {
  return (
    <div className="rounded-lg border border-border bg-background/30 p-3">
      <div className="mono text-[10px] tracking-widest text-muted-foreground mb-2">INFERENCE FLOW</div>
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] mono">
        {active.map((id, i) => (
          <span key={id} className="contents">
            <span className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-primary uppercase">{id}</span>
            {i < active.length - 1 && <span className="text-muted-foreground">→</span>}
          </span>
        ))}
        <span className="text-muted-foreground">→</span>
        <span className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-accent">FUSION</span>
        <span className="text-muted-foreground">→</span>
        <span className="rounded border border-success/40 bg-success/10 px-1.5 py-0.5 text-success">PLANNER</span>
      </div>
    </div>
  );
}

function ExplainPanel({ states, mode, weights }: {
  states: Record<SensorId, SensorState>; mode: { name: string; active: SensorId[]; fusion: string };
  weights: Record<SensorId, number>;
}) {
  const failed = (Object.values(states) as SensorState[]).filter(s => s.status === "failed");
  const top = (Object.entries(weights) as [SensorId, number][])
    .filter(([id]) => mode.active.includes(id))
    .sort((a, b) => b[1] - a[1])[0];
  return (
    <div className="space-y-2 text-[12px] leading-snug">
      <ExplainItem label="Why this pipeline?">
        {failed.length === 0
          ? `All five sensors are nominal — running ${mode.name} with ${mode.fusion} fusion for maximum redundancy.`
          : `${failed.map(f => f.id.toUpperCase()).join(", ")} ${failed.length > 1 ? "have" : "has"} failed (${failed.map(f => `"${f.failure}"`).join(", ")}). Pipeline switched to ${mode.name} to maintain perception.`}
      </ExplainItem>
      <ExplainItem label="Why these weights?">
        {top
          ? `Weights are normalized per-sensor confidence; ${top[0].toUpperCase()} currently dominates at ${(top[1]*100).toFixed(0)}% because its confidence is highest among active sensors.`
          : "No active sensors — entering emergency stop sequence."}
      </ExplainItem>
      <ExplainItem label="Why these alarms?">
        {failed.length
          ? `Anomaly detector flagged residual reconstruction error above 0.5σ on ${failed.map(f => f.id.toUpperCase()).join(", ")}. Confidence dropped below safety threshold; Agentic AI triggered failover.`
          : "No anomalies above threshold. System running within nominal envelope."}
      </ExplainItem>
    </div>
  );
}

function ExplainItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background/30 p-2.5">
      <div className="mono text-[10px] tracking-widest text-primary mb-1">{label}</div>
      <div className="text-foreground/90">{children}</div>
    </div>
  );
}
