import "server-only";

/**
 * Écran affiché quand l'application ne trouve pas sa configuration.
 *
 * Il ne se contente pas de lister les étapes : il dit ce que le serveur
 * voit réellement, variable par variable. Sans ça, « ça ne marche pas »
 * reste indiscernable d'un nom mal orthographié, d'une variable
 * renseignée sur le mauvais environnement, ou d'un déploiement qui n'a
 * jamais été reconstruit.
 *
 * Aucune VALEUR n'est affichée — seulement la présence ou l'absence.
 * Cette page est publique tant que la configuration manque.
 */

type Check = {
  name: string;
  present: boolean;
  /** Nom historique préfixé, encore accepté en repli. */
  legacy?: string;
  legacyPresent?: boolean;
  required: boolean;
  role: string;
};

function inspect(): Check[] {
  return [
    {
      name: "SUPABASE_URL",
      present: Boolean(process.env.SUPABASE_URL),
      legacy: "NEXT_PUBLIC_SUPABASE_URL",
      legacyPresent: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      required: true,
      role: "adresse du projet Supabase",
    },
    {
      name: "SUPABASE_ANON_KEY",
      present: Boolean(process.env.SUPABASE_ANON_KEY),
      legacy: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      legacyPresent: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      required: true,
      role: "clé publiable du projet",
    },
    {
      name: "OWNER_EMAIL",
      present: Boolean(process.env.OWNER_EMAIL),
      required: false,
      role: "seule adresse autorisée à ouvrir une session",
    },
  ];
}

export function Setup() {
  const checks = inspect();
  // Cet écran n'est rendu que lorsque la configuration Supabase est
  // introuvable, donc il y a toujours au moins une variable bloquante.
  const blocking = checks.filter((c) => c.required && !c.present && !c.legacyPresent);
  const ownerMissing = !checks[2].present;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[620px] flex-col justify-center gap-6 px-6 py-12">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight">Revenus</h1>
        <p className="mt-1 text-[14px]" style={{ color: "var(--text-secondary)" }}>
          {blocking.length > 1
            ? "Le serveur ne trouve pas ces variables."
            : blocking.length === 1
              ? `Le serveur ne trouve pas ${blocking[0].name}.`
              : "Le serveur n'arrive pas à lire sa configuration."}
        </p>
      </div>

      <section className="card overflow-hidden">
        <h2
          className="border-b px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          Ce que le serveur voit
        </h2>
        <ul>
          {checks.map((check, i) => {
            const viaLegacy = !check.present && Boolean(check.legacyPresent);
            const ok = check.present || viaLegacy;
            return (
              <li
                key={check.name}
                className="flex items-start gap-3 px-4 py-3"
                style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}
              >
                <span
                  aria-hidden
                  className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{
                    background: ok ? "var(--good)" : check.required ? "var(--critical)" : "var(--warning)",
                    color: "#fff",
                  }}
                >
                  {ok ? "✓" : "!"}
                </span>
                <div className="min-w-0">
                  <p className="font-mono text-[13px] font-medium">{check.name}</p>
                  <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {ok ? (
                      viaLegacy ? (
                        <>
                          absente, mais trouvée sous{" "}
                          <span className="font-mono">{check.legacy}</span>{" "}— acceptée en repli
                        </>
                      ) : (
                        <>présente — {check.role}</>
                      )
                    ) : check.required ? (
                      <>
                        absente — {check.role}
                        {check.legacy ? (
                          <>
                            {" "}
                            (<span className="font-mono">{check.legacy}</span>{" "}non plus)
                          </>
                        ) : null}
                      </>
                    ) : (
                      <>
                        absente — sans elle l&apos;accès n&apos;est pas verrouillé : le premier
                        compte créé entrerait
                      </>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
        <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
          Les trois causes, par ordre de fréquence
        </p>
        <p>
          <strong>1.</strong>{" "}La variable est renseignée sur un autre environnement que celui qui
          répond. Sur Vercel, vérifie qu&apos;elle couvre bien <em>Production</em>{" "}et pas
          seulement <em>Preview</em>.
        </p>
        <p>
          <strong>2.</strong>{" "}Elle a été ajoutée après le dernier déploiement. Les variables
          serveur sont lues à l&apos;exécution, mais un déploiement ne les découvre qu&apos;à son
          démarrage : relances-en un.
        </p>
        <p>
          <strong>3.</strong>{" "}Le nom ne correspond pas exactement — espace en trop, casse
          différente, ou variable posée sur un autre projet.
        </p>
      </section>

      {ownerMissing ? (
        <p
          className="rounded-[var(--radius-sm)] px-3 py-2.5 text-[12.5px]"
          style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}
        >
          Pense à renseigner <span className="font-mono">OWNER_EMAIL</span>{" "}: c&apos;est elle qui
          réserve l&apos;application à ton adresse.
        </p>
      ) : null}
    </main>
  );
}
