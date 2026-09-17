/**
 * Moteur fiscal et social — micro-entreprise française.
 *
 * ────────────────────────────────────────────────────────────────────
 * AVERTISSEMENT SUR L'ORIGINE DES CHIFFRES
 *
 * Les taux ci-dessous ont été vérifiés par recoupement de sources
 * officielles en septembre 2026, mais la plupart sont revalorisés chaque
 * année. Ils sont donc TOUS surchargeables depuis les réglages : aucun
 * chiffre n'est figé dans le code sans possibilité de correction.
 *
 * Cette application est un outil de suivi. Elle ne remplace ni l'avis
 * d'un expert-comptable, ni les montants que l'URSSAF appelle réellement.
 * ────────────────────────────────────────────────────────────────────
 */

import type { Entry, Stream } from "./types";
import { type DayKey, type MonthKey, monthOf } from "./dates";

/* ===================================================================
   Catégories
   =================================================================== */

export type FiscalCategory =
  | "bic_vente"
  | "bic_service"
  | "bnc"
  | "bnc_cipav"
  | "remplacement"
  | "hors";

export type CategorySpec = {
  key: FiscalCategory;
  label: string;
  short: string;
  /** Taux global du régime micro-social, en points de base (1230 = 12,30 %). */
  cotisationBps: number;
  /** Contribution à la formation professionnelle. JAMAIS réduite par l'ACRE. */
  cfpBps: number;
  /** Abattement forfaitaire pour le calcul du revenu imposable. */
  abattementBps: number;
  /** Plancher légal de l'abattement, en centimes. */
  abattementFloorCents: number;
  /** Taux du versement libératoire, si l'option est prise. */
  liberatoireBps: number;
  /** Plafond de chiffre d'affaires du régime micro, en centimes. */
  ceilingCents: number | null;
  /** Seuil de franchise en base de TVA, en centimes. */
  vatThresholdCents: number | null;
  /** Soumis aux cotisations du régime micro-social ? */
  cotise: boolean;
  /** Entre dans le revenu imposable ? */
  imposable: boolean;
  note: string;
};

/**
 * Valeurs 2026. Sources recoupées : urssaf.fr, entreprendre.service-public.fr,
 * BOFiP. Le taux BNC du régime général est passé à 25,6 % au 1er janvier
 * 2026 — la valeur de 26,1 %, initialement programmée, circule encore
 * largement et serait fausse.
 */
export const CATEGORIES: Record<FiscalCategory, CategorySpec> = {
  bic_vente: {
    key: "bic_vente",
    label: "Vente de marchandises (BIC)",
    short: "Vente BIC",
    cotisationBps: 1230,
    cfpBps: 10,
    abattementBps: 7100,
    abattementFloorCents: 30_500,
    liberatoireBps: 100,
    ceilingCents: 20_310_000,
    vatThresholdCents: 8_500_000,
    cotise: true,
    imposable: true,
    note: "Achat de biens pour les revendre. L'assiette est le prix de vente encaissé, jamais la marge.",
  },
  bic_service: {
    key: "bic_service",
    label: "Prestations de services commerciales (BIC)",
    short: "Services BIC",
    cotisationBps: 2120,
    cfpBps: 10,
    abattementBps: 5000,
    abattementFloorCents: 30_500,
    liberatoireBps: 170,
    ceilingCents: 8_360_000,
    vatThresholdCents: 3_750_000,
    cotise: true,
    imposable: true,
    note: "Prestations à caractère commercial : revente de solutions, sous-traitance de la réalisation, revente de licences.",
  },
  bnc: {
    key: "bnc",
    label: "Prestations libérales (BNC)",
    short: "BNC",
    cotisationBps: 2560,
    cfpBps: 20,
    abattementBps: 3400,
    abattementFloorCents: 30_500,
    liberatoireBps: 220,
    ceilingCents: 8_360_000,
    vatThresholdCents: 3_750_000,
    cotise: true,
    imposable: true,
    note: "Le travail intellectuel personnel est prépondérant : conception et développement réalisés soi-même, logiciel dont on est l'auteur.",
  },
  bnc_cipav: {
    key: "bnc_cipav",
    label: "Profession libérale réglementée (CIPAV)",
    short: "BNC CIPAV",
    cotisationBps: 2320,
    cfpBps: 20,
    abattementBps: 3400,
    abattementFloorCents: 30_500,
    liberatoireBps: 220,
    ceilingCents: 8_360_000,
    vatThresholdCents: 3_750_000,
    cotise: true,
    imposable: true,
    note: "Professions libérales réglementées affiliées à la CIPAV.",
  },
  remplacement: {
    key: "remplacement",
    label: "Revenu de remplacement (ARE)",
    short: "ARE",
    cotisationBps: 0,
    cfpBps: 0,
    abattementBps: 0,
    abattementFloorCents: 0,
    liberatoireBps: 0,
    ceilingCents: null,
    vatThresholdCents: null,
    cotise: false,
    imposable: true,
    note: "Hors cotisations URSSAF, mais intégralement imposable. Se déclare en case 1AP, jamais avec le chiffre d'affaires.",
  },
  hors: {
    key: "hors",
    label: "Hors comptabilité",
    short: "Hors",
    cotisationBps: 0,
    cfpBps: 0,
    abattementBps: 0,
    abattementFloorCents: 0,
    liberatoireBps: 0,
    ceilingCents: null,
    vatThresholdCents: null,
    cotise: false,
    imposable: false,
    note: "Ignoré par la comptabilité : remboursements, virements internes, ventes d'objets personnels.",
  },
};

