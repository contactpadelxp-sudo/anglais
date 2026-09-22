"use client";

import { useMemo } from "react";
import { useStore } from "@/components/store";
import { Card, Empty, StatTile } from "@/components/ui/kit";
import { Trend } from "@/components/charts/trend";
import { RankedBars } from "@/components/charts/small";
import { lifetime, milestones, yearSummaries, streamColor } from "@/lib/analytics";
import { money, moneyCompact, plural } from "@/lib/format";
import { monthLabel, monthsBetween, shiftMonth, type MonthKey } from "@/lib/dates";

/**
 * Le long terme.
 *
 * C'est la page la plus difficile à écrire honnêtement, parce qu'elle
 * parle d'une durée qu'on n'a pas encore. Avec cinq mois d'historique,
 * une « tendance annuelle » est une extrapolation et une « saison »
 * n'existe pas. La règle tenue ici : ne montrer que ce que la durée
 * permet, dire ce qui manque, et laisser le reste apparaître de
 * lui-même le jour où il aura du sens.
 */
export default function HistoriquePage() {
  const store = useStore();
  const { buckets, streams } = store;

  const vie = useMemo(() => lifetime(buckets), [buckets]);
  const annees = useMemo(() => yearSummaries(buckets), [buckets]);
  const paliers = useMemo(() => milestones(buckets), [buckets]);

  /** Tous les mois du premier au dernier, sans trou. */
  const months = useMemo<MonthKey[]>(() => {
    if (!vie) return [];
    const n = monthsBetween(vie.firstMonth, vie.lastMonth) + 1;
    return Array.from({ length: n }, (_, i) => shiftMonth(vie.firstMonth, i));
  }, [vie]);

  /** Le cumul, mois après mois : la courbe qui ne redescend jamais. */
  const cumul = useMemo(() => {
    let running = 0;
    return months.map((m) => {
      running += buckets.get(m)?.net ?? 0;
      return running;
    });
  }, [months, buckets]);

  if (!vie || months.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-[17px] font-semibold tracking-tight">Historique</h1>
        <Card>
          <Empty
            title="Rien à raconter pour l'instant"
            detail="Cette page se remplit toute seule : le cumul depuis le début, les paliers franchis, une carte par année. Il lui faut d'abord quelques mois."
          />
        </Card>
      </div>
    );
  }

  const enCours = annees.find((a) => !a.complete);
  const precedente = annees.find((a) => a.complete);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-[17px] font-semibold tracking-tight">Historique</h1>
        <span className="text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
          depuis {monthLabel(vie.firstMonth, "full")}
        </span>
      </div>

      {/* ---- Ce que l'app sait depuis le premier jour ------------------ */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Total depuis le début"
          value={money(vie.totalCents)}
          hint={`${vie.filledMonths} mois sur ${vie.spanMonths} ont rapporté`}
        />
        <StatTile
          label="Rythme annuel"
          value={money(vie.annualCents)}
          /* Douze mois d'histoire : c'est une somme, donc un fait. Moins :
             c'est une moyenne ramenée à douze, et il faut le dire, sinon
             le chiffre se lit comme un revenu acquis. */
          hint={
            vie.annualMonths >= 12
              ? "Les douze derniers mois"
              : `Extrapolé sur ${plural(vie.annualMonths, "mois terminé", "mois terminés")}`
          }
        />
        <StatTile
          label="Meilleur mois"
          value={vie.bestMonth ? money(vie.bestMonth.net) : "—"}
          hint={vie.bestMonth ? monthLabel(vie.bestMonth.month, "full") : "Pas encore"}
          tone="good"
        />
        <StatTile
          label="Série en cours"
          value={vie.streak > 0 ? plural(vie.streak, "mois", "mois") : "—"}
          hint={
            vie.streak > 0
              ? "Mois consécutifs avec du revenu"
              : "Le dernier mois terminé était vide"
          }
        />
      </div>

      {/* ---- Le cumul : la seule courbe qui ne ment pas sur la durée --- */}
      <Card title="Le cumul depuis le début">
        <Trend
          months={months}
          series={[
            {
              id: "cumul",
              label: "Cumulé",
              color: "var(--series-1)",
              values: cumul,
            },
          ]}
          height={230}
        />
        <p className="mt-3 max-w-[72ch] text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
          Une courbe qui ne redescend jamais : sa <strong>pente</strong>{" "}
          est l&apos;information, pas sa hauteur. Plus elle se redresse, plus les mois récents pèsent lourd par rapport
          aux premiers.
        </p>
      </Card>

      {/* ---- Une carte par année --------------------------------------- */}
      {annees.map((a) => {
        const parts = streams
          .map((s) => ({
            id: s.id,
            label: s.name,
            value: a.byStream[s.id] ?? 0,
            color: streamColor(s.color_slot),
          }))
          .filter((p) => p.value !== 0)
          .sort((x, y) => y.value - x.value);

        return (
          <Card
            key={a.year}
            title={`Année ${a.year}`}
            action={
              <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                {a.complete
                  ? `${plural(a.filledMonths, "mois", "mois")} de revenus`
                  : `en cours · ${plural(a.filledMonths, "mois", "mois")} à ce jour`}
              </span>
            }
          >
            <div className="grid grid-cols-2 gap-3 pb-4 sm:grid-cols-3">
              <Chiffre label="Total" value={money(a.totalCents)} fort />
              <Chiffre label="Par mois renseigné" value={money(a.averageCents)} />
              <Chiffre
                label="Meilleur mois"
                value={a.bestMonth ? money(a.bestMonth.net) : "—"}
                sous={a.bestMonth ? monthLabel(a.bestMonth.month, "full") : undefined}
              />
            </div>
            {parts.length > 0 ? <RankedBars items={parts} /> : null}
          </Card>
        );
      })}

      {/* ---- Une année face à la précédente ---------------------------- */}
      {enCours && precedente ? (
        <Card title={`${enCours.year} face à ${precedente.year}`}>
          <div className="grid grid-cols-2 gap-3">
            <Chiffre label={String(precedente.year)} value={money(precedente.totalCents)} />
            <Chiffre label={String(enCours.year)} value={money(enCours.totalCents)} fort />
          </div>
          <p className="mt-3 max-w-[72ch] text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
            {enCours.totalCents >= precedente.totalCents ? (
              <>
                {enCours.year} a déjà dépassé {precedente.year} de{" "}
                <strong>{money(enCours.totalCents - precedente.totalCents)}</strong>, en{" "}
                {plural(enCours.filledMonths, "mois", "mois")}.
              </>
            ) : (
              <>
                Il manque <strong>{money(precedente.totalCents - enCours.totalCents)}</strong>{" "}
                à {enCours.year} pour rejoindre {precedente.year}, soit{" "}
                {money(
                  Math.round(
                    (precedente.totalCents - enCours.totalCents) /
                      Math.max(1, 12 - enCours.filledMonths),
                  ),
                )}{" "}
                par mois sur ce qu&apos;il reste.
              </>
            )}{" "}
            La comparaison ne vaut que ce que vaut {precedente.year} :{" "}
            {plural(precedente.filledMonths, "mois renseigné", "mois renseignés")}.
          </p>
        </Card>
      ) : null}

      {/* ---- Les premières fois ---------------------------------------- */}
      {paliers.length > 0 ? (
        <Card title="Paliers franchis">
          <ul className="flex flex-col">
            {paliers.map((p, i) => (
              <li
                key={p.cents}
                className="flex items-center justify-between gap-3 py-2.5"
                style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}
              >
                <span className="tnum text-[13.5px] font-semibold">
                  {moneyCompact(p.cents)} en un mois
                </span>
                <span className="text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
                  {monthLabel(p.month, "full")} · {money(p.reachedCents)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 max-w-[72ch] text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            Le premier mois à dépasser chaque palier. Sur un historique court, c&apos;est le
            seul long terme qui existe vraiment : une suite de premières fois, qu&apos;aucune
            moyenne ne raconte.
          </p>
        </Card>
      ) : null}

      {/* ---- Ce qui viendra ------------------------------------------- */}
      {annees.length < 2 ? (
        <p className="px-1 pb-2 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          Une seule année pour l&apos;instant. La comparaison d&apos;une année à l&apos;autre, et
          la saisonnalité, apparaîtront d&apos;elles-mêmes quand il y aura deux années à mettre
          côte à côte — pas avant, parce qu&apos;une courbe de comparaison plate à zéro
          n&apos;apprend rien.
        </p>
      ) : null}
    </div>
  );
}

function Chiffre({
  label,
  value,
  sous,
  fort,
}: {
  label: string;
  value: string;
  sous?: string;
  fort?: boolean;
}) {
  return (
    <div>
      <p className="text-[11.5px]" style={{ color: "var(--text-secondary)" }}>
        {label}
      </p>
      <p className={`tnum mt-0.5 ${fort ? "text-[18px] font-semibold" : "text-[15px] font-medium"}`}>
        {value}
      </p>
      {sous ? (
        <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          {sous}
        </p>
      ) : null}
    </div>
  );
}
