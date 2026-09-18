import type { Basis, Entry, Goal, Stream } from "./types";
import {
  type DayKey,
  type MonthKey,
  addDays,
  currentMonth,
  daysBetween,
  daysInMonth,
  firstDayOf,
  monthOf,
  monthRange,
  shiftMonth,
  today,
} from "./dates";

/* ===================================================================
   Les trois montants qu'on tire d'une écriture
   =================================================================== */

/** Ce qui arrive réellement sur le compte : brut moins les frais. */
export function revenueOf(e: Entry) {
  return e.gross_cents - e.fee_cents;
}

/** Ce qu'il reste une fois le coût d'acquisition déduit. */
export function marginOf(e: Entry) {
  return e.gross_cents - e.fee_cents - e.cost_cents;
}

/**
 * La date qui compte, selon la base.
 *  - cash    : le jour de l'encaissement (null si pas encore encaissé)
 *  - accrual : le jour de la vente
 */
export function dateOf(e: Entry, basis: Basis): DayKey | null {
  return basis === "cash" ? e.received_on : e.occurred_on;
}

export function isCounted(e: Entry, basis: Basis): boolean {
  if (e.status === "cancelled") return false;
  return dateOf(e, basis) !== null;
}

/* ===================================================================
   Agrégation mensuelle
   =================================================================== */

export type Totals = {
  gross: number;
  fee: number;
  cost: number;
  /** gross − fee : l'argent qui rentre */
  revenue: number;
  /** gross − fee − cost : ce qu'il reste après le coût d'achat */
  margin: number;
  /** charges rattachées (direction « out ») */
  charges: number;
  /** margin − charges */
  net: number;
  count: number;
};

export type MonthBucket = Totals & {
  month: MonthKey;
  byStream: Record<string, Totals>;
  entries: Entry[];
};

function emptyTotals(): Totals {
  return { gross: 0, fee: 0, cost: 0, revenue: 0, margin: 0, charges: 0, net: 0, count: 0 };
}

function addEntry(t: Totals, e: Entry) {
  if (e.direction === "out") {
    t.charges += e.gross_cents;
    t.net -= e.gross_cents;
  } else {
    t.gross += e.gross_cents;
    t.fee += e.fee_cents;
    t.cost += e.cost_cents;
    t.revenue += revenueOf(e);
    t.margin += marginOf(e);
    t.net += marginOf(e);
  }
  t.count += 1;
}

/** Range les écritures par mois selon la base choisie. */
export function bucketByMonth(entries: Entry[], basis: Basis): Map<MonthKey, MonthBucket> {
  const map = new Map<MonthKey, MonthBucket>();
  for (const e of entries) {
    const day = dateOf(e, basis);
    if (!day || e.status === "cancelled") continue;
    const key = monthOf(day);
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { month: key, ...emptyTotals(), byStream: {}, entries: [] };
      map.set(key, bucket);
    }
    addEntry(bucket, e);
    const sid = e.stream_id ?? "—";
    bucket.byStream[sid] ??= emptyTotals();
    addEntry(bucket.byStream[sid], e);
    bucket.entries.push(e);
  }
  return map;
}

export function bucketFor(
  buckets: Map<MonthKey, MonthBucket>,
  month: MonthKey,
): MonthBucket {
  return buckets.get(month) ?? { month, ...emptyTotals(), byStream: {}, entries: [] };
}

/** Série continue : les mois sans aucune écriture valent zéro, pas un trou. */
export function series(
  buckets: Map<MonthKey, MonthBucket>,
  months: MonthKey[],
): MonthBucket[] {
  return months.map((m) => bucketFor(buckets, m));
}

/* ===================================================================
   Variations
   =================================================================== */

export type Delta = {
  absolute: number;
  /** null quand la référence est zéro : « +∞ % » ne veut rien dire */
  ratio: number | null;
};

export function delta(current: number, previous: number): Delta {
  return {
    absolute: current - previous,
    ratio: previous === 0 ? null : (current - previous) / Math.abs(previous),
  };
}

