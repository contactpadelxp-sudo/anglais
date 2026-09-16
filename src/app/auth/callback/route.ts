import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/owner";

/**
 * Point d'atterrissage du lien de connexion envoyé par email.
 * Le code de session est échangé ici, puis on vérifie une dernière fois
 * que l'utilisateur est bien le propriétaire avant de le laisser entrer.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/connexion?erreur=lien`);
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.redirect(`${origin}/connexion`);
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/connexion?erreur=lien`);
  }

  if (!isOwner(data.user?.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/connexion?erreur=refuse`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
