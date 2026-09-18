"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStore } from "@/components/store";
import { Card, Chip, Delta, Empty, Hero, Button } from "@/components/ui/kit";
import { Icon } from "@/components/ui/icons";
import { YearGrid, type YearCell } from "@/components/charts/year";
import { ActivityShift, type ShiftRow } from "@/components/charts/shift";
import { MonthStairs } from "@/components/charts/stairs";
import { GoalRing } from "@/components/charts/pulse";
import { InsightList } from "@/components/insight-list";
import { PendingPanel } from "@/components/pending-panel";
import { GoalEditor } from "@/components/goal-editor";
import { money, percent, plural } from "@/lib/format";
import {
  monthLabel,
  monthsOfYear,
  yearOf,
  currentMonth,
  daysInMonth,
  shiftMonth,
  type MonthKey,
} from "@/lib/dates";
import { projectMonth, dateOf } from "@/lib/analytics";

export default function Dashboard() {
  const store = useStore();
  const { bucket, overview, activeStreams, month, setMonth, basis, pending, goal } = store;

  const isCurrentMonth = month === currentMonth();
  const year = yearOf(month);
  const previousMonth = shiftMonth(month, -1);

  /** Ce qui est déjà vendu et dont le versement est prévu ce mois-ci. */
  const securedThisMonth = useMemo(
    () => pending.upcomingByMonth.find((u) => u.month === month)?.amount ?? 0,
    [pending.upcomingByMonth, month],
  );

  const projection = useMemo(
    () => (isCurrentMonth ? projectMonth(bucket, month, securedThisMonth) : null),
    [bucket, month, securedThisMonth, isCurrentMonth],
  );

  /* ---- L'année, case par case -------------------------------------
     Douze cases fixes. Aucune fenêtre glissante, donc aucun mois qui
     disparaît quand on en choisit un autre. */
  const yearCells = useMemo<YearCell[]>(
    () =>
      monthsOfYear(year).map((m) => {
        const b = store.buckets.get(m);
        const segments = activeStreams
          .map((s) => ({
            id: s.id,
            label: s.name,
            value: b?.byStream[s.id]?.net ?? 0,
            color: `var(--series-${s.color_slot})`,
          }))
          // Pas de tri par montant : l'ordre des activités doit être le
          // même dans les douze cases, sinon deux cases voisines
          // n'empilent pas les mêmes couleurs dans le même ordre et
          // plus rien ne se compare.
          .filter((s) => s.value > 0);
        return { month: m, total: Math.max(0, b?.net ?? 0), segments };
      }),
    [year, store.buckets, activeStreams],
  );

  const yearTotal = yearCells.reduce((s, c) => s + c.total, 0);

  /* ---- Ce qui a bougé depuis le mois dernier ----------------------- */
  const shiftRows = useMemo<ShiftRow[]>(() => {
    const previous = store.buckets.get(previousMonth);
    return activeStreams
      .map((s) => ({
        id: s.id,
        key: s.key,
        label: s.name,
        color: `var(--series-${s.color_slot})`,
        current: bucket.byStream[s.id]?.net ?? 0,
        previous: previous?.byStream[s.id]?.net ?? 0,
      }))
      .filter((r) => r.current !== 0 || r.previous !== 0)
      .sort((a, b) => b.current - a.current);
  }, [activeStreams, bucket, store.buckets, previousMonth]);

  /* ---- Le mois, jour par jour -------------------------------------- */
  const rhythm = useMemo(() => {
    const days = new Array<number>(daysInMonth(month)).fill(0);
    for (const e of bucket.entries) {
      const day = dateOf(e, basis);
      if (!day) continue;
      const i = Number(day.slice(8, 10)) - 1;
      if (i < 0 || i >= days.length) continue;
      days[i] += e.direction === "out" ? -e.gross_cents : e.gross_cents - e.fee_cents - e.cost_cents;
    }
    return { days, filled: days.filter((v) => v > 0).length };
  }, [bucket.entries, basis, month]);

  const chargeRate = store.settings.charge_rate_bps / 10_000;
  const afterCharges = Math.round(bucket.net - bucket.revenue * chargeRate);

  /**
   * Les compteurs portent sur le mois AFFICHÉ, donc leurs moyennes
   * aussi : comparer avril à des mois postérieurs à avril donnerait un
   * repère que l'utilisateur n'avait pas à l'époque.
   */
  const upTo = useMemo(
    () => monthsOfYear(year).filter((m) => m <= month).map((m) => store.buckets.get(m)),
    [year, month, store.buckets],
  );

  const average3 = useMemo(() => {
    const active = upTo.filter((b) => b && b.count > 0).slice(-3);
    return active.length
      ? Math.round(active.reduce((s, b) => s + (b?.net ?? 0), 0) / active.length)
      : 0;
  }, [upTo]);

  const ticket = bucket.count > 0 ? Math.round(bucket.net / bucket.count) : 0;

  const hasAnything = store.entries.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* ================================================================
          L'AFFICHE DU MOIS
          Combien, par rapport à quoi, où j'en suis de l'objectif, et à
          quoi ressemble l'année — sans scroller.
          ================================================================ */}
      <section className="card anim-rise flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3 sm:gap-4">
          <Hero
            label={
              basis === "cash"
                ? `Encaissé en ${monthLabel(month)} ${year}`
                : `Comptabilisé en ${monthLabel(month)} ${year}`
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
                {/* Le libellé dit le nombre de mois réellement moyennés :
                    « moyenne 12 mois » sur deux mois renseignés était faux. */}
                {`Moyenne de ${plural(overview.averageMonths, "mois renseigné", "mois renseignés")}\u00a0: ${money(overview.average12)}`}
                {overview.rank && overview.rank.position > 1 && overview.rank.outOf > 2
                  ? ` · ${overview.rank.position}ᵉ meilleur mois sur ${overview.rank.outOf}`
                  : ""}
              </p>
            ) : null}
          </Hero>

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

        {/* ---- L'année ------------------------------------------------ */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                aria-label={`Année ${year - 1}`}
                onClick={() => setMonth(`${year - 1}-${month.slice(5, 7)}` as MonthKey)}
                className="rounded-full p-1 transition-colors hover:bg-[var(--surface-2)]"
                style={{ color: "var(--text-secondary)" }}
              >
                <Icon.left size={15} />
              </button>
              <span className="tnum px-1 text-[12.5px] font-semibold">{year}</span>
              <button
                type="button"
                aria-label={`Année ${year + 1}`}
                disabled={year >= yearOf(currentMonth())}
                onClick={() => setMonth(`${year + 1}-${month.slice(5, 7)}` as MonthKey)}
                className="rounded-full p-1 transition-colors enabled:hover:bg-[var(--surface-2)] disabled:opacity-30"
                style={{ color: "var(--text-secondary)" }}
              >
                <Icon.right size={15} />
              </button>
            </div>
            {/* Chaîne construite plutôt que texte JSX collé à une
                expression : JSX avale l'espace qui suit une accolade
                fermante en fin de ligne, et « 12 557 €sur l'année »
                est passé en production deux fois déjà. */}
            <span className="tnum text-[11.5px]" style={{ color: "var(--text-muted)" }}>
              {`${money(yearTotal)} sur l'année`}
            </span>
          </div>

          <YearGrid cells={yearCells} selected={month} onSelect={setMonth} />
        </div>

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
              Au rythme des {projection.daysElapsed} premiers jours, le mois finirait autour de
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

      {/* ================================================================
          QUI ME PAIE, ET QU'EST-CE QUI A BOUGÉ
          ================================================================ */}
      {shiftRows.length > 0 ? (
        <Card title={`Qui me paie — ${monthLabel(month)}`}>
          <ActivityShift rows={shiftRows} month={month} previousMonth={previousMonth} />
        </Card>
      ) : null}

      {/* ================================================================
          OÙ EN EST LE MOIS
          ================================================================ */}
      {rhythm.filled > 0 ? (
        <Card
          title={`Où en est ${monthLabel(month)}`}
          action={
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {plural(rhythm.filled, "jour avec une rentrée", "jours avec une rentrée")}
            </span>
          }
        >
          <MonthStairs
            month={month}
            amounts={rhythm.days}
            goalCents={goal?.target ?? null}
            basis={basis}
          />
        </Card>
      ) : null}

      {/* ================================================================
          LES COMPTEURS — quatre nombres, une seule carte
          ================================================================ */}
      <Card padded={false}>
        <div className="grid grid-cols-2 lg:grid-cols-4">
          <Counter
            label={basis === "cash" ? "Encaissements" : "Ventes"}
            value={String(bucket.count)}
            hint={
              rhythm.filled > 0
                ? `sur ${plural(rhythm.filled, "jour", "jours")} du mois`
                : "aucun ce mois-ci"
            }
            cell={0}
          />
          <Counter
            label="Par encaissement"
            value={bucket.count > 0 ? money(ticket) : "—"}
            hint="Montant moyen d'une rentrée"
            cell={1}
          />
          {pending.total > 0 ? (
            <Counter
              label="En attente"
              value={money(pending.total)}
              tone={pending.overdueAmount > 0 ? "var(--warning)" : undefined}
              hint={
                pending.overdueAmount > 0
                  ? `dont ${money(pending.overdueAmount)} en retard`
                  : plural(pending.entries.length, "écriture", "écritures")
              }
              cell={2}
              onClick={() =>
                document.getElementById("attente")?.scrollIntoView({ behavior: "smooth" })
              }
            />
          ) : chargeRate > 0 ? (
            <Counter
              label="Après cotisations"
              value={money(afterCharges)}
              hint={`${percent(chargeRate)} retirés du brut`}
              cell={2}
            />
          ) : (
            <Counter
              label="Moyenne 3 mois"
              value={money(average3)}
              hint="Les trois derniers mois actifs"
              cell={2}
            />
          )}
          <Counter
            label={`Cumul ${year}`}
            value={money(overview.ytd)}
            hint={`à fin ${monthLabel(month)}`}
            cell={3}
          />
        </div>
      </Card>

      {/* ================================================================
          CE QU'IL FAUT RETENIR
          ================================================================ */}
      <Card title="Ce qu'il faut retenir">
        <InsightList insights={store.insights} />
      </Card>

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

/* ===================================================================
   Un compteur : un nombre, son libellé, son indice. Pas de courbe —
   celle des tuiles redisait au 1/10ᵉ ce que l'affiche montre en grand,
   et son point accentué ne désignait même pas le mois affiché.
   =================================================================== */

/**
 * Les filets suivent la grille : deux colonnes sur téléphone, quatre
 * sur grand écran. D'où des classes par rang plutôt qu'un booléen —
 * la case 1 n'a pas de filet à droite à deux colonnes, elle en a un à
 * quatre.
 */
const CELL_BORDERS = [
  "border-b border-r lg:border-b-0",
  "border-b lg:border-b-0 lg:border-r",
  "border-r",
  "",
];

function Counter({
  label,
  value,
  hint,
  tone,
  cell = 0,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
  cell?: number;
  onClick?: () => void;
}) {
  const Root = onClick ? "button" : "div";
  return (
    <Root
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`flex flex-col gap-1 p-4 text-left ${CELL_BORDERS[cell] ?? ""} ${
        onClick ? "transition-colors hover:bg-[var(--surface-2)]" : ""
      }`}
      style={{ borderColor: "var(--border)" }}
    >
      <span className="flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--text-secondary)" }}>
        {tone ? (
          <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: tone }} />
        ) : null}
        {label}
      </span>
      <span className="tnum text-[20px] font-semibold leading-none tracking-tight">{value}</span>
      {hint ? (
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {hint}
        </span>
      ) : null}
    </Root>
  );
}
