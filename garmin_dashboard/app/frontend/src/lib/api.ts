export interface ActivityListItem {
  activity_id: number;
  name: string | null;
  sport_type: string | null;
  start_time_local: string;
  activity_date: string;
  distance_m: number | null;
  duration_s: number | null;
  elevation_gain_m: number | null;
  elevation_loss_m: number | null;
  avg_speed_ms: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  aerobic_te: number | null;
  anaerobic_te: number | null;
  training_load: number | null;
  ground_contact_ms: number | null;
  gct_balance_left_pct: number | null;
  vertical_oscillation_cm: number | null;
  stride_length_cm: number | null;
  avg_power_w: number | null;
  has_notes: number;
  mini_track?: [number, number][] | null;
}

export interface Split {
  n: number;
  intensity?: string;
  distance_m?: number;
  duration_s?: number;
  avg_speed_ms?: number;
  gap_speed_ms?: number;
  avg_hr?: number;
  max_hr?: number;
  elev_gain_m?: number;
  elev_loss_m?: number;
  moving_s?: number;
  cadence_spm?: number;
  gct_ms?: number;
  gct_balance_left_pct?: number;
  stride_cm?: number;
  vosc_cm?: number;
  vratio_pct?: number;
  power_w?: number;
}

export interface SeriesPoint {
  t?: number; // s
  d?: number; // m
  hr?: number;
  cad?: number;
  spd?: number; // m/s
  alt?: number;
  gct?: number;
  bal?: number;
  vosc?: number;
  vratio?: number;
  stride?: number;
  pwr?: number;
}

/** Phase détectée par la montre : course, marche ou arrêt. start_s = secondes depuis le départ. */
export interface Segment {
  type: "run" | "walk" | "stand";
  start_s: number;
  dur_s: number | null;
  moving_s: number | null;
  dist_m: number | null;
  hr: number | null;
}

export interface Thresholds {
  available: boolean;
  date?: string;
  lthr_bpm?: number | null;
  lt_speed_ms?: number | null;
  lt_pace?: string | null;
  lt_date?: string | null;
  run_ftp_w?: number | null;
  run_wkg?: number | null;
  weight_kg?: number | null;
  run_ftp_date?: string | null;
  run_ftp_stale?: number | null;
  bike_ftp_w?: number | null;
  bike_ftp_stale?: number | null;
  max_hr_bpm?: number | null;
  resting_hr_bpm?: number | null;
}

export interface HrZone {
  zone: number;
  low_bpm: number | null;
  secs: number | null;
}

export interface ActivityDetail extends ActivityListItem {
  te_label: string | null;
  moving_duration_s: number | null;
  max_speed_ms: number | null;
  avg_gap_speed_ms: number | null;
  vo2max: number | null;
  calories: number | null;
  avg_cadence_spm: number | null;
  vertical_ratio_pct: number | null;
  max_power_w: number | null;
  hr_zones: HrZone[] | null;
  power_curve: { source: string; curve: [number, number][] } | null;
  splits: Split[] | null;
  segments: Segment[] | null;
  track: [number, number, number | null][] | null;
  timeseries: { units: Record<string, string>; series: SeriesPoint[] } | null;
  notes: string | null;
  ai_analysis: string | null;
  updated_at: string;
}

export interface FitnessDay {
  date: string;
  daily_load: number | null;
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  acute_load: number | null;
  chronic_load: number | null;
  acwr: number | null;
  acwr_status: string | null;
  training_status: string | null;
  hrv_last_night_ms: number | null;
  hrv_weekly_avg_ms: number | null;
  hrv_status: string | null;
  sleep_score: number | null;
  sleep_duration_s: number | null;
  resting_hr: number | null;
  body_battery_max: number | null;
  body_battery_min: number | null;
  stress_avg: number | null;
  readiness_score: number | null;
  readiness_level: string | null;
  recovery_time_h: number | null;
  vo2max: number | null;
  fitness_age: number | null;
  chrono_age: number | null;
  endurance_score: number | null;
  hill_score: number | null;
  endurance_class: number | null;
  endurance_limits_json: string | null;
  hill_class: number | null;
  hill_strength: number | null;
  hill_endurance: number | null;
  fitness_age_target: number | null;
  body_battery_now: number | null;
  body_battery_charged: number | null;
  body_battery_drained: number | null;
}

