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
  /**
   * Seuil MAJORÉ de TVA. Les deux ne se franchissent pas de la même
   * façon : dépasser le premier rend redevable au 1er janvier suivant,
   * dépasser le second rend redevable dès le jour du dépassement.
   */
  vatMajoreCents: number | null;
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
    vatMajoreCents: 9_350_000,
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
    vatMajoreCents: 4_125_000,
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
    vatMajoreCents: 4_125_000,
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
    vatMajoreCents: 4_125_000,
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
    vatMajoreCents: null,
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
    vatMajoreCents: null,
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
  /**
   * Abattement pour frais professionnels des revenus de remplacement.
   * L'ARE se déclare en 1AP, dans la catégorie des traitements et
   * salaires, et y ouvre droit au même abattement de 10 % — avec un
   * minimum et un plafond, tous deux revalorisés chaque année, donc
   * réglables comme le barème.
   */
  salaryAbatement: { rateBps: number; floorCents: number; ceilingCents: number };
  /**
   * Décote. Ses quatre paramètres sont revalorisés chaque année, comme
   * le barème : ils sont donc stockés et modifiables, jamais figés.
   */
  decote: {
    singleThresholdCents: number;
    coupleThresholdCents: number;
    singleBaseCents: number;
    coupleBaseCents: number;
    rateBps: number;
  };
};

/** Décote — valeurs par défaut, à vérifier chaque année comme le barème. */
export const DEFAULT_DECOTE = {
  singleThresholdCents: 196_400,
  coupleThresholdCents: 324_800,
  singleBaseCents: 88_900,
  coupleBaseCents: 146_400,
  rateBps: 4525,
};

/** Valeurs par défaut de l'abattement de 10 %, à vérifier chaque année. */
export const DEFAULT_SALARY_ABATEMENT = {
  rateBps: 1000,
  floorCents: 49_500,
  ceilingCents: 1_417_100,
};

/**
 * L'abattement réellement appliqué à un revenu de remplacement : 10 %,
 * jamais moins que le minimum, jamais plus que le plafond, et jamais
 * plus que le revenu lui-même.
 *
 * Le minimum est ANNUEL, exactement comme le plancher de 305 € des
 * activités. L'appliquer à une fenêtre d'un mois le ferait jouer douze
 * fois dans l'année et gonflerait l'abattement d'autant : `withFloor`
 * ne vaut donc vrai que sur une année entière.
 */