export const CATEGORY_ORDER: FiscalCategory[] = [
  "bic_vente",
  "bic_service",
  "bnc",
  "bnc_cipav",
  "remplacement",
  "hors",
];

/* ===================================================================
   ACRE

   La durée n'est PAS « douze mois ». Le taux minoré court jusqu'à la fin
   du troisième trimestre civil SUIVANT celui du début d'activité, soit
   neuf à douze mois selon le moment du démarrage. Calculer « début + 12
   mois » fait sous-provisionner le dernier trimestre.
   =================================================================== */

export type AcreRegime = { coefficient: number; endsOn: DayKey } | null;

function quarterOf(day: DayKey): number {
  return Math.floor((Number(day.slice(5, 7)) - 1) / 3);
}

/** Dernier jour du trimestre civil, `quarters` trimestres après celui de `day`. */
function endOfQuarterAfter(day: DayKey, quarters: number): DayKey {
  const year = Number(day.slice(0, 4));
  const absolute = year * 4 + quarterOf(day) + quarters;
  const endYear = Math.floor(absolute / 4);
  const endQuarter = absolute % 4;
  const month = (endQuarter + 1) * 3;
  const lastDay = new Date(endYear, month, 0).getDate();
  return `${endYear}-${String(month).padStart(2, "0")}-${lastDay}`;
}

/**
 * Le régime ACRE applicable, déduit de la date de début d'activité.
 *
 * Le coefficient dépend de cette date, pas de l'année en cours : une
 * activité démarrée avant le 1er juillet 2026 garde 50 % jusqu'au bout,
 * y compris sur les trimestres de 2027.
 */
export function acreRegime(startedOn: DayKey | null, enabled: boolean): AcreRegime {
  if (!enabled || !startedOn) return null;
  const coefficient = startedOn < "2026-07-01" ? 0.5 : 0.75;
  return { coefficient, endsOn: endOfQuarterAfter(startedOn, 3) };
}

/** Le taux de cotisations réellement dû à une date donnée, en points de base. */
export function cotisationBpsOn(
  category: FiscalCategory,
  day: DayKey,
  acre: AcreRegime,
): number {
  const spec = CATEGORIES[category];
  if (!spec.cotise) return 0;
  if (acre && day <= acre.endsOn) return Math.round(spec.cotisationBps * acre.coefficient);
  return spec.cotisationBps;
}

/* ===================================================================
   Réglages fiscaux
   =================================================================== */

export type TaxBracket = { upToCents: number | null; rateBps: number };

export type FiscalSettings = {
  activityStart: DayKey | null;
  acreEnabled: boolean;
  versementLiberatoire: boolean;
  taxParts: number;
  otherIncomeCents: number;
  brackets: TaxBracket[];
  bracketsYear: string;
};

/**
 * Barème par défaut. Il sert d'estimation et doit être vérifié : les
 * tranches sont revalorisées chaque année, et celui applicable aux
 * revenus 2026 ne sera connu qu'en fin d'année. Entièrement modifiable
 * depuis les réglages.
 */
export const DEFAULT_BRACKETS: TaxBracket[] = [
  { upToCents: 1_149_700, rateBps: 0 },
  { upToCents: 2_931_500, rateBps: 1100 },
  { upToCents: 8_382_300, rateBps: 3000 },
  { upToCents: 18_029_400, rateBps: 4100 },
  { upToCents: null, rateBps: 4500 },
];

