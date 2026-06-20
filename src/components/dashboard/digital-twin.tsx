import type { SensorId, SensorState, PerceptionMode } from "@/lib/simulation";

export function DigitalTwin({ states, mode }: {
  states: Record<SensorId, SensorState>; mode: PerceptionMode;
}) {
  const dots: Record<SensorId, { x: number; y: number; label: string }> = {
    camera: { x: 50, y: 14, label: "CAM" },
    lidar:  { x: 50, y: 30, label: "LiDAR" },
    radar:  { x: 18, y: 50, label: "RADAR" },
    gps:    { x: 82, y: 50, label: "GPS" },
    imu:    { x: 50, y: 78, label: "IMU" },
  };
  const color = (s: SensorState) => s.status === "failed" ? "oklch(0.65 0.22 25)"
                                  : s.status === "degraded" ? "oklch(0.82 0.17 80)"
                                  : "oklch(0.74 0.17 150)";
  return (
    <div className="relative h-[280px] w-full grid-bg rounded-xl border border-border overflow-hidden">
      <div className="absolute inset-0 scanline pointer-events-none" />
      {/* car silhouette */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="carGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="oklch(0.78 0.16 195)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="oklch(0.78 0.16 195)" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <rect x="32" y="18" width="36" height="64" rx="14" fill="url(#carGrad)" stroke="oklch(0.78 0.16 195 / 0.6)" strokeWidth="0.4" />
        <rect x="38" y="28" width="24" height="14" rx="3" fill="oklch(0.21 0.025 250)" stroke="oklch(0.78 0.16 195 / 0.5)" strokeWidth="0.3" />
        <rect x="38" y="56" width="24" height="20" rx="3" fill="oklch(0.21 0.025 250)" stroke="oklch(0.78 0.16 195 / 0.5)" strokeWidth="0.3" />
        {/* data flow lines from each sensor to center */}
        {(Object.keys(dots) as SensorId[]).map(id => {
          const d = dots[id];
          const active = mode.active.includes(id) && states[id].status !== "failed";
          return (
            <line key={id} x1={d.x} y1={d.y} x2={50} y2={50}
              stroke={active ? "oklch(0.78 0.16 195 / 0.6)" : "oklch(0.65 0.22 25 / 0.4)"}
              strokeWidth="0.3" strokeDasharray={active ? "0" : "1 1"} />
          );
        })}
        <circle cx="50" cy="50" r="2.5" fill="oklch(0.78 0.16 195)" />
      </svg>
      {(Object.keys(dots) as SensorId[]).map(id => {
        const d = dots[id]; const s = states[id];
        return (
          <div key={id} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
               style={{ left: `${d.x}%`, top: `${d.y}%` }}>
            <div className="size-3 rounded-full pulse-dot" style={{ background: color(s), boxShadow: `0 0 12px ${color(s)}` }} />
            <span className="mono text-[9px] mt-0.5 text-muted-foreground tracking-wider">{d.label}</span>
          </div>
        );
      })}
      <div className="absolute bottom-2 left-2 mono text-[10px] text-muted-foreground">
        DIGITAL TWIN · {mode.active.length}/5 SENSORS ACTIVE
      </div>
    </div>
  );
}
