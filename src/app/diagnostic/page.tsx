import "server-only";
import { supabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";
// Explicite : cette page lit process.env et fait un appel réseau
// sortant. On ne laisse pas le choix du runtime à l'inférence.
export const runtime = "nodejs";
export const metadata = { title: "Diagnostic — Revenus", robots: { index: false } };

/**
 * Page de diagnostic de la configuration.
 *
 * Elle existe parce qu'une erreur « Invalid API key » ne dit pas si la
 * clé est tronquée, si elle vient d'un autre projet, ou si c'est
 * l'adresse qui est fausse. Cette page interroge Supabase depuis le
 * serveur qui sert l'application — le seul endroit où le réseau est
 * celui de la production — et rapporte la réponse brute.
 *
 * Elle n'affiche JAMAIS la clé : seulement sa forme (préfixe, longueur,
 * projet revendiqué).
 *
 * Contrainte de conception : cette page ne doit JAMAIS renvoyer une
 * erreur 500. Une page de diagnostic qui plante ne diagnostique rien —
 * elle remplace un symptôme lisible par un symptôme opaque. Tout est
 * donc enveloppé, et une erreur inattendue s'affiche à l'écran.
 */

type Row = { label: string; value: string; tone: "ok" | "ko" | "info" };

/**
 * Le projet revendiqué par une clé JWT, lu dans sa charge utile.
 * Décodé avec atob plutôt que Buffer : cette page doit fonctionner quel
 * que soit le runtime qui l'exécute — Buffer n'existe pas partout.
 */
function refFromJwt(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(
      decodeURIComponent(
        atob(padded)
          .split("")
          .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
          .join(""),
      ),
    ) as Record<string, unknown>;
    return typeof payload.ref === "string" ? payload.ref : null;
  } catch {
    return null;
  }
}

function shape(key: string) {
  if (key.startsWith("sb_publishable_")) return "clé publiable (sb_publishable_…)";
  if (key.startsWith("sb_secret_")) return "CLÉ SECRÈTE — à ne jamais utiliser ici";
  if (key.split(".").length === 3) return "clé JWT historique";
  return "format non reconnu";
}

/** Masque : assez pour comparer, pas assez pour s'en servir. */
function masked(key: string) {
  if (key.length <= 12) return `trop courte (${key.length} caractères)`;
  return `${key.slice(0, 8)}…${key.slice(-4)} · ${key.length} caractères`;
}

async function probe(url: string, key: string) {
  try {
    const response = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
      // Sans limite, un projet injoignable ferait expirer la fonction
      // entière et rendrait une 500 sans explication.
      signal: AbortSignal.timeout(8000),
    });
    return { status: response.status, body: (await response.text()).slice(0, 300) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 0,
      body: /timeout|abort/i.test(message) ? "délai dépassé (8 s)" : message,
    };
  }
}

function readConfig() {
  const config = supabaseConfig();
  const rows: Row[] = [];
  const urlRef = config?.url.match(/https?:\/\/([a-z0-9]+)\.supabase\./i)?.[1] ?? null;

  rows.push(
    config
      ? { label: "SUPABASE_URL", value: config.url, tone: "ok" }
      : { label: "SUPABASE_URL", value: "absente", tone: "ko" },
  );
  rows.push({
    label: "Projet visé par l'adresse",
    value: urlRef ?? "illisible — attendu https://<projet>.supabase.co",
    tone: urlRef ? "ok" : "ko",
  });

  if (config) {
    rows.push({ label: "Format de la clé", value: shape(config.key), tone: "info" });
    rows.push({ label: "Empreinte de la clé", value: masked(config.key), tone: "info" });

    const keyRef = refFromJwt(config.key);
    if (keyRef) {
      const same = keyRef === urlRef;
      rows.push({
        label: "Projet revendiqué par la clé",
        value: same
          ? `${keyRef} — identique à l'adresse`
          : `${keyRef} — DIFFÉRENT de l'adresse (${urlRef ?? "?"})`,
        tone: same ? "ok" : "ko",
      });
    } else if (config.key.startsWith("sb_publishable_")) {
      rows.push({
        label: "Projet revendiqué par la clé",
        value: "une clé publiable ne le contient pas — le test ci-dessous tranche",
        tone: "info",
      });
    }
  }

  rows.push({
    label: "OWNER_EMAIL",
    value: process.env.OWNER_EMAIL ? "renseignée" : "absente — l'accès n'est pas verrouillé",
    tone: process.env.OWNER_EMAIL ? "ok" : "ko",
  });

  return { config, rows };
}

function verdict(status: number) {
  if (status === 200) {
    return "La clé est acceptée par ce projet. Si la connexion échoue malgré tout, le problème est ailleurs — envoi d'email ou réglages d'authentification.";
  }
  if (status === 401) {
    return "La clé est refusée par ce projet. Reprends l'adresse ET la clé dans le même projet Supabase, onglet API.";
  }
  if (status === 0) {
    return "Le projet n'a pas répondu : adresse erronée, projet en pause, ou réseau bloqué.";
  }
  return "Réponse inattendue — c'est peut-être un intermédiaire qui a répondu à la place de Supabase.";
}

export default async function DiagnosticPage() {
  let rows: Row[] = [];
  let test: { status: number; body: string } | null = null;
  let crash: string | null = null;

  try {
    const read = readConfig();
    rows = read.rows;
    if (read.config) test = await probe(read.config.url, read.config.key);
  } catch (error) {
    // Le diagnostic lui-même a échoué : on le dit, plutôt que de
    // laisser Next rendre une page d'erreur muette.
    crash = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[680px] flex-col justify-center gap-5 px-5 py-12">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">Diagnostic</h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-secondary)" }}>
          Ce que le serveur voit, et ce que Supabase lui répond.
        </p>
      </div>

      {crash ? (
        <section className="card overflow-hidden">
          <h2
            className="border-b px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide"
            style={{ borderColor: "var(--border)", color: "var(--critical)" }}
          >
            Le diagnostic lui-même a échoué
          </h2>
          <p className="break-all px-4 py-3 font-mono text-[12.5px]">{crash}</p>
        </section>
      ) : null}

      {rows.length > 0 ? (
        <section className="card overflow-hidden">
          <ul>
            {rows.map((row, i) => (
              <li
                key={row.label}
                className="px-4 py-3"
                style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}
              >
                <p
                  className="text-[11px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)" }}
                >
                  {row.label}
                </p>
                <p
                  className="mt-0.5 break-all font-mono text-[12.5px]"
                  style={{
                    color:
                      row.tone === "ko"
                        ? "var(--critical)"
                        : row.tone === "ok"
                          ? "var(--text-primary)"
                          : "var(--text-secondary)",
                  }}
                >
                  {row.value}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {test ? (
        <section className="card overflow-hidden">
          <h2
            className="border-b px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            Réponse de Supabase à cette clé
          </h2>
          <div className="px-4 py-3">
            <p className="font-mono text-[13px] font-semibold">
              {test.status === 0 ? "aucune réponse" : `HTTP ${test.status}`}
            </p>
            <p
              className="mt-1 break-all font-mono text-[12px]"
              style={{ color: "var(--text-secondary)" }}
            >
              {test.body || "(corps vide)"}
            </p>
            <p className="mt-3 text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
              {verdict(test.status)}
            </p>
          </div>
        </section>
      ) : null}
    </main>
  );
}
