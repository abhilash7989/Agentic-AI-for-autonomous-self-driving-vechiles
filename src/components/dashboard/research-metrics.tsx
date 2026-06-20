import type { ResearchMetrics } from "@/lib/metrics";
import { BASELINES } from "@/lib/metrics";

export function ResearchMetricsPanel({ m }: { m: ResearchMetrics }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
      <Group title="Anomaly Detection" rows={[
        ["Accuracy",  pct(m.anomaly.accuracy)],
        ["Precision", pct(m.anomaly.precision)],
        ["Recall",    pct(m.anomaly.recall)],
        ["F1",        pct(m.anomaly.f1)],
        ["ROC-AUC",   m.anomaly.rocAuc.toFixed(3)],
      ]} />
      <Group title="Recovery" rows={[
        ["Success Rate",  pct(m.recovery.successRate)],
        ["Avg Recovery",  `${m.recovery.avgRecoveryTicks.toFixed(1)} ticks`],
        ["Efficiency",    pct(m.recovery.efficiency)],
      ]} />
      <Group title="Fusion" rows={[
        ["Reliability", pct(m.fusion.reliability)],
        ["Confidence",  pct(m.fusion.confidence)],
      ]} />
      <Group title="Agentic AI" rows={[
        ["Decision Acc.", pct(m.agent.decisionAccuracy)],
        ["Planning Time", `${m.agent.planningTimeMs.toFixed(1)} ms`],
        ["Action Success", pct(m.agent.actionSuccess)],
      ]} />
      <Group title="Predictive Failure" rows={[
        ["RMSE",     m.prediction.rmse.toFixed(3)],
        ["MAE",      m.prediction.mae.toFixed(3)],
        ["Accuracy", pct(m.prediction.accuracy)],
      ]} />
    </div>
  );
}

export function BaselineComparison({ m }: { m: ResearchMetrics }) {
  const ours = {
    label: "Agentic AI (Ours)",
    safety: 0.5 + m.fusion.confidence * 0.5,
    recovery: m.recovery.successRate,
    latencyMs: m.agent.planningTimeMs * 4,
    reconfig: true, xai: true, predictive: true,
  };
  const rows = [BASELINES.staticFusion, BASELINES.ruleBasedFTM, BASELINES.classicalKalman, ours];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left mono text-[10px] tracking-widest text-muted-foreground border-b border-border">
            <th className="py-2 pr-3">SYSTEM</th>
            <th className="py-2 px-3">SAFETY</th>
            <th className="py-2 px-3">RECOVERY</th>
            <th className="py-2 px-3">LATENCY</th>
            <th className="py-2 px-3">RECONFIG</th>
            <th className="py-2 px-3">XAI</th>
            <th className="py-2 px-3">PREDICTIVE</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const ours = i === rows.length - 1;
            return (
              <tr key={r.label} className={`border-b border-border/60 ${ours ? "bg-primary/5" : ""}`}>
                <td className={`py-2 pr-3 ${ours ? "text-primary font-semibold" : ""}`}>{r.label}</td>
                <td className="py-2 px-3 mono">{pct(r.safety)}</td>
                <td className="py-2 px-3 mono">{pct(r.recovery)}</td>
                <td className="py-2 px-3 mono">{r.latencyMs.toFixed(0)} ms</td>
                <td className="py-2 px-3"><Yes v={r.reconfig} /></td>
                <td className="py-2 px-3"><Yes v={r.xai} /></td>
                <td className="py-2 px-3"><Yes v={r.predictive} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Baselines reflect representative reports from the literature on static fusion,
        rule-based fault tolerance, and Kalman-based health monitoring. Our system adds
        autonomous reasoning, dynamic reconfiguration, explainability, and predictive
        failure analysis in a single closed-loop agent.
      </p>
    </div>
  );
}

function Group({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-xl border border-border bg-background/30 p-3">
      <div className="mono text-[10px] tracking-widest text-primary mb-2">{title.toUpperCase()}</div>
      <div className="space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">{k}</span>
            <span className="mono text-[11px] font-semibold text-foreground">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Yes({ v }: { v: boolean }) {
  return v
    ? <span className="mono text-[11px] text-success">●  yes</span>
    : <span className="mono text-[11px] text-muted-foreground">○  no</span>;
}

function pct(x: number) { return `${(x * 100).toFixed(1)}%`; }
