/**
 * Dates — tout est manipulé en chaînes « AAAA-MM-JJ » et en clés de mois
 * « AAAA-MM ». Aucun objet Date n'entre dans les calculs : ça évite les
 * décalages de fuseau qui font sauter une vente d'un mois à l'autre.
 */

export type MonthKey = string; // "2026-09"
export type DayKey = string; // "2026-09-28"

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

const MOIS_COURT = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];

export const MOIS_INITIALE = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/** Date du jour dans le fuseau local, jamais en UTC. */
export function today(): DayKey {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function monthOf(day: DayKey): MonthKey {
  return day.slice(0, 7);
}

export function currentMonth(): MonthKey {
  return monthOf(today());
}

export function yearOf(key: MonthKey | DayKey): number {
  return Number(key.slice(0, 4));
}

export function monthIndex(key: MonthKey | DayKey): number {
  return Number(key.slice(5, 7)) - 1;
}

/** "2026-09" → "2026-09-01", la forme stockée en base pour un objectif. */
export function firstDayOf(month: MonthKey): DayKey {
  return `${month}-01`;
}

export function lastDayOf(month: MonthKey): DayKey {
  const y = yearOf(month);
  const m = monthIndex(month);
  return `${month}-${pad(new Date(y, m + 1, 0).getDate())}`;
}

export function daysInMonth(month: MonthKey): number {
  return new Date(yearOf(month), monthIndex(month) + 1, 0).getDate();
}

/** Décale une clé de mois de `delta` mois (négatif accepté). */
export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const y = yearOf(month);
  const m = monthIndex(month) + delta;
  const ny = y + Math.floor(m / 12);
  const nm = ((m % 12) + 12) % 12;
  return `${ny}-${pad(nm + 1)}`;
}

/** Nombre de mois entre deux clés, toujours positif ou nul. */
export function monthsBetween(a: MonthKey, b: MonthKey): number {
  const index = (k: MonthKey) => yearOf(k) * 12 + monthIndex(k);
  return Math.abs(index(b) - index(a));
}

/** La fenêtre des `n` derniers mois, celui de `end` compris. */
export function monthRange(end: MonthKey, n: number): MonthKey[] {
  return Array.from({ length: n }, (_, i) => shiftMonth(end, i - n + 1));
}

export function monthsOfYear(year: number): MonthKey[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`);
}

export function monthLabel(month: MonthKey, form: "long" | "short" | "full" = "long") {
  const m = MOIS[monthIndex(month)];
  if (form === "short") return MOIS_COURT[monthIndex(month)];
  if (form === "full") return `${m} ${yearOf(month)}`;
  return m;
}

/** Axe des mois : « sept. », et l'année seulement quand elle change. */
export function axisLabel(month: MonthKey, previous?: MonthKey) {
  const short = MOIS_COURT[monthIndex(month)];
  if (!previous || yearOf(previous) !== yearOf(month)) {
    return `${short} ${String(yearOf(month)).slice(2)}`;
  }
  return short;
}

export function dayLabel(day: DayKey) {
  return `${Number(day.slice(8, 10))} ${MOIS_COURT[monthIndex(day)]} ${yearOf(day)}`;
}

export function dayLabelShort(day: DayKey) {
  return `${Number(day.slice(8, 10))} ${MOIS_COURT[monthIndex(day)]}`;
}

/** Nombre de jours entre deux dates. Positif si `b` est après `a`. */
export function daysBetween(a: DayKey, b: DayKey): number {
  const ms = Date.parse(`${b}T00:00:00`) - Date.parse(`${a}T00:00:00`);
  return Math.round(ms / 86_400_000);
}

export function addDays(day: DayKey, n: number): DayKey {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isFuture(day: DayKey) {
  return day > today();
}