export function salaryAbatementOn(
  amountCents: number,
  settings: FiscalSettings,
  withFloor = true,
): number {
  if (amountCents <= 0) return 0;
  const a = settings.salaryAbatement ?? DEFAULT_SALARY_ABATEMENT;
  const computed = Math.round((amountCents * a.rateBps) / 10_000);
  const plancher = withFloor ? Math.min(a.floorCents, amountCents) : 0;
  return Math.min(amountCents, Math.max(computed, plancher), a.ceilingCents);
}

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
  /** Tout ce qui est entré sur la période, allocation comprise. */
  caTotalCents: number;
  /**
   * Le chiffre d'affaires au sens de l'URSSAF : les activités qui
   * cotisent, allocation chômage EXCLUE. C'est ce chiffre qu'on reporte
   * sur la déclaration, jamais `caTotalCents`.
   */
  caActivitesCents: number;
  cotisationsCents: number;
  cfpCents: number;
  /** Cotisations + CFP : le total réellement dû à l'URSSAF. */
  urssafCents: number;
  liberatoireCents: number;
  /** Base imposable des activités, ARE exclue. */
  baseActivitesCents: number;
  /** ARE encaissée sur la période : imposable, hors cotisations. */
  areCents: number;
  /** Abattement de 10 % appliqué à l'ARE, plancher et plafond compris. */
  areAbattementCents: number;
  /** Ce qui entre au barème : activités après abattement + ARE nette. */
  revenuImposableCents: number;
  /**
   * Estimation de l'impôt, ou null quand il n'y a rien à estimer.
   * `impotRaison` dit pourquoi : un barème annuel appliqué à un seul
   * mois ne veut rien dire, et sous versement libératoire le chiffre
   * d'affaires est déjà libéré.
   */
  impotCents: number | null;
  impotRaison: "calcule" | "periode-partielle" | "liberatoire-total" | null;
  /**
   * Vrai quand la fenêtre couvre les douze mois d'une même année. Le
   * plancher d'abattement, le barème et la décote sont annuels : hors
   * de ce cas, ils ne s'appliquent pas.
   */
  anneeComplete: boolean;
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

  // Le plancher d'abattement, le barème et la décote sont ANNUELS. La
  // fenêtre ne les mérite que si elle couvre les douze mois d'une même
  // année : sur un seul mois, le plancher s'appliquerait douze fois et
  // le barème annuel n'aurait aucun sens.
  const annee = months.length > 0 ? months[0].slice(0, 4) : "";
  const anneeComplete =
    months.length === 12 && months.every((m) => m.slice(0, 4) === annee);

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
    /*
     * L'allocation chômage a son propre abattement — 10 %, avec un
     * minimum et un plafond — et il est bien appliqué au revenu
     * imposable. Mais sa LIGNE du tableau affichait « — » en face de
     * l'abattement et le montant brut en base imposable : la page
     * contredisait son propre moteur.
     */
    if (row.category === "remplacement") {
      row.abattementCents = salaryAbatementOn(row.caCents, settings, anneeComplete);
      row.baseImposableCents = Math.max(0, row.caCents - row.abattementCents);
      continue;
    }
    if (spec.abattementBps > 0) {
      const computed = Math.round((row.caCents * spec.abattementBps) / 10_000);
      // Le plancher de 305 € est un minimum ANNUEL : l'appliquer à une
      // fenêtre d'un mois le ferait jouer douze fois dans l'année.
      const floor = anneeComplete ? spec.abattementFloorCents : 0;
      row.abattementCents = Math.min(row.caCents, Math.max(computed, floor));
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

  // L'ARE se déclare en 1AP, dans les traitements et salaires : elle y
  // ouvre droit au même abattement de 10 %, avec son minimum et son
  // plafond. L'ignorer surestimait l'impôt. On relit la valeur posée
  // sur la ligne plutôt que de la recalculer : un seul calcul, donc
  // aucun risque que l'écran et le total divergent.
  const areAbattementCents = totals.get("remplacement")?.abattementCents ?? 0;
  const areNetteCents = areCents - areAbattementCents;

  const revenuImposableCents =
    baseActivitesCents + areNetteCents + settings.otherIncomeCents;

  /*
   * Le versement libératoire ne libère QUE le chiffre d'affaires de la
   * micro-entreprise. L'allocation chômage et les autres revenus
   * restent imposés au barème : faire disparaître tout l'impôt dès que
   * l'option est cochée effaçait un impôt réellement dû.
   */
  const assietteBareme = settings.versementLiberatoire
    ? areNetteCents + settings.otherIncomeCents
    : revenuImposableCents;

  let impotCents: number | null;
  let impotRaison: FiscalReport["impotRaison"];
  if (!anneeComplete) {
    impotCents = null;
    impotRaison = "periode-partielle";
  } else if (assietteBareme <= 0) {
    impotCents = settings.versementLiberatoire ? null : 0;
    impotRaison = settings.versementLiberatoire ? "liberatoire-total" : "calcule";
  } else {
    impotCents = incomeTax(assietteBareme, settings);
    impotRaison = "calcule";
  }

  const acreCoveredMonths = acre
    ? months.filter((m) => `${m}-01` <= acre.endsOn).length
    : 0;

  return {
    months,
    byCategory: rows,
    caTotalCents: sum((r) => r.caCents),
    caActivitesCents: rows
      .filter((r) => CATEGORIES[r.category].cotise)
      .reduce((a, r) => a + r.caCents, 0),
    cotisationsCents,
    cfpCents,
    urssafCents: cotisationsCents + cfpCents + liberatoireCents,
    liberatoireCents,
    baseActivitesCents,
    areCents,
    areAbattementCents,
    revenuImposableCents,
    impotCents,
    impotRaison,
    anneeComplete,
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
 * Barème progressif appliqué au quotient familial, décote comprise.
 *
 * La décote n'est pas un détail à ce niveau de revenu : elle efface
 * l'impôt en bas de barème et le réduit encore largement au-dessus. Ne
 * pas la calculer surestimait ce qu'il faut provisionner.
 *
 * Restent ignorés : le plafonnement des effets du quotient familial
 * (sans objet à une part) et les réductions d'impôt. L'estimation sert
 * à provisionner, pas à remplir une déclaration.
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

  const brut = Math.round(tax * parts);

  /*
   * La décote s'applique à l'impôt BRUT du foyer, une fois les parts
   * réappliquées. Elle vaut « seuil − taux × impôt », plafonnée à
   * l'impôt lui-même, et ne joue que sous un certain montant.
   */
  const d = settings.decote ?? DEFAULT_DECOTE;
  const seuil = parts >= 2 ? d.coupleThresholdCents : d.singleThresholdCents;
  const base = parts >= 2 ? d.coupleBaseCents : d.singleBaseCents;
  if (brut <= 0 || brut >= seuil) return brut;

  const decote = Math.min(brut, Math.max(0, base - Math.round((brut * d.rateBps) / 10_000)));
  return brut - decote;
}

/* ===================================================================
   Alertes de seuils
   =================================================================== */

export type Threshold = {
  id: string;
  /** Sur quoi porte le seuil : une catégorie, ou l'ensemble. */
  scope: string;
  kind: "micro" | "tva";
  label: string;
  caCents: number;
  limitCents: number;
  ratio: number;
  /** CA projeté en fin d'année au rythme observé, quand il est connu. */
  projectedCents: number | null;
  tone: "info" | "warning" | "critical";
  /** Ce qui se passe concrètement, une fois le seuil franchi. */
  note: string;
};

/**
 * Les seuils, et leurs trois pièges.
 *
 * 1. Le plafond du régime micro et la franchise en base de TVA sont
 *    deux choses différentes, et la seconde est BIEN plus basse : on la
 *    franchit largement avant l'autre.
 * 2. La TVA a DEUX seuils. Dépasser le premier rend redevable au
 *    1er janvier suivant ; dépasser le second rend redevable dès le
 *    jour du dépassement, au beau milieu de l'année.
 * 3. Avec plusieurs activités, ces seuils s'apprécient aussi GLOBALEMENT.
 *    Vérifier catégorie par catégorie laisse passer le cas où aucune
 *    n'est seule en cause, mais où leur somme l'est.
 *
 * `elapsedMonths` sert à projeter : une alerte qui n'arrive qu'après la
 * bascule arrive trop tard pour changer quoi que ce soit.
 */
export function thresholds(
  report: FiscalReport,
  opts: { elapsedMonths?: number } = {},
): Threshold[] {
  const out: Threshold[] = [];
  const elapsed = opts.elapsedMonths ?? 0;
  const projeter = (ca: number) =>
    elapsed > 0 && elapsed < 12 ? Math.round((ca * 12) / elapsed) : null;

  const push = (
    id: string,
    scope: string,
    kind: Threshold["kind"],
    label: string,
    caCents: number,
    limitCents: number,
    note: string,
  ) => {
    if (caCents <= 0 || limitCents <= 0) return;
    const ratio = caCents / limitCents;
    const projected = projeter(caCents);
    // On montre un seuil quand il est à moitié atteint, ou quand la
    // PROJECTION le franchit — c'est tout l'intérêt de projeter.
    const projeteDepasse = projected !== null && projected >= limitCents;
    if (ratio < 0.5 && !projeteDepasse) return;
    out.push({
      id,
      scope,
      kind,
      label,
      caCents,
      limitCents,
      ratio,
      projectedCents: projected,
      tone: ratio >= 1 ? "critical" : ratio >= 0.8 || projeteDepasse ? "warning" : "info",
      note,
    });
  };

  const TVA_BASE =
    "Au-delà, la TVA devient due au 1er janvier suivant : il faut la facturer, la déclarer et la reverser.";
  const TVA_MAJORE =
    "Au-delà de ce second seuil, la TVA est due dès le jour du dépassement — pas l'année suivante.";
  const MICRO =
    "Au-delà, le régime micro cesse de s'appliquer et l'entreprise bascule au réel, avec une comptabilité complète.";

  /* --- catégorie par catégorie ------------------------------------- */
  for (const row of report.byCategory) {
    const spec = CATEGORIES[row.category];
    if (!spec.cotise || row.caCents <= 0) continue;
    push(`${row.category}-micro`, spec.short, "micro", "Plafond du régime micro", row.caCents, spec.ceilingCents ?? 0, MICRO);
    push(`${row.category}-tva`, spec.short, "tva", "Franchise en base de TVA", row.caCents, spec.vatThresholdCents ?? 0, TVA_BASE);
    // Le seuil majoré ne se montre qu'une fois le premier franchi :
    // avant, il ne dit rien de plus que le seuil de base et double la
    // ligne pour rien.
    if (spec.vatThresholdCents && row.caCents >= spec.vatThresholdCents) {
      push(`${row.category}-tva-maj`, spec.short, "tva", "Seuil majoré de TVA", row.caCents, spec.vatMajoreCents ?? 0, TVA_MAJORE);
    }
  }

  /* --- l'ensemble des activités ------------------------------------ */
  const cotisantes = report.byCategory.filter((r) => CATEGORIES[r.category].cotise);
  if (cotisantes.length > 1) {
    const total = cotisantes.reduce((a, r) => a + r.caCents, 0);
    // Le plafond global est celui de la vente ; à l'intérieur, la part
    // de services garde son propre plafond, déjà vérifié plus haut.
    push(
      "global-micro",
      "Toutes activités",
      "micro",
      "Plafond global du régime micro",
      total,
      CATEGORIES.bic_vente.ceilingCents ?? 0,
      MICRO,
    );
    push(
      "global-tva",
      "Toutes activités",
      "tva",
      "Franchise en base de TVA, tous revenus confondus",
      total,
      CATEGORIES.bic_vente.vatThresholdCents ?? 0,
      TVA_BASE,
    );
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
      // Sous versement libératoire, l'impôt part avec les cotisations
      // dans le même prélèvement : l'omettre ici faisait que la somme
      // des barres ne rejoignait pas la tuile « À payer à l'URSSAF ».
      const due =
        Math.round((ca * bps) / 10_000) +
        Math.round((ca * spec.cfpBps) / 10_000) +
        (settings.versementLiberatoire
          ? Math.round((ca * spec.liberatoireBps) / 10_000)
          : 0);
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

/* ===================================================================
   La déclaration URSSAF

   Ce qu'on tape sur net-entreprises, c'est le chiffre d'affaires
   ENCAISSÉ de la période, une ligne par catégorie. L'app le calculait
   déjà — puis le jetait. Elle le rend maintenant tel qu'il se recopie,
   avec la période exacte et l'échéance.
   =================================================================== */

export type UrssafPeriodKind = "monthly" | "quarterly";

export type DeclarationLine = {
  category: FiscalCategory;
  label: string;
  caCents: number;
  cotisationBps: number;
  dueCents: number;
};

export type DeclarationDraft = {
  /** Premier mois de la période déclarée. */
  start: MonthKey;
  months: MonthKey[];
  lines: DeclarationLine[];
  caCents: number;
  dueCents: number;
  /** Date limite de déclaration, telle qu'elle tombe en pratique. */
  deadline: DayKey;
  /** La période est-elle close ? On ne déclare pas un mois en cours. */
  closed: boolean;
};

/** Les mois d'une période de déclaration, à partir de l'un d'eux. */
export function periodMonths(month: MonthKey, kind: UrssafPeriodKind): MonthKey[] {
  if (kind === "monthly") return [month];
  const year = month.slice(0, 4);
  const m = Number(month.slice(5, 7));
  const first = Math.floor((m - 1) / 3) * 3 + 1;
  return [0, 1, 2].map((i) => `${year}-${String(first + i).padStart(2, "0")}`);
}

/**
 * L'échéance : le dernier jour du mois qui suit la période pour une
 * déclaration mensuelle, du mois qui suit le trimestre pour une
 * trimestrielle. C'est la règle pratique ; la date exacte figure sur
 * le compte URSSAF, et l'app ne prétend pas s'y substituer.
 */
function deadlineOf(months: MonthKey[]): DayKey {
  const last = months[months.length - 1];
  const y = Number(last.slice(0, 4));
  const m = Number(last.slice(5, 7));
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const lastDay = new Date(ny, nm, 0).getDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${lastDay}`;
}

export function declarationDraft(
  entries: Entry[],
  streamList: Stream[],
  settings: FiscalSettings,
  month: MonthKey,
  kind: UrssafPeriodKind,
  ref: MonthKey,
): DeclarationDraft {
  const months = periodMonths(month, kind);
  const report = buildReport(entries, streamList, settings, months);
  const acre = report.acre;

  const lines: DeclarationLine[] = report.byCategory
    .filter((row) => CATEGORIES[row.category].cotise && row.caCents > 0)
    .map((row) => {
      const spec = CATEGORIES[row.category];
      // Le taux affiché est celui qui s'applique au dernier jour de la
      // période : c'est lui qu'on lira sur l'appel de cotisations.
      const day: DayKey = `${months[months.length - 1]}-28`;
      const bps = cotisationBpsOn(row.category, day, acre) + spec.cfpBps;
      return {
        category: row.category,
        label: spec.label,
        caCents: row.caCents,
        cotisationBps: bps,
        dueCents: row.cotisationsCents + row.cfpCents + row.liberatoireCents,
      };
    });

  const last = months[months.length - 1];
  return {
    start: months[0],
    months,
    lines,
    caCents: report.caActivitesCents,
    dueCents: report.urssafCents,
    deadline: deadlineOf(months),
    closed: last < ref,
  };
}

/**
 * Ce qu'il faut mettre de côté sur un encaissement, au moment où il
 * arrive : le taux de cotisations réellement dû par sa catégorie ce
 * jour-là, CFP comprise. C'est la seule question qui se pose au
 * moment de la saisie.
 */
export function provisionOn(
  category: FiscalCategory,
  day: DayKey,
  grossCents: number,
  settings: FiscalSettings,
): { bps: number; cents: number } {
  const spec = CATEGORIES[category];
  if (!spec.cotise || grossCents <= 0) return { bps: 0, cents: 0 };
  const acre = acreRegime(settings.activityStart, settings.acreEnabled);
  const bps =
    cotisationBpsOn(category, day, acre) +
    spec.cfpBps +
    (settings.versementLiberatoire ? spec.liberatoireBps : 0);
  return { bps, cents: Math.round((grossCents * bps) / 10_000) };
}

/* ===================================================================
   La déclaration de revenus

   L'erreur qui coûte cher : reporter la base APRÈS abattement. Le
   formulaire attend le chiffre d'affaires BRUT — l'administration
   applique l'abattement elle-même. Saisir la base revient à
   l'appliquer deux fois, et l'écart se solde par un redressement.

   Les numéros de case sont stables depuis des années, mais ils se
   vérifient sur le formulaire de l'année : l'app les affiche comme un
   repère, pas comme une autorité.
   =================================================================== */

export type TaxBox = {
  /** Numéro de case, tel qu'il figure sur le formulaire. */
  code: string;
  form: "2042-C-PRO" | "2042";
  label: string;
  /** Le montant à reporter : brut, jamais après abattement. */
  cents: number;
  hint: string;
};

/** La case du micro-entrepreneur, selon la catégorie et l'option fiscale. */
function boxOf(category: FiscalCategory, liberatoire: boolean): { code: string; hint: string } | null {
  switch (category) {
    case "bic_vente":
      return liberatoire
        ? { code: "5TA", hint: "Versement libératoire — ventes de marchandises" }
        : { code: "5KO", hint: "Micro-BIC — ventes de marchandises" };
    case "bic_service":
      return liberatoire
        ? { code: "5TB", hint: "Versement libératoire — prestations de services" }
        : { code: "5KP", hint: "Micro-BIC — prestations de services" };
    case "bnc":
    case "bnc_cipav":
      return liberatoire
        ? { code: "5TE", hint: "Versement libératoire — revenus non commerciaux" }
        : { code: "5HQ", hint: "Micro-BNC — régime déclaratif spécial" };
    default:
      return null;
  }
}

/**
 * Les cases à remplir, montant brut compris, pour une année entière.
 *
 * Les deux catégories BNC partagent la même case : elles sont donc
 * ADDITIONNÉES, et non affichées deux fois — recopier deux lignes dans
 * une seule case est l'autre façon de se tromper.
 */
export function taxReturnBoxes(report: FiscalReport, settings: FiscalSettings): TaxBox[] {
  const liberatoire = settings.versementLiberatoire;
  const byCode = new Map<string, TaxBox>();

  for (const row of report.byCategory) {
    if (!CATEGORIES[row.category].cotise || row.caCents <= 0) continue;
    const box = boxOf(row.category, liberatoire);
    if (!box) continue;
    const existing = byCode.get(box.code);
    if (existing) {
      existing.cents += row.caCents;
      continue;
    }
    byCode.set(box.code, {
      code: box.code,
      form: "2042-C-PRO",
      label: CATEGORIES[row.category].short,
      cents: row.caCents,
      hint: box.hint,
    });
  }

  const out = [...byCode.values()];

  if (report.areCents > 0) {
    out.push({
      code: "1AP",
      form: "2042",
      label: "Allocation chômage",
      cents: report.areCents,
      hint: "Revenus de remplacement — préremplie par France Travail",
    });
  }

  return out;
}

/* ===================================================================
   Ce que coûte la fin de l'ACRE

   « Tes cotisations doubleront » n'est vrai qu'au coefficient 0,5, et
   ne dit rien du montant. Un euro se comprend ; un multiplicateur se
   discute. On prend donc le dernier mois représentatif et on le
   rejoue au taux plein.
   =================================================================== */

export type AcreStep = {
  month: MonthKey;
  caCents: number;
  /** Ce que ce mois a réellement coûté, ACRE comprise. */
  actuelCents: number;
  /** Ce que le même mois coûterait au taux plein. */
  pleinCents: number;
  ecartCents: number;
};

/**
 * Le mois de référence est le dernier de la période qui porte du
 * chiffre d'affaires ET qui est couvert par l'ACRE : rejouer un mois
 * vide ne montrerait rien, et rejouer un mois déjà au taux plein
 * donnerait un écart nul.
 */
export function acreStep(
  rows: MonthlyFiscalRow[],
  settings: FiscalSettings,
): AcreStep | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (!row.underAcre || row.caCents <= 0) continue;

    const plein = row.byCategory.reduce((total, c) => {
      const spec = CATEGORIES[c.category];
      if (!spec.cotise) return total;
      return (
        total +
        Math.round((c.caCents * spec.cotisationBps) / 10_000) +
        Math.round((c.caCents * spec.cfpBps) / 10_000) +
        (settings.versementLiberatoire
          ? Math.round((c.caCents * spec.liberatoireBps) / 10_000)
          : 0)
      );
    }, 0);

    return {
      month: row.month,
      caCents: row.caCents,
      actuelCents: row.dueCents,
      pleinCents: plein,
      ecartCents: plein - row.dueCents,
    };
  }
  return null;
}

/* ===================================================================
   La CFE

   Elle n'apparaît ni dans les cotisations URSSAF ni dans l'impôt sur
   le revenu, et tombe pourtant tous les 15 décembre. L'exonération de
   première année la rend invisible exactement le temps qu'il faut
   pour l'oublier.

   Son MONTANT dépend de la commune et de la base minimum qui y est
   votée : l'app ne peut pas le calculer, et ne prétend pas le faire.
   Elle dit la date, la règle, et l'ordre de grandeur.
   =================================================================== */

export type CfeStatus = {
  /** Année civile concernée. */
  year: number;
  /** Exonéré cette année-là ? */
  exonere: boolean;
  raison: "premiere-annee" | "ca-faible" | null;
  /** Première année où elle sera réellement due. */
  premiereAnneeDue: number;
  /** Échéance de paiement : le 15 décembre. */
  echeance: DayKey;
};

/** Seuil d'exonération : en dessous, aucune CFE n'est due. */
export const CFE_SEUIL_CENTS = 500_000;

export function cfeStatus(
  activityStart: DayKey | null,
  year: number,
  caAnnuelCents: number,
): CfeStatus | null {
  if (!activityStart) return null;
  const anneeCreation = Number(activityStart.slice(0, 4));
  if (year < anneeCreation) return null;

  const premiereAnnee = year === anneeCreation;
  const caFaible = caAnnuelCents > 0 && caAnnuelCents <= CFE_SEUIL_CENTS;

  return {
    year,
    exonere: premiereAnnee || caFaible,
    raison: premiereAnnee ? "premiere-annee" : caFaible ? "ca-faible" : null,
    premiereAnneeDue: anneeCreation + 1,
    echeance: `${year}-12-15`,
  };
}

/* ===================================================================
   Barème contre versement libératoire

   L'option se choisit une fois par an, avant le 30 septembre pour
   l'année suivante, et l'app affichait les deux régimes sans jamais
   les comparer. Or la réponse est un simple écart en euros.
   =================================================================== */

export type LiberatoireComparison = {
  /** Impôt total dû si le chiffre d'affaires passe au barème. */
  baremeCents: number;
  /** Impôt total dû sous versement libératoire, ARE comprise. */
  liberatoireCents: number;
  /** Positif : le versement libératoire coûte plus cher. */
  ecartCents: number;
  /** Le régime le moins cher, à situation égale. */
  meilleur: "bareme" | "liberatoire" | "egal";
};

/**
 * Les deux options chiffrées sur la même année.
 *
 * Dans les deux cas l'allocation chômage et les autres revenus restent
 * au barème : le versement libératoire ne libère que le chiffre
 * d'affaires. C'est ce que l'ancienne version oubliait, et c'est ce qui
 * rend la comparaison honnête.
 */
export function liberatoireComparison(
  report: FiscalReport,
  settings: FiscalSettings,
): LiberatoireComparison | null {
  if (!report.anneeComplete) return null;

  const areNette = report.areCents - report.areAbattementCents;
  const autres = areNette + settings.otherIncomeCents;

  const bareme = incomeTax(report.baseActivitesCents + autres, settings);

  const forfait = report.byCategory.reduce((total, row) => {
    const spec = CATEGORIES[row.category];
    if (!spec.cotise) return total;
    return total + Math.round((row.caCents * spec.liberatoireBps) / 10_000);
  }, 0);
  const liberatoire = forfait + incomeTax(autres, settings);

  const ecart = liberatoire - bareme;
  return {
    baremeCents: bareme,
    liberatoireCents: liberatoire,
    ecartCents: ecart,
    meilleur: ecart === 0 ? "egal" : ecart > 0 ? "bareme" : "liberatoire",
  };
}

/**
 * Ce qui a été encaissé mais rangé hors comptabilité : remboursements,
 * virements internes, ventes d'objets personnels. Le total n'était
 * réconcilié nulle part, si bien qu'une activité mal classée sortait
 * des calculs sans laisser de trace.
 */
export function horsComptabilite(
  entries: Entry[],
  streamList: Stream[],
  months: MonthKey[],
): { cents: number; count: number } {
  const streams = new Map(streamList.map((s) => [s.id, s]));
  const inWindow = new Set(months);
  let cents = 0;
  let count = 0;
  for (const entry of entries) {
    if (entry.status !== "received" || !entry.received_on) continue;
    if (entry.direction !== "in") continue;
    if (!inWindow.has(monthOf(entry.received_on))) continue;
    if (categoryOf(entry, streams) !== "hors") continue;
    cents += caOf(entry);
    count += 1;
  }
  return { cents, count };
}
