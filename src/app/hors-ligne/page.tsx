export const metadata = { title: "Hors ligne — Revenus" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-[20px] font-semibold tracking-tight">Pas de connexion</h1>
      <p className="text-[13.5px]" style={{ color: "var(--text-secondary)" }}>
        Tes chiffres sont en sécurité côté serveur. Reviens dès que le réseau est revenu.
      </p>
    </main>
  );
}
