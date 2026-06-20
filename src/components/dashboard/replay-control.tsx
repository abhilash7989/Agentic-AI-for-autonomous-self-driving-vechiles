import { Play, Pause, SkipBack, SkipForward, Rewind, History } from "lucide-react";
import type { SensorId, AgentDecision } from "@/lib/simulation";

export interface ReplayFrame {
  t: number;
  modeName: string;
  fusion: string;
  active: SensorId[];
  weights: Record<SensorId, number>;
  fusionConfidence: number;
  safety: number;
  failed: SensorId[];
  decisions: AgentDecision[];
}

interface Props {
  frames: ReplayFrame[];
  replayIdx: number | null;          // null = live
  onScrub: (idx: number | null) => void;
  onStep: (delta: number) => void;
  onResumeLive: () => void;
}

const severityTone = (s: AgentDecision["severity"]) =>
  s === "critical" ? "text-destructive border-destructive/40 bg-destructive/5"
  : s === "warn"   ? "text-accent border-accent/40 bg-accent/5"
  : s === "success"? "text-success border-success/40 bg-success/5"
  : "text-info border-info/40 bg-info/5";

export function ReplayControl({ frames, replayIdx, onScrub, onStep, onResumeLive }: Props) {
  const total = frames.length;
  const isLive = replayIdx === null;
  const idx = isLive ? Math.max(0, total - 1) : Math.min(replayIdx!, total - 1);
  const frame = total > 0 ? frames[idx] : null;

  // Compare to previous frame for change detection
  const prev = idx > 0 ? frames[idx - 1] : null;
  const pipelineSwitched = !!prev && prev.modeName !== frame?.modeName;
  const weightDeltas: { id: SensorId; delta: number; from: number; to: number }[] =
    frame && prev
      ? (Object.keys(frame.weights) as SensorId[])
          .map(id => ({ id, from: prev.weights[id], to: frame.weights[id], delta: frame.weights[id] - prev.weights[id] }))
          .filter(d => Math.abs(d.delta) > 0.005)
          .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      : [];

  if (total === 0) {
    return (
      <div className="text-[12px] text-muted-foreground mono px-3 py-6 text-center border border-dashed border-border rounded-lg">
        Replay buffer is empty — telemetry will populate as the simulation runs.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Scrubber */}
      <div className="rounded-lg border border-border bg-background/30 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <History className="size-3.5 text-primary" />
            <span className="mono text-[11px] tracking-widest text-muted-foreground">REPLAY</span>
            <span className={`mono text-[10px] px-1.5 py-0.5 rounded border ${
              isLive ? "border-success/40 bg-success/10 text-success"
                     : "border-accent/40 bg-accent/10 text-accent"
            }`}>
              {isLive ? "● LIVE" : "❚❚ SCRUBBING"}
            </span>
          </div>
          <div className="mono text-[11px]">
            <span className="text-muted-foreground">t=</span>
            <span className="text-primary">{frame?.t ?? 0}</span>
            <span className="text-muted-foreground"> · frame </span>
            <span className="text-primary">{idx + 1}</span>
            <span className="text-muted-foreground">/{total}</span>
          </div>
        </div>

        <input
          type="range"
          min={0}
          max={Math.max(0, total - 1)}
          value={idx}
          onChange={e => onScrub(Number(e.target.value))}
          className="w-full accent-primary"
        />

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button onClick={() => onScrub(0)}
              className="mono text-[10px] rounded-md border border-border bg-secondary/60 hover:bg-secondary px-2 py-1 inline-flex items-center gap-1">
              <Rewind className="size-3" /> START
            </button>
            <button onClick={() => onStep(-1)}
              className="mono text-[10px] rounded-md border border-border bg-secondary/60 hover:bg-secondary px-2 py-1 inline-flex items-center gap-1">
              <SkipBack className="size-3" /> −1
            </button>
            <button onClick={() => onStep(+1)}
              className="mono text-[10px] rounded-md border border-border bg-secondary/60 hover:bg-secondary px-2 py-1 inline-flex items-center gap-1">
              +1 <SkipForward className="size-3" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            {!isLive ? (
              <button onClick={onResumeLive}
                className="mono text-[10px] rounded-md border border-success/40 bg-success/10 hover:bg-success/20 text-success px-2 py-1 inline-flex items-center gap-1">
                <Play className="size-3" /> RESUME LIVE
              </button>
            ) : (
              <button onClick={() => onScrub(Math.max(0, total - 1))}
                className="mono text-[10px] rounded-md border border-accent/40 bg-accent/10 hover:bg-accent/20 text-accent px-2 py-1 inline-flex items-center gap-1">
                <Pause className="size-3" /> PAUSE & SCRUB
              </button>
            )}
          </div>
        </div>
      </div>

      {frame && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Pipeline state */}
          <div className={`rounded-lg border p-3 ${pipelineSwitched ? "border-accent/50 bg-accent/5" : "border-border bg-background/30"}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="mono text-[10px] tracking-widest text-muted-foreground">PIPELINE @ t={frame.t}</span>
              {pipelineSwitched && (
                <span className="mono text-[10px] text-accent">⚡ SWITCHED</span>
              )}
            </div>
            <div className="text-sm font-semibold">{frame.modeName}</div>
            <div className="text-[11px] text-muted-foreground mono mt-0.5">
              fusion: {frame.fusion} · active: {frame.active.length}/5
            </div>
            {pipelineSwitched && prev && (
              <div className="mt-2 text-[11px] mono">
                <span className="text-muted-foreground line-through">{prev.modeName}</span>
                <span className="text-muted-foreground"> → </span>
                <span className="text-accent">{frame.modeName}</span>
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-1">
              {frame.active.map(id => (
                <span key={id} className="mono text-[10px] rounded border border-primary/40 bg-primary/10 text-primary px-1.5 py-0.5 uppercase">
                  {id}
                </span>
              ))}
              {frame.failed.map(id => (
                <span key={id} className="mono text-[10px] rounded border border-destructive/40 bg-destructive/10 text-destructive px-1.5 py-0.5 uppercase line-through">
                  {id}
                </span>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 mono text-[10px]">
              <div className="rounded border border-border bg-background/40 px-2 py-1">
                <div className="text-muted-foreground">FUSION CONF</div>
                <div className="text-primary">{(frame.fusionConfidence * 100).toFixed(1)}%</div>
              </div>
              <div className="rounded border border-border bg-background/40 px-2 py-1">
                <div className="text-muted-foreground">SAFETY</div>
                <div className={frame.safety > 0.7 ? "text-success" : frame.safety > 0.4 ? "text-accent" : "text-destructive"}>
                  {(frame.safety * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>

          {/* Fusion weights */}
          <div className="rounded-lg border border-border bg-background/30 p-3">
            <div className="mono text-[10px] tracking-widest text-muted-foreground mb-2">FUSION WEIGHTS</div>
            <div className="space-y-1.5">
              {(Object.keys(frame.weights) as SensorId[]).map(id => {
                const w = frame.weights[id];
                const d = prev ? w - prev.weights[id] : 0;
                const dTone = d > 0.005 ? "text-success" : d < -0.005 ? "text-destructive" : "text-muted-foreground";
                return (
                  <div key={id} className="flex items-center gap-2">
                    <span className="mono text-[10px] w-12 text-muted-foreground uppercase">{id}</span>
                    <div className="flex-1 h-2 rounded-full bg-secondary/60 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-primary to-accent transition-all"
                           style={{ width: `${w * 100}%` }} />
                    </div>
                    <span className="mono text-[10px] w-10 text-right">{(w * 100).toFixed(1)}%</span>
                    <span className={`mono text-[10px] w-12 text-right ${dTone}`}>
                      {d === 0 ? "—" : `${d > 0 ? "+" : ""}${(d * 100).toFixed(1)}`}
                    </span>
                  </div>
                );
              })}
            </div>
            {weightDeltas.length > 0 && (
              <div className="mt-2 text-[10px] mono text-muted-foreground">
                Largest shift: <span className="text-foreground uppercase">{weightDeltas[0].id}</span>{" "}
                <span className={weightDeltas[0].delta > 0 ? "text-success" : "text-destructive"}>
                  {weightDeltas[0].delta > 0 ? "+" : ""}{(weightDeltas[0].delta * 100).toFixed(1)}%
                </span>
              </div>
            )}
          </div>

          {/* Agent explanations at this tick */}
          <div className="rounded-lg border border-border bg-background/30 p-3 md:col-span-2">
            <div className="mono text-[10px] tracking-widest text-muted-foreground mb-2">
              AGENT EXPLANATIONS @ t={frame.t}
            </div>
            {frame.decisions.length === 0 ? (
              <div className="text-[11px] text-muted-foreground mono">
                No agent activity at this tick — system reasoning was stable.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                {frame.decisions.map((d, i) => (
                  <div key={i} className={`rounded-md border ${severityTone(d.severity)} p-2`}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="mono text-[10px] tracking-widest">{d.phase.toUpperCase()}</span>
                      {d.sensor && <span className="mono text-[10px] text-muted-foreground">· {d.sensor.toUpperCase()}</span>}
                    </div>
                    <p className="text-[11.5px] leading-snug text-foreground/90">{d.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
