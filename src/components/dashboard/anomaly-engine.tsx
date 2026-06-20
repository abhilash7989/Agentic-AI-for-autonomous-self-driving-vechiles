import { AlertTriangle, Brain, Sigma, Activity, Network } from "lucide-react";
import type { SensorAnomalyReport, AnomalyEvent, DetectorId } from "@/lib/anomaly";
import { DETECTOR_META } from "@/lib/anomaly";
import { SENSORS, type SensorId } from "@/lib/simulation";

const DETECTOR_ICON: Record<DetectorId, React.ComponentType<{ className?: string }>> = {
  zscore: Sigma,
  ewma: Activity,
  iforest: Network,
  autoencoder: Brain,
};

interface Props {
  reports: Record<SensorId, SensorAnomalyReport>;
  events: AnomalyEvent[];
  threshold: number;
  onThresholdChange: (v: number) => void;
  scoreHistory: { t: number; scores: Record<SensorId, number> }[];
}

const verdictTone = (v: SensorAnomalyReport["verdict"]) =>
  v === "anomalous" ? "border-destructive/50 bg-destructive/10 text-destructive"
  : v === "watch"   ? "border-accent/50 bg-accent/10 text-accent"
  :                   "border-success/50 bg-success/10 text-success";

export function AnomalyEngine({ reports, events, threshold, onThresholdChange, scoreHistory }: Props) {
  const sensorIds = SENSORS.map(s => s.id);
  const anomalousCount = sensorIds.filter(id => reports[id]?.verdict === "anomalous").length;
  const watchCount = sensorIds.filter(id => reports[id]?.verdict === "watch").length;

  return (
    <div className="space-y-4">
      {/* Header strip: detectors + threshold + global state */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-background/30 p-3 lg:col-span-2">
          <div className="mono text-[10px] tracking-widest text-muted-foreground mb-2">
            ENSEMBLE DETECTORS · weighted vote
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DETECTOR_META.map(d => {
              const Icon = DETECTOR_ICON[d.id];
              return (
                <div key={d.id} className="rounded-md border border-border bg-background/40 px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <Icon className="size-3 text-primary" />
                    <span className="mono text-[10px] font-semibold">{d.name}</span>
                  </div>
                  <div className="mono text-[9px] text-muted-foreground mt-0.5">{d.family}</div>
                  <div className="mono text-[9px] text-accent mt-0.5">w = {d.weight.toFixed(2)}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background/30 p-3">
          <div className="mono text-[10px] tracking-widest text-muted-foreground mb-2">
            DECISION THRESHOLD · {(threshold * 100).toFixed(0)}%
          </div>
          <input
            type="range" min={0.2} max={0.9} step={0.01}
            value={threshold}
            onChange={e => onThresholdChange(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="mt-2 grid grid-cols-3 gap-1 mono text-[10px]">
            <div className="rounded border border-success/40 bg-success/5 text-success px-1.5 py-1 text-center">
              {sensorIds.length - anomalousCount - watchCount} OK
            </div>
            <div className="rounded border border-accent/40 bg-accent/5 text-accent px-1.5 py-1 text-center">
              {watchCount} WATCH
            </div>
            <div className="rounded border border-destructive/40 bg-destructive/5 text-destructive px-1.5 py-1 text-center">
              {anomalousCount} ALERT
            </div>
          </div>
        </div>
      </div>

      {/* Per-sensor reports */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {sensorIds.map(id => {
          const r = reports[id];
          if (!r) return null;
          return (
            <div key={id} className={`rounded-lg border p-3 ${verdictTone(r.verdict)}`}>
              <div className="flex items-center justify-between">
                <span className="mono text-[11px] font-semibold uppercase">{id}</span>
                <span className="mono text-[10px] uppercase tracking-widest">{r.verdict}</span>
              </div>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="mono text-2xl font-semibold">{(r.ensemble * 100).toFixed(0)}</span>
                <span className="mono text-[10px] text-muted-foreground">/ 100 ensemble</span>
              </div>
              {/* Threshold bar */}
              <div className="relative mt-1 h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-success via-accent to-destructive"
                     style={{ width: `${r.ensemble * 100}%` }} />
                <div className="absolute top-0 bottom-0 w-px bg-foreground/80"
                     style={{ left: `${r.threshold * 100}%` }} />
              </div>

              {/* Per-detector breakdown */}
              <div className="mt-2 space-y-1">
                {DETECTOR_META.map(d => {
                  const v = r.scores[d.id];
                  const isTop = d.id === r.topDriver;
                  return (
                    <div key={d.id} className="flex items-center gap-2">
                      <span className={`mono text-[9px] w-16 uppercase ${isTop ? "text-foreground font-semibold" : "text-muted-foreground"}`}>
                        {d.name.split(" ")[0]}
                      </span>
                      <div className="flex-1 h-1 rounded-full bg-secondary/60 overflow-hidden">
                        <div className="h-full bg-primary/80" style={{ width: `${v * 100}%` }} />
                      </div>
                      <span className="mono text-[9px] w-8 text-right">{(v * 100).toFixed(0)}</span>
                    </div>
                  );
                })}
              </div>

              <p className="mt-2 text-[10.5px] leading-snug text-foreground/90">
                {r.rationale}
              </p>
              <div className="mt-1 mono text-[9px] text-muted-foreground">
                window n={r.sampleCount} · driver={r.topDriver}
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent anomaly events */}
      <div className="rounded-lg border border-border bg-background/30 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-3.5 text-accent" />
            <span className="mono text-[11px] tracking-widest text-muted-foreground">
              DETECTED ANOMALIES · last {events.length}
            </span>
          </div>
          <span className="mono text-[10px] text-muted-foreground">
            buffer: {scoreHistory.length} samples
          </span>
        </div>
        {events.length === 0 ? (
          <div className="text-[11px] text-muted-foreground mono text-center py-4">
            No anomalies above threshold — all sensors within normal distribution.
          </div>
        ) : (
          <div className="space-y-1 max-h-[180px] overflow-y-auto pr-1">
            {events.slice(0, 20).map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1">
                <span className="mono text-muted-foreground w-12 shrink-0">t+{e.t}</span>
                <span className="mono text-destructive uppercase w-14 shrink-0">{e.sensor}</span>
                <span className="mono text-[10px] text-accent w-20 shrink-0">{e.topDriver}</span>
                <span className="mono text-[10px] w-14 shrink-0">{(e.ensemble * 100).toFixed(0)}%</span>
                <span className="text-foreground/85 truncate">{e.rationale}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
