import { LoginForm } from "@/components/login-form";
import { ownerEmail } from "@/lib/owner";

export const metadata = { title: "Connexion — Revenus" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; suite?: string }>;
}) {
  const params = await searchParams;
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

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
          Ce tableau de bord n&apos;a qu&apos;un seul utilisateur. Saisis ton adresse, un code
          arrive par email.
        </p>
      </div>

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
          Supabase n&apos;est pas encore configuré. Renseigne NEXT_PUBLIC_SUPABASE_URL et
          NEXT_PUBLIC_SUPABASE_ANON_KEY.
        </p>
      )}
    </main>
  );
}
