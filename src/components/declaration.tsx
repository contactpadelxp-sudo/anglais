"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/components/store";
import { Button, Card, Input } from "@/components/ui/kit";
import { Icon } from "@/components/ui/icons";
import { eurosArrondis, money, moneyArrondi, percent } from "@/lib/format";
import {
  dayLabel,
  monthLabel,
  monthOf,
  shiftMonth,
  today,
  type MonthKey,
} from "@/lib/dates";
import {
  CATEGORY_COLOR,
  declarationDraft,
  periodMonths,
  type UrssafPeriodKind,
} from "@/lib/fiscal";

/* ===================================================================
   Ma déclaration URSSAF

   L'app savait déjà calculer le chiffre à reporter sur
   net-entreprises ; elle le jetait ensuite. Ce bloc le rend tel qu'il
   se recopie : arrondi à l'euro comme l'exige le formulaire, une ligne
   par catégorie, avec l'échéance et la trace de ce qui a été déclaré.

   Il s'ouvre sur la période qu'il faut déclarer MAINTENANT — la
   dernière close — et non sur le mois consulté en en-tête : on ne
   vient pas ici pour explorer, on vient pour recopier trois nombres.
   =================================================================== */

/**
 * La période close la plus récente : celle qui est à déclarer.
 *
 * On recule d'une PÉRIODE, pas d'un mois. Reculer d'un mois marchait
 * par hasard en mensuel et jamais en trimestriel : en septembre, le
 * mois d'août appartient au trimestre juillet-septembre, qui n'est pas
 * terminé — la carte s'ouvrait sur « période en cours » et ne montrait
 * jamais ce qu'il y avait à déclarer.
 */
function periodeADeclarer(kind: UrssafPeriodKind): MonthKey {
  const courante = periodMonths(monthOf(today()), kind)[0];
  return periodMonths(shiftMonth(courante, kind === "monthly" ? -1 : -3), kind)[0];
}

