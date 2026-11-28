import { AlertTriangle, CheckCircle2, Eye } from "lucide-react";

import { InfoTip } from "@/components/common";
import type { ActivityDetail } from "@/lib/api";
import { balanceInfo, mean, nf, signed } from "@/lib/format";
import { C } from "@/lib/palette";
import { drift, type Prepared } from "@/lib/series";

function Tile({ label, value, unit, sub }: { label: string; value: string; unit: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-foreground/[0.04] px-3.5 py-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-0.5 flex items-baseline gap-1 tracking-tight">
        <span className="text-xl font-semibold">{value}</span>
        <span className="text-muted-foreground text-[13px] font-medium">{unit}</span>
      </p>
      {sub && <p className="text-muted-foreground mt-0.5 text-[11px]">{sub}</p>}
    </div>
  );
}

/** Barre d'équilibre G/D centrée sur 50 % ; la zone verte = ±1,5 pt, orange = ±2,5 pt. */
function BalanceBar({ left }: { left: number }) {
  const info = balanceInfo(left)!;
  const pos = Math.min(60, Math.max(40, left));
  const x = ((pos - 40) / 20) * 100;
  return (
    <div>
      <div className="relative h-3 rounded-full bg-foreground/[0.07]" role="img" aria-label={`Temps de contact : ${nf(left, 1)} % gauche, ${nf(100 - left, 1)} % droite`}>
        <div className="absolute inset-y-0 rounded-full bg-[#FF9F0A]/25" style={{ left: "37.5%", width: "25%" }} />
        <div className="absolute inset-y-0 rounded-full bg-[#30D158]/30" style={{ left: "42.5%", width: "15%" }} />
        <div className="absolute inset-y-[-3px] left-1/2 w-px bg-foreground/40" />
        <div
          className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-background shadow-lg"
          style={{ left: `${x}%`, background: info.color }}
        />
      </div>
      <div className="text-muted-foreground mt-1.5 flex justify-between text-[11px]">
        <span>Gauche {nf(left, 1)} %</span>
        <span>Droite {nf(100 - left, 1)} %</span>
      </div>
    </div>
  );
}

export function RunningDynamics({ a, prep }: { a: ActivityDetail; prep: Prepared | null }) {
  const left = a.gct_balance_left_pct;
  const info = balanceInfo(left);
  const splits = (a.splits ?? []).filter((s) => s.gct_balance_left_pct != null);
  const balDrift = prep ? drift(prep.bal) : null;
  const gctDrift = prep ? drift(prep.gct) : null;
  const voscDrift = prep ? drift(prep.vosc) : null;

  const has = a.ground_contact_ms != null || left != null || a.vertical_oscillation_cm != null || a.stride_length_cm != null;
  if (!has) {
    return <p className="text-muted-foreground text-sm">Pas de dynamiques de course sur cette sortie (ceinture HRM-600 non portée ou activité hors course).</p>;
  }

  const Icon = !info ? Eye : info.level === "ok" ? CheckCircle2 : AlertTriangle;
  const meanBal = mean(splits.map((s) => s.gct_balance_left_pct));

  return (
    <div className="grid gap-4">
      {info && left != null ? (
        <div
          className="rounded-2xl border p-4"
          style={{ borderColor: `${info.color}55`, background: `${info.color}12` }}
          role={info.level === "alert" ? "alert" : undefined}
        >
          <div className="mb-3 flex items-start gap-2.5">
            <Icon className="mt-0.5 size-5 shrink-0" style={{ color: info.color }} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[15px] font-semibold tracking-tight">
                Équilibre de contact au sol · {info.label}
                <InfoTip label="À propos de l'équilibre">
                  Écart entre le temps de contact au sol de la jambe gauche et de la droite. Jusqu'à 1,5 point d'écart autour de 50 % : normal. Au-delà de 2,5 points,
                  c'est un écart à surveiller.
                </InfoTip>
              </p>
              <p className="text-muted-foreground mt-0.5 text-[13px]">
                {info.level === "ok"
                  ? `Écart de ${nf(info.gap, 1)} pt à 50 %.`
                  : `Appui plus long côté ${info.side} : ${nf(info.gap, 1)} pt d'écart à 50 %.`}
                {balDrift && Math.abs(balDrift.end - 50) - Math.abs(balDrift.start - 50) > 0.5 && " Il se creuse en fin de séance."}
              </p>
            </div>
          </div>
          <BalanceBar left={left} />
          {balDrift && (
            <p className="text-muted-foreground mt-3 text-xs">
              Début {nf(balDrift.start, 1)} % → fin {nf(balDrift.end, 1)} % (gauche)
            </p>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground rounded-2xl bg-foreground/[0.04] p-3.5 text-[13px]">
          Équilibre gauche/droite non enregistré sur cette sortie (disponible seulement avec la ceinture HRM-600 et une synchro récente).
        </p>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {a.ground_contact_ms != null && (
          <Tile label="Temps de contact" value={nf(a.ground_contact_ms)} unit="ms" sub={gctDrift ? `${signed(gctDrift.end - gctDrift.start)} ms début → fin` : undefined} />
        )}
        {a.vertical_oscillation_cm != null && (
          <Tile label="Oscillation verticale" value={nf(a.vertical_oscillation_cm, 1)} unit="cm" sub={voscDrift ? `${signed(voscDrift.end - voscDrift.start, 1)} cm début → fin` : undefined} />
        )}
        {a.vertical_ratio_pct != null && <Tile label="Ratio vertical" value={nf(a.vertical_ratio_pct, 1)} unit="%" />}
        {a.stride_length_cm != null && <Tile label="Longueur de foulée" value={nf(a.stride_length_cm / 100, 2)} unit="m" />}
        {a.avg_cadence_spm != null && <Tile label="Cadence" value={nf(prep ? cadence(a.avg_cadence_spm) : a.avg_cadence_spm)} unit="ppm" />}
        {a.avg_power_w != null && <Tile label="Puissance" value={nf(a.avg_power_w)} unit="W" />}
      </div>

      {splits.length > 1 && (
        <div>
          <p className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium">
            Équilibre par tour
            {meanBal != null && <span className="text-muted-foreground/70">· moyenne {nf(meanBal, 1)} % gauche</span>}
          </p>
          <div className="flex h-20 items-center gap-1" role="img" aria-label="Écart à 50 % du temps de contact gauche, tour par tour">
            {splits.map((s) => {
              const dev = (s.gct_balance_left_pct as number) - 50;
              const bi = balanceInfo(s.gct_balance_left_pct)!;
              const h = Math.min(100, (Math.abs(dev) / 4) * 100);
              return (
                <div key={s.n} className="relative flex h-full min-w-0 flex-1 flex-col justify-center" title={`tour ${s.n} : ${nf(s.gct_balance_left_pct, 1)} % gauche`}>
                  <div className="absolute inset-x-0 top-1/2 h-px bg-foreground/15" />
                  <div
                    className="absolute inset-x-[10%] rounded-[3px]"
                    style={{
                      background: bi.color,
                      height: `${Math.max(h, 3) / 2}%`,
                      ...(dev >= 0 ? { bottom: "50%" } : { top: "50%" }),
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="text-muted-foreground/70 mt-1 flex justify-between text-[11px]">
            <span>↑ gauche plus long</span>
            <span style={{ color: C.label3 }}>tour 1 → {splits.length}</span>
            <span>droite plus long ↓</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Cadence : anciennes synchros = une seule jambe (~80) → on double si besoin
const cadence = (v: number) => (v < 110 ? v * 2 : v);
