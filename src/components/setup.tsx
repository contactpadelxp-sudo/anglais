/** Écran de mise en route affiché tant que Supabase n'est pas branché. */
export function Setup() {
  const steps = [
    {
      title: "Créer le projet Supabase",
      body: "Un projet suffit — l'app est mono-utilisateur.",
    },
    {
      title: "Appliquer la migration",
      body: "Colle le contenu de supabase/migrations/0001_init.sql dans l'éditeur SQL du projet et exécute-le. Il crée les tables, les politiques d'accès et les quatre activités de départ.",
    },
    {
      title: "Renseigner les variables d'environnement",
      body: "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY et OWNER_EMAIL — cette dernière étant la seule adresse autorisée à ouvrir une session.",
    },
    {
      title: "Se connecter",
      body: "Un code à six chiffres arrive par email. Aucun mot de passe à retenir.",
    },
  ];

  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col justify-center gap-6 px-6 py-12">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight">Revenus</h1>
        <p className="mt-1 text-[14px]" style={{ color: "var(--text-secondary)" }}>
          Quatre étapes et l&apos;app est opérationnelle.
        </p>
      </div>
      <ol className="flex flex-col gap-3">
        {steps.map((step, i) => (
          <li key={step.title} className="card flex gap-3 p-4">
            <span
              className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
              style={{ background: "var(--series-1)", color: "#fff" }}
            >
              {i + 1}
            </span>
            <div>
              <p className="text-[13.5px] font-semibold">{step.title}</p>
              <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}
