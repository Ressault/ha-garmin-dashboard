import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@/hooks/useQuery";
import { api } from "@/lib/api";
import { dayLabel, nf } from "@/lib/format";

function Item({ label, value, unit, note }: { label: string; value: string; unit?: string; note?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums">
        {value}
        {unit && <span className="text-muted-foreground ml-1 text-sm font-normal">{unit}</span>}
      </p>
      {note && <p className="text-muted-foreground mt-0.5 text-xs">{note}</p>}
    </div>
  );
}

/** Seuils mesurés par la montre : de quoi situer chaque séance. */
export function ThresholdsCard() {
  const q = useQuery("thresholds", () => api.thresholds());
  const t = q.data;
  if (!t?.available) return null;
  const since = (d?: string | null) => (d ? `mesuré le ${dayLabel(d)}` : undefined);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tes seuils</CardTitle>
        <CardDescription>Mesurés par ta montre. Les graphiques des sorties les tracent en orange.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
          {t.lthr_bpm != null && <Item label="FC au seuil" value={nf(t.lthr_bpm)} unit="bpm" note={since(t.lt_date)} />}
          {t.lt_pace && <Item label="Allure au seuil" value={t.lt_pace.replace('"/km', "").replace("'", ":").replace("/km", "")} unit="/km" note={since(t.lt_date)} />}
          {t.run_ftp_w != null && (
            <Item
              label="Puissance seuil de course"
              value={nf(t.run_ftp_w)}
              unit="W"
              note={`${t.run_wkg != null ? `${nf(t.run_wkg, 2)} W/kg · ` : ""}${t.run_ftp_stale ? "à rafraîchir" : since(t.run_ftp_date) ?? ""}`}
            />
          )}
          {t.bike_ftp_w != null && <Item label="FTP vélo" value={nf(t.bike_ftp_w)} unit="W" note={t.bike_ftp_stale ? "ancienne mesure, à rafraîchir" : undefined} />}
          {t.max_hr_bpm != null && <Item label="FC max (zones)" value={nf(t.max_hr_bpm)} unit="bpm" />}
          {t.resting_hr_bpm != null && <Item label="FC repos (zones)" value={nf(t.resting_hr_bpm)} unit="bpm" />}
        </div>
      </CardContent>
    </Card>
  );
}