export interface FitnessResponse {
  days: number;
  latest: FitnessDay | null;
  series: FitnessDay[];
  /** courbe Body Battery du dernier jour synchronisé : [minute du jour, valeur] */
  bb_timeline?: { date: string; points: [number, number][] } | null;
}

export interface PredictionDay {
  date: string;
  time_5k_s: number | null;
  time_10k_s: number | null;
  time_half_s: number | null;
  time_marathon_s: number | null;
}

export interface PredictionsResponse {
  latest: PredictionDay | null;
  delta_s_since_first: Record<"5k" | "10k" | "half" | "marathon", number | null> | null;
  history: PredictionDay[];
}

export interface SyncSummary {
  days: number;
  activities_summaries: number;
  activities_detailed: number;
  health_days: number;
  predictions: number;
  error_count: number;
  errors: string[];
  duration_s: number;
}

export interface SyncStatus {
  running: boolean;
  last: { finished_at: string; summary_json: SyncSummary | null } | null;
}

export type StatSport = "all" | "foot" | "run" | "trail" | "bikes" | "road" | "mtb" | "walk" | "hike" | "swim" | "strength";
export interface Totals {
  secs: number;
  km: number;
  dplus: number;
  count: number;
}
export interface WeeklyResponse {
  sport: string;
  series: (Totals & { week: string })[];
  current: Totals & { week: string };
}
export type PeriodKey = "7d" | "1m" | "3m" | "6m" | "ytd" | "1y";
export interface PeriodResponse {
  period: PeriodKey;
  sport: string;
  granularity: "day" | "week";
  from: string;
  to: string;
  prev_from: string;
  prev_to: string;
  days: number;
  prev_complete: boolean;
  first_date: string | null;
  current: Totals;
  previous: Totals;
  delta_pct: { secs: number | null; km: number | null; dplus: number | null };
  series: (Totals & { date: string })[];
}
export interface ZonePeriod {
  secs: number[];
  total: number;
  activities: number;
  with_zones: number;
  from: string;
  to: string;
}
export interface ZonesResponse {
  days: number;
  current: ZonePeriod;
  previous: ZonePeriod;
  bounds: (number | null)[];
}
export interface MonthlyResponse {
  series: (Totals & { month: string })[];
  current_month: string;
  previous_month: string;
  cumulative: { current: { day: number; secs: number; km: number; dplus: number }[]; previous: { day: number; secs: number; km: number; dplus: number }[] };
}
export interface EffortResponse {
  current: number;
  previous_total: number;
  previous_to_date: number;
  weekday: number;
  status: "below" | "ok" | "above" | null;
  typical: { lo: number[] | null; hi: number[] | null };
  cumulative: { current: number[]; previous: number[] };
  weeks: { week: string; load: number }[];
}
export interface RecordRef {
  activity_id: number;
  name: string | null;
  date: string;
  sport_type: string | null;
}
export interface EffortsResponse {
  kind: "foot" | "bike";
  distances: {
    distance_m: number;
    label: string;
    efforts: { activity_id: number; date: string; name: string | null; time_s: number }[];
  }[];
  analysed: { activities: number; with_detail: number };
}
export interface PlanSessionInput {
  date: string;
  title: string;
  type: string;
  km: number | null;
  description: string;
  steps: string[];
}
export interface PlanInput {
  name: string;
  goal_name: string | null;
  goal_date: string | null;
  sessions: PlanSessionInput[];
}
export type PlanStatus = "done" | "partial" | "missed" | "today" | "upcoming" | "info";
export interface PlanSession extends PlanSessionInput {
  status: PlanStatus;
  done_km: number | null;
  activity_id: number | null;
}
export interface PlanSummary {
  id: number;
  name: string;
  goal_name: string | null;
  goal_date: string | null;
  start_date: string;
  end_date: string;
  sessions: number;
  total_km: number;
  created_at: string;
}
export interface PlanDetail extends PlanSummary {
  today: string;
  sessions_detail: PlanSession[];
  weeks: { week: string; planned_km: number; done_km: number }[];
}
export interface RecordsResponse {
  efforts: (RecordRef & { kind: "foot" | "bike"; label: string; distance_m: number; time_s: number })[];
  totals: (RecordRef & { kind: string; label: string; value: number; unit: string })[];
  analysed: { activities: number; with_detail: number };
}

