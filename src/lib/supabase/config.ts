/**
 * Lecture de la configuration Supabase.
 *
 * NE PAS ajouter `import "server-only"` ici. Ce module est importé par
 * src/lib/supabase/proxy.ts, qui s'exécute dans le runtime Edge : le
 * paquet server-only y est résolu comme dans un bundle navigateur et
 * lève. Le garde-fou est porté par les modules qui ne tournent jamais en
 * Edge, et par le fait qu'aucun composant client n'importe ce fichier.
 *
 * Cette application ne parle à Supabase que depuis le serveur : les
 * composants serveur lisent, les Server Actions écrivent, le proxy
 * rafraîchit la session. Aucune requête ne part du navigateur — d'où des
 * noms SANS préfixe `NEXT_PUBLIC_`. Les noms préfixés restent acceptés en
 * repli.
 */

export type SupabaseConfig = { url: string; key: string };

export type ConfigDiagnosis = {
  url: { state: "ok"; value: string } | { state: "absente" } | { state: "invalide"; value: string };
  key: { state: "ok" } | { state: "absente" };
  /** Vrai si l'adresse a dû être complétée pour devenir utilisable. */
  urlRepaired: boolean;
};

/**
 * Les valeurs sont nettoyées avant usage : un copier-coller depuis une
 * interface web embarque régulièrement une espace ou un retour à la
 * ligne, et Supabase répond alors « Invalid API key » pour une clé
 * pourtant juste.
 */
function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Normalise l'adresse du projet.
 *
 * Le tableau de bord Supabase présente l'adresse sans schéma, et un
 * copier-coller donne « xxx.supabase.co » tout court. Passée telle
 * quelle à createServerClient, elle fait lever « Invalid supabaseUrl » —
 * dans le proxy, donc avant tout rendu, ce qui met TOUT le site en
 * erreur 500. On complète donc le schéma manquant plutôt que de laisser
 * une omission aussi banale tout casser.
 */
function normalizeUrl(raw: string | undefined): {
  url?: string;
  invalid?: string;
  repaired: boolean;
} {
  const value = clean(raw);
  if (!value) return { repaired: false };

  const hasScheme = /^https?:\/\//i.test(value);
  const candidate = hasScheme ? value : `https://${value}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { invalid: value, repaired: false };
    }
    if (!parsed.hostname.includes(".")) return { invalid: value, repaired: false };
    return { url: candidate.replace(/\/+$/, ""), repaired: !hasScheme };
  } catch {
    return { invalid: value, repaired: false };
  }
}

function rawUrl() {
  return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function rawKey() {
  return process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

/**
 * La configuration utilisable, ou null. Renvoyer null fait afficher
 * l'écran de mise en route : c'est toujours préférable à une exception
 * qui rendrait le site entier inaccessible.
 */
export function supabaseConfig(): SupabaseConfig | null {
  const { url } = normalizeUrl(rawUrl());
  const key = clean(rawKey());
  return url && key ? { url, key } : null;
}

/** Le détail, pour les écrans qui doivent expliquer ce qui manque. */
export function configDiagnosis(): ConfigDiagnosis {
  const { url, invalid, repaired } = normalizeUrl(rawUrl());
  const key = clean(rawKey());
  return {
    url: url
      ? { state: "ok", value: url }
      : invalid !== undefined
        ? { state: "invalide", value: invalid }
        : { state: "absente" },
    key: key ? { state: "ok" } : { state: "absente" },
    urlRepaired: repaired,
  };
}

/** Origine publique du site, utilisée par le lien de connexion. */
export function siteUrl(): string | undefined {
  return normalizeUrl(process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL).url;
}

/**
 * Identifiant du projet lu dans l'adresse, pour pouvoir nommer le projet
 * attendu dans un message d'erreur. Jamais la clé elle-même.
 */
export function projectRef(): string | null {
  const url = supabaseConfig()?.url;
  return url?.match(/https?:\/\/([a-z0-9]+)\.supabase\./i)?.[1] ?? null;
}
