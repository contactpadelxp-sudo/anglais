"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStore } from "@/components/store";
import { Card, Empty } from "@/components/ui/kit";
import { Icon, StreamIcon } from "@/components/ui/icons";
import { Sparkline } from "@/components/charts/small";
import { streamMetrics } from "@/lib/analytics";
import { money, percent, plural } from "@/lib/format";
import { monthRange, currentMonth } from "@/lib/dates";

export default function ActivitiesPage() {
  const { activeStreams, entries, basis } = useStore();
  const months = useMemo(() => monthRange(currentMonth(), 12), []);

  const cards = useMemo(
    () => activeStreams.map((s) => streamMetrics(s, entries, basis, months)),
    [activeStreams, entries, basis, months],
  );

  if (activeStreams.length === 0) {
    return (
      <Card>
        <Empty
          title="Aucune activité"
          detail="Crée tes activités dans les réglages pour commencer à y rattacher des revenus."
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[17px] font-semibold tracking-tight">Activités</h1>

      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((m) => {
          const color = `var(--series-${m.stream.color_slot})`;
          return (
            <Link
              key={m.stream.id}
              href={`/activites/${encodeURIComponent(m.stream.key)}`}
              className="card anim-rise flex flex-col gap-3 p-4 transition-colors hover:bg-[var(--surface-2)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
                    style={{ background: color, color: "#fff" }}
                  >
                    <StreamIcon name={m.stream.icon} size={17} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold leading-tight">
                      {m.stream.name}
                    </p>
                    <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                      {m.activeMonths > 0
                        ? plural(m.activeMonths, "mois actif", "mois actifs")
                        : "Pas encore de revenu"}
                    </p>
                  </div>
                </div>
                <Sparkline values={m.months.map((b) => b.net)} color={color} />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Stat label="12 mois" value={money(m.total.net)} />
                <Stat
                  label="Ce mois-ci"
                  value={money(m.months.at(-1)?.net ?? 0)}
                />
                <Stat
                  label={m.stream.kind === "resale" ? "Marge" : "Panier moyen"}
                  value={
                    m.stream.kind === "resale"
                      ? m.marginRate !== null
                        ? percent(m.marginRate)
                        : "—"
                      : m.averageTicket !== null
                        ? money(m.averageTicket)
                        : "—"
                  }
                />
              </div>

              {m.pendingAmount > 0 ? (
                <p
                  className="flex items-center gap-1.5 text-[11.5px]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <Icon.clock size={13} />
                  {money(m.pendingAmount)} en attente d&apos;encaissement
                </p>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p className="tnum text-[14px] font-semibold">{value}</p>
    </div>
  );
}
