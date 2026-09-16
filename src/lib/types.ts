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
  quantity: number;
  counterparty: string | null;
  notes: string | null;
  tags: string[];
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
  currency: string;
  default_basis: Basis;
  charge_rate_bps: number;
  fiscal_year_start: number;
  updated_at: string;
};

export type Snapshot = {
  streams: Stream[];
  entries: Entry[];
  goals: Goal[];
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
  quantity: number;
  counterparty: string | null;
  notes: string | null;
  meta?: Record<string, unknown>;
};
