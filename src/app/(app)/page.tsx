"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStore } from "@/components/store";
import { Card, Chip, Delta, Empty, Button } from "@/components/ui/kit";
import { Icon } from "@/components/ui/icons";
import { YearGrid, type YearCell } from "@/components/charts/year";
import { ActivityShift, type ShiftRow } from "@/components/charts/shift";
import { MonthStairs } from "@/components/charts/stairs";
import {
  MonthRing,
  amountSize,
  type RingSlice,
} from "@/components/charts/ring";
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
  const {
    bucket,
    overview,
    activeStreams,
    month,
    setMonth,
    basis,
    pending,
    goal,
  } = store;

  const isCurrentMonth = month === currentMonth();
  const year = yearOf(month);
  const previousMonth = shiftMonth(month, -1);

  /** Ce qui est déjà vendu et dont le versement est prévu ce mois-ci. */
  const securedThisMonth = useMemo(
    () => pending.upcomingByMonth.find((u) => u.month === month)?.amount ?? 0,
    [pending.upcomingByMonth, month],
  );

  const projection = useMemo(
    () =>
      isCurrentMonth ? projectMonth(bucket, month, securedThisMonth) : null,
    [bucket, month, securedThisMonth, isCurrentMonth],
  );

  /* ---- L'année, case par case -------------------------------------
     Douze cases fixes. Aucune fenêtre glissante, donc aucun mois qui
     disparaît quand on en choisit un autre. */
  const yearCells = useMemo<YearCell[]>(
    () =>
      monthsOfYear(year).map((m) => {
        const b = store.buckets.get(m);
        // Résolu contre TOUS les flux, archivés compris — comme les
        // parts de l'anneau. Avec `activeStreams`, un mois porté par
        // une activité archivée affichait son total sans un seul
        // segment : une case pleine de rien.
        const segments = Object.entries(b?.byStream ?? {})
          .map(([id, t]) => {
            const stream = store.streams.find((x) => x.id === id);
            return {
              id,
              label: stream?.name ?? "Sans activité",
              value: t.net,
              color: stream
                ? `var(--series-${stream.color_slot})`
                : "var(--text-muted)",
              rang: stream ? store.streams.indexOf(stream) : 99,
            };
          })
          // Pas de tri par montant : l'ordre des activités doit être le
          // même dans les douze cases, sinon deux cases voisines
          // n'empilent pas les mêmes couleurs dans le même ordre et
          // plus rien ne se compare.
          .sort((a, b2) => a.rang - b2.rang)
          .filter((x) => x.value > 0);
        return {
          month: m,
          total: b?.net ?? 0,
          barTotal: segments.reduce((t, x) => t + x.value, 0),
          segments,
        };
      }),
    [year, store.buckets, store.streams],
  );

  // Somme des nets BRUTS, sur les douze mois : un mois déficitaire doit
  // compter comme un déficit, sinon « sur l'année » annonce plus que ce
  // qui est réellement rentré. Ce total couvre l'année entière, quand le
  // compteur « Cumul » s'arrête au mois affiché — les deux libellés le
  // disent, ils ne se contredisent pas.
  const yearTotal = yearCells.reduce((s, c) => s + c.total, 0);

  /* ---- Les parts du mois -------------------------------------------
     Construites depuis bucket.byStream et résolues contre TOUS les
     flux, archivés compris : une activité archivée en cours d'année
     garde ses encaissements dans le total du mois, donc elle doit
     garder son arc — sinon la somme des parts cesse d'égaler le
     montant écrit au centre. */
  const parts = useMemo(() => {
    const rows: RingSlice[] = [];
    for (const [id, totals] of Object.entries(bucket.byStream)) {
      const stream = store.streams.find((x) => x.id === id);
      rows.push({
        id,
        label: stream?.name ?? "Sans activité",
        value: totals.net,
        // --axis est un jeton de chrome : 1,75:1 sur la carte, donc
        // indistinguable d'un anneau vide. --text-muted tient le 3:1
        // dans les deux thèmes.
        color: stream
          ? `var(--series-${stream.color_slot})`
          : "var(--text-muted)",
      });
    }
    // Ordre des activités, jamais ordre des montants : la roue ne doit
    // pas pivoter d'un mois à l'autre, et ses couleurs doivent se
    // succéder comme dans les douze cases du calendrier.
    const rang = new Map(store.streams.map((x, i) => [x.id, i]));
    rows.sort((a, b) => (rang.get(a.id) ?? 99) - (rang.get(b.id) ?? 99));

    // Dénominateur : la somme des parts POSITIVES, jamais bucket.net.
    // Une charge saisie rend un net d'activité négatif ; rapporter des
    // parts à un total plus petit que leur somme donnerait des
    // pourcentages au-dessus de cent.
    const total = rows.reduce((t, r) => t + Math.max(0, r.value), 0);
    return { rows, total };
  }, [bucket.byStream, store.streams]);

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
      days[i] +=
        e.direction === "out"
          ? -e.gross_cents
          : e.gross_cents - e.fee_cents - e.cost_cents;
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
    () =>
      monthsOfYear(year)
        .filter((m) => m <= month)
        .map((m) => store.buckets.get(m)),
    [year, month, store.buckets],
  );

  const average3 = useMemo(() => {
    const active = upTo.filter((b) => b && b.count > 0).slice(-3);
    return active.length
      ? Math.round(
          active.reduce((s, b) => s + (b?.net ?? 0), 0) / active.length,
        )
      : 0;
  }, [upTo]);

  /**
   * Le compteur d'écritures inclut les charges : `addEntry` incrémente
   * `count` dans les deux sens. Une tuile qui s'appelle
   * « Encaissements » doit, elle, ne compter que les entrées.
   */
  const encaissements = useMemo(
    () => bucket.entries.filter((e) => e.direction === "in").length,
    [bucket.entries],
  );
  // `margin` n'est alimenté que par la branche « in » de addEntry :
  // c'est exactement la somme des rentrées, charges exclues, alors que
  // `net` les a déjà retranchées.
  const ticket =
    encaissements > 0 ? Math.round(bucket.margin / encaissements) : 0;

  const hasAnything = store.entries.length > 0;

  /**
   * Le premier mois de l'app, et lui seul. On ne peut pas le déduire de
   * `vsPrevious.ratio === null` : ce ratio est nul dès que le mois
   * PRÉCÉDENT est vide, ce qui arrive à chaque trou dans l'historique.
   */
  const isFirstMonth =
    bucket.net > 0 &&
    store.availableMonths
      .filter((m) => m < month)
      .every((m) => {
        const b = store.buckets.get(m);
        return !b || b.count === 0;
      });

  return (
    <div className="flex flex-col gap-4">
      {/* ================================================================
          L'AFFICHE DU MOIS

          Un seul objet : l'anneau de répartition, avec le montant dans
          son creux. On lit « combien » et « d'où ça vient » en un seul
          arrêt du regard, sans rien faire défiler.
          ================================================================ */}
      <section className="card anim-rise p-5 sm:p-6">
        {/* Sur grand écran l'anneau se range à gauche et tout le reste
            passe à droite : une légende étirée sur 900 px éloignerait le
            nom de son montant de toute la largeur de l'écran. */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
          <div className="w-full lg:w-[360px] lg:shrink-0">
            <MonthRing slices={parts.rows}>
              <span
                className="leading-none"
                style={{ fontSize: "0.72em", color: "var(--text-secondary)" }}
              >
                {basis === "cash"
                  ? `Encaissé en ${monthLabel(month)}`
                  : `Comptabilisé en ${monthLabel(month)}`}
              </span>
              <span
                className="font-semibold leading-none tracking-[-0.02em]"
                style={{ fontSize: `${amountSize(bucket.net) / 16}em` }}
              >
                {money(bucket.net)}
              </span>
              {/* Aucune pastille sur un mois sans écriture : les douze
                  cases du calendrier sont cliquables, y compris celles
                  à venir, et « −100 % vs août » sur un octobre vide est
                  un chiffre qui n'a pas de sens. */}
              {bucket.count > 0 && overview.vsPrevious.ratio !== null ? (
                <span>
                  <Delta
                    ratio={overview.vsPrevious.ratio}
                    label={`vs ${monthLabel(previousMonth)}`}
                    variant="pill"
                  />
                </span>
              ) : isFirstMonth ? (
                <span
                  style={{ fontSize: "0.72em", color: "var(--text-muted)" }}
                >
                  Premier mois avec des revenus
                </span>
              ) : null}
            </MonthRing>
          </div>

          {/* Plafonnée : une ligne de légende étirée sur 700 px met le
              nom et son montant aux deux bouts de l'écran. */}
          <div className="flex min-w-0 flex-1 flex-col gap-4 lg:max-w-[520px]">
            {/* Le contexte, sur une ligne, sous l'anneau. */}
            {overview.rank?.position === 1 && overview.rank.outOf > 2 ? (
              <div className="flex flex-wrap items-center justify-center gap-2 lg:justify-start">
                <Chip icon={<Icon.up size={12} />} tone="var(--delta-up)">
                  Meilleur mois
                </Chip>
                {overview.average12 > 0 ? (
                  <span
                    className="text-[11.5px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {`Moyenne de ${plural(overview.averageMonths, "mois renseigné", "mois renseignés")}\u00a0: ${money(overview.average12)}`}
                  </span>
                ) : null}
              </div>
            ) : overview.average12 > 0 ? (
              <p
                className="text-center text-[11.5px] lg:text-left"
                style={{ color: "var(--text-muted)" }}
              >
                {`Moyenne de ${plural(overview.averageMonths, "mois renseigné", "mois renseignés")}\u00a0: ${money(overview.average12)}`}
                {overview.rank &&
                overview.rank.position > 1 &&
                overview.rank.outOf > 2
                  ? ` · ${overview.rank.position}ᵉ meilleur mois sur ${overview.rank.outOf}`
                  : ""}
              </p>
            ) : null}

            {/* La légende : c'est elle qui remplace le survol, absent sur
            iPhone. Chaque part y est écrite en toutes lettres. */}
            {/* La porte doit correspondre au filtre qu'elle garde :
                `parts.total` est la somme des nets POSITIFS, donc nulle
                sur un mois qui ne porte que des charges — et la légende,
                seule à expliquer le montant du creux, disparaissait. */}
            {parts.rows.some((r) => r.value !== 0) ? (
              <ul className="flex flex-col">
                {parts.rows
                  .filter((r) => r.value !== 0)
                  .map((r) => {
                    const share = r.value > 0 ? r.value / parts.total : 0;
                    const positives = parts.rows.filter(
                      (x) => x.value > 0,
                    ).length;
                    return (
                      <li
                        key={r.id}
                        className="flex items-center gap-2.5 py-[5px] text-[12.5px]"
                      >
                        <span
                          aria-hidden
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{
                            background: r.color,
                            // Trois teintes de la palette passent sous 3:1
                            // sur fond clair : un filet leur rend un bord.
                            outline: "1px solid var(--border)",
                            outlineOffset: -1,
                          }}
                        />
                        <span
                          className="min-w-0 flex-1 truncate"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {r.label}
                        </span>
                        <span
                          className="tnum shrink-0"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {/* Les deux garde-fous sont symétriques : « 0 % » à côté
                              d'un montant qui existe, et « 100 % » à côté d'un arc
                              qui n'est visiblement pas tout le cercle, mentent
                              autant l'un que l'autre. */}
                          {r.value <= 0
                            ? "—"
                            : share < 0.005
                              ? "< 1 %"
                              : share > 0.995 && positives > 1
                                ? "> 99 %"
                                : percent(share)}
                        </span>
                        <span className="tnum w-[76px] shrink-0 text-right font-semibold">
                          {money(r.value)}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            ) : null}

            {/* L'objectif : une barre, pas un second cercle. Deux anneaux
            concentriques se confondent, et --good ne se distingue pas
            de --series-3 en mode sombre. */}
            <GoalEditor
              month={month}
              goal={goal}
              actual={bucket.net}
              onSave={(cents) => store.setGoal(month, null, cents)}
              trigger={(open) => (
                <button
                  type="button"
                  onClick={open}
                  aria-haspopup="dialog"
                  aria-label={
                    goal
                      ? `Modifier l'objectif de ${monthLabel(month)} — ${money(goal.target)}, ${percent(goal.ratio)} atteints`
                      : `Définir un objectif pour ${monthLabel(month)}`
                  }
                  className="flex min-h-[46px] w-full flex-col justify-center gap-1.5 rounded-[var(--radius-sm)] px-3 transition-colors hover:bg-[var(--surface-2)]"
                  style={
                    goal
                      ? undefined
                      : {
                          border: "1px dashed var(--border)",
                          color: "var(--text-secondary)",
                        }
                  }
                >
                  {goal ? (
                    <>
                      <span className="flex items-baseline justify-between gap-3 text-[12px]">
                        <span style={{ color: "var(--text-secondary)" }}>
                          {`Objectif ${money(goal.target)}`}
                        </span>
                        <span
                          className="tnum font-semibold"
                          style={{
                            color: goal.reached
                              ? "var(--good)"
                              : "var(--text-primary)",
                          }}
                        >
                          {percent(goal.ratio)}
                        </span>
                      </span>
                      <span
                        aria-hidden
                        className="h-2 w-full overflow-hidden rounded-full"
                        style={{ background: "var(--grid)" }}
                      >
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.min(100, Math.max(0, goal.ratio * 100)).toFixed(1)}%`,
                            background: goal.reached
                              ? "var(--good)"
                              : "var(--text-primary)",
                            transition: "width .45s cubic-bezier(.22,1,.36,1)",
                          }}
                        />
                      </span>
                    </>
                  ) : (
                    <span className="text-[12.5px] font-medium">
                      {`Définir un objectif pour ${monthLabel(month)}`}
                    </span>
                  )}
                </button>
              )}
            />

            {goal && !goal.reached ? (
              <p
                className="text-center text-[12px] lg:text-left"
                style={{ color: "var(--text-secondary)" }}
              >
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
                  {`Au rythme des ${projection.daysElapsed} premiers jours, le mois finirait autour de`}
                </span>
                <span className="tnum font-semibold">
                  {money(projection.total)}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* ================================================================
          L'ANNÉE, CASE PAR CASE
          ================================================================ */}
      {/* Les flèches vivent dans `action`, jamais dans `title` : la prop
          title est rendue dans un <h2>, et deux boutons à l'intérieur
          font annoncer le titre « Année 2025 2026 Année 2027 ». */}
      <Card
        title={`Année ${year}`}
        action={
          <span className="flex items-center gap-1">
            <span
              className="tnum mr-1 text-[11.5px]"
              style={{ color: "var(--text-muted)" }}
            >
              {`${money(yearTotal)} sur l'année`}
            </span>
            <button
              type="button"
              aria-label={`Voir ${year - 1}`}
              disabled={year <= yearOf(store.availableMonths[0] ?? month)}
              onClick={() =>
                setMonth(`${year - 1}-${month.slice(5, 7)}` as MonthKey)
              }
              className="flex h-11 w-11 items-center justify-center rounded-full transition-colors enabled:hover:bg-[var(--surface-2)] disabled:opacity-30"
              style={{ color: "var(--text-secondary)" }}
            >
              <Icon.left size={16} />
            </button>
            <button
              type="button"
              aria-label={`Voir ${year + 1}`}
              disabled={year >= yearOf(currentMonth())}
              onClick={() =>
                setMonth(`${year + 1}-${month.slice(5, 7)}` as MonthKey)
              }
              className="flex h-11 w-11 items-center justify-center rounded-full transition-colors enabled:hover:bg-[var(--surface-2)] disabled:opacity-30"
              style={{ color: "var(--text-secondary)" }}
            >
              <Icon.right size={16} />
            </button>
          </span>
        }
      >
        <YearGrid cells={yearCells} selected={month} onSelect={setMonth} />
      </Card>

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
          <ActivityShift
            rows={shiftRows}
            month={month}
            previousMonth={previousMonth}
          />
        </Card>
      ) : null}

      {/* ================================================================
          OÙ EN EST LE MOIS
          ================================================================ */}
      {rhythm.filled > 0 ? (
        <Card
          title={`Où en est ${monthLabel(month)}`}
          action={
            <span
              className="text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              {plural(
                rhythm.filled,
                "jour avec une rentrée",
                "jours avec une rentrée",
              )}
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
            value={String(encaissements)}
            hint={
              rhythm.filled > 0
                ? `sur ${plural(rhythm.filled, "jour", "jours")} du mois`
                : "aucun ce mois-ci"
            }
            cell={0}
          />
          <Counter
            label="Par encaissement"
            value={encaissements > 0 ? money(ticket) : "—"}
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
                document
                  .getElementById("attente")
                  ?.scrollIntoView({ behavior: "smooth" })
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
      <span
        className="flex items-center gap-1.5 text-[11.5px]"
        style={{ color: "var(--text-secondary)" }}
      >
        {tone ? (
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: tone }}
          />
        ) : null}
        {label}
      </span>
      <span className="tnum text-[20px] font-semibold leading-none tracking-tight">
        {value}
      </span>
      {hint ? (
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {hint}
        </span>
      ) : null}
    </Root>
  );
}
