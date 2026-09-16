"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useStore } from "@/components/store";
import { Card, Delta, Empty, Hero, StatTile, Button } from "@/components/ui/kit";
import { Icon } from "@/components/ui/icons";
import { StackedMonths } from "@/components/charts/stacked-months";
import { Donut } from "@/components/charts/donut";
import { Meter, RankedBars } from "@/components/charts/small";
import { InsightList } from "@/components/insight-list";
import { PendingPanel } from "@/components/pending-panel";
import { GoalEditor } from "@/components/goal-editor";
import { money, percent, plural } from "@/lib/format";
import { monthLabel, currentMonth } from "@/lib/dates";
import { projectMonth } from "@/lib/analytics";

export default function Dashboard() {
  const store = useStore();
  const { bucket, overview, last12, activeStreams, month, setMonth, basis, pending, goal } = store;
  const [focus, setFocus] = useState<string | null>(null);

  const isCurrentMonth = month === currentMonth();

  /** Ce qui est déjà vendu et dont le versement est prévu ce mois-ci. */
  const securedThisMonth = useMemo(
    () => pending.upcomingByMonth.find((u) => u.month === month)?.amount ?? 0,
    [pending.upcomingByMonth, month],
  );

  const projection = useMemo(
    () => (isCurrentMonth ? projectMonth(bucket, month, securedThisMonth) : null),
    [bucket, month, securedThisMonth, isCurrentMonth],
  );

  const slices = useMemo(
    () =>
      activeStreams
        .map((s) => ({
          id: s.id,
          label: s.name,
          value: bucket.byStream[s.id]?.net ?? 0,
          color: `var(--series-${s.color_slot})`,
        }))
        .filter((s) => s.value > 0)
        .sort((a, b) => b.value - a.value),
    [activeStreams, bucket],
  );

  const ranked = useMemo(
    () =>
      activeStreams
        .map((s) => {
          const t = bucket.byStream[s.id];
          return {
            id: s.id,
            label: s.name,
            value: t?.net ?? 0,
            color: `var(--series-${s.color_slot})`,
            sub:
              t && t.cost > 0
                ? `${money(t.revenue)} encaissés − ${money(t.cost)} d'achats`
                : undefined,
          };
        })
        .sort((a, b) => b.value - a.value),
    [activeStreams, bucket],
  );

  const netTrend = last12.map((b) => b.net);

  const chargeRate = store.settings.charge_rate_bps / 10_000;
  const afterCharges = Math.round(bucket.net - bucket.revenue * chargeRate);

  /** Moyenne des trois derniers mois qui portent effectivement des revenus. */
  const average3 = useMemo(() => {
    const active = last12.filter((b) => b.count > 0).slice(-3);
    return active.length ? Math.round(active.reduce((s, b) => s + b.net, 0) / active.length) : 0;
  }, [last12]);
  const hasAnything = store.entries.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Chiffre de tête ------------------------------------------ */}
      <section className="card anim-rise flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Hero
            label={
              basis === "cash"
                ? `Encaissé en ${monthLabel(month)} ${month.slice(0, 4)}`
                : `Comptabilisé en ${monthLabel(month)} ${month.slice(0, 4)}`
            }
            cents={bucket.net}
          >
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
              {overview.vsPrevious.ratio !== null ? (
                <Delta ratio={overview.vsPrevious.ratio} label="vs mois dernier" />
              ) : bucket.net > 0 ? (
                <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                  Premier mois avec des revenus
                </span>
              ) : null}
              {overview.average12 > 0 ? (
                <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                  Moyenne 12 mois&nbsp;: {money(overview.average12)}
                </span>
              ) : null}
              {overview.rank && overview.rank.outOf > 2 ? (
                <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                  {overview.rank.position === 1
                    ? "Meilleur mois"
                    : `${overview.rank.position}ᵉ meilleur mois sur ${overview.rank.outOf}`}
                </span>
              ) : null}
            </div>
          </Hero>

          <GoalEditor
            month={month}
            goal={goal}
            actual={bucket.net}
            onSave={(cents) => store.setGoal(month, null, cents)}
          />
        </div>

        {goal ? (
          <div className="flex flex-col gap-1.5">
            <Meter
              ratio={goal.ratio}
              tone={goal.reached ? "good" : goal.ratio > 0.55 ? "accent" : "warning"}
            />
            <div className="flex items-center justify-between text-[11.5px]">
              <span style={{ color: "var(--text-secondary)" }}>
                {goal.reached
                  ? "Objectif atteint"
                  : goal.perDayNeeded !== null
                    ? `${money(goal.remaining)} en ${goal.daysLeft} j — ${money(goal.perDayNeeded)} / jour`
                    : `${money(goal.remaining)} manquants`}
              </span>
              <span className="tnum" style={{ color: "var(--text-muted)" }}>
                {percent(goal.ratio)} de {money(goal.target)}
              </span>
            </div>
          </div>
        ) : null}

        {projection && projection.total > bucket.net ? (
          <div
            className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--radius-sm)] px-3 py-2.5 text-[12.5px]"
            style={{ background: "var(--surface-2)" }}
          >
            <span style={{ color: "var(--text-muted)" }}>
              <Icon.sparkle size={14} />
            </span>
            <span style={{ color: "var(--text-secondary)" }}>
              Au rythme actuel, le mois finirait autour de
            </span>
            <span className="tnum font-semibold">{money(projection.total)}</span>
            {projection.secured > 0 ? (
              <span style={{ color: "var(--text-muted)" }}>
                dont {money(projection.secured)} déjà vendus, versement prévu ce mois-ci
              </span>
            ) : null}
          </div>
        ) : null}
      </section>

      {!hasAnything ? (
        <Card>
          <Empty
            title="Aucun revenu enregistré"
            detail="Ajoute ton premier encaissement : choisis l'activité, tape le montant, c'est tout. Tu peux en enchaîner plusieurs d'affilée."
            action={
              <Button
                variant="primary"
                icon={<Icon.plus size={16} />}
                onClick={() => store.openComposer()}
              >
                Ajouter un revenu
              </Button>
            }
          />
        </Card>
      ) : null}

      {/* ---- Tuiles ---------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Encaissé brut"
          value={money(bucket.revenue)}
          hint={
            bucket.cost > 0
              ? `${money(bucket.cost)} d'achats déduits`
              : plural(bucket.count, "écriture", "écritures")
          }
          trend={last12.map((b) => b.revenue)}
          trendColor="var(--series-1)"
        />
        <StatTile
          label="Net après achats"
          value={money(bucket.net)}
          delta={overview.vsPrevious.ratio}
          deltaLabel="vs M-1"
          trend={netTrend}
          trendColor="var(--series-3)"
        />
        {/* Cette tuile s'adapte : rien en attente et pas de taux de
            cotisations réglé, elle montre la moyenne plutôt qu'un
            « 0 € » qui n'apprend rien. */}
        {pending.total > 0 ? (
          <StatTile
            label="En attente d'encaissement"
            value={money(pending.total)}
            tone={pending.overdueAmount > 0 ? "warning" : "neutral"}
            hint={
              pending.overdueAmount > 0
                ? `dont ${money(pending.overdueAmount)} en retard`
                : plural(pending.entries.length, "écriture", "écritures")
            }
            onClick={() =>
              document.getElementById("attente")?.scrollIntoView({ behavior: "smooth" })
            }
          />
        ) : chargeRate > 0 ? (
          <StatTile
            label="Après cotisations"
            value={money(afterCharges)}
            hint={`${percent(chargeRate)} retirés du brut encaissé`}
          />
        ) : (
          <StatTile
            label="Moyenne 3 mois"
            value={money(average3)}
            hint="Sur les trois derniers mois avec des revenus"
          />
        )}
        <StatTile
          label={`Cumul ${month.slice(0, 4)}`}
          value={money(overview.ytd)}
          delta={
            overview.ytdLastYear > 0
              ? (overview.ytd - overview.ytdLastYear) / overview.ytdLastYear
              : null
          }
          deltaLabel="vs an dernier"
          hint={overview.ytdLastYear > 0 ? undefined : "Pas d'historique sur l'an dernier"}
        />
      </div>

      {/* ---- Évolution ------------------------------------------------- */}
      <Card
        title="Douze derniers mois"
        action={
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Clic sur un mois pour le cadrer
          </span>
        }
      >
        <StackedMonths
          data={last12}
          streams={activeStreams}
          metric="net"
          selected={month}
          onSelect={setMonth}
          height={250}
        />
      </Card>

      {/* ---- Répartition + lecture ------------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Card title={`Répartition — ${monthLabel(month)}`}>
          {slices.length > 0 ? (
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
              <Donut
                slices={slices}
                centerLabel="net du mois"
                selected={focus}
                onSelect={(id) => setFocus((f) => (f === id ? null : id))}
              />
              <div className="w-full min-w-0 flex-1">
                <RankedBars
                  items={ranked.filter((r) => r.value !== 0)}
                  selected={focus}
                  onSelect={(id) => setFocus((f) => (f === id ? null : id))}
                />
              </div>
            </div>
          ) : (
            <Empty
              title={`Rien en ${monthLabel(month)}`}
              detail="Change de mois dans l'en-tête, ou ajoute un encaissement pour ce mois."
            />
          )}
        </Card>

        <Card title="Ce qu'il faut retenir">
          <InsightList insights={store.insights} />
        </Card>
      </div>

      {/* ---- Encaissements en attente ---------------------------------- */}
      {pending.entries.length > 0 ? (
        <div id="attente">
          <PendingPanel />
        </div>
      ) : null}

      <div className="flex justify-center pt-2">
        <Link
          href="/analyse"
          className="flex items-center gap-1.5 text-[12.5px] font-medium transition-colors"
          style={{ color: "var(--text-secondary)" }}
        >
          Voir l&apos;analyse détaillée
          <Icon.arrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
