import { useMemo } from "react";
import { Stethoscope, AlertOctagon, ShieldAlert, CheckCircle2, Siren } from "lucide-react";
import type { SensorId, SensorState, AgentDecision } from "@/lib/simulation";
import type { SafetyVector } from "@/lib/metrics";
import { predictFailure } from "@/lib/simulation";

// Safety-Critical Diagnostics Dashboard
// - Aggregates diagnostic trouble codes (DTCs) with ASIL-style severity
// - Computes fail-safe operating state (Nominal / Degraded / Limp / MRC)
// - Surfaces the most recent root-cause finding from agent decisions

interface Props {
  states: Record<SensorId, SensorState>;
  decisions: AgentDecision[];
  safety: SafetyVector;
  failedCount: number;
}

interface DTC {
  code: string;       // e.g. SNS-CAM-001
  sensor: SensorId;
  severity: "ASIL-D" | "ASIL-C" | "ASIL-B" | "QM";
  message: string;
  status: "active" | "pending";
  t: number;
}

const SEV_RANK: Record<DTC["severity"], number> = { "ASIL-D": 4, "ASIL-C": 3, "ASIL-B": 2, "QM": 1 };

function codeFor(sensor: SensorId, failure: string, anomaly: number): DTC["code"] {
  const f = failure.toLowerCase();
  const tag =
    f.includes("black") || f.includes("loss") || f.includes("blackout") ? "001" :
    f.includes("freeze") || f.includes("frozen")                        ? "002" :
    f.includes("drift") || f.includes("jump")                           ? "003" :
    f.includes("noise") || f.includes("false")                          ? "004" :
    f.includes("blur") || f.includes("exposure") || f.includes("visibility") ? "005" :
    anomaly > 0.7 ? "010" : "020";
  return `SNS-${sensor.toUpperCase()}-${tag}`;
}

function severityFor(sensor: SensorId, status: SensorState["status"], anomaly: number): DTC["severity"] {
  if (status === "failed") {
    // Camera/LiDAR/Radar perception failures = ASIL-D, GPS/IMU localization = ASIL-C
    return (sensor === "camera" || sensor === "lidar" || sensor === "radar") ? "ASIL-D" : "ASIL-C";
  }
  if (status === "degraded") return anomaly > 0.6 ? "ASIL-B" : "QM";
  return "QM";
}