export const DEFAULT_BRACKETS_YEAR = "2025 (revenus 2024) — à vérifier";

/* ===================================================================
   Agrégation comptable
   =================================================================== */

export type CategoryTotals = {
  category: FiscalCategory;
  /** Chiffre d'affaires encaissé, montant brut sans aucune déduction. */
  caCents: number;
  /** Part du CA encaissée pendant la période couverte par l'ACRE. */
  caUnderAcreCents: number;
  cotisationsCents: number;
  cfpCents: number;
  liberatoireCents: number;
  abattementCents: number;
  /** CA − abattement : ce qui se reporte sur la déclaration de revenus. */
  baseImposableCents: number;
  entryCount: number;
};

export type FiscalReport = {
  months: MonthKey[];
  byCategory: CategoryTotals[];
  caTotalCents: number;
  cotisationsCents: number;
  cfpCents: number;
  /** Cotisations + CFP : le total réellement dû à l'URSSAF. */
  urssafCents: number;
  liberatoireCents: number;
  /** Base imposable des activités, ARE exclue. */
  baseActivitesCents: number;
  /** ARE encaissée sur la période : imposable, hors cotisations. */
  areCents: number;
  /** Ce qui entre au barème : activités après abattement + ARE. */
  revenuImposableCents: number;
  /** Estimation de l'impôt. null si le versement libératoire est actif. */
  impotCents: number | null;
  /** Ce qu'il reste après URSSAF et impôt. */
  netApresTouteChargeCents: number;
  acre: AcreRegime;
  /** Mois couverts par l'ACRE sur la période, pour l'affichage. */
  acreCoveredMonths: number;
};

function categoryOf(entry: Entry, streams: Map<string, Stream>): FiscalCategory {
  const stream = entry.stream_id ? streams.get(entry.stream_id) : undefined;
  const raw = stream?.fiscal_category;
  return raw && raw in CATEGORIES ? (raw as FiscalCategory) : "hors";
}

/**
 * Le chiffre d'affaires d'une écriture.
 *
 * C'est le montant BRUT encaissé. Ni les frais de plateforme ni le coût
 * d'achat ne s'en déduisent : l'abattement forfaitaire est précisément
 * ce qui tient lieu de prise en compte des charges. Déclarer la marge au
 * lieu du prix de vente est l'erreur la plus coûteuse en achat-revente.
 */
export function caOf(entry: Entry): number {
  return entry.gross_cents;
}

