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

export function supabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

/** Origine publique du site, utilisée par le lien de connexion. */
export function siteUrl(): string | undefined {
  return process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? undefined;
}
