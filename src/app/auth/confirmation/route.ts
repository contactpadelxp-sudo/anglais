import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/owner";

/**
 * Atterrissage des liens d'email au format à jeton haché.
 *
 * Supabase envoie soit un `code` (échangé dans /auth/callback), soit un
 * `token_hash` accompagné d'un `type`, selon la version des modèles
 * d'email du projet. Les deux formats sont acceptés pour que la
 * connexion ne dépende pas de réglages qu'on ne maîtrise pas.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  const fail = (reason: string) =>
    NextResponse.redirect(
      `${origin}/connexion?erreur=lien&detail=${encodeURIComponent(reason.slice(0, 200))}`,
    );

  if (!tokenHash || !type) return fail("Le lien ne contenait pas de jeton exploitable.");

  const supabase = await createClient();
  if (!supabase) return NextResponse.redirect(`${origin}/connexion`);

  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) return fail(error.message);

  if (!isOwner(data.user?.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/connexion?erreur=refuse`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
