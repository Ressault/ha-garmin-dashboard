import { useMemo, useRef, useState } from "react";
import { ArrowLeft, Flame, Gauge, HeartPulse, Mountain, Timer } from "lucide-react";

import { ActivityChart, type ActivityChartHandle } from "@/components/ActivityChart";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { QueryError, Segmented, SportTile, Value } from "@/components/common";
import { StravaPanels } from "@/components/StravaPanels";
import { RunningDynamics } from "@/components/RunningDynamics";
import { TrackMap, type MapMode, type TrackMapHandle } from "@/components/TrackMap";
import { ZoneBars } from "@/components/ZoneBars";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@/hooks/useQuery";
import { api, type ActivityDetail, type Split } from "@/lib/api";
import { dayLabelLong, fmtHM, isFoot, nf, speedDisplay, sportGroup, SPORT_LABEL, teInfo, timeOf, fmtPace } from "@/lib/format";
import { prepare } from "@/lib/series";

function Stat({ label, value, unit, icon }: { label: string; value: string; unit?: string; icon?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground flex items-center gap-1 text-xs [&_svg]:size-3.5">
        {icon}
        {label}
      </p>
      <Value value={value} unit={unit} size="lg" className="mt-0.5" />
    </div>
  );
}

function Header({ a }: { a: ActivityDetail }) {
  const g = sportGroup(a.sport_type);
  const foot = isFoot(a.sport_type);
  const speed = speedDisplay(a.sport_type, a.avg_speed_ms);
  const te = teInfo(a.aerobic_te);
  const gap = a.avg_gap_speed_ms && foot ? fmtPace(a.avg_gap_speed_ms) : null;
  return (
    <div className="grid gap-5">
      <div className="flex items-start gap-3.5">
        <SportTile type={a.sport_type} className="size-12" />
        <div className="min-w-0">
          <h1 className="text-[28px] leading-8 font-bold tracking-tight text-balance">{a.name || SPORT_LABEL[g]}</h1>
          <p className="text-muted-foreground mt-0.5 text-[15px]">
            {dayLabelLong(a.activity_date)} · {timeOf(a.start_time_local)} · {SPORT_LABEL[g]}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Distance" value={(a.distance_m ?? 0) > 100 ? nf((a.distance_m ?? 0) / 1000, 2) : "—"} unit="km" />
        <Stat label="Durée" value={fmtHM(a.duration_s)} />
        <Stat label={foot ? "Allure moy." : "Vitesse moy."} value={speed.value} unit={speed.unit} icon={<Gauge />} />
        <Stat label="D+" value={nf(a.elevation_gain_m)} unit="m" icon={<Mountain />} />
        <Stat label="FC moy." value={a.avg_hr ? nf(a.avg_hr) : "—"} unit="bpm" icon={<HeartPulse />} />
        <Stat label="Effet aérobie" value={a.aerobic_te != null ? nf(a.aerobic_te, 1) : "—"} icon={<Flame />} />
      </div>
      <div className="flex flex-wrap gap-2">
        {te && (
          <Badge variant="secondary" style={{ color: te.color }}>
            {a.te_label || te.label}
          </Badge>
        )}
        {gap && (
          <Badge variant="secondary">
            <Timer /> Allure ajustée {gap} /km
          </Badge>
        )}
        {a.max_hr ? <Badge variant="secondary">FC max {nf(a.max_hr)} bpm</Badge> : null}
        {a.training_load ? <Badge variant="secondary">Charge {nf(a.training_load)}</Badge> : null}
        {a.vo2max ? <Badge variant="secondary">VO₂max {nf(a.vo2max)}</Badge> : null}
      </div>
    </div>
  );
}