/* ===================================================================
   Encaissements — le décalage vente → versement

   On ne saisit jamais la date d'encaissement à la main : elle est
   déduite du délai habituel de l'activité, puis soit confirmée toute
   seule (versements fiables), soit validée d'un clic pour tout un lot.
   =================================================================== */

/** Date d'encaissement prévue pour une vente donnée. */
export function expectedDateFor(occurredOn: DayKey, stream: Stream | undefined): DayKey {
  return addDays(occurredOn, stream?.settlement_days ?? 0);
}

/** La date prévue d'une écriture, en retombant sur la vente si absente. */
export function expectedOf(e: Entry, streams: StreamIndex): DayKey {
  return e.expected_on ?? expectedDateFor(e.occurred_on, streams[e.stream_id ?? ""]);
}

export type StreamIndex = Record<string, Stream | undefined>;

export function indexStreams(streams: Stream[]): StreamIndex {
  return Object.fromEntries(streams.map((s) => [s.id, s]));
}

export type PendingBucket = {
  label: string;
  entries: Entry[];
  amount: number;
};

export type UpcomingMonth = {
  month: MonthKey;
  amount: number;
  entries: Entry[];
};

export type PendingReport = {
  entries: Entry[];
  total: number;

  /** Date prévue atteinte, encaissement pas encore confirmé : à valider. */
  dueNow: Entry[];
  dueNowAmount: number;

  /** Date prévue encore devant : l'argent qui va tomber, et quand. */
  upcoming: Entry[];
  upcomingAmount: number;
  upcomingByMonth: UpcomingMonth[];

  /** Plus de 14 jours après la date prévue : ça ne tombera pas tout seul. */
  overdue: Entry[];
  overdueAmount: number;

  /** Conclu ce mois-ci, pas encore encaissé : ce qui glissera au suivant. */
  fromCurrentMonth: number;
  /** Conclu avant ce mois-ci et toujours pas encaissé. */
  carriedOver: number;

  aging: PendingBucket[];
  /** Délai médian réellement constaté entre vente et encaissement. */
  medianDelay: number | null;
};

const AGING = [
  { label: "dans les temps", max: 0 },
  { label: "1 à 7 j de retard", max: 7 },
  { label: "8 à 30 j de retard", max: 30 },
  { label: "plus de 30 j de retard", max: Infinity },
];

const OVERDUE_GRACE_DAYS = 14;

export function pendingReport(
  entries: Entry[],
  streams: Stream[],
  ref: DayKey = today(),
): PendingReport {
  const index = indexStreams(streams);
  const pending = entries.filter((e) => e.status === "pending" && e.direction === "in");
  const month = monthOf(ref);

  const aging: PendingBucket[] = AGING.map((b) => ({ label: b.label, entries: [], amount: 0 }));
  const dueNow: Entry[] = [];
  const upcoming: Entry[] = [];
  const overdue: Entry[] = [];
  const byMonth = new Map<MonthKey, UpcomingMonth>();

  let total = 0;
  let dueNowAmount = 0;
  let upcomingAmount = 0;
  let fromCurrentMonth = 0;
  let carriedOver = 0;

  for (const e of pending) {
    const amount = revenueOf(e);
    const expected = expectedOf(e, index);
    total += amount;

    if (monthOf(e.occurred_on) === month) fromCurrentMonth += amount;
    else if (e.occurred_on < firstDayOf(month)) carriedOver += amount;

    if (expected > ref) {
      upcoming.push(e);
      upcomingAmount += amount;
      const key = monthOf(expected);
      const slot = byMonth.get(key) ?? { month: key, amount: 0, entries: [] };
      slot.amount += amount;
      slot.entries.push(e);
      byMonth.set(key, slot);
    } else {
      dueNow.push(e);
      dueNowAmount += amount;
      if (daysBetween(expected, ref) > OVERDUE_GRACE_DAYS) overdue.push(e);
    }

    const lateness = Math.max(0, daysBetween(expected, ref));
    const idx = AGING.findIndex((b) => lateness <= b.max);
    const slot = aging[idx === -1 ? AGING.length - 1 : idx];
    slot.entries.push(e);
    slot.amount += amount;
  }

  const order = (a: Entry, b: Entry) => expectedOf(a, index).localeCompare(expectedOf(b, index));

  return {
    entries: pending,
    total,
    dueNow: dueNow.sort(order),
    dueNowAmount,
    upcoming: upcoming.sort(order),
    upcomingAmount,
    upcomingByMonth: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
    overdue: overdue.sort(order),
    overdueAmount: overdue.reduce((s, e) => s + revenueOf(e), 0),
    fromCurrentMonth,
    carriedOver,
    aging: aging.filter((b) => b.entries.length > 0),
    medianDelay: medianSettlementDelay(entries),
  };
}