export interface SleepDetails {
  date: string;
  start_local_ms: number | null;
  end_local_ms: number | null;
  deep_s: number | null;
  light_s: number | null;
  rem_s: number | null;
  awake_s: number | null;
  awake_count: number | null;
  avg_hr: number | null;
  nap_s: number | null;
  qualifiers: Record<string, string | null>;
  need_min: number | null;
  need_baseline_min: number | null;
  next_need_min: number | null;
  next_need_baseline_min: number | null;
  bedtime_start_min: number | null;
  bedtime_end_min: number | null;
  levels: [number, number, "deep" | "light" | "rem" | "awake"][];
}
export interface HeartDay {
  date: string;
  min: number | null;
  max: number | null;
  resting: number | null;
  resting_7d: number | null;
  hours: ([number, number] | null)[];
}
export interface HealthDetails {
  sleep: SleepDetails | null;
  heart: HeartDay[];
}

export interface Profile {
  name: string;
  photo: string; // data-URL JPEG, "" si aucune
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!res.ok) {
    let detail: string = res.statusText || `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) {
        detail = typeof body.detail === "string"
          ? body.detail
          : Array.isArray(body.detail)
            ? body.detail.map((d: { loc?: (string | number)[]; msg?: string }) => `${(d.loc ?? []).slice(1).join(" › ")} : ${(d.msg ?? "").replace(/^Value error, /, "")}`).join(" · ")
            : JSON.stringify(body.detail);
      }
    } catch {
      /* corps non JSON (proxy Vite quand l'API est éteinte) */
    }
    if (res.status === 500 || res.status === 502 || res.status === 504) {
      detail = "API locale injoignable (démarre-la avec start.bat)";
    }
    throw new Error(detail);
  }
  const type = res.headers.get("content-type") ?? "";
  return (type.includes("json") ? res.json() : res.text()) as Promise<T>;
}

export const api = {
  activities: (p: { start?: string; limit?: number }) => {
    const q = new URLSearchParams({ limit: String(p.limit ?? 500) });
    if (p.start) q.set("start", p.start);
    return req<{ total: number; items: ActivityListItem[] }>(`/activities?${q}`);
  },
  activity: (id: number) => req<ActivityDetail>(`/activities/${id}`),
  thresholds: () => req<Thresholds>("/thresholds"),
  exportPrompt: (id: number) => req<string>(`/activities/${id}/export-prompt`),
  saveNotes: (id: number, body: { notes?: string | null; ai_analysis?: string | null }) =>
    req<{ activity_id: number; notes: string | null; ai_analysis: string | null; updated_at: string }>(
      `/activities/${id}/notes`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  fitness: (days: number) => req<FitnessResponse>(`/fitness?days=${days}`),
  predictions: (days: number) => req<PredictionsResponse>(`/predictions?days=${days}`),
  sync: (days = 30) => req<SyncSummary>(`/sync?days=${days}`, { method: "POST" }),
  period: (period: PeriodKey, sport: StatSport) => req<PeriodResponse>(`/stats/period?period=${period}&sport=${sport}`),
  weekly: (weeks: number, sport: StatSport) => req<WeeklyResponse>(`/stats/weekly?weeks=${weeks}&sport=${sport}`),
  zones: (days: number, sport: StatSport, bounds?: number[]) =>
    req<ZonesResponse>(`/stats/zones?days=${days}&sport=${sport}${bounds ? `&bounds=${bounds.join(",")}` : ""}`),
  monthly: (months: number, sport: StatSport) => req<MonthlyResponse>(`/stats/monthly?months=${months}&sport=${sport}`),
  effort: () => req<EffortResponse>("/stats/effort?weeks=12"),
  records: () => req<RecordsResponse>("/stats/records"),
  efforts: (kind: "foot" | "bike") => req<EffortsResponse>(`/stats/efforts?kind=${kind}`),
  plans: () => req<{ plans: PlanSummary[] }>("/plans"),
  plan: (id: number) => req<PlanDetail>(`/plans/${id}`),
  createPlan: (plan: PlanInput) => req<{ id: number; replaced: boolean }>("/plans", { method: "POST", body: JSON.stringify(plan) }),
  deletePlan: (id: number) => req<{ deleted: number }>(`/plans/${id}`, { method: "DELETE" }),
  syncStatus: () => req<SyncStatus>("/sync/status"),
  healthDetails: () => req<HealthDetails>("/health/details"),
  profile: () => req<Profile>("/profile"),
  saveProfile: (p: Partial<Profile>) => req<Profile>("/profile", { method: "PUT", body: JSON.stringify(p) }),
};
