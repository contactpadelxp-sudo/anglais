export type StreamKind = "resale" | "service" | "subscription" | "benefit" | "other";
export type Direction = "in" | "out";
export type EntryStatus = "pending" | "received" | "cancelled";

/**
 * Base de calcul.
 *  - "cash"    : on compte l'argent le jour où il arrive sur le compte.
 *  - "accrual" : on compte la vente le jour où elle est conclue.
 * Toute la différence entre « j'ai vendu en septembre » et « j'ai été
 * payé en octobre » tient dans ce seul réglage.
 */
export type Basis = "cash" | "accrual";

/**
 * Mode de règlement. Le livre des recettes doit le porter ligne à
 * ligne ; sans lui, l'export n'est pas opposable.
 */
export type PaymentMethod =
  | "virement"
  | "carte"
  | "especes"
  | "cheque"
  | "plateforme"
  | "autre";

/** Périodicité de la déclaration URSSAF. */
export type UrssafPeriod = "monthly" | "quarterly";

export type Stream = {
  id: string;
  user_id: string;
  key: string;
  name: string;
  kind: StreamKind;
  color_slot: number;
  icon: string;
  /** Délai habituel entre la vente et le versement, en jours. */
  settlement_days: number;
  /** Confirmer l'encaissement tout seul à la date prévue. */
  auto_settle: boolean;
  /** Catégorie fiscale et sociale, qui pilote taux et abattement. */
  fiscal_category: string;
  /** La catégorie a-t-elle été confirmée sur les documents officiels ? */
  fiscal_confirmed: boolean;
  position: number;
  archived: boolean;
  created_at: string;
};

export type Entry = {
  id: string;
  user_id: string;
  stream_id: string | null;
  direction: Direction;
  label: string;
  gross_cents: number;
  fee_cents: number;
  cost_cents: number;
  /** Date de la vente / prestation / mois d'allocation. */
  occurred_on: string;
  /** Date d'encaissement prévue, déduite du délai de l'activité. */
  expected_on: string | null;
  /** Date d'encaissement réelle. null tant que l'argent n'est pas arrivé. */
  received_on: string | null;
  status: EntryStatus;
  counterparty: string | null;
  notes: string | null;
  /** Mode de règlement — mention obligatoire du livre des recettes. */
  payment_method: PaymentMethod | null;
  /** Référence de la pièce justificative — mention obligatoire. */
  reference: string | null;
  /** Mise en attente à la main : la confirmation automatique la saute. */
  settle_locked: boolean;
  /** Réservée à la charge utile d'un import (Vinted). */
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type Goal = {
  id: string;
  user_id: string;
  month: string;
  stream_id: string | null;
  target_cents: number;
  created_at: string;
};

export type Settings = {
  user_id: string;
  default_basis: Basis;
  /** Début d'activité — détermine la période couverte par l'ACRE. */
  activity_start: string | null;
  acre_enabled: boolean;
  versement_liberatoire: boolean;
  /** Parts du foyer fiscal. */
  tax_parts: number;
  /** Autres revenus imposables du foyer, en centimes. */
  other_income_cents: number;
  /** Barème de l'impôt, modifiable : les tranches changent chaque année. */
  tax_brackets: { upToCents: number | null; rateBps: number }[] | null;
  tax_brackets_year: string | null;
  /**
   * Abattement de 10 % des revenus de remplacement : taux, minimum et
   * plafond. Stocké plutôt que codé en dur, comme le barème — ces trois
   * valeurs sont revalorisées chaque année.
   */
  salary_abatement: {
    rateBps: number;
    floorCents: number;
    ceilingCents: number;
  } | null;
  /** Décote : seuils, bases et taux, revalorisés chaque année. */
  decote: {
    singleThresholdCents: number;
    coupleThresholdCents: number;
    singleBaseCents: number;
    coupleBaseCents: number;
    rateBps: number;
  } | null;
  /** Périodicité de la déclaration URSSAF : pilote l'échéancier. */
  urssaf_period: UrssafPeriod;
  updated_at: string;
};

/** Une déclaration URSSAF, telle qu'elle a été faite et payée. */
export type Declaration = {
  id: string;
  user_id: string;
  /** Premier jour de la période déclarée. */
  period: string;
  periodicity: UrssafPeriod;
  declared_cents: Record<string, number>;
  called_cents: number | null;
  paid_cents: number | null;
  paid_on: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Snapshot = {
  streams: Stream[];
  entries: Entry[];
  goals: Goal[];
  declarations: Declaration[];
  settings: Settings;
};

/** Champs modifiables depuis le formulaire de saisie. */
export type EntryDraft = {
  id?: string;
  stream_id: string | null;
  direction: Direction;
  label: string;
  gross_cents: number;
  fee_cents: number;
  cost_cents: number;
  occurred_on: string;
  expected_on: string | null;
  received_on: string | null;
  status: EntryStatus;
  counterparty: string | null;
  notes: string | null;
  payment_method: PaymentMethod | null;
  reference: string | null;
  meta?: Record<string, unknown>;
};
