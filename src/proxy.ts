import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Le proxy s'exécute avant tout rendu. S'il lève, la plateforme répond
 * « Internal Server Error » en texte brut pour CHAQUE requête — aucune
 * page ne s'affiche, et rien n'indique d'où vient la panne.
 *
 * On laisse donc passer la requête plutôt que de faire tomber le site.
 * Ce n'est pas une faille : l'authentification est revérifiée au niveau
 * des pages (loadSnapshot redirige vers /connexion sans session) et les
 * données restent protégées par la RLS. Le proxy rafraîchit la session
 * et redirige tôt par confort, il n'est pas le gardien ultime.
 */
export async function proxy(request: NextRequest) {
  try {
    return await updateSession(request);
  } catch (error) {
    console.error("[proxy] échec, requête laissée passer :", error);
    return NextResponse.next({ request });
  }
}

export const config = {
  matcher: [
    // Tout sauf les fichiers statiques, les images optimisées et /ping,
    // qui doit rester joignable même quand le proxy est en cause.
    "/((?!_next/static|_next/image|favicon.ico|ping|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
