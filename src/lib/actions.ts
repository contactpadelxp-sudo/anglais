"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isOwner, ownerEmail } from "@/lib/owner";
import { projectRef, siteUrl } from "@/lib/supabase/config";
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

/**
 * Traduit les erreurs d'authentification Supabase.
 *
 * Le message brut est en anglais et décrit le symptôme sans jamais dire
 * quoi faire. « Invalid API key » en particulier ne distingue pas une
 * clé tronquée d'une clé appartenant à un autre projet — alors que
 * c'est presque toujours le second cas.
 */
function explain(raw: string): string {
  const message = raw.toLowerCase();

  if (
    message.includes("api key") ||
    message.includes("invalid key") ||
    message.includes("apikey")
  ) {
    const ref = projectRef();
    return (
      "La clé SUPABASE_ANON_KEY n'est pas reconnue par le projet Supabase" +
      (ref ? ` « ${ref} »` : "") +
      ". Le plus souvent, elle appartient à un autre projet que celui indiqué par " +
      "SUPABASE_URL : reprends les deux valeurs dans le même projet, onglet API."
    );
  }
  if (message.includes("rate limit") || message.includes("too many")) {
    return (
      "Trop de codes demandés d'affilée. Supabase limite les envois d'email " +
      "à quelques-uns par heure sur le plan gratuit : attends un moment avant de réessayer."
    );
  }
  if (message.includes("signups not allowed") || message.includes("signup is disabled")) {
    return (
      "Les inscriptions sont désactivées sur ce projet Supabase. Active-les le temps " +
      "de créer ton compte (Authentication → Sign In / Providers), l'accès reste de " +
      "toute façon verrouillé sur ton adresse."
    );
  }
  if (
    message.includes("failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("enotfound") ||
    message.includes("econnrefused")
  ) {
    return "Le projet Supabase est injoignable. Vérifie SUPABASE_URL, et qu'il n'est pas en pause.";
  }
  // Une réponse qui n'est pas du JSON ne vient pas de Supabase : c'est
  // un intermédiaire — proxy, passerelle, page d'erreur d'hébergeur —
  // qui a répondu à sa place, ou une URL qui ne pointe pas vers un
  // projet Supabase.
  if (message.includes("is not valid json") || message.includes("unexpected token")) {
    const ref = projectRef();
    return (
      "La réponse reçue ne vient pas de Supabase" +
      (ref ? ` — SUPABASE_URL pointe vers « ${ref} »` : "") +
      ". Vérifie que cette adresse est bien celle d'un projet Supabase actif, et qu'aucun " +
      "filtrage réseau ne s'interpose."
    );
  }
  if (message.includes("invalid") && message.includes("email")) {
    return "Cette adresse email n'est pas acceptée par Supabase.";
  }
  // Message inconnu : on le laisse passer plutôt que de le masquer
  // derrière un « une erreur est survenue » qui n'aide personne.
  return `Supabase a refusé la demande : ${raw}`;
}

/* ===================================================================
   Connexion par mot de passe

   C'est le chemin principal : aucun email à attendre, aucun quota
   d'envoi, aucune contrainte de navigateur. Le lien par email reste
   disponible en secours, pour le jour où le mot de passe est oublié.
   =================================================================== */

export type PasswordState = { status: "idle" | "error"; message?: string };

export async function signInWithPassword(
  _prev: unknown,
  formData: FormData,
): Promise<PasswordState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email) return { status: "error", message: "Renseigne ton adresse email." };
  if (!password) return { status: "error", message: "Saisis ton mot de passe." };

  const owner = ownerEmail();
  // Le filtre est ici, avant tout appel à Supabase : aucune autre
  // adresse ne peut même tenter une connexion.
  if (owner && email !== owner) {
    return { status: "error", message: "Cette adresse n'a pas accès à l'application." };
  }

  const supabase = await createClient();
  if (!supabase) return { status: "error", message: "Supabase n'est pas configuré." };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const raw = error.message.toLowerCase();
    if (raw.includes("invalid login credentials")) {
      return {
        status: "error",
        message:
          "Adresse ou mot de passe incorrect. Si tu n'as jamais défini de mot de passe, " +
          "crée-le depuis Supabase (Authentication → Users) ou demande un lien par email.",
      };
    }
    if (raw.includes("email not confirmed")) {
      return {
        status: "error",
        message:
          "Ce compte n'a pas confirmé son adresse. Dans Supabase (Authentication → Users), " +
          "ouvre l'utilisateur et confirme-le manuellement.",
      };
    }
    return { status: "error", message: explain(error.message) };
  }

  if (!isOwner(data.user?.email)) {
    await supabase.auth.signOut();
    return { status: "error", message: "Ce compte n'a pas accès à l'application." };
  }

  revalidatePath("/", "layout");
  // La redirection se fait ici plutôt que côté client : la session vient
  // d'être écrite dans les cookies, et rediriger depuis le serveur évite
  // un rendu intermédiaire où l'app ne la voit pas encore.
  redirect("/");
}

