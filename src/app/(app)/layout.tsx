import { redirect } from "next/navigation";
import { loadSnapshot } from "@/lib/data";
import { StoreProvider } from "@/components/store";
import { Shell } from "@/components/shell";
import { ServiceWorker } from "@/components/service-worker";
import { Setup } from "@/components/setup";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const result = await loadSnapshot();

  if (result.state === "unconfigured") return <Setup />;
  if (result.state === "anonymous") redirect("/connexion");

  if (result.state === "error") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[520px] flex-col justify-center gap-3 px-6">
        <h1 className="text-[20px] font-semibold tracking-tight">Lecture impossible</h1>
        <p className="text-[13.5px]" style={{ color: "var(--text-secondary)" }}>
          La base a répondu : {result.message}
        </p>
        <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          Si les tables n&apos;existent pas encore, applique les migrations du dossier
          <code className="mx-1">supabase/migrations/</code>
          dans le projet Supabase, dans l&apos;ordre de leur numéro : 0001, puis 0002, puis
          0003. Une seule oubliée, et la lecture échoue ici.
        </p>
      </main>
    );
  }

  return (
    <StoreProvider snapshot={result.snapshot}>
      <Shell email={result.email}>{children}</Shell>
      <ServiceWorker />
    </StoreProvider>
  );
}