/**
 * Les écritures qu'on peut confirmer sans rien demander : activité
 * marquée « versement fiable » et date prévue atteinte.
 */
export function autoSettlable(
  entries: Entry[],
  streams: Stream[],
  ref: DayKey = today(),
): { entry: Entry; on: DayKey }[] {
  const index = indexStreams(streams);
  const out: { entry: Entry; on: DayKey }[] = [];
  for (const e of entries) {
    if (e.status !== "pending" || e.direction !== "in") continue;
    const stream = index[e.stream_id ?? ""];
    if (!stream?.auto_settle) continue;
    const expected = expectedOf(e, index);
    if (expected <= ref) out.push({ entry: e, on: expected });
  }
  return out;
}

/**
 * Sur les écritures déjà encaissées, combien de jours se sont écoulés
 * entre la vente et le versement. La médiane résiste mieux qu'une
 * moyenne à la vente réglée six mois plus tard.
 */
export function medianSettlementDelay(entries: Entry[], streamId?: string): number | null {
  const delays = entries
    .filter(
      (e) =>
        e.status === "received" &&
        e.received_on &&
        e.direction === "in" &&
        (!streamId || e.stream_id === streamId),
    )
    .map((e) => daysBetween(e.occurred_on, e.received_on as DayKey))
    .filter((d) => d >= 0)
    .sort((a, b) => a - b);

  if (delays.length === 0) return null;
  const mid = Math.floor(delays.length / 2);
  return delays.length % 2 ? delays[mid] : Math.round((delays[mid - 1] + delays[mid]) / 2);
}

/**
 * Le réglage de délai d'une activité confronté à la réalité observée.
 * Sert à proposer un ajustement plutôt qu'à l'imposer.
 */
export type DelayCheck = {
  stream: Stream;
  configured: number;
  observed: number;
  sample: number;
};

export function delayChecks(entries: Entry[], streams: Stream[], minSample = 4): DelayCheck[] {
  const out: DelayCheck[] = [];
  for (const stream of streams) {
    const settled = entries.filter(
      (e) => e.stream_id === stream.id && e.status === "received" && e.received_on,
    );
    if (settled.length < minSample) continue;
    const observed = medianSettlementDelay(entries, stream.id);
    if (observed === null) continue;
    if (Math.abs(observed - stream.settlement_days) < 2) continue;
    out.push({
      stream,
      configured: stream.settlement_days,
      observed,
      sample: settled.length,
    });
  }
  return out;
}

/* ===================================================================
   Objectifs et projection
   =================================================================== */

export type GoalProgress = {
  target: number;
  actual: number;
  ratio: number;
  remaining: number;
  /** Ce qu'il reste à faire par jour pour y arriver. null si mois clos. */
  perDayNeeded: number | null;
  daysLeft: number;
  reached: boolean;
};

export function goalProgress(
  goals: Goal[],
  month: MonthKey,
  actual: number,
  streamId: string | null = null,
  ref: DayKey = today(),
): GoalProgress | null {
  const goal = goals.find(
    (g) => g.month.slice(0, 7) === month && (g.stream_id ?? null) === streamId,
  );
  if (!goal || goal.target_cents <= 0) return null;

  const total = daysInMonth(month);
  const elapsed = monthOf(ref) === month ? Number(ref.slice(8, 10)) : ref > month ? total : 0;
  const daysLeft = Math.max(0, total - elapsed);
  const remaining = Math.max(0, goal.target_cents - actual);

  return {
    target: goal.target_cents,
    actual,
    ratio: goal.target_cents === 0 ? 0 : actual / goal.target_cents,
    remaining,
    perDayNeeded: daysLeft > 0 ? Math.round(remaining / daysLeft) : null,
    daysLeft,
    reached: actual >= goal.target_cents,
  };
}