export function DiagnosticsDashboard({ states, decisions, safety, failedCount }: Props) {
  // Build live DTC list from sensor states
  const dtcs = useMemo<DTC[]>(() => {
    const out: DTC[] = [];
    (Object.keys(states) as SensorId[]).forEach(id => {
      const s = states[id];
      if (s.status === "healthy" && s.anomaly < 0.4) return;
      const failure = s.failure ?? (s.anomaly > 0.6 ? "Persistent anomaly" : "Elevated noise");
      out.push({
        code: codeFor(id, failure, s.anomaly),
        sensor: id,
        severity: severityFor(id, s.status, s.anomaly),
        message: failure,
        status: s.status === "failed" ? "active" : "pending",
        t: 0,
      });
    });
    return out.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity]);
  }, [states]);

  const activeCount  = dtcs.filter(d => d.status === "active").length;
  const asilDCount   = dtcs.filter(d => d.severity === "ASIL-D").length;
  const asilCount    = dtcs.filter(d => d.severity === "ASIL-D" || d.severity === "ASIL-C").length;

  // Fail-safe operating state
  const opState = useMemo(() => {
    if (failedCount === 0 && safety.vehicleSafety > 0.75) return { name: "NOMINAL", tone: "success", desc: "All systems operating within safety envelope." };
    if (safety.vehicleSafety < 0.25 || failedCount >= 3) return { name: "MRC · MINIMAL RISK", tone: "destructive", desc: "Vehicle commanded to safe stop. Driver handover required." };
    if (asilDCount > 0 || safety.vehicleSafety < 0.45)   return { name: "LIMP HOME",        tone: "destructive", desc: "Restricted speed envelope, manual takeover requested." };
    return { name: "DEGRADED OPERATION", tone: "accent", desc: "Operating under reconfigured perception pipeline." };
  }, [failedCount, safety.vehicleSafety, asilDCount]);

  // Root-cause: most recent Diagnose / Reason decision
  const rootCause = decisions.find(d => d.phase === "Diagnose" || d.phase === "Reason");

  // Predictive risk for "pre-fault" findings
  const upcoming = (Object.keys(states) as SensorId[])
    .map(id => ({ id, ...predictFailure(states[id]) }))
    .filter(p => p.risk > 0.5)
    .sort((a, b) => b.risk - a.risk)
    .slice(0, 3);

  return (
    <div className="space-y-4">
      {/* Operating state banner */}
      <div className={`rounded-xl border p-3 flex items-start gap-3 ${
        opState.tone === "success"     ? "border-success/40 bg-success/5" :
        opState.tone === "accent"      ? "border-accent/40 bg-accent/5" :
                                         "border-destructive/40 bg-destructive/5"
      }`}>
        <div className={
          opState.tone === "success"     ? "text-success" :
          opState.tone === "accent"      ? "text-accent"  : "text-destructive"
        }>
          {opState.tone === "success" ? <CheckCircle2 className="size-5" /> :
           opState.tone === "accent"  ? <ShieldAlert className="size-5" /> :
                                        <Siren className="size-5" />}
        </div>
        <div className="flex-1">
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Fail-Safe Operating State</div>
          <div className="text-sm font-semibold">{opState.name}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{opState.desc}</p>
        </div>
        <div className="text-right">
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Safety Integrity</div>
          <div className={`mono text-lg font-semibold ${
            safety.vehicleSafety > 0.7 ? "text-success" :
            safety.vehicleSafety > 0.4 ? "text-accent" : "text-destructive"
          }`}>
            {(safety.vehicleSafety * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Kpi icon={AlertOctagon} label="ACTIVE DTCs"    value={String(activeCount)} tone={activeCount ? "red" : "green"} />
        <Kpi icon={ShieldAlert}  label="ASIL-D"         value={String(asilDCount)}  tone={asilDCount ? "red" : "green"} />
        <Kpi icon={ShieldAlert}  label="ASIL-C+"        value={String(asilCount)}   tone={asilCount > 1 ? "amber" : asilCount ? "amber" : "green"} />
        <Kpi icon={Stethoscope}  label="PRE-FAULT"      value={String(upcoming.length)} tone={upcoming.length ? "amber" : "green"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* DTC table */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-background/30 overflow-hidden">
          <div className="px-3 py-2 mono text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border bg-background/40">
            Diagnostic Trouble Codes
          </div>
          {dtcs.length === 0 ? (
            <div className="text-[12px] text-success mono px-3 py-6 text-center">
              ✓ No diagnostic codes active — all sensors nominal.
            </div>
          ) : (
            <div className="divide-y divide-border max-h-[260px] overflow-y-auto">
              {dtcs.map(d => (
                <div key={d.code} className="grid grid-cols-12 gap-2 px-3 py-2 items-center text-[11px]">
                  <div className="col-span-3 mono">{d.code}</div>
                  <div className="col-span-2">
                    <SevBadge sev={d.severity} />
                  </div>
                  <div className="col-span-2 mono uppercase text-muted-foreground">{d.sensor}</div>
                  <div className="col-span-4 truncate">{d.message}</div>
                  <div className="col-span-1 text-right">
                    <span className={`mono text-[9px] uppercase ${
                      d.status === "active" ? "text-destructive" : "text-accent"
                    }`}>{d.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Root cause + pre-faults */}
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-background/30 p-3">
            <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              Latest Root-Cause Analysis
            </div>
            {rootCause ? (
              <>
                <div className="mono text-[10px] text-primary">t+{rootCause.t} · {rootCause.phase.toUpperCase()}</div>
                <p className="text-[11px] mt-1 leading-snug">{rootCause.message}</p>
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">No fault diagnosed yet.</p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-background/30 p-3">
            <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              Predictive Pre-Fault Findings
            </div>
            {upcoming.length === 0 ? (
              <p className="text-[11px] text-success mono">✓ No imminent failures predicted.</p>
            ) : (
              <ul className="space-y-1.5 text-[11px]">
                {upcoming.map(u => (
                  <li key={u.id} className="flex items-center justify-between gap-2">
                    <span className="mono uppercase">{u.id}</span>
                    <span className="text-muted-foreground">{u.eta}</span>
                    <span className={`mono ${u.risk > 0.7 ? "text-destructive" : "text-accent"}`}>
                      {(u.risk * 100).toFixed(0)}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SevBadge({ sev }: { sev: DTC["severity"] }) {
  const cls = sev === "ASIL-D" ? "border-destructive/50 bg-destructive/15 text-destructive"
            : sev === "ASIL-C" ? "border-destructive/40 bg-destructive/10 text-destructive"
            : sev === "ASIL-B" ? "border-accent/50 bg-accent/10 text-accent"
            :                    "border-border bg-secondary/40 text-muted-foreground";
  return <span className={`mono text-[9px] px-1.5 py-0.5 rounded border ${cls}`}>{sev}</span>;
}

function Kpi({ icon: Icon, label, value, tone }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string;
  tone: "green" | "amber" | "red";
}) {
  const cls = tone === "green" ? "border-success/40 text-success"
            : tone === "amber" ? "border-accent/40 text-accent"
            : "border-destructive/40 text-destructive";
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
