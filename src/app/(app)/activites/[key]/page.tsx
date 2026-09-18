"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { useStore } from "@/components/store";
import { Button, Card, Empty, StatTile } from "@/components/ui/kit";
import { Icon, StreamIcon } from "@/components/ui/icons";
import { StackedMonths } from "@/components/charts/stacked-months";
import { Trend } from "@/components/charts/trend";
import { streamMetrics, marginOf, revenueOf, dateOf } from "@/lib/analytics";
import { money, percent, plural } from "@/lib/format";
import { dayLabel, monthLabel, monthRange } from "@/lib/dates";

export default function StreamPage() {
  const params = useParams<{ key: string }>();
  const store = useStore();
  const { streams, entries, basis, month, setMonth, openComposer } = store;

  const key = decodeURIComponent(params.key ?? "");
  const stream = streams.find((s) => s.key === key);
  // La fenêtre se termine sur le mois AFFICHÉ : sinon un mois choisi
  // hors fenêtre n'y est pas trouvé, et la tuile affiche « 0 € » pour
  // un mois qui porte peut-être des revenus.
  const months = useMemo(() => monthRange(month, 12), [month]);

  const metrics = useMemo(
    () => (stream ? streamMetrics(stream, entries, basis, months) : null),
    [stream, entries, basis, months],
  );

  const recent = useMemo(
    () =>
      entries
        .filter((e) => e.stream_id === stream?.id && e.status !== "cancelled")
        .sort((a, b) => {
          const da = dateOf(a, basis) ?? a.occurred_on;
          const db = dateOf(b, basis) ?? b.occurred_on;
          return db.localeCompare(da);
        })
        .slice(0, 12),
    [entries, stream?.id, basis],
  );

  if (!stream || !metrics) {
    return (
      <Card>
        <Empty
          title="Activité introuvable"
          detail="Elle a peut-être été supprimée."
          action={
            <Link href="/activites">
              <Button variant="outline">Retour aux activités</Button>
            </Link>
          }
        />
      </Card>
    );
  }

  const color = `var(--series-${stream.color_slot})`;
  const thisMonth = metrics.months.find((b) => b.month === month);
  const isResale = stream.kind === "resale";
  const isSubscription = stream.kind === "subscription";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/activites"
            aria-label="Retour"
            className="rounded-full p-1.5 transition-colors hover:bg-[var(--surface-2)]"
            style={{ color: "var(--text-secondary)" }}
          >
            <Icon.left size={18} />
          </Link>
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-[11px]"
            style={{ background: color, color: "#fff" }}
          >
            <StreamIcon name={stream.icon} size={19} />
          </span>
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight">{stream.name}</h1>
            <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
              {stream.settlement_days > 0
                ? `Encaissement ${stream.settlement_days} j après la vente`
                : "Encaissement le jour même"}
              {stream.auto_settle ? " · confirmé automatiquement" : " · à confirmer à la main"}
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={<Icon.plus size={15} />}
          onClick={() => openComposer({ stream_id: stream.id })}
        >
          Ajouter
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={`Net — ${monthLabel(month)}`}
          value={money(thisMonth?.net ?? 0)}
          trend={metrics.months.map((b) => b.net)}
          trendColor={color}
        />
        <StatTile label="Net sur 12 mois" value={money(metrics.total.net)} />
        {isResale ? (
          <StatTile
            label="Taux de marge"
            value={metrics.marginRate !== null ? percent(metrics.marginRate) : "—"}
            hint={
              metrics.total.cost > 0
                ? `${money(metrics.total.cost)} d'achats sur ${money(metrics.total.gross)}`
                : "Renseigne le coût d'achat pour l'obtenir"
            }
          />
        ) : isSubscription ? (
          <StatTile
            label="Revenu récurrent"
            value={metrics.mrr !== null ? money(metrics.mrr) : "—"}
            delta={metrics.mrrDelta?.ratio ?? null}
            deltaLabel="vs mois précédent"
          />
        ) : (
          <StatTile
            label="Montant moyen"
            value={metrics.averageTicket !== null ? money(metrics.averageTicket) : "—"}
          />
        )}
        <StatTile
          label="En attente"
          value={money(metrics.pendingAmount)}
          tone={metrics.pendingAmount > 0 ? "warning" : "neutral"}
          hint={
            metrics.medianDelay !== null
              ? `Encaissé en ${metrics.medianDelay} j en moyenne`
              : metrics.pendingCount > 0
                ? plural(metrics.pendingCount, "écriture", "écritures")
                : "Tout est encaissé"
          }
        />
      </div>

      <Card title="Douze derniers mois">
        <StackedMonths
          data={metrics.months}
          streams={[stream]}
          metric="net"
          selected={month}
          onSelect={setMonth}
          height={230}
        />
      </Card>

      {isResale && metrics.total.cost > 0 ? (
        <Card title="Encaissé face à la marge">
          <p className="mb-3 max-w-[64ch] text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
            L&apos;écart entre les deux courbes, c&apos;est ce que t&apos;ont coûté les articles
            revendus. Deux montants en euros, donc un seul axe.
          </p>
          <Trend
            months={metrics.months.map((b) => b.month)}
            series={[
              {
                id: "revenue",
                label: "Encaissé",
                color,
                values: metrics.months.map((b) => b.revenue),
              },
              {
                id: "margin",
                label: "Marge nette",
                color: "var(--series-3)",
                values: metrics.months.map((b) => b.margin),
              },
            ]}
            height={210}
          />
        </Card>
      ) : null}

      <Card title="Dernières écritures" padded={false}>
        {recent.length === 0 ? (
          <Empty
            title="Rien pour le moment"
            detail={`Ajoute un encaissement pour ${stream.name}.`}
            action={
              <Button
                variant="primary"
                icon={<Icon.plus size={16} />}
                onClick={() => openComposer({ stream_id: stream.id })}
              >
                Ajouter
              </Button>
            }
          />
        ) : (
          <ul className="pb-2">
            {recent.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => openComposer({ ...entry, id: entry.id })}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--surface-2)] sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{entry.label}</p>
                    <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                      {entry.status === "received" && entry.received_on
                        ? `Encaissé le ${dayLabel(entry.received_on)}`
                        : `Vendu le ${dayLabel(entry.occurred_on)} · en attente`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tnum text-[13.5px] font-semibold">
                      {money(entry.direction === "out" ? -entry.gross_cents : revenueOf(entry))}
                    </p>
                    {entry.cost_cents > 0 ? (
                      <p className="tnum text-[11px]" style={{ color: "var(--text-muted)" }}>
                        net {money(marginOf(entry))}
                      </p>
                    ) : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
