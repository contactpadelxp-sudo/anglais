import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/owner";
import type { Entry, Goal, Settings, Snapshot, Stream } from "@/lib/types";

export type LoadResult =
  | { state: "unconfigured" }
  | { state: "anonymous" }
  | { state: "ready"; snapshot: Snapshot; email: string }
  | { state: "error"; message: string };

const DEFAULT_SETTINGS = (userId: string): Settings => ({
  user_id: userId,
  currency: "EUR",
  default_basis: "cash",
  charge_rate_bps: 0,
  fiscal_year_start: 1,
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

  const [streams, entries, goals, settings] = await Promise.all([
    supabase.from("streams").select("*").order("position"),
    supabase.from("entries").select("*").order("occurred_on", { ascending: false }),
    supabase.from("goals").select("*"),
    supabase.from("settings").select("*").maybeSingle(),
  ]);

  const failure = [streams, entries, goals, settings].find((r) => r.error);
  if (failure?.error) return { state: "error", message: failure.error.message };

  return {
    state: "ready",
    email: user.email ?? "",
    snapshot: {
      streams: (streams.data ?? []) as Stream[],
      entries: (entries.data ?? []) as Entry[],
      goals: (goals.data ?? []) as Goal[],
      settings: (settings.data as Settings | null) ?? DEFAULT_SETTINGS(user.id),
    },
  };
}