export function DeclarationUrssaf() {
  const store = useStore();
  const { entries, streams, fiscal, settings, declarationByPeriod, month: moisAffiche } = store;
  // Une base restée en arrière ne porte pas encore la colonne : la
  // périodicité mensuelle est celle de la très grande majorité des
  // micro-entrepreneurs, et c'est le défaut de l'inscription.
  const kind: UrssafPeriodKind = settings.urssaf_period ?? "monthly";

  /*
   * La période lue se DÉDUIT du mois de l'en-tête, elle n'est pas
   * mémorisée à part : lire « août » en haut et « juillet » ici serait
   * le genre de désaccord qu'on ne remarque qu'après avoir recopié le
   * mauvais chiffre.
   *
   * Une exception, et c'est le cas d'ouverture : sur le mois courant,
   * la période à déclarer n'est pas celle qu'on traverse, c'est la
   * précédente — la dernière close. On arrive ici pour recopier trois
   * nombres, pas pour regarder un mois qui n'est pas fini.
   *
   * Les flèches posent une surcharge attachée au mois d'en-tête : elles
   * restent maîtresses tant qu'on ne retouche pas l'en-tête, et
   * s'effacent d'elles-mêmes dès qu'on en change.
   */
  const [override, setOverride] = useState<{ start: MonthKey; from: MonthKey } | null>(null);

  const defaut =
    moisAffiche === monthOf(today())
      ? periodeADeclarer(kind)
      : periodMonths(moisAffiche, kind)[0];
  const start = override && override.from === moisAffiche ? override.start : defaut;
  const setStart = (m: MonthKey) => setOverride({ start: m, from: moisAffiche });

  // `null` = « je n'ai rien saisi », distinct de `""` = « j'ai tout
  // effacé ». Confondre les deux empêchait de vider le champ : il se
  // remplissait à nouveau tout seul avec la valeur enregistrée.
  const [appele, setAppele] = useState<string | null>(null);

  const pas = kind === "monthly" ? 1 : 3;
  const mois = monthOf(today());

  const draft = useMemo(
    () => declarationDraft(entries, streams, fiscal, start, kind, mois),
    [entries, streams, fiscal, start, kind, mois],
  );

  const periodKey = `${draft.start}-01`;
  const declaree = declarationByPeriod[periodKey];

  const label =
    kind === "monthly"
      ? monthLabel(draft.start, "full")
      : `${monthLabel(draft.months[0])} → ${monthLabel(draft.months[2], "full")}`;

  // L'échéance ne se lit pas de la même façon selon qu'elle est passée
  // ou devant : « dans 9 jours » se comprend sans compter, « le 30
  // septembre » demande d'ouvrir un calendrier.
  const jours = joursJusqua(draft.deadline);
  const enRetard = draft.closed && !declaree && jours < 0;

  const ecart =
    declaree?.called_cents != null ? declaree.called_cents - draft.dueCents : null;

  return (
    <Card
      title="Ma déclaration"
      action={
        <div className="flex items-center gap-1">
          <NavBtn
            label="Période précédente"
            onClick={() => setStart(periodMonths(shiftMonth(start, -pas), kind)[0])}
          >
            <Icon.left size={16} />
          </NavBtn>
          <span
            className="min-w-[104px] text-center text-[12px] font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            {label}
          </span>
          <NavBtn
            label="Période suivante"
            onClick={() => setStart(periodMonths(shiftMonth(start, pas), kind)[0])}
          >
            <Icon.right size={16} />
          </NavBtn>
        </div>
      }
    >
      {/* ---- L'état de la période ------------------------------------ */}
      <div className="flex flex-wrap items-center gap-2 pb-3">
        {!draft.closed ? (
          <Etat tone="muted">
            Période en cours — elle se déclare à partir du{" "}
            {dayLabel(`${shiftMonth(draft.months[draft.months.length - 1], 1)}-01`)}
          </Etat>
        ) : declaree?.paid_on ? (
          <Etat tone="good">Payée le {dayLabel(declaree.paid_on)}</Etat>
        ) : declaree ? (
          <Etat tone="good">Déclarée</Etat>
        ) : enRetard ? (
          <Etat tone="critical">
            En retard de {Math.abs(jours)} jour{Math.abs(jours) > 1 ? "s" : ""}
          </Etat>
        ) : (
          <Etat tone={jours <= 7 ? "warning" : "normal"}>
            À déclarer avant le {dayLabel(draft.deadline)}
            {jours >= 0 ? ` · dans ${jours} jour${jours > 1 ? "s" : ""}` : ""}
          </Etat>
        )}
      </div>

      {/* ---- Les chiffres à recopier --------------------------------- */}
      {draft.lines.length === 0 ? (
        <p className="py-2 text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
          Aucun encaissement sur cette période. Une déclaration à zéro reste{" "}
          <strong>obligatoire</strong> : sans elle, l&apos;URSSAF applique une pénalité
          forfaitaire, même quand il n&apos;y a rien à payer.
        </p>
      ) : (
        <ul className="flex flex-col">
          {draft.lines.map((line, i) => (
            <li
              key={line.category}
              className="flex items-center gap-3 py-2.5"
              style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}
            >
              <span
                aria-hidden
                className="h-7 w-1 shrink-0 rounded-full"
                style={{ background: CATEGORY_COLOR[line.category] }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{line.label}</p>
                <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                  {percent(line.cotisationBps / 10_000, 2)} · {money(line.dueCents)} de
                  cotisations
                </p>
              </div>
              <Copier cents={line.caCents} />
            </li>
          ))}
        </ul>
      )}

      {draft.lines.length > 0 ? (
        <div
          className="mt-1 flex flex-col gap-1.5 pt-3"
          style={{ borderTop: "2px solid var(--border-strong)" }}
        >
          {/* La somme des lignes ARRONDIES, et non l'arrondi de la
              somme : c'est ce qu'on tape ligne à ligne, donc c'est ce
              que le formulaire totalisera. Les deux peuvent différer
              d'un euro, et cet euro-là se remarque. */}
          <Ligne
            label="Total déclaré"
            value={moneyArrondi(
              draft.lines.reduce((a, l) => a + eurosArrondis(l.caCents), 0) * 100,
            )}
            strong
          />
          <Ligne label="Cotisations attendues" value={money(draft.dueCents)} />
        </div>
      ) : null}

      {/* ---- Ce qui a été fait --------------------------------------- */}
      {draft.closed ? (
        <div className="mt-4 flex flex-col gap-3">
          {!declaree ? (
            <Button
              variant="primary"
              icon={<Icon.check size={16} />}
              onClick={() =>
                void store.saveDeclaration({
                  period: periodKey,
                  periodicity: kind,
                  declared_cents: Object.fromEntries(
                    draft.lines.map((l) => [l.category, l.caCents]),
                  ),
                })
              }
            >
              J&apos;ai déclaré cette période
            </Button>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex-1">
                  <span
                    className="mb-1 block text-[11.5px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Montant appelé par l&apos;URSSAF
                  </span>
                  <Input
                    inputMode="decimal"
                    placeholder={String(eurosArrondis(draft.dueCents))}
                    value={
                      appele ??
                      (declaree.called_cents != null
                        ? String(declaree.called_cents / 100)
                        : "")
                    }
                    onChange={(e) => setAppele(e.target.value)}
                    onBlur={() => {
                      if (appele === null) return;
                      const brut = appele.trim();
                      if (brut === "") {
                        void store.saveDeclaration({
                          period: periodKey,
                          periodicity: kind,
                          called_cents: null,
                        });
                        setAppele(null);
                        return;
                      }
                      const v = Number(brut.replace(",", ".").replace(/\s/g, ""));
                      if (!Number.isFinite(v)) return;
                      void store.saveDeclaration({
                        period: periodKey,
                        periodicity: kind,
                        called_cents: Math.round(v * 100),
                      });
                      setAppele(null);
                    }}
                  />
                </label>
                <Button
                  onClick={() =>
                    void store.saveDeclaration({
                      period: periodKey,
                      periodicity: kind,
                      paid_on: declaree.paid_on ? null : today(),
                      paid_cents: declaree.paid_on
                        ? null
                        : (declaree.called_cents ?? draft.dueCents),
                    })
                  }
                >
                  {declaree.paid_on ? "Pas encore payée" : "Payée"}
                </Button>
              </div>

              {ecart !== null && Math.abs(ecart) >= 100 ? (
                <p
                  className="rounded-[var(--radius-sm)] px-3 py-2.5 text-[12px]"
                  style={{
                    background: "color-mix(in oklab, var(--warning) 12%, var(--surface-2))",
                    color: "var(--text-secondary)",
                  }}
                >
                  <strong>
                    {money(Math.abs(ecart))} d&apos;écart avec le calcul de l&apos;app
                  </strong>{" "}
                  — l&apos;URSSAF appelle {ecart > 0 ? "plus" : "moins"} que prévu. Vérifie
                  le taux de chaque activité dans Réglages → Fiscalité, et la période
                  d&apos;ACRE : c&apos;est de là que vient presque toujours l&apos;écart.
                </p>
              ) : null}

              <button
                type="button"
                onClick={() => void store.removeDeclaration(periodKey)}
                className="self-start text-[11.5px] underline"
                style={{ color: "var(--text-muted)" }}
              >
                Annuler l&apos;enregistrement de cette déclaration
              </button>
            </>
          )}
        </div>
      ) : null}

      <p className="mt-3 max-w-[72ch] text-[11.5px]" style={{ color: "var(--text-muted)" }}>
        Le montant à saisir est le chiffre d&apos;affaires <strong>brut encaissé</strong>,
        arrondi à l&apos;euro : ni les frais de plateforme ni le coût d&apos;achat ne s&apos;en
        déduisent. L&apos;allocation chômage n&apos;y figure jamais. L&apos;échéance est celle
        qui tombe en pratique ; la date exacte figure sur ton compte URSSAF.
      </p>
    </Card>
  );
}

