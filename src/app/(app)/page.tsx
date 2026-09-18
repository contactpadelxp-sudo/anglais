"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useStore } from "@/components/store";
import { Card, Chip, Delta, Empty, Hero, StatTile, Button } from "@/components/ui/kit";
import { Icon } from "@/components/ui/icons";
import { StackedMonths } from "@/components/charts/stacked-months";
import { Donut } from "@/components/charts/donut";
import { CumulativeYear } from "@/components/charts/area";
import { GoalRing, MonthBars, DayRhythm, ShareBar, ShareLegend } from "@/components/charts/pulse";
import { ActivityTiles } from "@/components/activity-tiles";
import { InsightList } from "@/components/insight-list";
import { PendingPanel } from "@/components/pending-panel";
import { GoalEditor } from "@/components/goal-editor";
import { money, percent, plural } from "@/lib/format";
import { monthLabel, monthsOfYear, yearOf, currentMonth, daysInMonth } from "@/lib/dates";
import { projectMonth, dateOf } from "@/lib/analytics";

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

  const netTrend = last12.map((b) => b.net);

  /**
   * Cumul de l'année en cours et de la précédente, mois après mois.
   * Le cumul répond à ce que le mois par mois ne peut pas trancher :
   * suis-je en avance ou en retard sur l'an dernier, à la même date ?
   */
  const cumulative = useMemo(() => {
    const year = yearOf(month);
    const build = (y: number) => {
      let running = 0;
      return monthsOfYear(y).map((m) => {
        running += store.buckets.get(m)?.net ?? 0;
        return running;
      });
    };
    const current = build(year);
    const previous = build(year - 1);

    // Le dernier mois renseigné se lit sur les mois, pas sur le cumul :
    // un cumul ne redescend jamais, donc « la dernière valeur non nulle »
    // y désigne décembre dès qu'un seul mois porte un revenu — et la
    // comparaison se ferait alors contre l'année précédente entière.
    const lastFilled = monthsOfYear(year).reduce(
      (acc, m, i) => ((store.buckets.get(m)?.count ?? 0) > 0 ? i : acc),
      0,
    );
    const ecart =
      previous[lastFilled] > 0
        ? (current[lastFilled] - previous[lastFilled]) / previous[lastFilled]
        : null;

    // Objectif annuel : la somme des objectifs mensuels renseignés.
    const goalCents = store.goals
      .filter((g) => g.stream_id === null && g.month.slice(0, 4) === String(year))
      .reduce((a, g) => a + g.target_cents, 0);

    return {
      year,
      months: monthsOfYear(year),
      current,
      previous,
      lastFilled,
      goalCents: goalCents > 0 ? goalCents : null,
      hasHistory: current.some((v) => v > 0),
      deltaLabel:
        ecart !== null
          ? `${ecart >= 0 ? "+" : "−"}${percent(Math.abs(ecart))} par rapport à ${year - 1} à la même date`
          : null,
    };
  }, [month, store.buckets, store.goals]);

  const chargeRate = store.settings.charge_rate_bps / 10_000;
  const afterCharges = Math.round(bucket.net - bucket.revenue * chargeRate);

  /**
   * Montant encaissé jour par jour sur le mois affiché. Le total d'un
   * mois ne dit pas comment il s'est construit : quatre virements
   * réguliers et une seule grosse rentrée donnent le même chiffre.
   */
  const rhythm = useMemo(() => {
    const days = new Array<number>(daysInMonth(month)).fill(0);
    for (const e of bucket.entries) {
      const day = dateOf(e, basis);
      if (!day) continue;
      const i = Number(day.slice(8, 10)) - 1;
      if (i < 0 || i >= days.length) continue;
      days[i] += e.direction === "out" ? -e.gross_cents : e.gross_cents - e.fee_cents - e.cost_cents;
    }
    const filled = days.filter((v) => v > 0).length;
    return { days, filled };
  }, [bucket.entries, basis, month]);

  /** Montant moyen d'une rentrée sur douze mois. */
  const averageTicket12 = useMemo(() => {
    const count = last12.reduce((s, b) => s + b.count, 0);
    const net = last12.reduce((s, b) => s + b.net, 0);
    return count > 0 ? Math.round(net / count) : 0;
  }, [last12]);

  /** Part de chaque activité depuis le 1er janvier. */
  const yearSlices = useMemo(
    () =>
      activeStreams
        .map((s) => {
          let total = 0;
          for (const m of monthsOfYear(yearOf(month))) {
            if (m > month) break;
            total += store.buckets.get(m)?.byStream[s.id]?.net ?? 0;
          }
          return {
            id: s.id,
            label: s.name,
            value: total,
            color: `var(--series-${s.color_slot})`,
          };
        })
        .filter((s) => s.value > 0)
        .sort((a, b) => b.value - a.value),
    [activeStreams, store.buckets, month],
  );

  /** Moyenne des trois derniers mois qui portent effectivement des revenus. */
  const average3 = useMemo(() => {
    const active = last12.filter((b) => b.count > 0).slice(-3);
    return active.length ? Math.round(active.reduce((s, b) => s + b.net, 0) / active.length) : 0;
  }, [last12]);
  const hasAnything = store.entries.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Le mois -----------------------------------------------------
          Trois choses, dans cet ordre : combien, par rapport à quoi, et
          comment le mois s'est construit. Le reste de la page détaille. */}
      <section className="card anim-rise flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3 sm:gap-4">
          <Hero
            label={
              basis === "cash"
                ? `Encaissé en ${monthLabel(month)} ${month.slice(0, 4)}`
                : `Comptabilisé en ${monthLabel(month)} ${month.slice(0, 4)}`
            }
            cents={bucket.net}
          >
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {overview.vsPrevious.ratio !== null ? (
                <Delta ratio={overview.vsPrevious.ratio} label="vs mois dernier" variant="pill" />
              ) : bucket.net > 0 ? (
                <Chip icon={<Icon.sparkle size={12} />}>Premier mois avec des revenus</Chip>
              ) : null}
              {overview.rank?.position === 1 && overview.rank.outOf > 2 ? (
                <Chip icon={<Icon.up size={12} />} tone="var(--good)">
                  Meilleur mois
                </Chip>
              ) : null}
            </div>
            {overview.average12 > 0 ? (
              <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                Moyenne 12 mois&nbsp;: {money(overview.average12)}
                {overview.rank && overview.rank.position > 1 && overview.rank.outOf > 2
                  ? ` · ${overview.rank.position}ᵉ meilleur mois sur ${overview.rank.outOf}`
                  : ""}
              </p>
            ) : null}
          </Hero>

          {/* L'anneau tient le rôle que la barre tenait plus bas : il se
              lit de loin et il est lui-même le bouton de réglage. */}
          <GoalEditor
            month={month}
            goal={goal}
            actual={bucket.net}
            onSave={(cents) => store.setGoal(month, null, cents)}
            trigger={(open) => (
              <div className="flex shrink-0 flex-col items-center gap-1.5">
                <GoalRing
                  ratio={goal ? goal.ratio : null}
                  reached={goal?.reached ?? false}
                  onClick={open}
                />
                {goal ? (
                  <span className="tnum text-[11px]" style={{ color: "var(--text-muted)" }}>
                    sur {money(goal.target)}
                  </span>
                ) : null}
              </div>
            )}
          />
        </div>

        {/* Douze barres, une par mois, cliquables : le mois se change
            ici autant que dans l'en-tête. */}
        <MonthBars
          months={last12.map((b) => b.month)}
          values={netTrend}
          selected={month}
          onSelect={setMonth}
        />

        {goal && !goal.reached ? (
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            {goal.perDayNeeded !== null
              ? `${money(goal.remaining)} à faire en ${goal.daysLeft} jours, soit ${money(goal.perDayNeeded)} par jour.`
              : `${money(goal.remaining)} manquants.`}
          </p>
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

      {/* ---- Tuiles ----------------------------------------------------
          Aucune ne répète le chiffre de tête : quand il n'y a pas
          d'achats, « encaissé brut » et « net » donnent le même nombre,
          et une tuile qui redit le titre de la page ne sert à rien. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {bucket.cost > 0 ? (
          <StatTile
            label="Encaissé brut"
            value={money(bucket.revenue)}
            hint={`${money(bucket.cost)} d'achats déduits`}
            trend={last12.map((b) => b.revenue)}
            trendColor="var(--series-1)"
          />
        ) : (
          <StatTile
            label="Encaissements"
            value={String(bucket.count)}
            hint={
              rhythm.filled > 0
                ? `sur ${plural(rhythm.filled, "jour", "jours")} du mois`
                : "aucun ce mois-ci"
            }
            trend={last12.map((b) => b.count)}
            trendColor="var(--series-1)"
          />
        )}
        <StatTile
          label="Par encaissement"
          value={bucket.count > 0 ? money(Math.round(bucket.net / bucket.count)) : "—"}
          hint={
            averageTicket12 > 0
              ? `${money(averageTicket12)} en moyenne sur 12 mois`
              : "Montant moyen d'une rentrée"
          }
          trend={last12.map((b) => (b.count > 0 ? Math.round(b.net / b.count) : 0))}
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
            trend={last12.map((b) => Math.round(b.net - b.revenue * chargeRate))}
            trendColor="var(--series-3)"
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
          trend={cumulative.current.slice(0, cumulative.lastFilled + 1)}
          trendColor="var(--series-1)"
        />
      </div>

      {/* ---- D'où vient l'argent, ce mois-ci --------------------------- */}
      <Card title={`D'où vient l'argent — ${monthLabel(month)}`}>
        {slices.length > 0 ? (
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
            <Donut
              slices={slices}
              centerLabel="net du mois"
              selected={focus}
              onSelect={(id) => setFocus((f) => (f === id ? null : id))}
            />
            <div className="w-full min-w-0 flex-1">
              <ShareLegend
                slices={slices}
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

      {/* ---- Par activité ----------------------------------------------
          Le ruban porte sur l'année, le camembert plus haut sur le mois :
          deux périodes, deux questions — « qui me paie en ce moment »
          n'est pas « qui m'a fait vivre cette année ». */}
      {yearSlices.length > 0 ? (
        <Card title={`Par activité — ${month.slice(0, 4)}`}>
          <div className="flex flex-col gap-4">
            <ShareBar
              slices={yearSlices}
              selected={focus}
              onSelect={(id) => setFocus((f) => (f === id ? null : id))}
            />
            <ActivityTiles />
          </div>
        </Card>
      ) : (
        <ActivityTiles />
      )}

      {/* ---- Rythme du mois --------------------------------------------- */}
      {rhythm.filled > 0 ? (
        <Card
          title={`Rythme de ${monthLabel(month)}`}
          action={
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {plural(rhythm.filled, "jour avec une rentrée", "jours avec une rentrée")}
            </span>
          }
        >
          <DayRhythm month={month} amounts={rhythm.days} />
        </Card>
      ) : null}

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

      {/* ---- Cumul de l'année ------------------------------------------ */}
      {cumulative.hasHistory ? (
        <Card
          title={`Cumul ${cumulative.year}`}
          action={
            cumulative.deltaLabel ? (
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {cumulative.deltaLabel}
              </span>
            ) : null
          }
        >
          <CumulativeYear
            months={cumulative.months}
            current={cumulative.current}
            previous={cumulative.previous}
            currentLabel={String(cumulative.year)}
            previousLabel={String(cumulative.year - 1)}
            goalCents={cumulative.goalCents}
            through={cumulative.lastFilled}
          />
        </Card>
      ) : null}

      {/* ---- Ce qu'il faut retenir -------------------------------------- */}
      <Card title="Ce qu'il faut retenir">
        <InsightList insights={store.insights} />
      </Card>

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
