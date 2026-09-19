"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/components/store";
import { Card, Empty, Segmented, StatTile } from "@/components/ui/kit";
import { Icon } from "@/components/ui/icons";
import { Meter } from "@/components/charts/small";
import { Waterfall } from "@/components/charts/waterfall";
import { MonthlyUrssaf } from "@/components/charts/monthly-urssaf";
import { DeclarationUrssaf } from "@/components/declaration";
import {
  CATEGORIES,
  CATEGORY_COLOR,
  type FiscalCategory,
  acreStep,
  buildReport,
  cfeStatus,
  cotisationBpsOn,
  horsComptabilite,
  tauxMoyenImpositionBps,
  liberatoireComparison,
  monthlyBreakdown,
  taxReturnBoxes,
  thresholds,
} from "@/lib/fiscal";
import { money, moneyArrondi, percent } from "@/lib/format";
import {
  dayLabel,
  lastDayOf,
  monthLabel,
  monthsOfYear,
  yearOf,
  currentMonth,
  today,
  type MonthKey,
} from "@/lib/dates";

export default function ComptabilitePage() {
  const store = useStore();
  const { entries, streams, fiscal, month } = store;

  /**
   * L'année est DÉRIVÉE du mois, avec une surcharge explicite.
   *
   * Elle était figée au montage : choisir décembre 2025 dans l'en-tête
   * laissait la page sur 2026, et comme le sélecteur d'année se cache
   * tant qu'il n'y a qu'une seule année de données, la page restait
   * bloquée sur une année vide sans aucun moyen d'en sortir.
   */
  const [override, setOverride] = useState<{ year: string; from: MonthKey } | null>(null);
  const year = override && override.from === month ? override.year : String(yearOf(month));
  const setYear = (y: string) => setOverride({ year: y, from: month });

  /*
   * La page se lit sur DEUX horizons à la fois, et non sur l'un OU
   * l'autre. Un sélecteur « année / mois » obligeait à basculer pour
   * répondre à deux questions qu'on se pose ensemble : « combien ce
   * mois-ci » et « où j'en suis sur l'année ». Le mois vient de
   * l'en-tête, l'année l'accompagne partout.
   *
   * Certaines choses n'ont de sens qu'annuellement — le barème de
   * l'impôt, les abattements et leur plancher, les plafonds : elles
   * restent sur l'année et le disent.
   */
  const moisAnnee = useMemo(() => monthsOfYear(Number(year)), [year]);

  /** Le mois affiché en en-tête. */
  const report = useMemo(
    () => buildReport(entries, streams, fiscal, [month]),
    [entries, streams, fiscal, month],
  );

  /** L'année, cumulée jusqu'au dernier encaissement. */
  const reportAnnuel = useMemo(
    () => buildReport(entries, streams, fiscal, moisAnnee),
    [entries, streams, fiscal, moisAnnee],
  );

  /** L'année affichée est-elle encore en cours ? */
  const anneeEnCours = year === currentMonth().slice(0, 4);

  /*
   * Le tableau par catégorie est le seul endroit où l'on veut parfois
   * l'un OU l'autre : sept colonnes de chiffres mensuels et annuels
   * côte à côte ne tiendraient pas sur un téléphone. Il garde donc sa
   * propre bascule, locale à la carte.
   */
  const [detail, setDetail] = useState<"mois" | "annee">("mois");
  const detailReport = detail === "mois" ? report : reportAnnuel;
  // Le taux affiché est celui qui s'applique au dernier jour de la
  // fenêtre : c'est lui qu'on lira sur l'appel de cotisations.
  const detailDernierMois = detail === "mois" ? month : moisAnnee[moisAnnee.length - 1];

  const moisEcoules = useMemo(() => {
    const courant = currentMonth();
    if (year < courant.slice(0, 4)) return 12;
    if (year > courant.slice(0, 4)) return 0;
    return Number(courant.slice(5, 7));
  }, [year]);

  const alerts = useMemo(
    () => thresholds(reportAnnuel, { elapsedMonths: moisEcoules }),
    [reportAnnuel, moisEcoules],
  );

  /** Barème contre versement libératoire, sur l'année entière. */
  const options = useMemo(
    () => liberatoireComparison(reportAnnuel, fiscal),
    [reportAnnuel, fiscal],
  );

  /** Ce qui a été encaissé mais rangé hors comptabilité, sur l'année. */
  const hors = useMemo(
    () => horsComptabilite(entries, streams, moisAnnee),
    [entries, streams, moisAnnee],
  );

  const cfe = useMemo(
    () => cfeStatus(fiscal.activityStart, Number(year), reportAnnuel.caActivitesCents),
    [fiscal.activityStart, year, reportAnnuel.caActivitesCents],
  );
  // La déclaration de revenus porte sur l'année entière : elle se lit
  // sur le rapport annuel, jamais sur le mois affiché.
  const boxes = useMemo(() => taxReturnBoxes(reportAnnuel, fiscal), [reportAnnuel, fiscal]);
  const acre = report.acre;

  const monthly = useMemo(
    () => monthlyBreakdown(entries, streams, fiscal, moisAnnee),
    [entries, streams, fiscal, moisAnnee],
  );

  /*
   * L'impôt sur le revenu ne se paie qu'une fois l'année close, et il
   * est progressif : il n'existe pas d'« impôt du mois de septembre ».
   * Mais il part quand même, et appeler « net » ce dont on ne l'a pas
   * retiré fait croire à une somme disponible qui ne l'est pas. On
   * provisionne donc le mois au TAUX MOYEN de l'année — ce que ferait
   * n'importe quel comptable.
   */
  const tauxMoyenBps = useMemo(() => tauxMoyenImpositionBps(reportAnnuel), [reportAnnuel]);
  const impotProvisionneCents =
    tauxMoyenBps === null
      ? 0
      : Math.round((report.revenuImposableCents * tauxMoyenBps) / 10_000);
  const resteCents =
    report.caTotalCents - report.urssafCents - impotProvisionneCents;

  /** Ce que la fin de l'ACRE coûtera, en euros et sur un mois réel. */
  const marche = useMemo(() => acreStep(monthly, fiscal), [monthly, fiscal]);

  const monthlyRows = useMemo(
    () =>
      monthly.map((m) => ({
        month: m.month,
        totalCents: m.dueCents,
        underAcre: m.underAcre,
        segments: m.byCategory
          .filter((c) => c.dueCents > 0)
          .map((c) => ({
            id: c.category,
            label: CATEGORIES[c.category].short,
            color: CATEGORY_COLOR[c.category],
            cents: c.dueCents,
          })),
      })),
    [monthly],
  );

  /** Les activités dont la catégorie repose encore sur une déduction. */
  const aConfirmer = useMemo(
    () =>
      streams.filter(
        (st) =>
          !st.fiscal_confirmed &&
          CATEGORIES[(st.fiscal_category as FiscalCategory) ?? "hors"]?.cotise,
      ),
    [streams],
  );

  /** Part de l'année déjà écoulée sous ACRE, pour la jauge. */
  const acreProgress = useMemo(() => {
    if (!acre || !fiscal.activityStart) return null;
    const debut = Date.parse(`${fiscal.activityStart}T00:00:00`);
    const fin = Date.parse(`${acre.endsOn}T00:00:00`);
    // today() est en heure LOCALE ; toISOString donne la date UTC, donc
    // la veille entre minuit et 2 h du matin en France.
    const now = Date.parse(`${today()}T00:00:00`);
    if (fin <= debut) return null;
    return {
      ratio: Math.max(0, Math.min(1, (now - debut) / (fin - debut))),
      joursRestants: Math.max(0, Math.round((fin - now) / 86_400_000)),
    };
  }, [acre, fiscal.activityStart]);

  // L'année affichée fait toujours partie de la liste, même sans
  // aucune écriture : sinon le sélecteur ne permet pas de la quitter.
  const years = useMemo(() => {
    const set = new Set<string>([String(yearOf(currentMonth())), year]);
    for (const e of entries) if (e.received_on) set.add(e.received_on.slice(0, 4));
    return [...set].sort().reverse();
  }, [entries, year]);

  const hasData = report.caTotalCents > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[17px] font-semibold tracking-tight">Comptabilité</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
            {monthLabel(month, "full")} · cumul {year}
          </span>
          {years.length > 1 ? (
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

      {aConfirmer.length > 0 ? (
        <section
          className="card anim-rise flex flex-col gap-2 p-4"
          style={{ borderColor: "color-mix(in oklab, var(--warning) 45%, var(--border))" }}
        >
          <p className="flex items-center gap-1.5 text-[13px] font-semibold">
            <span style={{ color: "var(--warning)" }}>
              <Icon.alert size={15} />
            </span>
            Catégorie fiscale à confirmer
          </p>
          <p className="max-w-[72ch] text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
            Le taux appliqué à{" "}
            {aConfirmer.map((st, i) => (
              <span key={st.id}>
                {i > 0 ? (i === aConfirmer.length - 1 ? " et " : ", ") : ""}
                <strong>{st.name}</strong>{" "}(
                {CATEGORIES[st.fiscal_category as FiscalCategory].short})
              </span>
            ))}{" "}
            repose sur une déduction, pas sur un document. Vérifie-le sur ton attestation URSSAF
            ou ton avis de situation SIRENE : un taux trop bas se solde par un rappel de
            cotisations, un taux trop haut te fait payer pour rien.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {aConfirmer.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => void store.updateStream(st.id, { fiscal_confirmed: true })}
                className="rounded-full px-3 py-1.5 text-[12px] font-medium"
                style={{ background: "var(--surface-2)", color: "var(--text-primary)" }}
              >
                {st.name}{" "}: c&apos;est confirmé
              </button>
            ))}
          </div>
        </section>
      ) : null}

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
          label={`Chiffre d'affaires · ${monthLabel(month)}`}
          value={money(report.caActivitesCents)}
          hint={`${money(reportAnnuel.caActivitesCents)} depuis janvier`}
        />
        <StatTile
          label={`À payer à l'URSSAF · ${monthLabel(month)}`}
          value={money(report.urssafCents)}
          tone="warning"
          hint={
            acre && report.acreCoveredMonths > 0
              ? `${money(reportAnnuel.urssafCents)} sur l'année · ACRE jusqu'au ${dayLabel(acre.endsOn)}`
              : `${money(reportAnnuel.urssafCents)} sur l'année`
          }
        />
        {/* Les deux tuiles suivantes sont ANNUELLES, et le disent : le
            barème de l'impôt, les abattements et leur plancher de 305 €
            se calculent sur une année civile. Les montrer sur un mois
            donnerait un chiffre qui ne veut rien dire. */}
        <StatTile
          label={`Revenu imposable ${year}`}
          value={money(reportAnnuel.revenuImposableCents)}
          hint="Après abattements, allocation chômage comprise"
        />
        {/* `impotCents` vaut null pour DEUX raisons distinctes : le
            versement libératoire, et une période qui n'est pas une
            année entière. Les confondre annonçait « Versement
            libératoire » à quelqu'un au barème qui regardait un mois. */}
        {reportAnnuel.impotRaison === "liberatoire-total" ? (
          <StatTile
            label={`Versement libératoire ${year}`}
            value={money(reportAnnuel.liberatoireCents)}
            hint="Payé avec les cotisations"
          />
        ) : (
          <StatTile
            label={anneeEnCours ? `Impôt ${year} à date` : `Impôt ${year}`}
            value={money(reportAnnuel.impotCents ?? 0)}
            tone={reportAnnuel.impotCents === 0 ? "good" : "neutral"}
            /* Le barème s'applique à une ANNÉE. Sur l'année en cours,
               les mois qui restent ne sont pas encaissés : le chiffre
               n'est pas l'impôt de l'année, c'est celui qu'on devrait
               si l'année s'arrêtait aujourd'hui. Le dire évite de
               provisionner sur un montant qui ne fera que monter. */
            hint={
              anneeEnCours
                ? `Si l'année s'arrêtait aujourd'hui. Barème ${fiscal.bracketsYear}`
                : reportAnnuel.impotCents === 0
                  ? "Sous la première tranche, décote comprise"
                  : `Barème ${fiscal.bracketsYear}`
            }
          />
        )}
      </div>

      {hors.cents > 0 ? (
        <p
          className="max-w-[72ch] rounded-[var(--radius-sm)] px-3 py-2.5 text-[12px]"
          style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}
        >
          <strong>{money(hors.cents)}</strong>{" "}
          encaissés en {year} sont rangés <em>hors comptabilité</em> ({hors.count}{" "}
          {hors.count > 1 ? "écritures" : "écriture"}) : remboursements, virements internes,
          ventes d&apos;objets personnels. Ils n&apos;entrent dans aucun chiffre de cette page.
          Si l&apos;un d&apos;eux est en réalité du chiffre d&apos;affaires, change la
          catégorie fiscale de son activité dans Réglages.
        </p>
      ) : null}

      {/* ---- Ce qu'il faut recopier, et où --------------------------- */}
      <DeclarationUrssaf />

      {boxes.length > 0 ? (
        <Card title={`Ma déclaration de revenus ${year}`}>
          <p className="max-w-[72ch] pb-3 text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
            Ces cases attendent le chiffre d&apos;affaires <strong>BRUT encaissé</strong>.
            N&apos;en retire pas l&apos;abattement : l&apos;administration l&apos;applique
            elle-même. Reporter la base imposable calculée plus bas reviendrait à
            l&apos;appliquer deux fois.
          </p>
          <ul className="flex flex-col">
            {boxes.map((box, i) => (
              <li
                key={box.code}
                className="flex items-center gap-3 py-2.5"
                style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}
              >
                <span
                  className="tnum shrink-0 rounded-[var(--radius-sm)] px-2 py-1 text-[12.5px] font-semibold"
                  style={{ background: "var(--surface-2)", color: "var(--text-primary)" }}
                >
                  {box.code}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{box.label}</p>
                  <p className="truncate text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                    {box.form} · {box.hint}
                  </p>
                </div>
                <span className="tnum shrink-0 text-[15px] font-semibold">
                  {moneyArrondi(box.cents)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 max-w-[72ch] text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            Les numéros de case sont ceux du formulaire des dernières années ; vérifie-les sur
            celui de {year}. La case 1AP est préremplie par France Travail avec le{" "}
            <em>net imposable</em>, un peu plus élevé que ce qui arrive sur le compte : garde
            le montant prérempli.
          </p>
        </Card>
      ) : null}

      {/* ---- L'ARE, le point que tout le monde confond ---------------- */}
      {reportAnnuel.areCents > 0 ? (
        <Card title="Allocation chômage">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Figure
                label={`Perçue en ${monthLabel(month)}`}
                value={money(report.areCents)}
              />
              <Figure label="Cotisations URSSAF dues" value={money(0)} tone="good" />
              {/* L'abattement est ANNUEL — son minimum de 495 € ne joue
                  qu'une fois par an. Le montrer sur un mois donnerait un
                  chiffre qui ne se retrouvera sur aucune déclaration. */}
              <Figure
                label={`Perçue en ${year}`}
                value={money(reportAnnuel.areCents)}
              />
              <Figure
                label={`Au barème ${year}, après 10 %`}
                value={money(reportAnnuel.areCents - reportAnnuel.areAbattementCents)}
              />
            </div>
            <p className="max-w-[72ch] text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
              Elle n&apos;entre pas dans le chiffre d&apos;affaires et ne supporte aucune
              cotisation URSSAF — sur ce point tu avais raison. En revanche elle est{" "}
              <strong>imposable</strong>{" "}: elle se déclare en case 1AP de la 2042, avec les
              revenus de remplacement, jamais avec le chiffre d&apos;affaires. Elle y ouvre
              droit au <strong>même abattement de 10 %</strong>{" "}que les salaires, avec un
              minimum et un plafond — c&apos;est lui qui est retiré ci-dessus. La CSG-CRDS que
              France Travail retient déjà à la source est une autre chose que l&apos;impôt.
            </p>
            <p
              className="max-w-[72ch] rounded-[var(--radius-sm)] px-3 py-2.5 text-[12px]"
              style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}
            >
              <strong>Une nuance sur le montant.</strong>{" "}Le chiffre repris ici est celui que
              tu as saisi, c&apos;est-à-dire ce qui est arrivé sur ton compte. La déclaration de
              revenus, elle, retient le <em>net imposable</em>{" "}— l&apos;allocation brute
              diminuée de la seule CSG déductible — qui est un peu plus élevé. France Travail
              préremplit ce montant sur ta déclaration et l&apos;indique sur son attestation
              fiscale annuelle : c&apos;est celui-là qui fait foi. L&apos;estimation
              d&apos;impôt ci-dessus est donc légèrement optimiste sur cette part.
            </p>
          </div>
        </Card>
      ) : null}

      {/* ---- Cotisations mois par mois --------------------------------- */}
      {reportAnnuel.cotisationsCents > 0 ? (
        <Card
          title="Cotisations mois par mois"
          action={
            // Le repère n'apparaît que si la fin d'ACRE tombe dans la
            // période affichée : annoncer une légende sans repère à
            // l'écran ferait chercher quelque chose qui n'y est pas.
            acre && monthlyRows.some((r) => !r.underAcre) ? (
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Le repère marque la fin de l&apos;ACRE
              </span>
            ) : null
          }
        >
          <MonthlyUrssaf
            key={month}
            rows={monthlyRows}
            acreEndsOn={acre?.endsOn ?? null}
            selectedMonth={month}
            height={230}
          />
          {acre ? (
            <p className="mt-3 max-w-[72ch] text-[12px]" style={{ color: "var(--text-secondary)" }}>
              L&apos;ACRE court jusqu&apos;au {dayLabel(acre.endsOn)}. Au lendemain, les taux
              repassent au plein d&apos;un seul coup — il n&apos;y a pas de dégressivité.
              {marche ? (
                <>
                  {" "}
                  Concrètement : {monthLabel(marche.month, "full")}, {money(marche.caCents)}{" "}
                  encaissés, <strong>{money(marche.actuelCents)}</strong>{" "}
                  de cotisations. Le même mois après l&apos;ACRE coûterait{" "}
                  <strong>{money(marche.pleinCents)}</strong>, soit{" "}
                  {money(marche.ecartCents)} de plus.
                </>
              ) : null}
            </p>
          ) : null}
        </Card>
      ) : null}

      {/* ---- Détail par catégorie -------------------------------------- */}
      <Card
        title="Par catégorie"
        padded={false}
        action={
          <Segmented
            size="sm"
            label="Détail par catégorie"
            value={detail}
            onChange={setDetail}
            options={[
              { value: "mois", label: monthLabel(month) },
              { value: "annee", label: year },
            ]}
          />
        }
      >
        {/* Sept colonnes ne tiennent pas sur un écran de téléphone : en
            dessous de 640 px, chaque catégorie devient une fiche. Un
            tableau qu'il faut faire défiler latéralement pour lire un
            montant n'est pas un tableau lisible. */}
        <ul className="sm:hidden">
          {detailReport.byCategory.map((row, i) => {
            const spec = CATEGORIES[row.category];
            const last = detailDernierMois;
            const bps = cotisationBpsOn(row.category, lastDayOf(last), acre);
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
                  {/* L'allocation chômage a un abattement de 10 % que
                      `spec.abattementBps` ne porte pas : il vit dans les
                      réglages, avec son minimum et son plafond. On lit
                      donc la ligne, pas la catégorie. */}
                  {row.abattementCents > 0 ? (
                    <Line
                      label={
                        spec.abattementBps > 0
                          ? `Abattement ${percent(spec.abattementBps / 10_000)}`
                          : "Abattement 10 %"
                      }
                      value={`− ${money(row.abattementCents)}`}
                    />
                  ) : null}
                  <Line label="Base imposable" value={money(row.baseImposableCents)} strong />
                </dl>
              </li>
            );
          })}
          {/* Le total est la somme de la colonne, allocation comprise :
              il affichait le chiffre d'affaires hors allocation, si bien
              que les lignes visibles ne s'additionnaient pas à leur
              propre total. Le chiffre à déclarer a sa ligne, dessous. */}
          <li
            className="flex flex-col gap-1 px-4 py-3"
            style={{ borderTop: "2px solid var(--border-strong)" }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-semibold">Total encaissé</span>
              <span className="tnum text-[14px] font-semibold">
                {money(detailReport.caTotalCents)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                dont chiffre d&apos;affaires
              </span>
              <span className="tnum text-[12.5px]">{money(detailReport.caActivitesCents)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                dû à l&apos;URSSAF
              </span>
              <span className="tnum text-[12.5px]">{money(detailReport.urssafCents)}</span>
            </div>
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
              {detailReport.byCategory.map((row) => {
                const spec = CATEGORIES[row.category];
                const last = detailDernierMois;
                const bps = cotisationBpsOn(row.category, lastDayOf(last), acre);
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
                      {row.abattementCents > 0 ? money(row.abattementCents) : "—"}
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
                <td className="px-4 py-2.5 font-semibold sm:px-5">Total encaissé</td>
                {/* La somme de SA colonne, allocation comprise : le pied
                    affichait le chiffre d'affaires hors allocation, et la
                    colonne ne s'additionnait donc pas à l'œil. Le chiffre
                    à déclarer est sur la ligne suivante, nommé. */}
                <td className="tnum px-3 py-2.5 text-right font-semibold">
                  {money(detailReport.caTotalCents)}
                </td>
                <td />
                <td className="tnum px-3 py-2.5 text-right font-semibold">{money(detailReport.cotisationsCents)}</td>
                <td className="tnum px-3 py-2.5 text-right font-semibold">{money(detailReport.cfpCents)}</td>
                <td />
                {/* La somme de SA colonne, pas le revenu imposable du
                    foyer : celui-ci ajoute les autres revenus et retire
                    l'abattement de l'allocation, dont aucune cellule
                    au-dessus ne parle. Il a sa tuile en haut de page. */}
                <td className="tnum px-4 py-2.5 text-right font-semibold sm:px-5">
                  {money(
                    detailReport.byCategory.reduce((a, r) => a + r.baseImposableCents, 0),
                  )}
                </td>
              </tr>
              <tr style={{ color: "var(--text-secondary)" }}>
                <td className="px-4 py-2 sm:px-5">dont chiffre d&apos;affaires</td>
                <td className="tnum px-3 py-2 text-right font-medium">
                  {money(detailReport.caActivitesCents)}
                </td>
                <td colSpan={5} className="px-3 py-2 text-[11.5px]">
                  l&apos;allocation chômage n&apos;est pas du chiffre d&apos;affaires : c&apos;est
                  ce montant-là qui se déclare à l&apos;URSSAF
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* ---- Ce qui reste vraiment -------------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Ce qu'il te reste · ${monthLabel(month, "full")}`}>
          <Waterfall
            steps={[
              {
                id: "ca",
                // L'allocation est incluse ici alors qu'elle est exclue de
                // la tuile « chiffre d'affaires » : deux totaux différents
                // à l'écran doivent porter deux noms différents.
                label: "Encaissé",
                deltaCents: report.caTotalCents,
                total: true,
              },
              { id: "cot", label: "Cotisations", deltaCents: -report.cotisationsCents },
              { id: "cfp", label: "Formation", deltaCents: -report.cfpCents },
              ...(report.liberatoireCents > 0
                ? [{ id: "vl", label: "Libératoire", deltaCents: -report.liberatoireCents }]
                : []),
              // L'impôt provisionné, au taux moyen de l'année. La barre
              // n'apparaît que s'il y a quelque chose à provisionner :
              // sous la première tranche, elle n'aurait rien à montrer.
              ...(impotProvisionneCents > 0
                ? [{ id: "ir", label: "Impôt", deltaCents: -impotProvisionneCents }]
                : []),
              {
                id: "reste",
                label: "Reste",
                deltaCents: resteCents,
                total: true,
              },
            ]}
          />
          <p className="mt-3 max-w-[72ch] text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            Calculé sur l&apos;ensemble encaissé du mois, allocation comprise.{" "}
            {tauxMoyenBps !== null ? (
              <>
                L&apos;impôt sur le revenu ne se paie qu&apos;après la clôture de
                l&apos;année : ce qui est retiré ici est une <strong>provision</strong>, le
                mois passé au taux moyen de {percent(tauxMoyenBps / 10_000, 1)} — pas un
                montant dû. Sur {year}, il resterait{" "}
                <strong>{money(reportAnnuel.netApresTouteChargeCents)}</strong> une fois tout
                retiré.
              </>
            ) : (
              <>
                Rien n&apos;est retiré au titre de l&apos;impôt sur le revenu : au rythme de{" "}
                {year}, l&apos;estimation annuelle est nulle. Le jour où elle ne le sera plus,
                une barre de provision apparaîtra ici.
              </>
            )}{" "}
            Le coût d&apos;achat des articles revendus n&apos;est jamais déduit : en
            micro-entreprise, c&apos;est l&apos;abattement forfaitaire qui en tient lieu.
          </p>
        </Card>

        <Card title="Paramètres appliqués">
          {acre && acreProgress ? (
            <div className="mb-4 flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12px] font-medium">Période d&apos;ACRE</span>
                <span className="tnum text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  {acreProgress.joursRestants > 0
                    ? `${acreProgress.joursRestants} jours restants`
                    : "terminée"}
                </span>
              </div>
              <Meter
                ratio={acreProgress.ratio}
                tone={acreProgress.joursRestants < 60 ? "warning" : "accent"}
              />
              <div
                className="flex justify-between text-[11px]"
                style={{ color: "var(--text-muted)" }}
              >
                <span>{fiscal.activityStart ? dayLabel(fiscal.activityStart) : ""}</span>
                <span>{dayLabel(acre.endsOn)}</span>
              </div>
            </div>
          ) : null}
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

      {/* ---- Les deux options fiscales, chiffrées --------------------- */}
      {options && reportAnnuel.caActivitesCents > 0 ? (
        <Card title="Barème ou versement libératoire ?">
          <div className="grid grid-cols-2 gap-3">
            <Figure
              label="Au barème"
              value={money(options.baremeCents)}
              tone={options.meilleur === "bareme" ? "good" : undefined}
            />
            <Figure
              label="Au versement libératoire"
              value={money(options.liberatoireCents)}
              tone={options.meilleur === "liberatoire" ? "good" : undefined}
            />
          </div>
          <p className="mt-3 max-w-[72ch] text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
            {options.meilleur === "egal" ? (
              <>Les deux régimes reviennent au même sur {year}.</>
            ) : (
              <>
                Sur {year}, <strong>{options.meilleur === "bareme" ? "le barème" : "le versement libératoire"}</strong>{" "}
                te coûte <strong>{money(Math.abs(options.ecartCents))}</strong> de moins.
              </>
            )}{" "}
            Dans les deux cas l&apos;allocation chômage reste imposée au barème : le versement
            libératoire ne libère que le chiffre d&apos;affaires. L&apos;option se demande à
            l&apos;URSSAF avant le 30 septembre pour l&apos;année suivante, et suppose un revenu
            fiscal de référence N−2 sous plafond — la première année d&apos;activité, il est
            souvent nul, donc la condition est remplie.
          </p>
        </Card>
      ) : null}

      {/* ---- La CFE, que personne ne voit venir ---------------------- */}
      {cfe ? (
        <Card title="Cotisation foncière des entreprises (CFE)">
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[13px] font-medium">
                {cfe.exonere ? `Rien à payer en ${cfe.year}` : `À payer avant le 15 décembre ${cfe.year}`}
              </span>
              <span
                className="rounded-full px-2.5 py-1 text-[11.5px] font-medium"
                style={{
                  background: "var(--surface-2)",
                  color: cfe.exonere ? "var(--good)" : "var(--warning)",
                }}
              >
                {cfe.raison === "premiere-annee"
                  ? "Exonérée — première année"
                  : cfe.raison === "ca-faible"
                    ? "Exonérée — chiffre d'affaires sous 5 000 €"
                    : "Due"}
              </span>
            </div>
            <p className="max-w-[72ch] text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
              La CFE n&apos;est ni une cotisation URSSAF ni de l&apos;impôt sur le revenu : elle
              n&apos;apparaît nulle part ailleurs dans cette page, et se règle séparément sur
              impots.gouv.fr, dans l&apos;espace professionnel.{" "}
              {cfe.raison === "premiere-annee" ? (
                <>
                  L&apos;année de création en est exonérée — ta première CFE tombera donc le{" "}
                  <strong>15 décembre {cfe.premiereAnneeDue}</strong>, et elle portera sur le
                  chiffre d&apos;affaires de {cfe.year}.
                </>
              ) : null}{" "}
              Son montant dépend de la commune : l&apos;app ne peut pas le calculer. Compte
              quelques centaines d&apos;euros pour une base minimum, et crée ton espace
              professionnel avant décembre — l&apos;avis n&apos;arrive que par là, aucun courrier
              n&apos;est envoyé.
            </p>
          </div>
        </Card>
      ) : null}

      {/* ---- Seuils ---------------------------------------------------- */}
      {alerts.length > 0 ? (
        <Card title="Seuils">
          <ul className="flex flex-col gap-3">
            {alerts.map((a) => (
              <li key={a.id} className="flex flex-col gap-1">
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
                    {a.label} — {a.scope}
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
                <p className="max-w-[72ch] text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                  {a.projectedCents !== null && a.ratio < 1 ? (
                    <>
                      Au rythme de l&apos;année, tu finirais à{" "}
                      <strong>{money(a.projectedCents)}</strong>.{" "}
                    </>
                  ) : null}
                  {a.note}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-3 max-w-[72ch] text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            Les seuils sont annuels : ils sont toujours mesurés sur l&apos;année {year}{" "}
            entière, même quand la page est cadrée sur un mois. La projection suppose que le
            rythme des mois écoulés se prolonge — elle sert à voir venir, pas à prédire.
          </p>
        </Card>
      ) : null}

      <p className="px-1 pb-2 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
        Ces montants sont une estimation destinée à provisionner. Ils ne remplacent ni les appels
        de cotisations de l&apos;URSSAF, ni ta déclaration de revenus, ni l&apos;avis d&apos;un
        expert-comptable. Les taux de cotisations, abattements et plafonds sont ceux de 2026 ;
        ils sont revalorisés chaque année. Le barème de l&apos;impôt, la décote et
        l&apos;abattement de 10 % se modifient dans les réglages ; les taux de cotisations, eux,
        sont écrits dans le code — s&apos;ils changent, c&apos;est l&apos;app qu&apos;il faut
        mettre à jour.
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
