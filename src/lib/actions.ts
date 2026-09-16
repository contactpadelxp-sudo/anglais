"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isOwner, ownerEmail } from "@/lib/owner";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Entry, EntryDraft, Goal, Settings, Stream } from "@/lib/types";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

type Session =
  | { ok: false; error: string }
  | { ok: true; supabase: SupabaseClient; userId: string };

/** Toute écriture passe par ici : session valide + propriétaire légitime. */
async function authed(): Promise<Session> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Supabase n'est pas configuré." };
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { ok: false, error: "Session expirée. Reconnecte-toi." };
  if (!isOwner(user.email)) return { ok: false, error: "Compte non autorisé." };
  return { ok: true, supabase, userId: user.id };
}

/* ===================================================================
   Connexion
   =================================================================== */

export async function requestMagicLink(
  _prev: unknown,
  formData: FormData,
): Promise<{ status: "idle" | "sent" | "error"; message?: string; email?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { status: "error", message: "Renseigne ton adresse email." };

  const owner = ownerEmail();
  // Le filtre est ici, avant tout appel à Supabase : aucune autre
  // adresse ne peut même déclencher l'envoi d'un lien.
  if (owner && email !== owner) {
    return { status: "error", message: "Cette adresse n'a pas accès à l'application." };
  }

  const supabase = await createClient();
  if (!supabase) return { status: "error", message: "Supabase n'est pas configuré." };

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: site ? `${site}/auth/callback` : undefined,
    },
  });

  if (error) return { status: "error", message: error.message };
  return { status: "sent", email };
}

export async function verifyCode(
  _prev: unknown,
  formData: FormData,
): Promise<{ status: "idle" | "error"; message?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!token) return { status: "error", message: "Saisis le code reçu par email." };

  const owner = ownerEmail();
  if (owner && email !== owner) {
    return { status: "error", message: "Cette adresse n'a pas accès à l'application." };
  }

  const supabase = await createClient();
  if (!supabase) return { status: "error", message: "Supabase n'est pas configuré." };

  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { status: "error", message: "Code invalide ou expiré." };

  revalidatePath("/", "layout");
  return { status: "idle" };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase?.auth.signOut();
  revalidatePath("/", "layout");
}

/* ===================================================================
   Écritures
   =================================================================== */

export async function saveEntry(draft: EntryDraft): Promise<ActionResult<Entry>> {
  const session = await authed();
  if (!session.ok) return fail(session.error);
  const { supabase, userId } = session;

  const payload = {
    user_id: userId,
    stream_id: draft.stream_id,
    direction: draft.direction,
    label: draft.label,
    gross_cents: Math.round(draft.gross_cents),
    fee_cents: Math.round(draft.fee_cents),
    cost_cents: Math.round(draft.cost_cents),
    occurred_on: draft.occurred_on,
    expected_on: draft.expected_on,
    // La contrainte en base refuse un état « encaissé » sans date, et
    // une date sans l'état. On aligne les deux ici.
    received_on: draft.status === "received" ? draft.received_on : null,
    status: draft.status,
    quantity: draft.quantity,
    counterparty: draft.counterparty,
    notes: draft.notes,
    meta: draft.meta ?? {},
  };

  const query = draft.id
    ? supabase.from("entries").update(payload).eq("id", draft.id).select().single()
    : supabase.from("entries").insert(payload).select().single();

  const { data, error } = await query;
  if (error) return fail(error.message);
  return { ok: true, data: data as Entry };
}

export async function deleteEntry(id: string): Promise<ActionResult<string>> {
  const session = await authed();
  if (!session.ok) return fail(session.error);
  const { error } = await session.supabase.from("entries").delete().eq("id", id);
  if (error) return fail(error.message);
  return { ok: true, data: id };
}

/** Marque un lot d'écritures comme encaissées le même jour. */
export async function settleEntries(
  ids: string[],
  on: string,
): Promise<ActionResult<Entry[]>> {
  const session = await authed();
  if (!session.ok) return fail(session.error);
  if (ids.length === 0) return { ok: true, data: [] };

  const { data, error } = await session.supabase
    .from("entries")
    .update({ status: "received", received_on: on })
    .in("id", ids)
    .select();

  if (error) return fail(error.message);
  return { ok: true, data: (data ?? []) as Entry[] };
}

