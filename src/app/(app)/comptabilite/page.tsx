"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/components/store";
import { Card, Empty, Segmented, StatTile } from "@/components/ui/kit";
import { Icon } from "@/components/ui/icons";
import { RankedBars } from "@/components/charts/small";
import {
  CATEGORIES,
  type FiscalCategory,
  buildReport,
  cotisationBpsOn,
  thresholds,
} from "@/lib/fiscal";
import { money, percent } from "@/lib/format";
import { dayLabel, monthLabel, monthsOfYear, yearOf, currentMonth } from "@/lib/dates";

export default function ComptabilitePage() {
  const store = useStore();
  const { entries, streams, fiscal, month } = store;

  const [year, setYear] = useState(() => String(yearOf(month)));
  const [scope, setScope] = useState<"annee" | "mois">("annee");

  const months = useMemo(
    () => (scope === "mois" ? [month] : monthsOfYear(Number(year))),
    [scope, month, year],
  );

  const report = useMemo(
    () => buildReport(entries, streams, fiscal, months),
    [entries, streams, fiscal, months],
  );

  const alerts = useMemo(() => thresholds(report), [report]);
  const acre = report.acre;

  const years = useMemo(() => {
    const set = new Set<string>([String(yearOf(currentMonth()))]);
    for (const e of entries) if (e.received_on) set.add(e.received_on.slice(0, 4));
    return [...set].sort().reverse();
  }, [entries]);

  const hasData = report.caTotalCents > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[17px] font-semibold tracking-tight">Comptabilité</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            size="sm"
            label="Période"
            value={scope}
            onChange={setScope}
            options={[
              { value: "annee", label: `Année ${year}` },
              { value: "mois", label: monthLabel(month, "full") },
            ]}
          />
          {scope === "annee" && years.length > 1 ? (
            <Segmented
              size="sm"
              label="Année"
              value={year}
              onChange={setYear}
              options={years.map((y) => ({ value: y, label: y }))}
            />
          ) : null}
        </div>
      </div>

      {!hasData ? (
        <Card>
          <Empty
            title="Rien à comptabiliser sur cette période"
            detail="Seules les écritures marquées comme encaissées entrent dans la comptabilité — c'est la règle du régime micro."
          />
        </Card>
      ) : null}

      {/* ---- Ce qu'il faut provisionner -------------------------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Chiffre d'affaires"
          value={money(report.caTotalCents - report.areCents)}
          hint="Hors allocation chômage, qui n'est pas du chiffre d'affaires"
        />
        <StatTile
          label="À payer à l'URSSAF"
          value={money(report.urssafCents)}
          tone="warning"
          hint={
            acre && report.acreCoveredMonths === months.length
              ? `ACRE appliquée sur toute la période, jusqu'au ${dayLabel(acre.endsOn)}`
              : acre && report.acreCoveredMonths > 0
                ? `ACRE jusqu'au ${dayLabel(acre.endsOn)}, puis taux plein`
                : "Cotisations + formation professionnelle"
          }
        />
        <StatTile
          label="Revenu imposable"
          value={money(report.revenuImposableCents)}
          hint="Après abattements, allocation chômage comprise"
        />
        <StatTile
          label={report.impotCents === null ? "Versement libératoire" : "Impôt estimé"}
          value={money(report.impotCents ?? report.liberatoireCents)}
          tone={report.impotCents === 0 ? "good" : "neutral"}
          hint={
            report.impotCents === null
              ? "Payé avec les cotisations"
              : report.impotCents === 0
                ? "Sous la première tranche"
                : `Barème ${fiscal.bracketsYear}`
          }
        />
      </div>

      {/* ---- L'ARE, le point que tout le monde confond ---------------- */}
      {report.areCents > 0 ? (
        <Card title="Allocation chômage">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Figure label="Perçue sur la période" value={money(report.areCents)} />
              <Figure label="Cotisations URSSAF dues" value={money(0)} tone="good" />
            </div>
            <p className="max-w-[72ch] text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
              Elle n&apos;entre pas dans le chiffre d&apos;affaires et ne supporte aucune
              cotisation URSSAF — sur ce point tu avais raison. En revanche elle est{" "}
              <strong>intégralement imposable</strong>{" "}: elle se déclare en case 1AP de la 2042,
              avec les revenus de remplacement, jamais avec le chiffre d&apos;affaires. La
              CSG-CRDS que France Travail retient déjà à la source est une autre chose que
              l&apos;impôt. Elle est donc comptée ici dans le revenu imposable, et exclue de
              l&apos;assiette des cotisations.
            </p>
          </div>
        </Card>
      ) : null}

      {/* ---- Détail par catégorie -------------------------------------- */}
      <Card title="Par catégorie" padded={false}>
        {/* Sept colonnes ne tiennent pas sur un écran de téléphone : en
            dessous de 640 px, chaque catégorie devient une fiche. Un
            tableau qu'il faut faire défiler latéralement pour lire un
            montant n'est pas un tableau lisible. */}
        <ul className="sm:hidden">
          {report.byCategory.map((row, i) => {
            const spec = CATEGORIES[row.category];
            const last = months[months.length - 1];
            const bps = cotisationBpsOn(row.category, `${last}-28`, acre);
            return (
              <li
                key={row.category}
                className="flex flex-col gap-2 px-4 py-3"
                style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold">{spec.short}</span>
                  <span className="tnum text-[14px] font-semibold">{money(row.caCents)}</span>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                  {spec.cotise ? (
                    <>
                      <Line label={`Cotisations ${percent(bps / 10_000, 2)}`} value={money(row.cotisationsCents)} />
                      <Line label="Formation" value={money(row.cfpCents)} />
                    </>
                  ) : (
                    <Line label="Cotisations" value="aucune" />
                  )}
                  {spec.abattementBps > 0 ? (
                    <Line
                      label={`Abattement ${percent(spec.abattementBps / 10_000)}`}
                      value={`− ${money(row.abattementCents)}`}
                    />
                  ) : null}
                  <Line label="Base imposable" value={money(row.baseImposableCents)} strong />
                </dl>
              </li>
            );
          })}
          <li
            className="flex items-baseline justify-between gap-2 px-4 py-3"
            style={{ borderTop: "2px solid var(--border-strong)" }}
          >
            <span className="text-[13px] font-semibold">Total</span>
            <span className="flex flex-col items-end">
              <span className="tnum text-[14px] font-semibold">{money(report.caTotalCents)}</span>
              <span className="tnum text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                {money(report.urssafCents)}{" "}d&apos;URSSAF
              </span>
            </span>
          </li>
        </ul>

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <th className="px-4 py-2 text-left font-medium sm:px-5">Catégorie</th>
                <th className="px-3 py-2 text-right font-medium">CA encaissé</th>
                <th className="px-3 py-2 text-right font-medium">Taux</th>
                <th className="px-3 py-2 text-right font-medium">Cotisations</th>
                <th className="px-3 py-2 text-right font-medium">Formation</th>
                <th className="px-3 py-2 text-right font-medium">Abattement</th>
                <th className="px-4 py-2 text-right font-medium sm:px-5">Base imposable</th>
              </tr>
            </thead>
            <tbody>
              {report.byCategory.map((row) => {
                const spec = CATEGORIES[row.category];
                const last = months[months.length - 1];
                const bps = cotisationBpsOn(row.category, `${last}-28`, acre);
                return (
                  <tr key={row.category} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-2.5 font-medium sm:px-5">{spec.short}</td>
                    <td className="tnum px-3 py-2.5 text-right">{money(row.caCents)}</td>
                    <td className="tnum px-3 py-2.5 text-right" style={{ color: "var(--text-muted)" }}>
                      {spec.cotise ? percent(bps / 10_000, 2) : "—"}
                    </td>
                    <td className="tnum px-3 py-2.5 text-right">
                      {spec.cotise ? money(row.cotisationsCents) : "—"}
                    </td>
                    <td className="tnum px-3 py-2.5 text-right" style={{ color: "var(--text-muted)" }}>
                      {spec.cotise ? money(row.cfpCents) : "—"}
                    </td>
                    <td className="tnum px-3 py-2.5 text-right" style={{ color: "var(--text-muted)" }}>
                      {spec.abattementBps > 0 ? money(row.abattementCents) : "—"}
                    </td>
                    <td className="tnum px-4 py-2.5 text-right font-semibold sm:px-5">
                      {money(row.baseImposableCents)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2" style={{ borderColor: "var(--border-strong)" }}>
                <td className="px-4 py-2.5 font-semibold sm:px-5">Total</td>
                <td className="tnum px-3 py-2.5 text-right font-semibold">{money(report.caTotalCents)}</td>
                <td />
                <td className="tnum px-3 py-2.5 text-right font-semibold">{money(report.cotisationsCents)}</td>
                <td className="tnum px-3 py-2.5 text-right font-semibold">{money(report.cfpCents)}</td>
                <td />
                <td className="tnum px-4 py-2.5 text-right font-semibold sm:px-5">
                  {money(report.revenuImposableCents)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* ---- Ce qui reste vraiment -------------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Ce qui te reste">
          <RankedBars
            items={[
              {
                id: "net",
                label: "Net après URSSAF et impôt",
                value: report.netApresTouteChargeCents,
                color: "var(--series-3)",
              },
              {
                id: "urssaf",
                label: "URSSAF",
                value: report.urssafCents,
                color: "var(--series-2)",
              },
              ...(report.impotCents && report.impotCents > 0
                ? [
                    {
                      id: "impot",
                      label: "Impôt estimé",
                      value: report.impotCents,
                      color: "var(--series-8)",
                    },
                  ]
                : []),
            ]}
          />
          <p className="mt-3 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            Calculé sur l&apos;ensemble encaissé, allocation comprise. Le coût d&apos;achat des
            articles revendus n&apos;est pas déduit ici : en micro-entreprise, il n&apos;est
            jamais déductible — c&apos;est l&apos;abattement forfaitaire qui en tient lieu.
          </p>
        </Card>

        <Card title="Paramètres appliqués">
          <ul className="flex flex-col gap-2.5 text-[12.5px]">
            <Param
              label="ACRE"
              value={
                acre
                  ? `${percent(1 - acre.coefficient)} d'exonération jusqu'au ${dayLabel(acre.endsOn)}`
                  : "Non appliquée"
              }
              tone={acre ? "good" : "muted"}
            />
            <Param
              label="Début d'activité"
              value={fiscal.activityStart ? dayLabel(fiscal.activityStart) : "Non renseigné"}
              tone={fiscal.activityStart ? "normal" : "warning"}
            />
            <Param
              label="Impôt"
              value={
                fiscal.versementLiberatoire
                  ? "Versement libératoire"
                  : `Barème, ${fiscal.taxParts} part${fiscal.taxParts > 1 ? "s" : ""}`
              }
              tone="normal"
            />
            {!fiscal.versementLiberatoire ? (
              <Param label="Barème utilisé" value={fiscal.bracketsYear} tone="warning" />
            ) : null}
          </ul>
          <p className="mt-3 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            Tout se règle dans Réglages → Fiscalité.
          </p>
        </Card>
      </div>

      {/* ---- Seuils ---------------------------------------------------- */}
      {alerts.length > 0 ? (
        <Card title="Seuils">
          <ul className="flex flex-col gap-3">
            {alerts.map((a) => (
              <li key={`${a.category}-${a.kind}`} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[12.5px] font-medium">
                    <span
                      style={{
                        color:
                          a.tone === "critical"
                            ? "var(--critical)"
                            : a.tone === "warning"
                              ? "var(--warning)"
                              : "var(--text-muted)",
                      }}
                    >
                      <Icon.alert size={13} />
                    </span>
                    {a.label} — {CATEGORIES[a.category].short}
                  </span>
                  <span className="tnum text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {money(a.caCents)} sur {money(a.limitCents)} · {percent(a.ratio)}
                  </span>
                </div>
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full"
                  style={{ background: "var(--surface-2)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, a.ratio * 100)}%`,
                      background:
                        a.tone === "critical"
                          ? "var(--critical)"
                          : a.tone === "warning"
                            ? "var(--warning)"
                            : "var(--series-1)",
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 max-w-[72ch] text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            Le plafond du régime micro et le seuil de franchise en base de TVA sont deux choses
            différentes, et le second est bien plus bas : on le franchit largement avant
            l&apos;autre.
          </p>
        </Card>
      ) : null}

      <p className="px-1 pb-2 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
        Ces montants sont une estimation destinée à provisionner. Ils ne remplacent ni les appels
        de cotisations de l&apos;URSSAF, ni ta déclaration de revenus, ni l&apos;avis d&apos;un
        expert-comptable. Les taux sont vérifiables et modifiables dans les réglages.
      </p>
    </div>
  );
}

function Line({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt style={{ color: "var(--text-secondary)" }}>{label}</dt>
      <dd className={`tnum ${strong ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good";
}) {
  return (
    <div>
      <p className="text-[11.5px]" style={{ color: "var(--text-secondary)" }}>
        {label}
      </p>
      <p
        className="tnum mt-0.5 text-[18px] font-semibold"
        style={{ color: tone === "good" ? "var(--good)" : undefined }}
      >
        {value}
      </p>
    </div>
  );
}

function Param({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "normal" | "good" | "warning" | "muted";
}) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2">
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span
        className="font-medium"
        style={{
          color:
            tone === "good"
              ? "var(--good)"
              : tone === "warning"
                ? "var(--warning)"
                : tone === "muted"
                  ? "var(--text-muted)"
                  : "var(--text-primary)",
        }}
      >
        {value}
      </span>
    </li>
  );
}

export type { FiscalCategory };
