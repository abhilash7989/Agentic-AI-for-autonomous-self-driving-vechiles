import type { RecoveryFlow } from "@/lib/metrics";
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";

const STEP_ORDER = ["Detect", "Diagnose", "Plan", "Backup", "Reconfigure", "Validate", "Outcome"] as const;

export function RecoveryWorkflow({ flows }: { flows: RecoveryFlow[] }) {
  if (flows.length === 0) {
    return (
      <div className="text-[12px] text-muted-foreground mono px-3 py-6 text-center border border-dashed border-border rounded-lg">
        No recovery workflows yet. Inject a sensor failure to trigger the autonomous recovery pipeline.
      </div>
    );
  }
  return (
    <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
      {flows.slice(0, 8).map(f => <FlowCard key={f.id} flow={f} />)}
    </div>
  );
}

function FlowCard({ flow }: { flow: RecoveryFlow }) {
  const present = new Set(flow.steps.map(s => s.phase));
  const recovered = flow.verdict === "recovered";
  const Tone = recovered ? CheckCircle2 : AlertTriangle;
  const toneCls = recovered ? "text-success" : "text-accent";
  return (
    <div className="rounded-xl border border-border bg-background/30 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Tone className={`size-3.5 ${toneCls}`} />
        <span className="text-[12px] font-semibold">Recovery · {flow.sensor.toUpperCase()}</span>
        <span className={`ml-auto mono text-[10px] uppercase ${toneCls}`}>
          {recovered ? `recovered in ${flow.durationTicks}t` : "in progress"}
        </span>
      </div>
      <div className="relative">
        <div className="absolute left-2.5 top-2 bottom-2 w-px bg-border" />
        <ol className="space-y-1.5">
          {STEP_ORDER.map(phase => {
            const step = flow.steps.find(s => s.phase === phase);
            const done = present.has(phase);
            return (
              <li key={phase} className="relative pl-7">
                <span className={`absolute left-1 top-1 size-3 rounded-full border ${
                  done ? "bg-primary border-primary" : "bg-background border-border"
                }`} />
                <div className="flex items-center gap-2">
                  <span className={`mono text-[10px] tracking-widest ${done ? "text-primary" : "text-muted-foreground"}`}>
                    {phase.toUpperCase()}
                  </span>
                  {step && <span className="mono text-[10px] text-muted-foreground">t+{step.t}</span>}
                  {!done && phase !== "Outcome" && flow.verdict === "in-progress" && (
                    <Loader2 className="size-3 text-muted-foreground animate-spin" />
                  )}
                </div>
                {step && (
                  <p className="text-[11px] text-foreground/80 leading-snug mt-0.5">{step.message}</p>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
