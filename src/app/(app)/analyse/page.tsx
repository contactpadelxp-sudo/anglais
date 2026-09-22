"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/components/store";
import { Card, Segmented, StatTile } from "@/components/ui/kit";
import { Trend } from "@/components/charts/trend";
import { StackedMonths } from "@/components/charts/stacked-months";
import { RankedBars } from "@/components/charts/small";
import {
  basisComparison,
  bucketFor,
  momentum,
  movingAverage,
  revenueMix,
  streamColor,
  streamTrends,
  yearProjection,
} from "@/lib/analytics";
import { money, percent, plural, signedPercent } from "@/lib/format";
import {
  monthLabel,
  monthRange,
  yearOf,
  currentMonth,
  monthsBetween,
  type MonthKey,
} from "@/lib/dates";

const WINDOWS = [
  { value: "6", label: "6 mois" },
  { value: "12", label: "12 mois" },
  { value: "24", label: "24 mois" },
] as const;

export default function AnalysePage() {
  const store = useStore();
  const { entries, activeStreams, buckets, month, setMonth } = store;
  const [windowSize, setWindowSize] = useState<"6" | "12" | "24">("12");

  /** Le premier mois qui porte quelque chose. Rien avant n'existe. */
  const premierMois = useMemo(() => {
    let plusAncien: MonthKey | null = null;
    for (const b of buckets.values()) {
      if (b.count === 0) continue;
      if (plusAncien === null || b.month < plusAncien) plusAncien = b.month;
    }
    return plusAncien;
  }, [buckets]);

  /**
   * La fenêtre est ancrée sur le mois courant, mais s'étire jusqu'au
   * mois cadré s'il est plus ancien : choisir mars dans l'en-tête et
   * lire une fenêtre qui commence en juin ne montrerait pas le mois
   * qu'on vient de désigner.
   *
   * Elle est surtout COUPÉE au premier mois qui porte quelque chose.
   * Demander douze mois avec cinq mois d'histoire ajoutait sept mois à
   * zéro devant : la courbe partait à plat, et « la première moitié de
   * la fenêtre » — celle à laquelle on compare la seconde — était vide,
   * si bien que chaque activité était déclarée « nouvelle ».
   */
  const months = useMemo(() => {
    const now = currentMonth();
    const asked = Number(windowSize);
    const span = monthsBetween(month, now) + 1;
    const plage = monthRange(now, Math.max(asked, Math.min(span, 60)));
    return premierMois ? plage.filter((m) => m >= premierMois) : plage;
  }, [windowSize, month, premierMois]);

  const window = useMemo(() => months.map((m) => bucketFor(buckets, m)), [months, buckets]);

  /** Le rythme récent contre celui d'avant : la question du moyen terme. */
  const rythme = useMemo(() => momentum(buckets, 3), [buckets]);

  /** La part du revenu qui tombe sans rien avoir à revendre. */
  const mix = useMemo(() => revenueMix(window, activeStreams), [window, activeStreams]);

  /** Où va chaque activité, et pas seulement combien elle a rapporté. */
  const trajectoires = useMemo(
    () => streamTrends(window, activeStreams),
    [window, activeStreams],
  );

  /** La courbe des mois, lissée sur trois mois. */
  const lissage = useMemo(
    () => movingAverage(window.map((b) => b.net), 3, true),
    [window],
  );

  /* --- Encaissé vs comptabilisé : le décalage, chiffré --------------- */
  const gaps = useMemo(() => basisComparison(entries, months), [entries, months]);
  const totalGap = useMemo(
    () => gaps.reduce((s, g) => s + Math.abs(g.gap), 0),
    [gaps],
  );
  const biggestGap = useMemo(
    () => gaps.reduce((a, b) => (Math.abs(b.gap) > Math.abs(a.gap) ? b : a), gaps[0]),
    [gaps],
  );

  /* --- Année ---------------------------------------------------------- */
  const year = yearOf(month);
  const projection = useMemo(() => yearProjection(buckets, year), [buckets, year]);

  /* --- Classement des mois -------------------------------------------- */
  const bestMonths = useMemo(
    () =>
      [...buckets.values()]
        .filter((b) => b.net > 0)
        .sort((a, b) => b.net - a.net)
        .slice(0, 6)
        .map((b) => ({
          id: b.month,
          label: monthLabel(b.month, "full"),
          value: b.net,
          color: "var(--series-1)",
        })),
    [buckets],
  );

  /* --- Contribution par activité sur la fenêtre ----------------------- */
  const contributions = useMemo(() => {
    const totals = activeStreams.map((s) => ({
      id: s.id,
      label: s.name,
      value: window.reduce((sum, b) => sum + (b.byStream[s.id]?.net ?? 0), 0),
      color: `var(--series-${s.color_slot})`,
    }));
    return totals.filter((t) => t.value !== 0).sort((a, b) => b.value - a.value);
  }, [activeStreams, window]);

  const windowTotal = window.reduce((s, b) => s + b.net, 0);

  /*
   * La moyenne porte sur les mois RENSEIGNÉS, pas sur la largeur de la
   * fenêtre. Diviser par douze quand huit mois seulement portent des
   * revenus compte les mois d'avant l'immatriculation comme des mois à
   * zéro et rabaisse la moyenne d'un tiers.
   */
  const filledMonths = useMemo(() => window.filter((b) => b.count > 0), [window]);
  const windowAverage = filledMonths.length
    ? Math.round(filledMonths.reduce((s, b) => s + b.net, 0) / filledMonths.length)
    : 0;

  /* --- Régularité : l'écart-type rapporté à la moyenne ----------------
     Le mois EN COURS est écarté : vu au tiers, il tire mécaniquement la
     dispersion vers le haut et fait basculer la tuile de « stable » à
     « irrégulier » sans que rien n'ait changé. */
  const volatility = useMemo(() => {
    const active = window
      .filter((b) => b.count > 0 && b.month < currentMonth())
      .map((b) => b.net);
    if (active.length < 3) return null;
    const mean = active.reduce((s, v) => s + v, 0) / active.length;
    if (mean === 0) return null;
    const variance = active.reduce((s, v) => s + (v - mean) ** 2, 0) / active.length;
    return Math.sqrt(variance) / Math.abs(mean);
  }, [window]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[17px] font-semibold tracking-tight">Analyse</h1>
        <Segmented
          size="sm"
          label="Fenêtre"
          value={windowSize}
          onChange={setWindowSize}
          options={[...WINDOWS]}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          /* La fenêtre demandée n'est pas la fenêtre RENSEIGNÉE :
             « Total 24 mois » sur huit mois d'historique promet seize
             mois de données qui n'existent pas. */
          label={
            filledMonths.length < Number(windowSize)
              ? `Total ${filledMonths.length} mois`
              : `Total ${windowSize} mois`
          }
          value={money(windowTotal)}
          hint={`${money(windowAverage)} par mois sur ${plural(
            filledMonths.length,
            "mois renseigné",
            "mois renseignés",
          )}`}
        />
        <StatTile
          /* Le tableau de bord arrête son cumul au mois AFFICHÉ, celui-ci
             va jusqu'à aujourd'hui : deux nombres différents sous le même
             nom. Chacun dit désormais où il s'arrête. */
          label={`Cumul ${year} à ce jour`}
          value={money(projection.earned)}
          hint={
            projection.monthsLeft > 0
              ? `${projection.monthsLeft} mois restants`
              : "Année complète"
          }
        />
        {/* Le rythme récent contre celui d'avant : c'est la seule tuile
            qui dit un SENS, pas un niveau. Les trois autres disent où
            l'on est ; celle-ci dit où l'on va. */}
        <StatTile
          label="Rythme"
          value={rythme ? money(rythme.recentCents) : "—"}
          tone={
            !rythme || rythme.change.ratio === null
              ? "neutral"
              : rythme.change.ratio > 0.05
                ? "good"
                : rythme.change.ratio < -0.05
                  ? "warning"
                  : "neutral"
          }
          hint={
            !rythme
              ? "Deux mois terminés suffiront"
              : rythme.change.ratio === null
                ? `Moyenne des ${rythme.months} derniers mois terminés`
                : `${signedPercent(rythme.change.ratio)} contre les ${rythme.months} mois d'avant`
          }
        />
        <StatTile
          label="Régularité"
          value={volatility === null ? "—" : volatility < 0.3 ? "Stable" : volatility < 0.6 ? "Variable" : "Irrégulier"}
          tone={volatility === null ? "neutral" : volatility < 0.3 ? "good" : volatility < 0.6 ? "neutral" : "warning"}
          hint={
            volatility === null
              ? "Trois mois de données suffiront"
              : `Écart de ${percent(volatility)} autour de la moyenne`
          }
        />
      </div>

      {/* ---- Le rythme, lissé ----------------------------------------- */}
      <Card title="Le rythme, mois après mois">
        <Trend
          months={months}
          series={[
            {
              id: "net",
              label: "Chaque mois",
              color: "var(--series-1)",
              values: window.map((b) => b.net),
            },
            {
              id: "lisse",
              label: "Moyenne 3 mois",
              color: "var(--series-6)",
              values: lissage,
            },
          ]}
          height={230}
        />
        <p className="mt-3 max-w-[72ch] text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
          {rythme ? (
            <>
              Les {rythme.months} derniers mois terminés rapportent{" "}
              <strong>{money(rythme.recentCents)}</strong> par mois en moyenne, contre{" "}
              {money(rythme.previousCents)} sur les {rythme.months}{" "}
              mois d&apos;avant
              {rythme.change.ratio !== null ? (
                <>
                  {" "}
                  — <strong>{signedPercent(rythme.change.ratio)}</strong>
                </>
              ) : null}
              .{" "}
            </>
          ) : null}
          La courbe lissée écrase les à-coups : au début de la fenêtre elle porte sur moins de
          trois mois, faute de recul.
        </p>
      </Card>

      {/* ---- Où va chaque activité ------------------------------------- */}
      {trajectoires.length > 0 ? (
        <Card title="Où va chaque activité">
          <ul className="flex flex-col">
            {trajectoires.map((t, i) => (
              <li
                key={t.stream.id}
                className="flex flex-col gap-1.5 py-3"
                style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="flex items-center gap-2 text-[13.5px] font-medium">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: streamColor(t.stream.color_slot) }}
                    />
                    {t.stream.name}
                    {t.recurring ? (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10.5px] font-medium"
                        style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                      >
                        récurrent
                      </span>
                    ) : null}
                  </span>
                  <span className="tnum text-[13.5px] font-semibold">{money(t.totalCents)}</span>
                </div>
                <div
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11.5px]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <span>{percent(t.share)} de la période</span>
                  <span>
                    {money(t.earlyCents)} → <span className="font-medium">{money(t.lateCents)}</span>{" "}
                    par mois
                  </span>
                  <span
                    className="font-medium"
                    style={{
                      color:
                        t.change.ratio === null
                          ? "var(--text-muted)"
                          : t.change.ratio > 0.05
                            ? "var(--good)"
                            : t.change.ratio < -0.05
                              ? "var(--critical)"
                              : "var(--text-muted)",
                    }}
                  >
                    {t.change.ratio === null
                      ? t.earlyCents === 0
                        ? "nouvelle"
                        : "—"
                      : signedPercent(t.change.ratio)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 max-w-[72ch] text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            La seconde moitié de la fenêtre comparée à la première, en moyenne par mois. Un
            total seul ne dit pas si une activité monte ou s&apos;éteint — et c&apos;est
            précisément ce qu&apos;on veut savoir quand on en mène plusieurs de front.
          </p>
        </Card>
      ) : null}

      {/* ---- Ce qui tombe tout seul ------------------------------------ */}
      {mix.recurringShare !== null ? (
        <Card title="Récurrent contre ponctuel">
          <div className="grid grid-cols-2 gap-3 pb-3">
            <div>
              <p className="text-[11.5px]" style={{ color: "var(--text-secondary)" }}>
                Récurrent
              </p>
              <p className="tnum mt-0.5 text-[18px] font-semibold">
                {money(mix.recurringCents)}
              </p>
            </div>
            <div>
              <p className="text-[11.5px]" style={{ color: "var(--text-secondary)" }}>
                Ponctuel
              </p>
              <p className="tnum mt-0.5 text-[18px] font-semibold">{money(mix.oneOffCents)}</p>
            </div>
          </div>
          <div
            className="flex h-3 w-full overflow-hidden rounded-full"
            style={{ background: "var(--surface-2)" }}
          >
            <div
              style={{
                width: `${Math.max(0, Math.min(100, mix.recurringShare * 100))}%`,
                background: "var(--series-5)",
              }}
            />
            <div className="flex-1" style={{ background: "var(--series-2)" }} />
          </div>
          <p className="mt-3 max-w-[72ch] text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
            <strong>{percent(mix.recurringShare)}</strong>{" "}
            de tes revenus tombent sans que tu aies à revendre ou à refacturer quoi que ce soit — abonnements et allocations. Le
            reste se regagne chaque mois. C&apos;est la seule part qui se projette sans pari.
          </p>
        </Card>
      ) : null}

      {/* ---- Le décalage vente / encaissement -------------------------
          Tant que chaque montant est saisi comme déjà encaissé, les deux
          courbes se superposent exactement. Les tracer quand même
          donnerait un graphique qui n'apprend rien : on n'affiche alors
          qu'une ligne d'explication, et le graphique apparaît le jour
          où le décalage existe réellement. */}
      {store.hasTimingGap ? (
      <Card
        title="Encaissé face à comptabilisé"
        action={
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            L&apos;écart = ce qui change de mois
          </span>
        }
      >
        <p className="mb-4 max-w-[64ch] text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
          La courbe <strong>Encaissé</strong>{" "}place l&apos;argent au jour où il arrive sur le
          compte. La courbe <strong>Comptabilisé</strong>{" "}le place au jour de la vente. Quand
          les deux se séparent, c&apos;est qu&apos;un mois a vendu sans encaisser — ou
          l&apos;inverse.
        </p>
        <Trend
          months={months}
          series={[
            {
              id: "cash",
              label: "Encaissé",
              color: "var(--series-1)",
              values: gaps.map((g) => g.cash),
            },
            {
              id: "accrual",
              label: "Comptabilisé",
              color: "var(--series-2)",
              values: gaps.map((g) => g.accrual),
            },
          ]}
          height={230}
        />
        {totalGap > 0 && biggestGap ? (
          <p className="mt-3 text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
            Écart cumulé de <strong>{money(totalGap)}</strong>{" "}sur la période. Le mois le plus
            décalé est <strong>{monthLabel(biggestGap.month, "full")}</strong>{" "}:{" "}
            {money(biggestGap.cash)} encaissés pour {money(biggestGap.accrual)} vendus, soit{" "}
            {money(Math.abs(biggestGap.gap))}{" "}
            {biggestGap.gap > 0 ? "venus des mois précédents" : "qui glissent sur le mois suivant"}.
          </p>
        ) : null}
      </Card>
      ) : (
        <Card title="Encaissé face à comptabilisé">
          <p className="max-w-[72ch] text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
            Chaque montant saisi est déjà encaissé, donc la date de vente et la date
            d&apos;encaissement se confondent : il n&apos;y a rien à comparer. Le jour où des
            ventes seront enregistrées avant leur versement — un client web facturé à 30 jours,
            ou l&apos;import automatique des ventes Vinted — cette carte tracera l&apos;écart
            entre les deux lectures du même mois.
          </p>
        </Card>
      )}

      {/* ---- Cumul annuel --------------------------------------------- */}
      {/* ---- Empilé + contributions ------------------------------------ */}
      <Card title={`Par activité — ${windowSize} mois`}>
        <StackedMonths
          data={window}
          streams={activeStreams}
          metric="net"
          selected={month}
          onSelect={setMonth}
          height={250}
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Contribution par activité — ${windowSize} mois`}>
          {contributions.length > 0 ? (
            <RankedBars items={contributions} />
          ) : (
            <p className="py-6 text-center text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              Rien sur la période.
            </p>
          )}
        </Card>

        <Card title="Meilleurs mois">
          {bestMonths.length > 0 ? (
            <RankedBars items={bestMonths} onSelect={(id) => setMonth(id as MonthKey)} />
          ) : (
            <p className="py-6 text-center text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              Pas encore assez d&apos;historique.
            </p>
          )}
        </Card>
      </div>

    </div>
  );
}
