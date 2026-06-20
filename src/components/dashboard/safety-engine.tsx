import type { SafetyVector } from "@/lib/metrics";
import { ShieldCheck, Activity, AlertOctagon, Aperture, LifeBuoy } from "lucide-react";

const ITEMS: { key: keyof SafetyVector; label: string; invert?: boolean; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "systemConfidence",      label: "System Confidence",      icon: Activity },
  { key: "vehicleSafety",         label: "Vehicle Safety",         icon: ShieldCheck },
  { key: "operationalRisk",       label: "Operational Risk",       icon: AlertOctagon, invert: true },
  { key: "perceptionReliability", label: "Perception Reliability", icon: Aperture },
  { key: "recoveryEffectiveness", label: "Recovery Effectiveness", icon: LifeBuoy },
];

export function SafetyEngine({ vec }: { vec: SafetyVector }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {ITEMS.map(it => {
        const raw = vec[it.key];
        const v = it.invert ? raw : raw;
        const display = Math.round(v * 100);
        const goodHigh = !it.invert;
        const tone = goodHigh
          ? (v > 0.7 ? "success" : v > 0.4 ? "accent" : "destructive")
          : (v < 0.3 ? "success" : v < 0.6 ? "accent" : "destructive");
        return <Gauge key={it.key} icon={it.icon} label={it.label} value={display} tone={tone} />;
      })}
    </div>
  );
}

function Gauge({ icon: Icon, label, value, tone }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: number;
  tone: "success" | "accent" | "destructive";
}) {
  const stroke =
    tone === "success" ? "var(--color-success)" :
    tone === "accent"  ? "var(--color-accent)"  : "var(--color-destructive)";
  const textCls =
    tone === "success" ? "text-success" :
    tone === "accent"  ? "text-accent"  : "text-destructive";
  const R = 36;
  const C = 2 * Math.PI * R;
  const off = C * (1 - value / 100);
  return (
    <div className="rounded-xl border border-border bg-background/40 p-3 flex flex-col items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" />
        <span className="mono text-[10px] tracking-widest">{label.toUpperCase()}</span>
      </div>
      <div className="relative size-[96px]">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle cx="50" cy="50" r={R} stroke="oklch(0.32 0.03 250)" strokeWidth="8" fill="none" />
          <circle cx="50" cy="50" r={R} stroke={stroke} strokeWidth="8" fill="none"
            strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off}
            style={{ transition: "stroke-dashoffset 600ms ease, stroke 300ms ease" }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`mono text-lg font-semibold ${textCls}`}>{value}%</span>
        </div>
      </div>
    </div>
  );
}
