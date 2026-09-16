"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/components/store";
import { Card, Segmented, StatTile } from "@/components/ui/kit";
import { Trend } from "@/components/charts/trend";
import { StackedMonths } from "@/components/charts/stacked-months";
import { Heatmap, RankedBars } from "@/components/charts/small";
import { basisComparison, bucketFor, yearProjection } from "@/lib/analytics";
import { money, percent } from "@/lib/format";
import {
  monthLabel,
  monthRange,
  monthsOfYear,
  yearOf,
  currentMonth,
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

  const months = useMemo(
    () => monthRange(currentMonth(), Number(windowSize)),
    [windowSize],
  );

  const window = useMemo(() => months.map((m) => bucketFor(buckets, m)), [months, buckets]);

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

  const cumulative = useMemo(() => {
    const build = (y: number) => {
      let running = 0;
      return monthsOfYear(y).map((m) => {
        running += bucketFor(buckets, m).net;
        return running;
      });
    };
    return { current: build(year), previous: build(year - 1) };
  }, [buckets, year]);

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const e of entries) {
      set.add(yearOf(e.occurred_on));
      if (e.received_on) set.add(yearOf(e.received_on));
    }
    set.add(yearOf(currentMonth()));
    return [...set].sort((a, b) => b - a).slice(0, 5);
  }, [entries]);

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
  const windowAverage = window.length ? Math.round(windowTotal / window.length) : 0;

  /* --- Régularité : l'écart-type rapporté à la moyenne ---------------- */
  const volatility = useMemo(() => {
    const active = window.filter((b) => b.count > 0).map((b) => b.net);
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
          label={`Total ${windowSize} mois`}
          value={money(windowTotal)}
          hint={`${money(windowAverage)} par mois en moyenne`}
        />
        <StatTile
          label={`Cumul ${year}`}
          value={money(projection.earned)}
          hint={
            projection.monthsLeft > 0
              ? `${projection.monthsLeft} mois restants`
              : "Année complète"
          }
        />
        <StatTile
          label={`Projection fin ${year}`}
          value={money(projection.projected)}
          hint={
            projection.runRate > 0
              ? `au rythme de ${money(projection.runRate)} / mois`
              : "Pas encore de rythme mesurable"
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
      <Card title={`Cumul ${year} face à ${year - 1}`}>
        <Trend
          months={monthsOfYear(year)}
          series={[
            {
              id: "cur",
              label: `${year}`,
              color: "var(--series-1)",
              values: cumulative.current,
            },
            {
              id: "prev",
              label: `${year - 1}`,
              color: "var(--series-5)",
              values: cumulative.previous,
            },
          ]}
          height={220}
        />
      </Card>

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

      {/* ---- Saisonnalité ---------------------------------------------- */}
      <Card
        title="Saisonnalité"
        action={
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Clic sur une case pour cadrer ce mois
          </span>
        }
      >
        <Heatmap
          years={years}
          valueAt={(m) => bucketFor(buckets, m).net}
          onSelect={setMonth}
        />
      </Card>
    </div>
  );
}