export function buildReport(
  entries: Entry[],
  streamList: Stream[],
  settings: FiscalSettings,
  months: MonthKey[],
): FiscalReport {
  const streams = new Map(streamList.map((s) => [s.id, s]));
  const inWindow = new Set(months);
  const acre = acreRegime(settings.activityStart, settings.acreEnabled);

  const totals = new Map<FiscalCategory, CategoryTotals>();
  const blank = (category: FiscalCategory): CategoryTotals => ({
    category,
    caCents: 0,
    caUnderAcreCents: 0,
    cotisationsCents: 0,
    cfpCents: 0,
    liberatoireCents: 0,
    abattementCents: 0,
    baseImposableCents: 0,
    entryCount: 0,
  });

  for (const entry of entries) {
    // La comptabilité du micro-entrepreneur est tenue sur les
    // ENCAISSEMENTS : une écriture non encaissée n'est pas encore du
    // chiffre d'affaires, et une charge n'entre pas dans l'assiette.
    if (entry.status !== "received" || !entry.received_on) continue;
    if (entry.direction !== "in") continue;
    if (!inWindow.has(monthOf(entry.received_on))) continue;

    const category = categoryOf(entry, streams);
    if (category === "hors") continue;

    const row = totals.get(category) ?? blank(category);
    const ca = caOf(entry);
    row.caCents += ca;
    row.entryCount += 1;

    // On accumule seulement, sans calculer de cotisation ici : le taux
    // s'applique au TOTAL déclaré de la période, pas à chaque ligne.
    // Arrondir écriture par écriture ferait dériver le résultat de
    // plusieurs dizaines de centimes sur une centaine de ventes, et ne
    // correspondrait à aucun appel de l'URSSAF.
    if (acre && entry.received_on <= acre.endsOn) row.caUnderAcreCents += ca;

    totals.set(category, row);
  }

  // Cotisations calculées sur les agrégats. L'ACRE prenant fin à une
  // frontière de trimestre, séparer le CA couvert du CA non couvert suffit
  // à reproduire exactement le découpage de l'URSSAF.
  for (const row of totals.values()) {
    const spec = CATEGORIES[row.category];
    if (!spec.cotise) continue;

    const reduced = acre ? Math.round(spec.cotisationBps * acre.coefficient) : spec.cotisationBps;
    const outsideAcre = row.caCents - row.caUnderAcreCents;

    row.cotisationsCents =
      Math.round((row.caUnderAcreCents * reduced) / 10_000) +
      Math.round((outsideAcre * spec.cotisationBps) / 10_000);

    // La CFP n'est jamais réduite par l'ACRE : elle se calcule au taux
    // plein sur la totalité du chiffre d'affaires.
    row.cfpCents = Math.round((row.caCents * spec.cfpBps) / 10_000);

    if (settings.versementLiberatoire) {
      row.liberatoireCents = Math.round((row.caCents * spec.liberatoireBps) / 10_000);
    }
  }

  // L'abattement se calcule sur le CA total de la catégorie, avec son
  // plancher — pas écriture par écriture, sinon le plancher s'appliquerait
  // autant de fois qu'il y a de lignes.
  for (const row of totals.values()) {
    const spec = CATEGORIES[row.category];
    if (spec.abattementBps > 0) {
      const computed = Math.round((row.caCents * spec.abattementBps) / 10_000);
      row.abattementCents = Math.min(row.caCents, Math.max(computed, spec.abattementFloorCents));
    }
    row.baseImposableCents = Math.max(0, row.caCents - row.abattementCents);
  }

  const rows = CATEGORY_ORDER.map((c) => totals.get(c)).filter(
    (r): r is CategoryTotals => r !== undefined,
  );

  const sum = (pick: (r: CategoryTotals) => number) => rows.reduce((a, r) => a + pick(r), 0);

  const areCents = totals.get("remplacement")?.caCents ?? 0;
  const baseActivitesCents = rows
    .filter((r) => r.category !== "remplacement")
    .reduce((a, r) => a + r.baseImposableCents, 0);

  const cotisationsCents = sum((r) => r.cotisationsCents);
  const cfpCents = sum((r) => r.cfpCents);
  const liberatoireCents = settings.versementLiberatoire ? sum((r) => r.liberatoireCents) : 0;

  // L'ARE est imposable en totalité, sans abattement.
  const revenuImposableCents = baseActivitesCents + areCents + settings.otherIncomeCents;

  const impotCents = settings.versementLiberatoire
    ? null
    : incomeTax(revenuImposableCents, settings);

  const acreCoveredMonths = acre
    ? months.filter((m) => `${m}-01` <= acre.endsOn).length
    : 0;

  return {
    months,
    byCategory: rows,
    caTotalCents: sum((r) => r.caCents),
    cotisationsCents,
    cfpCents,
    urssafCents: cotisationsCents + cfpCents + liberatoireCents,
    liberatoireCents,
    baseActivitesCents,
    areCents,
    revenuImposableCents,
    impotCents,
    netApresTouteChargeCents:
      sum((r) => r.caCents) - cotisationsCents - cfpCents - liberatoireCents - (impotCents ?? 0),
    acre,
    acreCoveredMonths,
  };
}

/* ===================================================================
   Impôt sur le revenu — estimation au barème progressif
   =================================================================== */

/**
 * Barème progressif appliqué au quotient familial.
 *
 * Estimation volontairement simple : elle ignore la décote, le plafond
 * des effets du quotient familial et les réductions d'impôt. Elle donne
 * un ordre de grandeur pour provisionner, pas un montant à payer.
 */
export function incomeTax(revenuImposableCents: number, settings: FiscalSettings): number {
  const parts = Math.max(1, settings.taxParts || 1);
  const brackets = settings.brackets.length > 0 ? settings.brackets : DEFAULT_BRACKETS;
  const perPart = revenuImposableCents / parts;

  let tax = 0;
  let floor = 0;
  for (const bracket of brackets) {
    const ceiling = bracket.upToCents ?? Infinity;
    if (perPart <= floor) break;
    const slice = Math.min(perPart, ceiling) - floor;
    if (slice > 0) tax += (slice * bracket.rateBps) / 10_000;
    floor = ceiling;
    if (!Number.isFinite(ceiling)) break;
  }

  return Math.round(tax * parts);
}

