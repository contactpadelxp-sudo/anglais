import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isOwner } from "@/lib/owner";

const PUBLIC_PATHS = ["/connexion", "/auth", "/manifest.webmanifest", "/sw.js", "/offline"];

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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { pathname } = request.nextUrl;

  // Sans configuration Supabase, on laisse passer : la page d'accueil
  // affiche alors les instructions de mise en route.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
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
