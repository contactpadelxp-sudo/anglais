"use client";

import { useState } from "react";
import { money, moneyCompact } from "@/lib/format";
import { daysInMonth, monthLabel, today, type MonthKey } from "@/lib/dates";
import { ChartTooltip, type TooltipState, niceMax, useMeasure } from "./chart-kit";

/* ===================================================================
   L'escalier du mois

   Le cumul jour par jour, en marches — jamais une courbe lissée.
   L'argent n'arrive pas en continu : il tombe par virements. Une
   courbe dessinerait une pente entre deux versements, c'est-à-dire un
   débit qui n'a jamais existé. Une marche dit la vérité : plat, puis
   saut.

   La diagonale pointillée est l'objectif réparti sur le mois. Au-dessus
   d'elle on est en avance, en dessous en retard — et l'écart se lit
   sans chiffre.
   =================================================================== */

export function MonthStairs({
  month,
  amounts,
  goalCents,
  basis,
  height = 168,
  color = "var(--series-1)",
}: {
  month: MonthKey;
  /** Montant net du jour, indexé par jour − 1. */
  amounts: number[];
  goalCents?: number | null;
  basis: "cash" | "accrual";
  height?: number;
  color?: string;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [tip, setTip] = useState<TooltipState>(null);
  const [hover, setHover] = useState<number | null>(null);

  const n = daysInMonth(month);
  const pad = { top: 18, right: 10, bottom: 20, left: 8 };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;

  // Cumul jour par jour.
  const cumul: number[] = [];
  let running = 0;
  for (let i = 0; i < n; i += 1) {
    running += amounts[i] ?? 0;
    cumul.push(running);
  }
  const totalCents = running;

  const max = niceMax(Math.max(totalCents, goalCents ?? 0, 1));
  const x = (day: number) => pad.left + ((day - 1) / Math.max(1, n - 1)) * plotW;
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;

  const todayKey = today();
  const currentDay = todayKey.slice(0, 7) === month ? Number(todayKey.slice(8, 10)) : null;

  // L'escalier s'arrête à aujourd'hui pour un mois en cours : le
  // prolonger à plat jusqu'au 30 ferait croire à une fin de mois déjà
  // jouée. Mais jamais AVANT le dernier jour qui porte de l'argent —
  // un versement daté d'après aujourd'hui existe (Vinted verse à
  // date), et le cacher ferait mentir le total affiché.
  let lastWithMoney = 0;
  for (let i = 0; i < n; i += 1) if ((amounts[i] ?? 0) !== 0) lastWithMoney = i + 1;
  const lastDay = Math.max(currentDay ?? n, lastWithMoney, 1);

  let steps = `M${x(1)},${y(0)}`;
  for (let i = 0; i < lastDay; i += 1) {
    steps += ` L${x(i + 1)},${y(i === 0 ? 0 : cumul[i - 1])} L${x(i + 1)},${y(cumul[i])}`;
  }
  const area = `${steps} L${x(lastDay)},${y(0)} Z`;

  const shownDay = hover ?? lastDay;
  const shownValue = cumul[shownDay - 1] ?? 0;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 ? (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Cumul jour par jour de ${monthLabel(month, "full")} : ${money(totalCents)}`}
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const d = Math.max(
              1,
              Math.min(lastDay, Math.round(((e.clientX - rect.left - pad.left) / (plotW || 1)) * (n - 1)) + 1),
            );
            setHover(d);
            setTip({
              x: x(d) - pad.left,
              y: 0,
              title: `${d} ${monthLabel(month)}`,
              rows: [
                { label: basis === "cash" ? "Encaissé ce jour" : "Vendu ce jour", value: money(amounts[d - 1] ?? 0) },
                { label: "Cumul", value: money(cumul[d - 1] ?? 0), color },
              ],
            });
          }}
          onPointerLeave={() => {
            setHover(null);
            setTip(null);
          }}
        >
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={y(0)}
            y2={y(0)}
            stroke="var(--axis)"
            strokeWidth={1}
          />

          {/* L'objectif réparti au prorata des jours. Il n'apparaît que
              s'il existe : une diagonale sans objectif ne mesurerait
              rien. */}
          {goalCents ? (
            <>
              <line
                x1={x(1)}
                x2={x(n)}
                y1={y(0)}
                y2={y(goalCents)}
                stroke="var(--text-muted)"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <text
                x={width - pad.right}
                y={y(goalCents) - 5}
                textAnchor="end"
                fontSize={10.5}
                fill="var(--text-muted)"
              >
                objectif {moneyCompact(goalCents)}
              </text>
            </>
          ) : null}

          <path d={area} fill={color} opacity={0.1} />
          <path
            d={steps}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {hover !== null ? (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={pad.top}
              y2={y(0)}
              stroke="var(--axis)"
              strokeWidth={1}
            />
          ) : null}

          <circle
            cx={x(shownDay)}
            cy={y(shownValue)}
            r={4.5}
            fill={color}
            stroke="var(--surface-1)"
            strokeWidth={2}
          />

          {/* Le total est ÉCRIT, pas caché derrière un survol. */}
          <text
            x={Math.min(width - pad.right, Math.max(x(shownDay), pad.left + 40))}
            y={Math.max(12, y(shownValue) - 11)}
            textAnchor={shownDay > n * 0.7 ? "end" : "middle"}
            fontSize={11.5}
            fontWeight={600}
            fill="var(--text-primary)"
          >
            {money(shownValue)}
          </text>

          {[1, Math.round(n / 2), n].map((d) => (
            <text
              key={d}
              x={x(d)}
              y={height - 5}
              textAnchor={d === 1 ? "start" : d === n ? "end" : "middle"}
              fontSize={10.5}
              fill="var(--text-muted)"
            >
              {d === 1 ? `1er ${monthLabel(month, "short")}` : d}
            </text>
          ))}

          {currentDay !== null ? (
            <text
              x={x(currentDay)}
              y={height - 5}
              textAnchor="middle"
              fontSize={10}
              fontWeight={600}
              fill="var(--text-secondary)"
            >
              auj.
            </text>
          ) : null}
        </svg>
      ) : null}
      <ChartTooltip state={tip} width={width} />
    </div>
  );
}
