import type { PlanInput, PlanSessionInput } from "./api";

/** Types de séance connus (les autres s'affichent en gris). */
export const PLAN_TYPES: Record<string, string> = {
  endurance: "Endurance",
  seuil: "Seuil / qualité",
  relance: "Côtes & relances",
  longue: "Sortie longue",
  test: "Test",
  repos: "Repos",
  course: "Course",
};

const TEMPLATE_SESSIONS: PlanSessionInput[] = [
  { date: "2027-01-05", title: "Footing", type: "endurance", km: 8, description: "Allure facile, tu dois pouvoir parler.", steps: [] },
  {
    date: "2027-01-07",
    title: "Fractionné 6 × 2 min",
    type: "seuil",
    km: 10,
    description: "",
    steps: ["Échauffement 15 min", "6 × [2 min vite / 2 min trot]", "Retour au calme 10 min"],
  },
  { date: "2027-01-09", title: "Sortie longue", type: "longue", km: 14, description: "Sur sentier, sans forcer.", steps: [] },
  { date: "2027-01-10", title: "Repos", type: "repos", km: null, description: "", steps: [] },
];

export function templateJson(): string {
  const t: PlanInput = { name: "Mon programme", goal_name: "Ma course", goal_date: "2027-03-06", sessions: TEMPLATE_SESSIONS };
  return JSON.stringify(t, null, 2);
}

export function templateCsv(): string {
  const head = "date;titre;type;km;description";
  const rows = TEMPLATE_SESSIONS.map((s) =>
    [s.date, s.title, s.type, s.km ?? "", [s.description, ...s.steps].filter(Boolean).join(" · ")].map((v) => csvCell(String(v))).join(";"),
  );
  return "﻿" + [head, ...rows].join("\r\n") + "\r\n";
}

const csvCell = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Accepte AAAA-MM-JJ ou JJ/MM/AAAA (ce qu'Excel produit en français). */
function toIso(v: unknown, where: string): string {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  throw new Error(`${where} : date « ${s || "vide"} » non reconnue (format attendu : 2027-03-06 ou 06/03/2027).`);
}

function toKm(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v > 0 ? v : null;
  const n = parseFloat(String(v).replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function cleanSession(raw: Record<string, unknown>, i: number): PlanSessionInput {
  const where = `Séance ${i + 1}`;
  const title = String(raw.title ?? raw.titre ?? "").trim();
  if (!title) throw new Error(`${where} : le titre est vide.`);
  const type = String(raw.type ?? "endurance").trim().toLowerCase() || "endurance";
  const steps = Array.isArray(raw.steps) ? raw.steps.map(String) : [];
  return {
    date: toIso(raw.date, where),
    title,
    type,
    km: toKm(raw.km ?? raw.distance),
    description: String(raw.description ?? "").trim(),
    steps,
  };
}

/** Découpe un CSV (séparateur ; , ou tabulation, guillemets) en lignes de cellules. */
function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const first = t.split(/\r?\n/, 1)[0] ?? "";
  const sep = [";", "\t", ","].map((c) => [c, first.split(c).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"' && t[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const norm = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function parsePlanFile(fileName: string, text: string): PlanInput {
  const baseName = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Mon programme";
  const trimmed = text.replace(/^﻿/, "").trim();
  if (!trimmed) throw new Error("Le fichier est vide.");

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    let data: unknown;
    try {
      data = JSON.parse(trimmed);
    } catch (e) {
      throw new Error(`Fichier JSON illisible (${(e as Error).message}).`);
    }
    const obj = Array.isArray(data) ? { sessions: data } : (data as Record<string, unknown>);
    const list = obj.sessions;
    if (!Array.isArray(list) || list.length === 0) throw new Error("Aucune séance trouvée : il faut une liste « sessions ».");
    return {
      name: String(obj.name ?? obj.nom ?? baseName),
      goal_name: obj.goal_name ? String(obj.goal_name) : null,
      goal_date: obj.goal_date ? toIso(obj.goal_date, "Date de l'objectif") : null,
      sessions: list.map((s, i) => cleanSession(s as Record<string, unknown>, i)),
    };
  }

  const rows = parseCsv(trimmed);
  if (rows.length < 2) throw new Error("Le tableau doit contenir une ligne d'en-têtes puis au moins une séance.");
  const head = rows[0].map(norm);
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const iDate = col("date", "jour");
  const iTitle = col("titre", "title", "seance", "nom");
  if (iDate < 0 || iTitle < 0) throw new Error("Colonnes obligatoires : « date » et « titre ». Télécharge le modèle pour voir le format.");
  const iType = col("type");
  const iKm = col("km", "distance", "distance km");
  const iDesc = col("description", "details", "detail", "notes");
  const sessions = rows.slice(1).map((r, i) =>
    cleanSession(
      { date: r[iDate], title: r[iTitle], type: iType >= 0 ? r[iType] : "", km: iKm >= 0 ? r[iKm] : null, description: iDesc >= 0 ? r[iDesc] : "" },
      i,
    ),
  );
  return { name: baseName, goal_name: null, goal_date: null, sessions };
}

export function downloadText(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