/** Définit ou remplace le mot de passe du compte connecté. */
export async function updatePassword(
  _prev: unknown,
  formData: FormData,
): Promise<PasswordState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) {
    return { status: "error", message: "Huit caractères minimum." };
  }

  const session = await authed();
  if (!session.ok) return { status: "error", message: session.error };

  const { error } = await session.supabase.auth.updateUser({ password });
  if (error) return { status: "error", message: explain(error.message) };

  return { status: "idle", message: "Mot de passe enregistré." };
}

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

  const site = siteUrl();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: site ? `${site}/auth/callback` : undefined,
    },
  });

  if (error) return { status: "error", message: explain(error.message) };
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
  if (error) {
    // Un code refusé est presque toujours un code périmé ou mal recopié.
    // Mais une clé invalide échoue ici aussi, et mérite son vrai message.
    const message = error.message.toLowerCase();
    return {
      status: "error",
      message: message.includes("api key")
        ? explain(error.message)
        : "Code invalide ou expiré. Demande-en un nouveau.",
    };
  }

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
    /*
     * La contrainte en base refuse un état « encaissé » sans date, et
     * une date sans l'état. On aligne les deux ici.
     *
     * Le repli n'est pas décoratif : annuler une écriture efface sa
     * date d'encaissement, et la désannuler la renvoyait « encaissée »
     * sans date — la contrainte refusait la ligne, et le bouton
     * échouait à chaque fois, sans autre explication qu'un message de
     * Postgres. Une écriture encaissée sans date retombe donc sur sa
     * date prévue, à défaut sur celle de la vente.
     */
    received_on:
      draft.status === "received"
        ? draft.received_on || draft.expected_on || draft.occurred_on
        : null,
    status: draft.status,
    counterparty: draft.counterparty,
    notes: draft.notes,
    // Rouvrir une écriture lève la mise en attente manuelle : l'état
    // qu'on vient de choisir est le dernier mot.
    settle_locked: false,
    meta: draft.meta ?? {},
  };

  // Un montant négatif retranchait du chiffre d'affaires déclaré sans
  // que rien ne le signale. Une charge se saisit avec direction
  // « out », jamais avec un moins devant le montant.
  if (payload.gross_cents < 0 || payload.fee_cents < 0 || payload.cost_cents < 0) {
    return fail("Les montants doivent être positifs. Pour une charge, choisis le sens « sortie ».");
  }

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
        .update({ status: "received", received_on: on, settle_locked: false })
        .in("id", ids)
        .select(),
    ),
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) return fail(failed.error.message);
  return { ok: true, data: results.flatMap((r) => (r.data ?? []) as Entry[]) };
}

/**
 * Remet des écritures en attente.
 *
 * `expected_on` doit repartir dans le futur : laissée à la date
 * d'encaissement — donc dans le passé — la confirmation automatique la
 * rattrapait au chargement suivant et l'écriture se remettait toute
 * seule en « encaissée ». Le geste était défait sans un mot.
 */
export async function unsettleEntries(ids: string[]): Promise<ActionResult<Entry[]>> {
  const session = await authed();
  if (!session.ok) return fail(session.error);
  if (ids.length === 0) return { ok: true, data: [] };

  const { data, error } = await session.supabase
    .from("entries")
    .update({ status: "pending", received_on: null, settle_locked: true })
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
  patch: Partial<
    Pick<
      Stream,
      | "name"
      | "color_slot"
      | "settlement_days"
      | "auto_settle"
      | "archived"
      | "position"
      | "kind"
    >
  >,
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
      // Sans catégorie, la base pose « hors », que le moteur fiscal
      // saute purement et simplement : le chiffre d'affaires de la
      // nouvelle activité sortait de la comptabilité sans un mot.
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
  patch: Partial<Pick<Settings, "default_basis">>,
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
