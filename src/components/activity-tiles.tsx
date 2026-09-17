"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStore } from "./store";
import { StreamIcon } from "./ui/icons";
import { TrendArea } from "./charts/area";
import { Delta } from "./ui/kit";
import { bucketFor, delta } from "@/lib/analytics";
import { money } from "@/lib/format";
import { monthRange, shiftMonth, type MonthKey } from "@/lib/dates";

/**
 * Une tuile par activité, toutes à la même échelle de lecture.
 *
 * C'est le principe des petits multiples : douze mois côte à côte pour
 * chaque activité, ce qu'aucun graphique empilé ne montre — dans un
 * empilement, une activité qui stagne et une qui recule ont la même
 * allure dès que les autres bougent.
 */
export function ActivityTiles({ months = 12 }: { months?: number }) {
  const { activeStreams, buckets, month } = useStore();
  const window = useMemo(() => monthRange(month, months), [month, months]);

  const tiles = useMemo(
    () =>
      activeStreams
        .map((stream) => {
          const values = window.map((m) => bucketFor(buckets, m).byStream[stream.id]?.net ?? 0);
          const current = values[values.length - 1] ?? 0;
          const previous = values[values.length - 2] ?? 0;
          return {
            stream,
            values,
            current,
            change: delta(current, previous),
            total: values.reduce((a, v) => a + v, 0),
          };
        })
        .filter((t) => t.total !== 0)
        .sort((a, b) => b.current - a.current),
    [activeStreams, buckets, window],
  );

  if (tiles.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map(({ stream, values, current, change }) => {
        const color = `var(--series-${stream.color_slot})`;
        return (
          <Link
            key={stream.id}
            href={`/activites/${encodeURIComponent(stream.key)}`}
            className="card anim-rise flex flex-col gap-2 p-3.5 transition-colors hover:bg-[var(--surface-2)]"
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px]"
                style={{ background: color, color: "#fff" }}
              >
                <StreamIcon name={stream.icon} size={13} />
              </span>
              <span
                className="truncate text-[12px] font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                {stream.name}
              </span>
            </div>

            <span className="text-[19px] font-semibold leading-none tracking-tight">
              {money(current)}
            </span>

            {change.ratio !== null ? (
              <Delta ratio={change.ratio} label="vs M-1" />
            ) : (
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {current > 0 ? "premier mois" : "rien ce mois-ci"}
              </span>
            )}

            <TrendArea
              months={window}
              values={values}
              color={color}
              height={44}
            />
          </Link>
        );
      })}
    </div>
  );
}

export { shiftMonth };
export type { MonthKey };
