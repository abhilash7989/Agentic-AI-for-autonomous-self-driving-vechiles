import { ShieldHalf, Activity, CircleAlert, CheckCircle2 } from "lucide-react";
import { REDUNDANCY, SENSORS, type SensorId, type SensorState } from "@/lib/simulation";

// Multi-Sensor Redundancy Management System
// - Shows primary→backup→tertiary chain per sensor with live role assignment
// - Computes redundancy depth, overall coverage, and identifies single-points-of-failure

interface Props {
  states: Record<SensorId, SensorState>;
  activeSensors: SensorId[];
}

type Role = "primary" | "standby" | "active-backup" | "exhausted" | "failed";

function chainFor(id: SensorId): SensorId[] {
  return [id, ...REDUNDANCY[id]];
}

export function RedundancyManager({ states, activeSensors }: Props) {
  const rows = SENSORS.map(spec => {
    const primary = states[spec.id];
    const chain = chainFor(spec.id);
    const healthyBackups = REDUNDANCY[spec.id].filter(b => states[b].status !== "failed");
    const depth = (primary.status !== "failed" ? 1 : 0) + healthyBackups.length;

    const role: Role = primary.status === "failed"
      ? (healthyBackups.length === 0 ? "exhausted" : "active-backup")
      : "primary";

    return {
      spec, primary, chain, healthyBackups, depth, role,
      coverage: depth / chain.length,
    };
  });

  const totalCoverage = rows.reduce((s, r) => s + r.coverage, 0) / rows.length;
  const spofs = rows.filter(r => r.depth <= 1);
  const exhausted = rows.filter(r => r.role === "exhausted");
  const activeBackups = rows.filter(r => r.role === "active-backup");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat icon={ShieldHalf} label="COVERAGE" value={`${(totalCoverage * 100).toFixed(0)}%`}
              tone={totalCoverage > 0.7 ? "green" : totalCoverage > 0.4 ? "amber" : "red"} />
        <Stat icon={Activity}   label="ACTIVE FAILOVERS" value={String(activeBackups.length)}
              tone={activeBackups.length === 0 ? "green" : "amber"} />
        <Stat icon={CircleAlert} label="SPOF SENSORS"  value={String(spofs.length)}
              tone={spofs.length === 0 ? "green" : "amber"} />
        <Stat icon={CircleAlert} label="EXHAUSTED"     value={String(exhausted.length)}
              tone={exhausted.length === 0 ? "green" : "red"} />
      </div>

      <div className="rounded-xl border border-border bg-background/30 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-3 py-2 mono text-[9px] uppercase tracking-widest text-muted-foreground border-b border-border bg-background/40">
          <div className="col-span-2">Sensor</div>
          <div className="col-span-2">Role</div>
          <div className="col-span-5">Failover Chain</div>
          <div className="col-span-2">Depth</div>
          <div className="col-span-1 text-right">Coverage</div>
        </div>
        <div className="divide-y divide-border">
          {rows.map(r => (
            <div key={r.spec.id} className="grid grid-cols-12 gap-2 px-3 py-2 items-center">
              <div className="col-span-2 mono text-[11px] font-semibold">{r.spec.name}</div>
              <div className="col-span-2">
                <RoleBadge role={r.role} />
              </div>
              <div className="col-span-5 flex items-center gap-1 flex-wrap">
                {r.chain.map((c, i) => {
                  const cs = states[c];
                  const isPrimary = i === 0;
                  const isActiveBackup =
                    !isPrimary && r.primary.status === "failed" &&
                    r.chain.slice(1, i + 1).every(b => b === c || states[b].status === "failed") &&
                    cs.status !== "failed";
                  const failed = cs.status === "failed";
                  const cls = failed
                    ? "border-destructive/40 bg-destructive/10 text-destructive line-through"
                    : isPrimary && r.primary.status !== "failed"
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : isActiveBackup
                    ? "border-accent/50 bg-accent/15 text-accent"
                    : "border-border bg-secondary/40 text-muted-foreground";
                  return (
                    <span key={c} className={`mono text-[10px] px-1.5 py-0.5 rounded border ${cls}`}>
                      {isPrimary ? "P:" : i === 1 ? "B1:" : "B2:"}{c.toUpperCase()}
                    </span>
                  );
                })}
              </div>
              <div className="col-span-2 mono text-[11px]">
                {r.depth}/{r.chain.length}
              </div>
              <div className="col-span-1">
                <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                  <div className="h-full transition-all"
                       style={{
                         width: `${r.coverage * 100}%`,
                         background: r.coverage > 0.66 ? "var(--color-success)"
                                   : r.coverage > 0.33 ? "var(--color-accent)"
                                   : "var(--color-destructive)",
                       }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-background/30 p-3">
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Active Redundancy Pool
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {SENSORS.map(s => {
              const active = activeSensors.includes(s.id) && states[s.id].status !== "failed";
              return (
                <span key={s.id} className={`mono text-[10px] px-1.5 py-0.5 rounded border ${
                  active ? "border-success/50 bg-success/10 text-success" :
                           "border-border bg-secondary/40 text-muted-foreground line-through"
                }`}>
                  {active ? <CheckCircle2 className="size-3 inline -mt-0.5 mr-1" /> : null}
                  {s.name.toUpperCase()}
                </span>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            {activeSensors.length} of {SENSORS.length} sensors contributing to the active perception pipeline.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-background/30 p-3">
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Single Point-of-Failure Watchlist
          </div>
          {spofs.length === 0 ? (
            <div className="text-[11px] text-success mono">
              ✓ All sensors have at least one healthy backup available.
            </div>
          ) : (
            <ul className="space-y-1 text-[11px]">
              {spofs.map(s => (
                <li key={s.spec.id} className="flex items-center gap-2 text-accent">
                  <CircleAlert className="size-3" />
                  <span className="mono">{s.spec.name.toUpperCase()}</span>
                  <span className="text-muted-foreground">— only {s.depth} healthy node{s.depth === 1 ? "" : "s"} in chain</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: Role }) {
  const map: Record<Role, { label: string; cls: string }> = {
    primary:        { label: "PRIMARY",        cls: "border-success/40 bg-success/10 text-success" },
    standby:        { label: "STANDBY",        cls: "border-border bg-secondary/40 text-muted-foreground" },
    "active-backup":{ label: "BACKUP ACTIVE",  cls: "border-accent/40 bg-accent/10 text-accent" },
    exhausted:      { label: "EXHAUSTED",      cls: "border-destructive/40 bg-destructive/10 text-destructive" },
    failed:         { label: "FAILED",         cls: "border-destructive/40 bg-destructive/10 text-destructive" },
  };
  const r = map[role];
  return <span className={`mono text-[10px] px-1.5 py-0.5 rounded border ${r.cls}`}>{r.label}</span>;
}

function Stat({ icon: Icon, label, value, tone }: {
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
