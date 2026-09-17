import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/owner";

/**
 * Point d'atterrissage du lien de connexion envoyé par email.
 *
 * En cas d'échec, la raison est transmise à la page de connexion plutôt
 * qu'avalée. Un lien qui ramène au formulaire sans rien dire est
 * indiscernable d'un lien périmé, d'un lien déjà utilisé, ou d'une
 * session ouverte depuis un autre navigateur — trois causes, trois
 * gestes différents.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  const fail = (reason: string) =>
    NextResponse.redirect(
      `${origin}/connexion?erreur=lien&detail=${encodeURIComponent(reason.slice(0, 200))}`,
    );

  if (!code) return fail("Le lien ne contenait aucun code de connexion.");

  const supabase = await createClient();
  if (!supabase) return NextResponse.redirect(`${origin}/connexion`);

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(error.message);

  if (!isOwner(data.user?.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/connexion?erreur=refuse`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