/**
 * Projection du mois en cours : on extrapole le rythme observé depuis
 * le 1er, puis on y ajoute ce qui est déjà vendu mais pas encore
 * encaissé — cette partie-là n'est pas une hypothèse, elle est acquise.
 */
export function projectMonth(
  bucket: MonthBucket,
  month: MonthKey,
  /** Encaissements déjà vendus dont la date prévue tombe dans ce mois. */
  securedPending: number,
  ref: DayKey = today(),
): {
  paced: number;
  secured: number;
  total: number;
  confidence: number;
  daysElapsed: number;
} | null {
  if (monthOf(ref) !== month) return null;
  const total = daysInMonth(month);
  const elapsed = Math.max(1, Number(ref.slice(8, 10)));
  const paced = Math.round((bucket.net / elapsed) * total);
  return {
    paced,
    secured: securedPending,
    total: paced + securedPending,
    confidence: elapsed / total,
    daysElapsed: elapsed,
  };
}

/* ===================================================================
   Vue d'ensemble d'un mois
   =================================================================== */

export type MonthOverview = {
  month: MonthKey;
  current: MonthBucket;
  previous: MonthBucket;
  lastYear: MonthBucket;
  vsPrevious: Delta;
  vsLastYear: Delta;
  /** Moyenne des 12 mois précédents (le mois courant exclu). */
  average12: number;
  /** Nombre de mois réellement moyennés dans `average12`. */
  averageMonths: number;
  best: MonthBucket | null;
  ytd: number;
  ytdLastYear: number;
  rank: { position: number; outOf: number } | null;
};

export function monthOverview(
  buckets: Map<MonthKey, MonthBucket>,
  month: MonthKey,
): MonthOverview {
  const current = bucketFor(buckets, month);
  const previous = bucketFor(buckets, shiftMonth(month, -1));
  const lastYear = bucketFor(buckets, shiftMonth(month, -12));

  // La moyenne ne porte que sur les mois RENSEIGNÉS des douze
  // précédents — inclure les mois d'avant le début d'activité la
  // ferait chuter sans que ça veuille dire quoi que ce soit. Le compte
  // est renvoyé avec elle : « moyenne 12 mois » sur deux mois
  // renseignés était un libellé faux.
  const trailing = monthRange(shiftMonth(month, -1), 12).map((m) => bucketFor(buckets, m));
  const nonEmpty = trailing.filter((b) => b.count > 0);
  const average12 = nonEmpty.length
    ? Math.round(nonEmpty.reduce((s, b) => s + b.net, 0) / nonEmpty.length)
    : 0;
  const averageMonths = nonEmpty.length;

  const all = [...buckets.values()].filter((b) => b.count > 0);
  const best = all.length ? all.reduce((a, b) => (b.net > a.net ? b : a)) : null;

  const year = month.slice(0, 4);
  const ytd = all
    .filter((b) => b.month.slice(0, 4) === year && b.month <= month)
    .reduce((s, b) => s + b.net, 0);
  const prevYear = String(Number(year) - 1);
  const prevMonthKey = `${prevYear}${month.slice(4)}`;
  const ytdLastYear = all
    .filter((b) => b.month.slice(0, 4) === prevYear && b.month <= prevMonthKey)
    .reduce((s, b) => s + b.net, 0);

  const sorted = [...all].sort((a, b) => b.net - a.net);
  const position = sorted.findIndex((b) => b.month === month);

  return {
    month,
    current,
    previous,
    lastYear,
    vsPrevious: delta(current.net, previous.net),
    vsLastYear: delta(current.net, lastYear.net),
    average12,
    averageMonths,
    best,
    ytd,
    ytdLastYear,
    rank: position >= 0 ? { position: position + 1, outOf: sorted.length } : null,
  };
}

/* ===================================================================
   Métriques propres à une activité
   =================================================================== */

