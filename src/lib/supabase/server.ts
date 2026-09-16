import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseConfig } from "./config";

/**
 * Client Supabase pour les composants serveur et les Server Actions.
 * Renvoie null tant que la configuration est absente : l'appelant
 * affiche alors l'écran de mise en route plutôt que de planter.
 */
export async function createClient() {
  const config = supabaseConfig();
  if (!config) return null;

  const cookieStore = await cookies();

  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Appelé depuis un composant serveur : l'écriture de cookies
          // y est interdite. Le proxy rafraîchit déjà la session à
          // chaque requête, donc il n'y a rien à rattraper ici.
        }
      },
    },
  });
}
