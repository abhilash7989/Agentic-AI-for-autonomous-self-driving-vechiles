import { Camera, Radar, Satellite, Compass, Box, Zap, AlertTriangle, CheckCircle2, type LucideIcon } from "lucide-react";
import type { SensorState, SensorSpec } from "@/lib/simulation";

const ICONS: Record<string, LucideIcon> = { camera: Camera, lidar: Box, radar: Radar, gps: Satellite, imu: Compass };

export function SensorCard({ spec, state, onFail, onRecover, failures }: {
  spec: SensorSpec; state: SensorState; failures: string[];
  onFail: (f: string) => void; onRecover: () => void;
}) {
  const Icon = ICONS[spec.id] ?? Zap;
  const tone = state.status === "failed" ? "glow-red" : state.status === "degraded" ? "glow-amber" : "glow-green";
  const dot  = state.status === "failed" ? "bg-destructive" : state.status === "degraded" ? "bg-accent" : "bg-success";
  return (
    <div className={`glass rounded-xl p-4 ${tone} transition-shadow`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-secondary/60 p-2 border border-border">
            <Icon className="size-5 text-primary" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-wide">{spec.name}</div>
            <div className="text-[11px] text-muted-foreground">{spec.subtitle}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`size-2 rounded-full ${dot} pulse-dot`} />
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{state.status}</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 mono text-[11px]">
        <Stat label="HEALTH" value={(state.health * 100).toFixed(0) + "%"} />
        <Stat label="CONF"   value={(state.confidence * 100).toFixed(0) + "%"} />
        <Stat label="ANOM"   value={state.anomaly.toFixed(2)} warn={state.anomaly > 0.5} />
      </div>

      {state.failure && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5">
          <AlertTriangle className="size-3.5 text-destructive" />
          <span className="text-[11px] text-destructive">{state.failure}</span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1">
        {failures.slice(0, 3).map(f => (
          <button key={f} onClick={() => onFail(f)}
            className="text-[10px] rounded border border-border bg-secondary/40 hover:bg-secondary px-1.5 py-0.5 text-muted-foreground hover:text-foreground transition">
            inject: {f}
          </button>
        ))}
        <button onClick={onRecover}
          className="text-[10px] rounded border border-success/40 bg-success/10 hover:bg-success/20 px-1.5 py-0.5 text-success transition inline-flex items-center gap-1">
          <CheckCircle2 className="size-3" /> recover
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-background/40 px-2 py-1">
      <div className="text-[9px] text-muted-foreground tracking-widest">{label}</div>
      <div className={`text-xs font-semibold ${warn ? "text-accent" : "text-foreground"}`}>{value}</div>
    </div>
  );
}