/** Jours restants avant une échéance, en heure locale. */
function joursJusqua(deadline: string): number {
  const now = Date.parse(`${today()}T00:00:00`);
  const fin = Date.parse(`${deadline}T00:00:00`);
  return Math.round((fin - now) / 86_400_000);
}

function NavBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-[var(--surface-2)]"
      style={{ color: "var(--text-secondary)" }}
    >
      {children}
    </button>
  );
}

function Etat({
  tone,
  children,
}: {
  tone: "normal" | "good" | "warning" | "critical" | "muted";
  children: React.ReactNode;
}) {
  const color =
    tone === "good"
      ? "var(--good)"
      : tone === "warning"
        ? "var(--warning)"
        : tone === "critical"
          ? "var(--critical)"
          : tone === "muted"
            ? "var(--text-muted)"
            : "var(--text-secondary)";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium"
      style={{ background: "var(--surface-2)", color }}
    >
      {tone === "good" ? <Icon.check size={13} /> : null}
      {tone === "critical" || tone === "warning" ? <Icon.alert size={13} /> : null}
      {children}
    </span>
  );
}

function Ligne({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
      <span className={`tnum text-[14px] ${strong ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}

/**
 * Le montant, et le geste qui le met dans le presse-papiers. Recopier
 * « 1 240 » à la main d'un écran à l'autre est exactement l'endroit où
 * l'on inverse deux chiffres.
 */
function Copier({ cents }: { cents: number }) {
  const [copie, setCopie] = useState(false);
  const brut = String(eurosArrondis(cents));

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(brut).then(
          () => {
            setCopie(true);
            setTimeout(() => setCopie(false), 1600);
          },
          () => {},
        );
      }}
      aria-label={`Copier ${brut} euros`}
      className="flex h-11 shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] px-2 transition-colors hover:bg-[var(--surface-2)]"
    >
      <span className="tnum text-[15px] font-semibold">{moneyArrondi(cents)}</span>
      <span style={{ color: copie ? "var(--good)" : "var(--text-muted)" }}>
        {copie ? <Icon.check size={14} /> : <Icon.copy size={14} />}
      </span>
    </button>
  );
}
