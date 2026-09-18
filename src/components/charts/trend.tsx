"use client";

import { useMemo, useState } from "react";
import { axisLabel, monthLabel, type MonthKey } from "@/lib/dates";
import { money, moneyCompact } from "@/lib/format";
import {
  ChartTooltip,
  Legend,
  type TooltipState,
  niceMax,
  smoothPath,
  ticksFor,
  useMeasure,
} from "./chart-kit";

export type TrendSeries = {
  id: string;
  label: string;
  color: string;
  values: number[];
};

const PAD = { top: 18, right: 16, bottom: 26, left: 48 };

/**
 * Courbes sur un axe unique. Toutes les séries passées ici sont en
 * euros : jamais deux échelles dans un même cadre.
 *
 * Le réticule accroche le mois le plus proche du curseur — on vise une
 * date, pas une ligne de deux pixels — et la bulle liste toutes les
 * séries à cette date d'un coup.
 */
export function Trend({
  months,
  series,
  height = 220,
  zeroLine = false,
}: {
  months: MonthKey[];
  series: TrendSeries[];
  height?: number;
  zeroLine?: boolean;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [index, setIndex] = useState<number | null>(null);
  const [tip, setTip] = useState<TooltipState>(null);

  const flat = series.flatMap((s) => s.values);
  const rawMax = Math.max(...flat, 1);
  const rawMin = Math.min(...flat, 0);
  const max = niceMax(rawMax);
  const min = zeroLine && rawMin < 0 ? -niceMax(Math.abs(rawMin)) : 0;

  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const step = months.length > 1 ? plotW / (months.length - 1) : 0;
  const x = (i: number) => PAD.left + step * i;
  const y = (v: number) => PAD.top + plotH - ((v - min) / (max - min)) * plotH;

  const paths = useMemo(
    () =>
      series.map((s) => ({
        ...s,
        d: smoothPath(s.values.map((v, i) => ({ x: x(i), y: y(v) }))),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, width, height, max, min, months.length],
  );

  const ticks = min < 0 ? [min, min / 2, 0, max / 2, max] : ticksFor(max);

  // Un libellé sur N, calculé sur la place réellement disponible plutôt
  // que sur un nombre de mois fixé d'avance.
  const labelEvery = step > 0 ? Math.max(1, Math.ceil(42 / step)) : 1;

  return (
    <div>
      <div className="mb-3">
        <Legend items={series.map((s) => ({ id: s.id, label: s.label, color: s.color }))} />
      </div>
      <div ref={ref} className="relative" style={{ height }}>
        {width > 0 ? (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={series.map((s) => s.label).join(" et ")}
            onPointerMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const raw = (e.clientX - rect.left - PAD.left) / (step || 1);
              const i = Math.max(0, Math.min(months.length - 1, Math.round(raw)));
              setIndex(i);
              setTip({
                x: x(i) - PAD.left,
                y: PAD.top,
                title: monthLabel(months[i], "full"),
                rows: series.map((s) => ({
                  label: s.label,
                  value: money(s.values[i] ?? 0),
                  color: s.color,
                })),
              });
            }}
            onPointerLeave={() => {
              setIndex(null);
              setTip(null);
            }}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke={t === 0 ? "var(--axis)" : "var(--grid)"}
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 8}
                  y={y(t) + 4}
                  textAnchor="end"
                  className="tnum"
                  fontSize={11}
                  fill="var(--text-muted)"
                >
                  {moneyCompact(t)}
                </text>
              </g>
            ))}

            {/* Réticule */}
            {index !== null ? (
              <line
                x1={x(index)}
                x2={x(index)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="var(--axis)"
                strokeWidth={1}
              />
            ) : null}

            {paths.map((s) => (
              <path
                key={s.id}
                d={s.d}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}

            {/* Marqueur de fin + point survolé, cerclés de la couleur de
                surface pour rester lisibles quand deux lignes se croisent */}
            {series.map((s) => {
              const last = s.values.length - 1;
              const pts = index !== null ? [index, last] : [last];
              return [...new Set(pts)].map((i) => (
                <circle
                  key={`${s.id}-${i}`}
                  cx={x(i)}
                  cy={y(s.values[i] ?? 0)}
                  r={i === index ? 5 : 4}
                  fill={s.color}
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                />
              ));
            })}

            {months.map((m, i) => {
              const isLast = i === months.length - 1;
              // Le dernier libellé est prioritaire : s'il tombe trop
              // près du précédent, c'est le précédent qu'on sacrifie.
              const collidesWithLast = !isLast && (months.length - 1 - i) * step < 42;
              if (!(i % labelEvery === 0 || isLast) || collidesWithLast) return null;
              return (
                <text
                  key={m}
                  x={x(i)}
                  y={height - 8}
                  textAnchor={i === 0 ? "start" : isLast ? "end" : "middle"}
                  fontSize={10.5}
                  fill="var(--text-muted)"
                >
                  {axisLabel(m, months[Math.max(0, i - labelEvery)])}
                </text>
              );
            })}
          </svg>
        ) : null}
        <ChartTooltip state={tip} width={width} />
      </div>
    </div>
  );
}
