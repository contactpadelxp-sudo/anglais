"use client";

import { useState } from "react";
import { useStore } from "./store";
import { Card, Field, Input, Segmented } from "./ui/kit";
import { Icon } from "./ui/icons";
import { CATEGORIES, CATEGORY_ORDER, acreRegime, type FiscalCategory } from "@/lib/fiscal";
import { centsToInput, money, parseMoney, percent } from "@/lib/format";
import { dayLabel } from "@/lib/dates";

/**
 * Réglages fiscaux.
 *
 * Aucun taux n'est figé : ils sont revalorisés chaque année, et une
 * application qui les enfermerait dans son code deviendrait fausse sans
 * prévenir. Ce qui se règle ici est ce dont le calcul ne peut pas se
 * déduire tout seul.
 */
export function FiscalCard() {
  const store = useStore();
  const { settings, streams, fiscal, updateSettings, updateStream } = store;

  const acre = acreRegime(fiscal.activityStart, fiscal.acreEnabled);

  return (
    <>
      <Card title="Catégorie fiscale de chaque activité">
        <p className="mb-3 max-w-[72ch] text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
          C&apos;est le réglage le plus lourd de conséquences : il fixe le taux de cotisations et
          l&apos;abattement. La catégorie découle de l&apos;activité réellement exercée — aucune
          case cochée à l&apos;immatriculation ne la choisit. Vérifie-la sur ton attestation
          URSSAF.
        </p>
        <ul className="flex flex-col gap-3">
          {streams.map((stream) => {
            const current = (stream.fiscal_category as FiscalCategory) ?? "hors";
            const spec = CATEGORIES[current] ?? CATEGORIES.hors;
            return (
              <li key={stream.id} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                    style={{ background: `var(--series-${stream.color_slot})` }}
                  />
                  <span className="text-[13px] font-medium">{stream.name}</span>
                </div>
                <select
                  value={current}
                  onChange={(e) =>
                    void updateStream(stream.id, { fiscal_category: e.target.value })
                  }
                  className="w-full appearance-none rounded-[var(--radius-sm)] px-3 py-2 text-[13px] outline-none"
                  style={{ background: "var(--surface-2)", color: "var(--text-primary)" }}
                >
                  {CATEGORY_ORDER.map((key) => (
                    <option key={key} value={key}>
                      {CATEGORIES[key].label}
                      {CATEGORIES[key].cotise
                        ? ` — ${percent(CATEGORIES[key].cotisationBps / 10_000, 1)} + ${percent(
                            CATEGORIES[key].abattementBps / 10_000,
                          )} d'abattement`
                        : ""}
                    </option>
                  ))}
                </select>
                <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                  {spec.note}
                </p>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Déclaration URSSAF">
        <Field
          label="Périodicité"
          hint="Choisie à l'inscription. Elle pilote la période et l'échéance du bloc « Ma déclaration » de la page Comptabilité. Elle ne se change qu'avant le 31 décembre, pour l'année suivante."
        >
          <Segmented
            label="Périodicité de la déclaration"
            value={settings.urssaf_period ?? "monthly"}
            onChange={(v) => void updateSettings({ urssaf_period: v })}
            options={[
              { value: "monthly", label: "Mensuelle" },
              { value: "quarterly", label: "Trimestrielle" },
            ]}
          />
        </Field>
      </Card>

      <Card title="Début d'activité et ACRE">
        <div className="flex flex-col gap-4">
          <Field
            label="Date de début d'activité"
            hint="Celle déclarée au guichet unique. Elle détermine à la fois le taux d'ACRE et sa date de fin."
          >
            <Input
              type="date"
              value={settings.activity_start ?? ""}
              onChange={(e) =>
                void updateSettings({ activity_start: e.target.value || null })
              }
              className="max-w-[200px]"
            />
          </Field>

          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={settings.acre_enabled}
              onChange={(e) => void updateSettings({ acre_enabled: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-[var(--series-1)]"
            />
            <span>
              <span className="block text-[13px] font-medium">Je bénéficie de l&apos;ACRE</span>
              <span className="block text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                Exonération partielle des cotisations. Elle ne réduit jamais la contribution à la
                formation professionnelle, qui reste due au taux plein.
              </span>
            </span>
          </label>

          {acre ? (
            <div
              className="flex flex-col gap-1 rounded-[var(--radius-sm)] px-3 py-2.5 text-[12.5px]"
              style={{ background: "var(--surface-2)" }}
            >
              <span className="flex items-center gap-1.5 font-medium">
                <span style={{ color: "var(--good)" }}>
                  <Icon.check size={14} />
                </span>
                {percent(1 - acre.coefficient)} d&apos;exonération jusqu&apos;au{" "}
                {dayLabel(acre.endsOn)}
              </span>
              <span style={{ color: "var(--text-secondary)" }}>
                La durée n&apos;est pas de douze mois : l&apos;exonération court jusqu&apos;à la
                fin du troisième trimestre civil suivant celui du début d&apos;activité, soit neuf
                à douze mois selon le moment du démarrage.
              </span>
            </div>
          ) : settings.acre_enabled ? (
            <p className="text-[12.5px]" style={{ color: "var(--warning)" }}>
              Renseigne la date de début d&apos;activité : sans elle, l&apos;ACRE ne peut pas être
              appliquée.
            </p>
          ) : null}
        </div>
      </Card>

      <Card title="Impôt sur le revenu">
        <div className="flex flex-col gap-4">
          <Field
            label="Mode d'imposition"
            hint="Le versement libératoire se paie avec les cotisations, à taux fixe sur le chiffre d'affaires."
          >
            <Segmented
              value={settings.versement_liberatoire ? "liberatoire" : "bareme"}
              onChange={(v) =>
                void updateSettings({ versement_liberatoire: v === "liberatoire" })
              }
              options={[
                { value: "bareme", label: "Barème" },
                { value: "liberatoire", label: "Versement libératoire" },
              ]}
            />
          </Field>

          {!settings.versement_liberatoire ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Parts fiscales">
                  <Input
                    inputMode="decimal"
                    defaultValue={String(settings.tax_parts)}
                    onBlur={(e) => {
                      // La base refuse au-delà de 20 parts : accepter 25
                      // ici faisait échouer l'enregistrement sans rien dire.
                      const parts = Number(e.target.value.replace(",", "."));
                      if (Number.isFinite(parts) && parts >= 1 && parts <= 20) {
                        void updateSettings({ tax_parts: parts });
                      }
                    }}
                  />
                </Field>
                <Field label="Autres revenus du foyer" hint="Imposables, sur l'année.">
                  <Input
                    inputMode="decimal"
                    defaultValue={centsToInput(settings.other_income_cents)}
                    placeholder="0"
                    onBlur={(e) =>
                      void updateSettings({ other_income_cents: parseMoney(e.target.value) })
                    }
                  />
                </Field>
              </div>

              <div
                className="flex flex-col gap-1.5 rounded-[var(--radius-sm)] px-3 py-2.5"
                style={{ background: "var(--surface-2)" }}
              >
                <span className="flex items-center gap-1.5 text-[12.5px] font-medium">
                  <span style={{ color: "var(--warning)" }}>
                    <Icon.alert size={14} />
                  </span>
                  Barème utilisé : {fiscal.bracketsYear}
                </span>
                <span className="text-[11.5px]" style={{ color: "var(--text-secondary)" }}>
                  Les tranches sont revalorisées chaque année, et celle applicable aux revenus de
                  l&apos;année en cours n&apos;est connue qu&apos;après coup. L&apos;estimation
                  tient compte de la décote, mais ignore les réductions et crédits
                  d&apos;impôt : elle sert à
                  provisionner, pas à payer.
                </span>
                <BracketEditor />
              </div>
            </>
          ) : null}
        </div>
      </Card>
    </>
  );
}

/**
 * Saisie des tranches, une par ligne : « plafond ; taux ».
 *
 * Le barème est lu DANS L'ORDRE par le moteur : une ligne mal placée
 * ne produit pas une erreur, elle produit un impôt faux. Et deux
 * tranches sans plafond font que tout ce qui suit la première est
 * ignoré en silence. La saisie est donc remise en ordre, vérifiée, et
 * le barème réellement appliqué est réaffiché en toutes lettres.
 */
function BracketEditor() {
  const { settings, fiscal, updateSettings, notify } = useStore();
  const [erreur, setErreur] = useState<string | null>(null);

  const text = fiscal.brackets
    .map((b) => `${b.upToCents === null ? "" : b.upToCents / 100} ; ${b.rateBps / 100}`)
    .join("\n");

  function enregistrer(valeur: string) {
    const lues = valeur
      .split("\n")
      .map((line) => line.split(";").map((x) => x.trim()))
      .filter((parts) => parts.length === 2 && parts[1] !== "")
      .map(([limit, rate]) => ({
        upToCents: limit === "" ? null : Math.round(Number(limit.replace(",", ".")) * 100),
        rateBps: Math.round(Number(rate.replace(",", ".")) * 100),
      }))
      .filter(
        (b) => Number.isFinite(b.rateBps) && (b.upToCents === null || Number.isFinite(b.upToCents)),
      );

    if (lues.length === 0) {
      setErreur("Aucune tranche lisible. Format attendu : « 11497 ; 11 ».");
      return;
    }

    const sansPlafond = lues.filter((b) => b.upToCents === null);
    if (sansPlafond.length > 1) {
      setErreur(
        "Une seule tranche peut être sans plafond — c'est la dernière. Les autres seraient ignorées.",
      );
      return;
    }
    if (sansPlafond.length === 0) {
      setErreur("La dernière tranche doit être sans plafond : laisse son plafond vide.");
      return;
    }
    if (lues.some((b) => b.rateBps < 0 || b.rateBps > 10_000)) {
      setErreur("Un taux se situe entre 0 et 100 %.");
      return;
    }

    // Remises en ordre plutôt que refusées : l'ordre est une contrainte
    // du moteur, pas une intention de l'utilisateur.
    const triees = [...lues].sort((a, b) => {
      if (a.upToCents === null) return 1;
      if (b.upToCents === null) return -1;
      return a.upToCents - b.upToCents;
    });

    const plafonds = triees.filter((b) => b.upToCents !== null).map((b) => b.upToCents as number);
    if (new Set(plafonds).size !== plafonds.length) {
      setErreur("Deux tranches portent le même plafond.");
      return;
    }

    setErreur(null);
    void updateSettings({
      tax_brackets: triees,
      tax_brackets_year: settings.tax_brackets_year ?? "personnalisé",
    });
    notify({ tone: "good", message: "Barème enregistré." });
  }

  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-[11.5px]" style={{ color: "var(--text-muted)" }}>
        Modifier les tranches
      </summary>
      <textarea
        defaultValue={text}
        rows={5}
        spellCheck={false}
        className="tnum mt-2 w-full rounded-[var(--radius-sm)] px-2.5 py-2 font-mono text-[11.5px] outline-none"
        style={{ background: "var(--surface-1)", color: "var(--text-primary)" }}
        onBlur={(e) => enregistrer(e.target.value)}
      />
      <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
        Une ligne par tranche : plafond en euros, point-virgule, taux en %. Laisse le plafond vide
        sur la dernière ligne. Exemple : <code>11497 ; 11</code>
      </p>

      {erreur ? (
        <p className="mt-2 text-[11.5px]" style={{ color: "var(--critical)" }}>
          {erreur} Rien n&apos;a été enregistré.
        </p>
      ) : null}

      {/* Le barème réellement appliqué, relu depuis les réglages : la
          seule façon de voir qu'une saisie a bien été prise. */}
      <ul className="mt-2 flex flex-col gap-0.5">
        {fiscal.brackets.map((b, i) => {
          const bas = i === 0 ? 0 : (fiscal.brackets[i - 1].upToCents ?? 0);
          return (
            <li
              key={`${b.upToCents}-${b.rateBps}`}
              className="flex items-baseline justify-between gap-2 text-[11.5px]"
              style={{ color: "var(--text-secondary)" }}
            >
              <span className="tnum">
                {b.upToCents === null
                  ? `au-delà de ${money(bas)}`
                  : `de ${money(bas)} à ${money(b.upToCents)}`}
              </span>
              <span className="tnum font-medium" style={{ color: "var(--text-primary)" }}>
                {b.rateBps / 100} %
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
        Par part de quotient familial. L&apos;app en compte {fiscal.taxParts}.
      </p>
    </details>
  );
}
