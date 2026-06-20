import { useMemo } from "react";
import { Workflow, ArrowRight, Zap, Layers, Clock, GitBranch } from "lucide-react";
import type { ReplayFrame } from "./replay-control";
import type { PerceptionMode, FusionWeights, SensorId } from "@/lib/simulation";

// Autonomous Inference Reconfiguration Framework
// - Tracks every pipeline transition over the replay buffer
// - Shows current pipeline graph, latency budget, and reconfiguration KPIs
// - Renders fusion-weight rebalance deltas between the two most recent pipelines

interface Props {
  frames: ReplayFrame[];
  currentMode: PerceptionMode;
  currentWeights: FusionWeights;
  currentTick: number;
}

interface Transition {
  t: number;
  from: string;
  to: string;
  fusion: string;
  trigger: string;
  latencyMs: number;
}

// Approximate per-mode inference latency budget (ms) — reflects model size & sensor count
const MODE_BUDGET: Record<string, number> = {
  "Nominal Multimodal":          24,
  "LiDAR-Radar Fallback":        18,
  "Vision-Radar Fallback":       16,
  "Camera-LiDAR Fusion":         20,
  "Dead-Reckoning Localization": 14,
  "Graceful Degradation":        12,
};

export function InferenceReconfiguration({ frames, currentMode, currentWeights, currentTick }: Props) {
  const transitions = useMemo<Transition[]>(() => {
    const out: Transition[] = [];
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1], b = frames[i];
      if (a.modeName !== b.modeName) {
        const newlyFailed = b.failed.filter(s => !a.failed.includes(s));
        const recovered   = a.failed.filter(s => !b.failed.includes(s));
        const trigger = newlyFailed.length
          ? `${newlyFailed.map(s => s.toUpperCase()).join("+")} failure`
          : recovered.length
          ? `${recovered.map(s => s.toUpperCase()).join("+")} recovered`
          : "agent re-plan";
        // Reconfiguration latency proxy: model swap + fusion rebalance
        const latencyMs = Math.round(
          8 + Math.abs((MODE_BUDGET[b.modeName] ?? 18) - (MODE_BUDGET[a.modeName] ?? 18)) * 1.4
        );
        out.push({ t: b.t, from: a.modeName, to: b.modeName, fusion: b.fusion, trigger, latencyMs });
      }
    }
    return out.reverse();
  }, [frames]);

  const switches = transitions.length;
  const avgLatency = switches ? transitions.reduce((s, x) => s + x.latencyMs, 0) / switches : 0;
  const lastSwitchTick = switches ? transitions[0].t : null;
  const ticksSinceSwitch = lastSwitchTick !== null ? currentTick - lastSwitchTick : currentTick;
  const stability = Math.min(1, ticksSinceSwitch / 30);

  const budget = MODE_BUDGET[currentMode.name] ?? 18;
  const headroom = Math.max(0, 30 - budget) / 30;

  // last weight rebalance — diff vs frame before the most recent transition
  const rebalance = useMemo(() => {
    if (transitions.length === 0 || frames.length < 2) return null;
    const switchTick = transitions[0].t;
    const idxAfter  = frames.findIndex(f => f.t === switchTick);
    const idxBefore = idxAfter - 1;
    if (idxBefore < 0) return null;
    const before = frames[idxBefore].weights;
    const after  = frames[idxAfter].weights;
    const rows = (Object.keys(after) as SensorId[]).map(id => ({
      id, before: before[id] ?? 0, after: after[id] ?? 0, delta: (after[id] ?? 0) - (before[id] ?? 0),
    }));
    return rows;
  }, [transitions, frames]);

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Kpi icon={GitBranch} label="RECONFIGS" value={String(switches)} tone="cyan" />
        <Kpi icon={Clock} label="AVG SWITCH" value={`${avgLatency.toFixed(0)}ms`} tone={avgLatency < 25 ? "green" : "amber"} />
        <Kpi icon={Layers} label="BUDGET" value={`${budget}ms`} tone={headroom > 0.3 ? "green" : "amber"} />
        <Kpi icon={Zap} label="STABILITY" value={`${(stability * 100).toFixed(0)}%`} tone={stability > 0.6 ? "green" : "amber"} />
      </div>

      {/* Current pipeline graph */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
        <div className="text-[10px] mono uppercase tracking-widest text-primary mb-2 flex items-center gap-1.5">
          <Workflow className="size-3" /> Active Inference Graph · {currentMode.fusion} Fusion
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {currentMode.active.map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              <span className="mono text-[10px] px-2 py-1 rounded border border-primary/40 bg-primary/10 text-primary">
                {s.toUpperCase()} · {((currentWeights[s] ?? 0) * 100).toFixed(0)}%
              </span>
              {i < currentMode.active.length - 1 && <ArrowRight className="size-3 text-muted-foreground" />}
            </span>
          ))}
          <ArrowRight className="size-3 text-muted-foreground" />
          <span className="mono text-[10px] px-2 py-1 rounded border border-accent/40 bg-accent/10 text-accent">
            {currentMode.fusion.toUpperCase()} FUSION
          </span>
          <ArrowRight className="size-3 text-muted-foreground" />
          <span className="mono text-[10px] px-2 py-1 rounded border border-success/40 bg-success/10 text-success">
            PERCEPTION OUT
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Transition log */}
        <div className="rounded-xl border border-border bg-background/30 p-3">
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Pipeline Transition Log
          </div>
          {transitions.length === 0 ? (
            <div className="text-[12px] text-muted-foreground mono px-3 py-6 text-center border border-dashed border-border rounded-lg">
              No reconfigurations yet — pipeline stable. Inject a failure to trigger the framework.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
              {transitions.slice(0, 12).map((tr, i) => (
                <div key={i} className="rounded-md border border-border bg-background/40 p-2">
                  <div className="flex items-center justify-between mono text-[10px] text-muted-foreground">
                    <span>t+{tr.t}</span>
                    <span className="text-accent">{tr.trigger}</span>
                    <span className="text-primary">{tr.latencyMs}ms</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-[11px]">
                    <span className="text-muted-foreground line-through">{tr.from}</span>
                    <ArrowRight className="size-3 text-primary" />
                    <span className="text-foreground font-semibold">{tr.to}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Weight rebalance */}
        <div className="rounded-xl border border-border bg-background/30 p-3">
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Last Fusion-Weight Rebalance
          </div>
          {rebalance ? (
            <div className="space-y-1.5">
              {rebalance.map(r => {
                const dir = r.delta > 0.01 ? "up" : r.delta < -0.01 ? "down" : "flat";
                const tone = dir === "up" ? "text-success" : dir === "down" ? "text-destructive" : "text-muted-foreground";
                return (
                  <div key={r.id} className="flex items-center gap-2">
                    <span className="mono text-[10px] w-14 uppercase text-muted-foreground">{r.id}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-secondary/60 overflow-hidden relative">
                      <div className="absolute top-0 h-full bg-muted-foreground/40" style={{ width: `${r.before * 100}%` }} />
                      <div className="absolute top-0 h-full bg-primary" style={{ width: `${r.after * 100}%` }} />
                    </div>
                    <span className={`mono text-[10px] w-16 text-right ${tone}`}>
                      {dir === "up" ? "▲" : dir === "down" ? "▼" : "·"} {Math.abs(r.delta * 100).toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-[12px] text-muted-foreground mono px-3 py-6 text-center border border-dashed border-border rounded-lg">
              Rebalance diff appears after the first pipeline switch.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string;
  tone: "cyan" | "green" | "amber";
}) {
  const cls = tone === "green" ? "border-success/40 text-success"
            : tone === "amber" ? "border-accent/40 text-accent"
            : "border-primary/40 text-primary";
  return (
    <div className={`rounded-lg border ${cls} bg-background/40 px-2.5 py-2 flex items-center gap-2`}>
      <Icon className="size-3.5" />
      <div className="leading-tight">
        <div className="mono text-[9px] uppercase tracking-widest opacity-70">{label}</div>
        <div className="mono text-sm font-semibold">{value}</div>
      </div>
    </div>
  );
}