function SplitsTable({ a }: { a: ActivityDetail }) {
  const splits = a.splits ?? [];
  const foot = isFoot(a.sport_type);
  if (!splits.length) return <p className="text-muted-foreground text-sm">Pas de tours enregistrés.</p>;
  // Allure en temps de mouvement (les arrêts détectés par la montre ne comptent pas), comme Strava
  const movingSpeed = (s: Split) => (s.moving_s && s.distance_m && s.moving_s > 0 ? s.distance_m / s.moving_s : s.avg_speed_ms);
  const hasMoving = splits.some((s) => s.moving_s);
  const fastest = foot ? Math.max(...splits.filter((s) => (s.distance_m ?? 0) > 200).map((s) => movingSpeed(s) ?? 0)) : 0;
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-xs">
            <th className="px-2 py-2 text-left font-medium">Tour</th>
            <th className="px-2 py-2 text-right font-medium">Allure</th>
            <th className="px-2 py-2 text-right font-medium">FC</th>
            <th className="px-2 py-2 text-right font-medium">D+</th>
            <th className="px-2 py-2 text-right font-medium">Cadence</th>
            <th className="px-2 py-2 text-right font-medium">Contact</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {splits.map((s) => {
            const spd = movingSpeed(s);
            const sp = speedDisplay(a.sport_type, spd);
            const best = foot && spd === fastest && splits.length > 2;
            const cad = s.cadence_spm ? (s.cadence_spm < 110 && foot ? s.cadence_spm * 2 : s.cadence_spm) : null;
            return (
              <tr key={s.n} className="hover:bg-foreground/[0.03]">
                <td className="px-2 py-2 font-medium">{s.n}</td>
                <td className={`px-2 py-2 text-right font-semibold ${best ? "text-[#30D158]" : ""}`}>
                  {sp.value} <span className="text-muted-foreground text-xs font-normal">{sp.unit}</span>
                </td>
                <td className="px-2 py-2 text-right">{s.avg_hr ? nf(s.avg_hr) : "—"}</td>
                <td className="px-2 py-2 text-right">{s.elev_gain_m != null ? nf(s.elev_gain_m) : "—"}</td>
                <td className="px-2 py-2 text-right">{cad ? nf(cad) : "—"}</td>
                <td className="px-2 py-2 text-right">{s.gct_ms ? `${nf(s.gct_ms)} ms` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {hasMoving && <p className="text-muted-foreground mt-2 px-1 text-xs">Allure en temps de mouvement : les arrêts détectés par ta montre ne comptent pas.</p>}
    </div>
  );
}

export default function ActivityDetailView({ id }: { id: number }) {
  const q = useQuery(`activity:${id}`, () => api.activity(id));
  const a = q.data;
  const prep = useMemo(() => (a ? prepare(a) : null), [a]);
  const [mode, setMode] = useState<MapMode>("pace");
  const mapRef = useRef<TrackMapHandle>(null);
  const chartRef = useRef<ActivityChartHandle>(null);
  const foot = a ? isFoot(a.sport_type) : true;

  return (
    <div className="grid gap-5">
      <a
        href="#/"
        className="text-primary -ml-1 inline-flex w-fit items-center gap-1 rounded-lg px-1 py-1 text-[15px] font-medium outline-none transition-opacity duration-150 hover:opacity-80 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:opacity-60"
      >
        <ArrowLeft className="size-4" /> Sorties
      </a>

      {q.error && !a && <QueryError error={q.error} onRetry={q.reload} />}

      {!a && !q.error && (
        <div className="grid gap-5">
          <Skeleton className="h-24 w-full max-w-xl" />
          <Skeleton className="h-[360px] w-full rounded-2xl" />
          <Skeleton className="h-[420px] w-full rounded-2xl" />
        </div>
      )}

      {a && (
        <>
          <Header a={a} />

          {a.track && a.track.length > 2 && (
            <Card className="gap-0 overflow-hidden py-0">
              <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
                <CardTitle className="text-base">Parcours</CardTitle>
                <Segmented
                  label="Couleur du tracé"
                  value={mode}
                  onChange={setMode}
                  size="sm"
                  className="w-[180px]"
                  options={[
                    { value: "pace", label: foot ? "Allure" : "Vitesse" },
                    { value: "hr", label: "FC" },
                  ]}
                />
              </div>
              <TrackMap
                ref={mapRef}
                track={a.track}
                prep={prep}
                mode={mode}
                onHover={(d) => chartRef.current?.showAt(d)}
                className="h-[320px] sm:h-[420px]"
              />
            </Card>
          )}

          {prep && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Profil de la sortie</CardTitle>
              </CardHeader>
              <CardContent>
                <ActivityChart ref={chartRef} prep={prep} onHover={(d) => mapRef.current?.showAt(d)} />
              </CardContent>
            </Card>
          )}

          <StravaPanels a={a} prep={prep} />

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Zones de fréquence cardiaque</CardTitle>
              </CardHeader>
              <CardContent>{a.hr_zones?.length ? <ZoneBars zones={a.hr_zones} /> : <p className="text-muted-foreground text-sm">Pas de zones pour cette sortie.</p>}</CardContent>
            </Card>
            {foot && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Dynamiques de course</CardTitle>
                </CardHeader>
                <CardContent>
                  <RunningDynamics a={a} prep={prep} />
                </CardContent>
              </Card>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tours</CardTitle>
            </CardHeader>
            <CardContent>
              <SplitsTable a={a} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bilan & analyse</CardTitle>
            </CardHeader>
            <CardContent>
              <AnalysisPanel a={a} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
