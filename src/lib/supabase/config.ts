import "server-only";

/**
 * Lecture de la configuration Supabase.
 *
 * Cette application ne parle à Supabase que depuis le serveur : les
 * composants serveur lisent, les Server Actions écrivent, le proxy
 * rafraîchit la session. Aucune requête ne part du navigateur — la clé
 * n'a donc aucune raison d'être embarquée dans le bundle JavaScript,
 * d'où des noms SANS préfixe `NEXT_PUBLIC_`, qui la gardent côté
 * serveur.
 *
 * (La clé publiable Supabase est conçue pour être exposable, et c'est
 * la RLS qui protège les données, pas le secret de la clé. La garder
 * côté serveur ne remplace donc pas la RLS : ça réduit simplement la
 * surface, et ça évite de la voir traîner dans le code source de la
 * page.)
 *
 * Le repli sur les noms préfixés reste accepté pour qu'un déploiement
 * déjà configuré ainsi continue de fonctionner sans intervention.
 */
export type SupabaseConfig = { url: string; key: string };

/**
 * Les valeurs sont nettoyées avant usage : un copier-coller depuis une
 * interface web embarque régulièrement une espace ou un retour à la
 * ligne, et Supabase répond alors « Invalid API key » pour une clé
 * pourtant juste. On retire aussi la barre oblique finale de l'URL, qui
 * produirait des adresses à double barre.
 */
function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function supabaseConfig(): SupabaseConfig | null {
  const url = clean(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = clean(process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return url && key ? { url: url.replace(/\/+$/, ""), key } : null;
}

/** Origine publique du site, utilisée par le lien de connexion. */
export function siteUrl(): string | undefined {
  const site = clean(process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL);
  return site?.replace(/\/+$/, "");
}

/**
 * Identifiant du projet lu dans l'URL, pour pouvoir dire à l'écran de
 * connexion QUEL projet la clé est censée ouvrir. Jamais la clé
 * elle-même.
 */
export function projectRef(): string | null {
  const url = supabaseConfig()?.url;
  return url?.match(/https?:\/\/([a-z0-9]+)\.supabase\./i)?.[1] ?? null;
}