/** Confirme chaque écriture à sa propre date prévue, en une requête par date. */
export async function settleEntriesOnOwnDates(
  pairs: { id: string; on: string }[],
): Promise<ActionResult<Entry[]>> {
  const session = await authed();
  if (!session.ok) return fail(session.error);
  if (pairs.length === 0) return { ok: true, data: [] };

  const byDate = new Map<string, string[]>();
  for (const { id, on } of pairs) {
    byDate.set(on, [...(byDate.get(on) ?? []), id]);
  }

  const results = await Promise.all(
    [...byDate.entries()].map(([on, ids]) =>
      session.supabase
        .from("entries")
        .update({ status: "received", received_on: on })
        .in("id", ids)
        .select(),
    ),
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) return fail(failed.error.message);
  return { ok: true, data: results.flatMap((r) => (r.data ?? []) as Entry[]) };
}

export async function unsettleEntries(ids: string[]): Promise<ActionResult<Entry[]>> {
  const session = await authed();
  if (!session.ok) return fail(session.error);
  if (ids.length === 0) return { ok: true, data: [] };

  const { data, error } = await session.supabase
    .from("entries")
    .update({ status: "pending", received_on: null })
    .in("id", ids)
    .select();

  if (error) return fail(error.message);
  return { ok: true, data: (data ?? []) as Entry[] };
}

/* ===================================================================
   Objectifs, activités, préférences
   =================================================================== */

export async function saveGoal(
  month: string,
  streamId: string | null,
  targetCents: number,
): Promise<ActionResult<Goal | null>> {
  const session = await authed();
  if (!session.ok) return fail(session.error);
  const { supabase, userId } = session;
  const day = `${month}-01`;

  if (targetCents <= 0) {
    let q = supabase.from("goals").delete().eq("user_id", userId).eq("month", day);
    q = streamId ? q.eq("stream_id", streamId) : q.is("stream_id", null);
    const { error } = await q;
    if (error) return fail(error.message);
    return { ok: true, data: null };
  }

  let existing = supabase.from("goals").select("id").eq("user_id", userId).eq("month", day);
  existing = streamId ? existing.eq("stream_id", streamId) : existing.is("stream_id", null);
  const { data: found } = await existing.maybeSingle();

  const payload = {
    user_id: userId,
    month: day,
    stream_id: streamId,
    target_cents: Math.round(targetCents),
  };

  const { data, error } = found
    ? await supabase.from("goals").update(payload).eq("id", found.id).select().single()
    : await supabase.from("goals").insert(payload).select().single();

  if (error) return fail(error.message);
  return { ok: true, data: data as Goal };
}

export async function saveStream(
  id: string,
  patch: Partial<Pick<Stream, "name" | "color_slot" | "settlement_days" | "auto_settle" | "archived" | "position" | "kind">>,
): Promise<ActionResult<Stream>> {
  const session = await authed();
  if (!session.ok) return fail(session.error);
  const { data, error } = await session.supabase
    .from("streams")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) return fail(error.message);
  return { ok: true, data: data as Stream };
}

export async function createStream(
  name: string,
  kind: Stream["kind"],
  colorSlot: number,
  settlementDays: number,
): Promise<ActionResult<Stream>> {
  const session = await authed();
  if (!session.ok) return fail(session.error);
  const { supabase, userId } = session;

  const key = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || `activite-${Date.now()}`;

  const { count } = await supabase
    .from("streams")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  const { data, error } = await supabase
    .from("streams")
    .insert({
      user_id: userId,
      key,
      name,
      kind,
      color_slot: colorSlot,
      settlement_days: settlementDays,
      auto_settle: settlementDays === 0,
      position: count ?? 0,
    })
    .select()
    .single();

  if (error) return fail(error.message);
  return { ok: true, data: data as Stream };
}

export async function deleteStream(id: string): Promise<ActionResult<string>> {
  const session = await authed();
  if (!session.ok) return fail(session.error);
  const { error } = await session.supabase.from("streams").delete().eq("id", id);
  if (error) return fail(error.message);
  return { ok: true, data: id };
}

export async function saveSettings(
  patch: Partial<Pick<Settings, "default_basis" | "charge_rate_bps" | "currency">>,
): Promise<ActionResult<Settings>> {
  const session = await authed();
  if (!session.ok) return fail(session.error);
  const { supabase, userId } = session;

  const { data, error } = await supabase
    .from("settings")
    .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" })
    .select()
    .single();

  if (error) return fail(error.message);
  return { ok: true, data: data as Settings };
}