export type StreamMetrics = {
  stream: Stream;
  total: Totals;
  months: MonthBucket[];
  /** Taux de marge : marge / brut. */
  marginRate: number | null;
  /** Panier moyen encaissé. */
  averageTicket: number | null;
  /** Délai médian vente → encaissement. */
  medianDelay: number | null;
  pendingAmount: number;
  pendingCount: number;
  /** Revenu récurrent du dernier mois clos (activités par abonnement). */
  mrr: number | null;
  mrrDelta: Delta | null;
  /** Meilleur mois de l'activité. */
  best: MonthBucket | null;
  activeMonths: number;
};

export function streamMetrics(
  stream: Stream,
  entries: Entry[],
  basis: Basis,
  months: MonthKey[],
): StreamMetrics {
  const own = entries.filter((e) => e.stream_id === stream.id);
  const buckets = bucketByMonth(own, basis);
  const list = series(buckets, months);

  const total = emptyTotals();
  for (const e of own) {
    if (e.status === "cancelled") continue;
    if (!isCounted(e, basis)) continue;
    addEntry(total, e);
  }

  const incoming = own.filter((e) => e.direction === "in" && isCounted(e, basis));
  const pending = own.filter((e) => e.status === "pending" && e.direction === "in");

  const withCount = list.filter((b) => b.count > 0);
  const closed = list.slice(0, -1);
  const lastClosed = closed.at(-1);
  const prevClosed = closed.at(-2);

  return {
    stream,
    total,
    months: list,
    marginRate: total.gross > 0 ? total.margin / total.gross : null,
    averageTicket: incoming.length ? Math.round(total.revenue / incoming.length) : null,
    medianDelay: medianSettlementDelay(entries, stream.id),
    pendingAmount: pending.reduce((s, e) => s + revenueOf(e), 0),
    pendingCount: pending.length,
    mrr: stream.kind === "subscription" ? (lastClosed?.revenue ?? 0) : null,
    mrrDelta:
      stream.kind === "subscription" && lastClosed && prevClosed
        ? delta(lastClosed.revenue, prevClosed.revenue)
        : null,
    best: withCount.length ? withCount.reduce((a, b) => (b.net > a.net ? b : a)) : null,
    activeMonths: withCount.length,
  };
}

/* ===================================================================
   Projection de fin d'année
   =================================================================== */

export function yearProjection(
  buckets: Map<MonthKey, MonthBucket>,
  year: number,
  ref: DayKey = today(),
): { earned: number; projected: number; monthsLeft: number; runRate: number } {
  const done = [...buckets.values()].filter(
    (b) => b.month.slice(0, 4) === String(year) && b.month < monthOf(ref),
  );
  const currentBucket = bucketFor(buckets, monthOf(ref));
  const inYear = monthOf(ref).slice(0, 4) === String(year);

  const earned = done.reduce((s, b) => s + b.net, 0) + (inYear ? currentBucket.net : 0);
  const recent = done.slice(-3);
  const runRate = recent.length
    ? Math.round(recent.reduce((s, b) => s + b.net, 0) / recent.length)
    : 0;
  const monthsLeft = inYear ? 12 - Number(monthOf(ref).slice(5, 7)) : 0;

  return { earned, projected: earned + runRate * monthsLeft, monthsLeft, runRate };
}

/* ===================================================================
   Comparaison des deux bases — le décalage, chiffré
   =================================================================== */

export type BasisGap = {
  month: MonthKey;
  cash: number;
  accrual: number;
  gap: number;
};

/**
 * Le même mois vu des deux côtés. L'écart est exactement l'argent
 * vendu sur une période mais encaissé sur une autre.
 */
export function basisComparison(entries: Entry[], months: MonthKey[]): BasisGap[] {
  const cash = bucketByMonth(entries, "cash");
  const accrual = bucketByMonth(entries, "accrual");
  return months.map((m) => {
    const c = bucketFor(cash, m).net;
    const a = bucketFor(accrual, m).net;
    return { month: m, cash: c, accrual: a, gap: c - a };
  });
}

/* ===================================================================
   Lecture — les constats que l'app fait à ta place
   =================================================================== */

