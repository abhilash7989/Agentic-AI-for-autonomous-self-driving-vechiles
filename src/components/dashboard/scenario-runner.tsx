import { Play, Square, FlaskConical, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { Scenario, ScenarioRun, ScenarioVerdict } from "@/lib/scenarios";

export function ScenarioRunner({
  scenarios, activeId, progress, runs, onStart, onStop,
}: {
  scenarios: Scenario[];
  activeId: string | null;
  progress: { current: number; total: number; scenarioName?: string } | null;
  runs: ScenarioRun[];
  onStart: (id: string) => void;
  onStop: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {scenarios.map(s => {
          const isActive = activeId === s.id;
          return (
            <div key={s.id}
              className={`rounded-lg border p-2.5 transition ${
                isActive ? "border-primary/60 bg-primary/5 glow-cyan" : "border-border bg-background/30"
              }`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold truncate">{s.name}</div>
                  <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{s.description}</p>
                  <div className="mono text-[10px] text-muted-foreground mt-1">
                    {s.events.length} events · {s.durationTicks} ticks
                  </div>
                </div>
                {isActive ? (
                  <button onClick={onStop}
                    className="mono text-[10px] inline-flex items-center gap-1 rounded border border-destructive/40 bg-destructive/10 hover:bg-destructive/20 text-destructive px-2 py-1 shrink-0">
                    <Square className="size-3" /> STOP
                  </button>
                ) : (
                  <button onClick={() => onStart(s.id)} disabled={!!activeId}
                    className="mono text-[10px] inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary px-2 py-1 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed">
                    <Play className="size-3" /> RUN
                  </button>
                )}
              </div>
              {isActive && progress && (
                <div className="mt-2">
                  <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-primary to-accent transition-all"
                         style={{ width: `${Math.min(100, (progress.current / progress.total) * 100)}%` }} />
                  </div>
                  <div className="mono text-[10px] text-muted-foreground mt-1">
                    tick {progress.current}/{progress.total}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <FlaskConical className="size-3.5 text-primary" />
          <h3 className="text-[12px] font-semibold">Recovery Outcomes</h3>
          <span className="mono text-[10px] text-muted-foreground">· {runs.length} run{runs.length === 1 ? "" : "s"}</span>
        </div>
        <div className="max-h-[260px] overflow-y-auto space-y-1.5 pr-1">
          {runs.length === 0 && (
            <div className="text-[11px] text-muted-foreground mono px-3 py-4 text-center border border-dashed border-border rounded-lg">
              No scenarios executed yet. Launch one above to evaluate the agent.
            </div>
          )}
          {runs.map(r => <RunRow key={r.id} run={r} />)}
        </div>
      </div>
    </div>
  );
}

function RunRow({ run }: { run: ScenarioRun }) {
  const v = run.verdict;
  const VIcon = v === "pass" ? CheckCircle2 : v === "degraded" ? AlertTriangle : XCircle;
  const tone =
    v === "pass"     ? "border-success/40 bg-success/5 text-success"     :
    v === "degraded" ? "border-accent/40 bg-accent/5 text-accent"        :
                       "border-destructive/40 bg-destructive/5 text-destructive";
  return (
    <div className={`rounded-lg border ${tone.split(" ").slice(0,2).join(" ")} p-2.5`}>
      <div className="flex items-center gap-2">
        <VIcon className={`size-3.5 ${tone.split(" ")[2]}`} />
        <span className="text-[12px] font-semibold truncate">{run.scenarioName}</span>
        <span className={`ml-auto mono text-[10px] uppercase ${tone.split(" ")[2]}`}>{verdictLabel(v)}</span>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2 mono text-[10px]">
        <Metric label="MIN SAFETY"   value={(run.minSafety * 100).toFixed(0) + "%"} />
        <Metric label="AVG SAFETY"   value={(run.avgSafety * 100).toFixed(0) + "%"} />
        <Metric label="FINAL FUSION" value={(run.finalFusion * 100).toFixed(0) + "%"} />
        <Metric label="PEAK RISK"    value={(run.maxRisk * 100).toFixed(0) + "%"} />
        <Metric label="INJECTED"     value={String(run.failuresInjected)} />
        <Metric label="RECOVERED"    value={String(run.recoveriesObserved)} />
        <Metric label="PIPE SWITCH"  value={String(run.pipelineSwitches)} />
        <Metric label="DURATION"     value={`${run.durationTicks}t`} />
      </div>
      {run.modesVisited.length > 1 && (
        <div className="mt-2 flex flex-wrap items-center gap-1 mono text-[10px]">
          <span className="text-muted-foreground">pipelines:</span>
          {run.modesVisited.map((m, i) => (
            <span key={i} className="rounded border border-border bg-background/40 px-1.5 py-0.5 text-foreground/80">{m}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-background/40 px-1.5 py-1">
      <div className="text-[9px] tracking-widest text-muted-foreground">{label}</div>
      <div className="text-[11px] font-semibold text-foreground">{value}</div>
    </div>
  );
}

function verdictLabel(v: ScenarioVerdict): string {
  return v === "pass" ? "RECOVERED" : v === "degraded" ? "DEGRADED" : "UNSAFE";
}