/* ===================================================================
   Alertes de seuils
   =================================================================== */

export type Threshold = {
  category: FiscalCategory;
  kind: "micro" | "tva";
  label: string;
  caCents: number;
  limitCents: number;
  ratio: number;
  tone: "info" | "warning" | "critical";
};

/**
 * Deux plafonds distincts, souvent confondus : celui du régime micro
 * (élevé) et celui de la franchise en base de TVA (bien plus bas). Le
 * second se franchit largement avant le premier.
 */
export function thresholds(report: FiscalReport): Threshold[] {
  const out: Threshold[] = [];

  for (const row of report.byCategory) {
    const spec = CATEGORIES[row.category];
    if (row.caCents <= 0) continue;

    for (const [kind, limit, label] of [
      ["micro", spec.ceilingCents, "Plafond du régime micro"],
      ["tva", spec.vatThresholdCents, "Franchise en base de TVA"],
    ] as const) {
      if (!limit) continue;
      const ratio = row.caCents / limit;
      if (ratio < 0.5) continue;
      out.push({
        category: row.category,
        kind,
        label,
        caCents: row.caCents,
        limitCents: limit,
        ratio,
        tone: ratio >= 1 ? "critical" : ratio >= 0.8 ? "warning" : "info",
      });
    }
  }

  return out.sort((a, b) => b.ratio - a.ratio);
}


/* ===================================================================
   Décomposition mensuelle
   =================================================================== */

export type MonthlyFiscalRow = {
  month: MonthKey;
  byCategory: { category: FiscalCategory; caCents: number; dueCents: number }[];
  caCents: number;
  dueCents: number;
  /** Le mois est-il couvert par l'ACRE ? */
  underAcre: boolean;
};

/**
 * Cotisations dues mois par mois.
 *
 * Chaque mois est agrégé avant d'appliquer le taux, comme pour la
 * période entière : c'est ainsi que l'URSSAF calcule, et cela évite
 * d'accumuler des arrondis ligne à ligne.
 */
export function monthlyBreakdown(
  entries: Entry[],
  streamList: Stream[],
  settings: FiscalSettings,
  months: MonthKey[],
): MonthlyFiscalRow[] {
  const streams = new Map(streamList.map((s) => [s.id, s]));
  const acre = acreRegime(settings.activityStart, settings.acreEnabled);

  const perMonth = new Map<MonthKey, Map<FiscalCategory, number>>();
  for (const m of months) perMonth.set(m, new Map());

  for (const entry of entries) {
    if (entry.status !== "received" || !entry.received_on) continue;
    if (entry.direction !== "in") continue;
    const month = monthOf(entry.received_on);
    const bucket = perMonth.get(month);
    if (!bucket) continue;
    const category = categoryOf(entry, streams);
    if (category === "hors") continue;
    bucket.set(category, (bucket.get(category) ?? 0) + caOf(entry));
  }

  return months.map((month) => {
    const bucket = perMonth.get(month) ?? new Map();
    // Le mois est couvert si son premier jour l'est : l'ACRE se terminant
    // sur une frontière de trimestre, un mois n'est jamais à cheval.
    const underAcre = Boolean(acre && `${month}-01` <= acre.endsOn);

    const byCategory = CATEGORY_ORDER.filter((c) => (bucket.get(c) ?? 0) > 0).map((category) => {
      const spec = CATEGORIES[category];
      const ca = bucket.get(category) ?? 0;
      if (!spec.cotise) return { category, caCents: ca, dueCents: 0 };
      const bps =
        acre && underAcre ? Math.round(spec.cotisationBps * acre.coefficient) : spec.cotisationBps;
      const due =
        Math.round((ca * bps) / 10_000) + Math.round((ca * spec.cfpBps) / 10_000);
      return { category, caCents: ca, dueCents: due };
    });

    return {
      month,
      byCategory,
      caCents: byCategory.reduce((a, r) => a + r.caCents, 0),
      dueCents: byCategory.reduce((a, r) => a + r.dueCents, 0),
      underAcre,
    };
  });
}

/** Couleur d'affichage d'une catégorie, alignée sur la palette validée. */
export const CATEGORY_COLOR: Record<FiscalCategory, string> = {
  bic_vente: "var(--series-1)",
  bic_service: "var(--series-2)",
  bnc: "var(--series-3)",
  bnc_cipav: "var(--series-4)",
  remplacement: "var(--series-5)",
  hors: "var(--axis)",
};
