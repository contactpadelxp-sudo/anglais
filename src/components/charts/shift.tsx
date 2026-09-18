"use client";

import Link from "next/link";
import { money, percent, signedPercent } from "@/lib/format";
import { monthLabel, type MonthKey } from "@/lib/dates";

/* ===================================================================
   Haltères — ce qui a bougé depuis le mois dernier

   Un camembert dit la part de chacun mais jamais le mouvement ; deux
   camemberts côte à côte demandent de comparer des angles de mémoire.
   Ici chaque activité tient sur une règle commune : le point creux est
   le mois précédent, le point plein le mois affiché, et le segment
   entre les deux EST la variation. Longueur du segment et position sur
   la règle se lisent d'un coup, et les activités se comparent entre
   elles puisqu'elles partagent l'échelle.

   Aucune valeur ne dépend du survol : les montants sont écrits. Sur un
   iPhone, il n'y a pas de survol.
   =================================================================== */

export type ShiftRow = {
  id: string;
  key: string;
  label: string;
  color: string;
  current: number;
  previous: number;
};

export function ActivityShift({
  rows,
  month,
  previousMonth,
}: {
  rows: ShiftRow[];
  month: MonthKey;
  previousMonth: MonthKey;
}) {
  const max = Math.max(...rows.flatMap((r) => [r.current, r.previous]), 1);
  const total = rows.reduce((s, r) => s + r.current, 0);

  return (
    <div className="flex flex-col">
      <div className="mb-2.5 flex items-center gap-4 text-[11px]">
        <span className="flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full border-[1.5px]"
            style={{ borderColor: "var(--axis)", background: "var(--surface-1)" }}
          />
          {monthLabel(previousMonth)}
        </span>
        <span className="flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: "var(--text-secondary)" }}
          />
          {monthLabel(month)}
        </span>
      </div>

      {rows.map((row, i) => {
        const pc = (row.current / max) * 100;
        const pp = (row.previous / max) * 100;
        const from = Math.min(pc, pp);
        const width = Math.abs(pc - pp);
        const ratio = row.previous > 0 ? (row.current - row.previous) / row.previous : null;
        const flat = ratio !== null && Math.abs(ratio) < 0.005;
        const up = row.current >= row.previous;

        return (
          <Link
            key={row.id}
            href={`/activites/${encodeURIComponent(row.key)}`}
            className="flex flex-col gap-1.5 py-2.5 transition-colors hover:bg-[var(--surface-2)]"
            style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}
          >
            <div className="flex items-baseline gap-2">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 translate-y-[1px] rounded-full"
                style={{ background: row.color }}
              />
              <span className="min-w-0 flex-1 truncate text-[13px]">{row.label}</span>
              {ratio !== null ? (
                <span
                  className="tnum text-[11.5px] font-medium"
                  style={{
                    color: flat
                      ? "var(--text-secondary)"
                      : up
                        ? "var(--delta-up)"
                        : "var(--delta-down)",
                  }}
                >
                  {signedPercent(ratio)}
                </span>
              ) : row.current > 0 ? (
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  nouveau
                </span>
              ) : null}
              <span className="tnum text-[13px] font-semibold">{money(row.current)}</span>
            </div>

            {/* La règle. Piste pleine largeur, segment de variation dans
                la couleur de l'activité, extrémités marquées. */}
            <div className="relative h-3 w-full">
              <span
                aria-hidden
                className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full"
                style={{ background: "var(--surface-2)" }}
              />
              {width > 0.2 ? (
                <span
                  aria-hidden
                  className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full"
                  style={{ left: `${from}%`, width: `${width}%`, background: row.color }}
                />
              ) : null}
              <span
                aria-hidden
                className="absolute top-1/2 h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px]"
                style={{
                  left: `${pp}%`,
                  borderColor: row.color,
                  background: "var(--surface-1)",
                }}
              />
              <span
                aria-hidden
                className="absolute top-1/2 h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${pc}%`,
                  background: row.color,
                  boxShadow: "0 0 0 2px var(--surface-1)",
                }}
              />
            </div>

            {total > 0 && row.current > 0 ? (
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {percent(row.current / total)} du mois
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
