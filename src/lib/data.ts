import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/owner";
import type { Declaration, Entry, Goal, Settings, Snapshot, Stream } from "@/lib/types";

export type LoadResult =
  | { state: "unconfigured" }
  | { state: "anonymous" }
  | { state: "ready"; snapshot: Snapshot; email: string }
  | { state: "error"; message: string };

const DEFAULT_SETTINGS = (userId: string): Settings => ({
  user_id: userId,
  default_basis: "cash",
  activity_start: null,
  acre_enabled: false,
  versement_liberatoire: false,
  tax_parts: 1,
  other_income_cents: 0,
  tax_brackets: null,
  tax_brackets_year: null,
  salary_abatement: null,
  decote: null,
  urssaf_period: "monthly",
  updated_at: new Date().toISOString(),
});

/**
 * Charge tout d'un coup : quelques milliers de lignes au maximum pour
 * un suivi personnel. Le reste des calculs se fait côté client, ce qui
 * rend les filtres et les bascules instantanés — aucun aller-retour
 * réseau pour changer de mois ou de base de calcul.
 */
export async function loadSnapshot(): Promise<LoadResult> {
  const supabase = await createClient();
  if (!supabase) return { state: "unconfigured" };

  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return { state: "anonymous" };
  if (!isOwner(user.email)) return { state: "anonymous" };

  const [streams, entries, goals, declarations, settings] = await Promise.all([
    supabase.from("streams").select("*").order("position"),
    supabase.from("entries").select("*").order("occurred_on", { ascending: false }),
    supabase.from("goals").select("*"),
    supabase.from("declarations").select("*").order("period", { ascending: false }),
    supabase.from("settings").select("*").maybeSingle(),
  ]);

  /*
   * `declarations` est arrivée avec la migration 0003. Une base restée
   * en 0002 la renverrait en erreur, et l'app entière se serait
   * arrêtée sur une page d'erreur pour une table dont un seul bloc a
   * besoin. On la laisse donc échouer en silence : le suivi des
   * déclarations sera vide, tout le reste fonctionnera.
   */
  const failure = [streams, entries, goals, settings].find((r) => r.error);
  if (failure?.error) return { state: "error", message: failure.error.message };

  return {
    state: "ready",
    email: user.email ?? "",
    snapshot: {
      streams: (streams.data ?? []) as Stream[],
      entries: (entries.data ?? []) as Entry[],
      goals: (goals.data ?? []) as Goal[],
      declarations: (declarations.error ? [] : (declarations.data ?? [])) as Declaration[],
      // Une colonne ajoutée par une migration plus récente revient
      // `undefined` sur une base restée en arrière : les valeurs par
      // défaut comblent les trous plutôt que de propager des
      // `undefined` jusque dans les calculs.
      settings: {
        ...DEFAULT_SETTINGS(user.id),
        ...((settings.data ?? {}) as Partial<Settings>),
      } as Settings,
    },
  };
}
