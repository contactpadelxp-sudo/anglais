import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isOwner } from "@/lib/owner";
import { supabaseConfig } from "./config";

// /diagnostic doit rester accessible sans session : il sert précisément
// quand la connexion est impossible.
const PUBLIC_PATHS = [
  "/connexion",
  "/auth",
  "/diagnostic",
  "/ping",
  "/manifest.webmanifest",
  "/sw.js",
  "/hors-ligne",
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Rafraîchit la session à chaque requête et garde la porte : cette app
 * n'a qu'un seul utilisateur légitime. Toute session dont l'email ne
 * correspond pas à OWNER_EMAIL est détruite sur place, pas seulement
 * redirigée.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const config = supabaseConfig();
  const { pathname, searchParams } = request.nextUrl;

  // Le lien reçu par email atterrit là où pointe le réglage « Site URL »
  // de Supabase — souvent la racine, pas /auth/callback. Plutôt que
  // d'exiger une configuration exacte, on réachemine tout code de
  // connexion vers la route qui sait l'échanger.
  const code = searchParams.get("code");
  if (code && pathname !== "/auth/callback") {
    const callback = new URL("/auth/callback", request.url);
    callback.searchParams.set("code", code);
    const next = searchParams.get("next");
    if (next) callback.searchParams.set("next", next);
    return NextResponse.redirect(callback);
  }

  // Même logique pour le format à jeton haché des modèles récents.
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  if (tokenHash && type && pathname !== "/auth/confirmation") {
    const confirm = new URL("/auth/confirmation", request.url);
    confirm.searchParams.set("token_hash", tokenHash);
    confirm.searchParams.set("type", type);
    return NextResponse.redirect(confirm);
  }

  // Sans configuration Supabase, on laisse passer : la page d'accueil
  // affiche alors les instructions de mise en route.
  if (!config) return response;

  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Rien ne doit s'intercaler entre createServerClient et getUser().
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Le rafraîchissement a échoué : on traite la requête comme anonyme
    // plutôt que de renvoyer une erreur 500.
  }

  if (user && !isOwner(user.email)) {
    await supabase.auth.signOut();
    const denied = new URL("/connexion", request.url);
    denied.searchParams.set("erreur", "refuse");
    return NextResponse.redirect(denied);
  }

  if (!user && !isPublic(pathname)) {
    const login = new URL("/connexion", request.url);
    if (pathname !== "/") login.searchParams.set("suite", pathname);
    return NextResponse.redirect(login);
  }

  if (user && pathname === "/connexion") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}
