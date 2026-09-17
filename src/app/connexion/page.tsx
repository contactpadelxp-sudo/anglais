import { LoginForm } from "@/components/login-form";
import { ownerEmail } from "@/lib/owner";
import { supabaseConfig } from "@/lib/supabase/config";

export const metadata = { title: "Connexion — Revenus" };
export const dynamic = "force-dynamic";

/**
 * Traduit l'échec d'un lien de connexion.
 *
 * Trois causes donnent le même symptôme — retour au formulaire — mais
 * appellent trois gestes différents. Le message brut de Supabase est
 * conservé en dessous : il a servi à identifier chacune des pannes
 * précédentes.
 */
function explainLink(detail?: string): string {
  const message = (detail ?? "").toLowerCase();

  if (message.includes("code verifier") || message.includes("code_verifier")) {
    return (
      "Ce lien a été demandé depuis un autre navigateur, ou en navigation privée. " +
      "La connexion doit se terminer là où elle a commencé : redemande un lien depuis " +
      "ce navigateur-ci, puis ouvre-le sans changer de fenêtre."
    );
  }
  if (message.includes("expired") || message.includes("invalid") || message.includes("already")) {
    return (
      "Ce lien n'est plus valable — ils expirent vite et ne servent qu'une fois. " +
      "Demandes-en un nouveau, et ouvre le plus récent."
    );
  }
  if (message.includes("rate") || message.includes("too many")) {
    return "Trop de demandes d'affilée. Attends un moment avant de réessayer.";
  }
  return "La connexion par ce lien a échoué. Demandes-en un nouveau.";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; suite?: string; detail?: string }>;
}) {
  const params = await searchParams;
  const configured = supabaseConfig() !== null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[400px] flex-col justify-center gap-6 px-6 py-12">
      <div className="flex flex-col gap-2">
        <span
          aria-hidden
          className="flex h-11 w-11 items-center justify-center rounded-[13px]"
          style={{ background: "var(--series-1)", color: "#fff" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M3 3v18h18M7 15v3M12 9v9M17 5v13" />
          </svg>
        </span>
        <h1 className="mt-2 text-[24px] font-semibold tracking-tight">Revenus</h1>
        <p className="text-[13.5px]" style={{ color: "var(--text-secondary)" }}>
          Ce tableau de bord n&apos;a qu&apos;un seul utilisateur.
        </p>
      </div>

      {params.erreur === "lien" ? (
        <div
          className="flex flex-col gap-1.5 rounded-[var(--radius-sm)] px-3 py-2.5 text-[12.5px]"
          style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}
        >
          <p>{explainLink(params.detail)}</p>
          {params.detail ? (
            <p className="font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
              {params.detail}
            </p>
          ) : null}
        </div>
      ) : null}

      {params.erreur === "refuse" ? (
        <p
          className="rounded-[var(--radius-sm)] px-3 py-2.5 text-[12.5px]"
          style={{ background: "var(--surface-2)", color: "var(--critical)" }}
        >
          Ce compte n&apos;a pas accès à l&apos;application. La session a été fermée.
        </p>
      ) : null}

      {configured ? (
        <LoginForm defaultEmail={ownerEmail() ?? ""} />
      ) : (
        <p
          className="rounded-[var(--radius-sm)] px-3 py-2.5 text-[12.5px]"
          style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}
        >
          Supabase n&apos;est pas encore configuré. Renseigne SUPABASE_URL et
          SUPABASE_ANON_KEY.
        </p>
      )}
    </main>
  );
}