export type Insight = {
  id: string;
  tone: "good" | "warning" | "critical" | "neutral";
  title: string;
  detail: string;
};

type InsightInput = {
  basis: Basis;
  month: MonthKey;
  overview: MonthOverview;
  pending: PendingReport;
  streams: Stream[];
  goal: GoalProgress | null;
  entries: Entry[];
  delays: DelayCheck[];
  fmt: (cents: number) => string;
  pct: (r: number) => string;
};

export function buildInsights(input: InsightInput): Insight[] {
  const { overview, pending, streams, goal, fmt, pct, month, basis } = input;
  const out: Insight[] = [];
  const cur = overview.current;

  // 1. Le décalage vente → encaissement : la raison d'être de l'app.
  if (pending.fromCurrentMonth > 0) {
    const n = pending.entries.filter((e) => monthOf(e.occurred_on) === month).length;
    out.push({
      id: "shift",
      tone: "neutral",
      title: `${fmt(pending.fromCurrentMonth)} vendus ce mois-ci tomberont plus tard`,
      detail:
        `${n} écriture${n > 1 ? "s" : ""} conclue${n > 1 ? "s" : ""} en ${month.slice(5)}/${month.slice(0, 4)} ` +
        `n'${n > 1 ? "ont" : "a"} pas encore été encaissée${n > 1 ? "s" : ""}` +
        (pending.medianDelay !== null
          ? `. Ton délai habituel est de ${pending.medianDelay} jour${pending.medianDelay > 1 ? "s" : ""}.`
          : "."),
    });
  }

  // 2. Ce qui doit être confirmé maintenant.
  if (pending.dueNow.length > 0) {
    const n = pending.dueNow.length;
    out.push({
      id: "due-now",
      tone: "neutral",
      title: `${fmt(pending.dueNowAmount)} à confirmer`,
      detail: `${n} encaissement${n > 1 ? "s ont" : " a"} atteint ${n > 1 ? "leur" : "sa"} date prévue. Un clic suffit à tout valider.`,
    });
  }

  // 3. Ce qui va tomber, et quand.
  if (pending.upcomingByMonth.length > 0) {
    const next = pending.upcomingByMonth[0];
    out.push({
      id: "upcoming",
      tone: "good",
      title: `${fmt(next.amount)} attendus en ${monthNameOf(next.month)}`,
      detail: `${next.entries.length} encaissement${next.entries.length > 1 ? "s" : ""} déjà vendu${next.entries.length > 1 ? "s" : ""}, versement prévu le mois prochain.`,
    });
  }

  // 4. Encaissements qui n'arrivent pas.
  if (pending.overdue.length > 0) {
    out.push({
      id: "overdue",
      tone: pending.overdueAmount > 20_000 ? "critical" : "warning",
      title: `${fmt(pending.overdueAmount)} en retard sur la date prévue`,
      detail: `${pending.overdue.length} écriture${pending.overdue.length > 1 ? "s" : ""} dépasse${pending.overdue.length > 1 ? "nt" : ""} de plus de 14 jours la date attendue. À relancer.`,
    });
  }

  // 5. Le réglage de délai qui ne colle plus à la réalité.
  for (const c of input.delays) {
    out.push({
      id: `delay-${c.stream.id}`,
      tone: "neutral",
      title: `${c.stream.name} : encaissé en ${c.observed} j, pas ${c.configured} j`,
      detail: `Mesuré sur ${c.sample} encaissements. Ajuste le délai dans les réglages pour des prévisions justes.`,
    });
  }

  // 6. Variation par rapport au mois précédent.
  if (overview.previous.count > 0 && cur.count > 0) {
    const d = overview.vsPrevious;
    out.push({
      id: "mom",
      tone: d.absolute >= 0 ? "good" : "warning",
      title:
        d.ratio !== null
          ? `${d.absolute >= 0 ? "En hausse" : "En baisse"} de ${pct(Math.abs(d.ratio))} sur un mois`
          : `${d.absolute >= 0 ? "+" : "−"}${fmt(Math.abs(d.absolute))} sur un mois`,
      detail: `${fmt(cur.net)} ce mois-ci contre ${fmt(overview.previous.net)} le mois dernier.`,
    });
  }

  // 7. L'activité qui porte le mois.
  const ranked = Object.entries(cur.byStream)
    .map(([id, t]) => ({ stream: streams.find((s) => s.id === id), t }))
    .filter((r) => r.stream && r.t.net > 0)
    .sort((a, b) => b.t.net - a.t.net);

  if (ranked.length > 0 && cur.net > 0) {
    const top = ranked[0];
    const share = top.t.net / cur.net;
    out.push({
      id: "top-stream",
      tone: share > 0.75 && ranked.length > 1 ? "warning" : "neutral",
      title: `${top.stream!.name} pèse ${pct(share)} du mois`,
      detail:
        share > 0.75 && ranked.length > 1
          ? `${fmt(top.t.net)} sur ${fmt(cur.net)}. Tes revenus reposent sur une seule activité.`
          : `${fmt(top.t.net)} sur ${fmt(cur.net)} au total.`,
    });
  }

  // 8. Objectif du mois.
  if (goal) {
    out.push({
      id: "goal",
      tone: goal.reached ? "good" : goal.ratio > 0.6 ? "neutral" : "warning",
      title: goal.reached
        ? `Objectif du mois atteint`
        : `${pct(goal.ratio)} de l'objectif`,
      detail: goal.reached
        ? `${fmt(goal.actual)} pour un objectif de ${fmt(goal.target)}.`
        : goal.perDayNeeded !== null
          ? `Il reste ${fmt(goal.remaining)} à faire en ${goal.daysLeft} jour${goal.daysLeft > 1 ? "s" : ""}, soit ${fmt(goal.perDayNeeded)} par jour.`
          : `Il manquait ${fmt(goal.remaining)}.`,
    });
  }

  // 9. Record.
  if (overview.rank && overview.rank.position === 1 && cur.count > 0 && overview.rank.outOf > 2) {
    out.push({
      id: "record",
      tone: "good",
      title: "Meilleur mois enregistré",
      detail: `${fmt(cur.net)}, devant tous les ${overview.rank.outOf} mois suivis.`,
    });
  }

  // 10. Position par rapport à la moyenne.
  if (overview.average12 > 0 && cur.count > 0) {
    const d = delta(cur.net, overview.average12);
    if (d.ratio !== null && Math.abs(d.ratio) > 0.15) {
      out.push({
        id: "vs-avg",
        tone: d.absolute > 0 ? "good" : "neutral",
        title: `${pct(Math.abs(d.ratio))} ${d.absolute > 0 ? "au-dessus" : "en dessous"} de ta moyenne`,
        // Le nombre de mois est dit : « moyenne des 12 derniers mois »
        // sur sept mois renseignés était faux, et le chiffre de tête
        // annonce déjà la bonne période.
        detail: `Moyenne de ${overview.averageMonths} mois renseigné${
          overview.averageMonths > 1 ? "s" : ""
        } : ${fmt(overview.average12)}.`,
      });
    }
  }

  // 11. Ce que la base de calcul change, chiffré.
  if (basis === "cash" && pending.total > 0) {
    out.push({
      id: "basis",
      tone: "neutral",
      title: `${fmt(pending.total)} déjà gagnés mais pas encore sur le compte`,
      detail:
        "En base « comptabilisé », cette somme apparaîtrait au mois de la vente. " +
        "En base « encaissé », elle n'apparaîtra qu'au versement.",
    });
  }

  return out;
}

/* ===================================================================
   Divers
   =================================================================== */

function monthNameOf(month: MonthKey) {
  return MONTHS[Number(month.slice(5, 7)) - 1];
}

const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

export function streamColor(slot: number) {
  return `var(--series-${((slot - 1) % 8) + 1})`;
}

export function sortStreams(streams: Stream[]) {
  return [...streams].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

/** Les mois couverts par les données, plus le mois courant. */
export function coveredMonths(entries: Entry[]): MonthKey[] {
  const set = new Set<MonthKey>([currentMonth()]);
  for (const e of entries) {
    set.add(monthOf(e.occurred_on));
    if (e.received_on) set.add(monthOf(e.received_on));
  }
  return [...set].sort();
}
