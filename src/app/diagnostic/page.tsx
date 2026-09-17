import "server-only";
import { supabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";
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
 * projet revendiqué). La clé publiable est conçue pour être exposable,
 * mais l'exposer ici n'apporterait rien.
 */

type Row = { label: string; value: string; tone: "ok" | "ko" | "info" };

/** Le projet revendiqué par une clé JWT, lu dans sa charge utile. */
function refFromJwt(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    );
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
  if (key.length <= 12) return "trop courte";
  return `${key.slice(0, 8)}…${key.slice(-4)} (${key.length} caractères)`;
}

async function probe(url: string, key: string) {
  try {
    const response = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    const body = (await response.text()).slice(0, 300);
    return { status: response.status, body };
  } catch (error) {
    return { status: 0, body: error instanceof Error ? error.message : String(error) };
  }
}

export default async function DiagnosticPage() {
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
    value: urlRef ?? "illisible — l'adresse n'a pas la forme https://<projet>.supabase.co",
    tone: urlRef ? "ok" : "ko",
  });

  if (config) {
    const keyRef = refFromJwt(config.key);
    rows.push({ label: "Format de la clé", value: shape(config.key), tone: "info" });
    rows.push({ label: "Empreinte de la clé", value: masked(config.key), tone: "info" });

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

  const test = config ? await probe(config.url, config.key) : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[680px] flex-col justify-center gap-5 px-5 py-12">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">Diagnostic</h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-secondary)" }}>
          Ce que le serveur voit, et ce que Supabase lui répond.
        </p>
      </div>

      <section className="card overflow-hidden">
        <ul>
          {rows.map((row, i) => (
            <li
              key={row.label}
              className="px-4 py-3"
              style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}
            >
              <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
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
            <p className="mt-1 break-all font-mono text-[12px]" style={{ color: "var(--text-secondary)" }}>
              {test.body || "(corps vide)"}
            </p>
            <p className="mt-3 text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
              {test.status === 200
                ? "La clé est acceptée par ce projet. Si la connexion échoue malgré tout, le problème est ailleurs — envoi d'email ou réglages d'authentification."
                : test.status === 401
                  ? "La clé est refusée par ce projet. Reprends l'adresse ET la clé dans le même projet Supabase, onglet API."
                  : test.status === 0
                    ? "Le projet n'a pas répondu du tout : adresse erronée, projet en pause, ou réseau bloqué."
                    : "Réponse inattendue — c'est peut-être un intermédiaire qui a répondu à la place de Supabase."}
            </p>
          </div>
        </section>
      ) : null}
    </main>
  );
}
