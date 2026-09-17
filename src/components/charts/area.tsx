"use client";

import { useId, useState } from "react";
import { axisLabel, monthLabel, type MonthKey } from "@/lib/dates";
import { money, moneyCompact } from "@/lib/format";
import { ChartTooltip, type TooltipState, niceMax, smoothPath, useMeasure } from "./chart-kit";

/* ===================================================================
   Courbe pleine — une forme sous un chiffre

   Un grand nombre seul ne dit pas s'il est haut ou bas. La courbe
   placée dessous lui donne son échelle sans occuper de place : c'est un
   repère, pas un graphique à lire en détail, d'où l'absence d'axes.
   =================================================================== */

export function TrendArea({
  months,
  values,
  color = "var(--series-1)",
  height = 72,
  highlightLast = true,
}: {
  months: MonthKey[];
  values: number[];
  color?: string;
  height?: number;
  highlightLast?: boolean;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [tip, setTip] = useState<TooltipState>(null);
  const [index, setIndex] = useState<number | null>(null);
  const gradientId = useId();

  if (values.length < 2) return <div ref={ref} style={{ height }} />;

  const max = niceMax(Math.max(...values, 1));
  const pad = 6;
  const step = width > 0 ? (width - pad * 2) / (values.length - 1) : 0;
  const x = (i: number) => pad + step * i;
  const y = (v: number) => height - 8 - (v / max) * (height - 18);

  const points = values.map((v, i) => ({ x: x(i), y: y(v) }));
  const line = smoothPath(points);
  const area = `${line} L${x(values.length - 1)},${height - 6} L${x(0)},${height - 6} Z`;
  const last = values.length - 1;
  const shown = index ?? (highlightLast ? last : null);

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 ? (
        <svg
          width={width}
          height={height}
          aria-hidden
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const i = Math.max(
              0,
              Math.min(values.length - 1, Math.round((e.clientX - rect.left - pad) / (step || 1))),
            );
            setIndex(i);
            setTip({
              x: x(i),
              y: 0,
              title: monthLabel(months[i], "full"),
              rows: [{ label: "Net", value: money(values[i]), color }],
            });
          }}
          onMouseLeave={() => {
            setIndex(null);
            setTip(null);
          }}
        >
          {/* Le remplissage est un lavis, jamais un aplat : il situe la
              courbe sans lui voler l'attention, et s'éteint vers le bas
              pour ne pas dessiner un bloc au pied de la carte. */}
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.16} />
              <stop offset="100%" stopColor={color} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} />
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {shown !== null ? (
            <>
              <line
                x1={x(shown)}
                x2={x(shown)}
                y1={y(values[shown])}
                y2={height - 6}
                stroke={color}
                strokeWidth={1}
                opacity={0.35}
              />
              <circle
                cx={x(shown)}
                cy={y(values[shown])}
                r={4}
                fill={color}
                stroke="var(--surface-1)"
                strokeWidth={2}
              />
            </>
          ) : null}
        </svg>
      ) : null}
      <ChartTooltip state={tip} width={width} />
    </div>
  );
}

/* ===================================================================
   Cumul de l'année, comparé à l'année précédente

   Le cumul répond à une question que le mois par mois ne peut pas
   trancher : suis-je en avance ou en retard sur l'an dernier, à la
   même date ?
   =================================================================== */

const PAD = { top: 18, right: 12, bottom: 26, left: 50 };

export function CumulativeYear({
  months,
  current,
  previous,
  currentLabel,
  previousLabel,
  goalCents,
  through,
  height = 210,
}: {
  months: MonthKey[];
  current: number[];
  previous: number[];
  currentLabel: string;
  previousLabel: string;
  goalCents?: number | null;
  /** Dernier mois réellement renseigné : la courbe s'arrête là. */
  through?: number;
  height?: number;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [index, setIndex] = useState<number | null>(null);
  const [tip, setTip] = useState<TooltipState>(null);

  const hasPrevious = previous.some((v) => v > 0);
  const max = niceMax(Math.max(...current, ...(hasPrevious ? previous : [0]), goalCents ?? 0, 1));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const step = months.length > 1 ? plotW / (months.length - 1) : 0;
  const x = (i: number) => PAD.left + step * i;
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  // Le cumul s'arrête au dernier mois réellement renseigné : prolonger
  // la courbe à plat jusqu'en décembre laisserait croire à une
  // stagnation. Ce rang vient du dehors — un cumul ne décroît jamais,
  // on ne peut donc pas le déduire de la série elle-même.
  const lastFilled = Math.max(
    0,
    Math.min(current.length - 1, through ?? current.length - 1),
  );
  const curPoints = current.slice(0, lastFilled + 1).map((v, i) => ({ x: x(i), y: y(v) }));
  const curLine = smoothPath(curPoints);
  const curArea =
    curPoints.length > 1
      ? `${curLine} L${x(lastFilled)},${y(0)} L${x(0)},${y(0)} Z`
      : "";

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {[
          [currentLabel, "var(--series-1)"],
          ...(hasPrevious ? ([[previousLabel, "var(--series-5)"]] as const) : []),
        ].map(([label, color]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: color }} />
            <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              {label}
            </span>
          </span>
        ))}
        {goalCents ? (
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-0 w-4 border-t border-dashed"
              style={{ borderColor: "var(--text-muted)" }}
            />
            <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              Objectif
            </span>
          </span>
        ) : null}
      </div>

      <div ref={ref} className="relative" style={{ height }}>
        {width > 0 ? (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`Cumul ${currentLabel} comparé à ${previousLabel}`}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const i = Math.max(
                0,
                Math.min(months.length - 1, Math.round((e.clientX - rect.left - PAD.left) / (step || 1))),
              );
              setIndex(i);
              setTip({
                x: x(i) - PAD.left,
                y: PAD.top,
                title: `Cumul à fin ${monthLabel(months[i])}`,
                rows: [
                  ...(i <= lastFilled
                    ? [
                        {
                          label: currentLabel,
                          value: money(current[i] ?? 0),
                          color: "var(--series-1)",
                        },
                      ]
                    : []),
                  ...(hasPrevious
                    ? [
                        {
                          label: previousLabel,
                          value: money(previous[i] ?? 0),
                          color: "var(--series-5)",
                        },
                      ]
                    : []),
                ],
              });
            }}
            onMouseLeave={() => {
              setIndex(null);
              setTip(null);
            }}
          >
            {[0, max / 2, max].map((t) => (
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

            {goalCents ? (
              <g>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(goalCents)}
                  y2={y(goalCents)}
                  stroke="var(--text-muted)"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
              </g>
            ) : null}

            {hasPrevious ? (
              <path
                d={smoothPath(previous.map((v, i) => ({ x: x(i), y: y(v) })))}
                fill="none"
                stroke="var(--series-5)"
                strokeWidth={2}
                strokeLinecap="round"
                opacity={0.9}
              />
            ) : null}

            {curArea ? <path d={curArea} fill="var(--series-1)" opacity={0.1} /> : null}
            <path
              d={curLine}
              fill="none"
              stroke="var(--series-1)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

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

            <circle
              cx={x(lastFilled)}
              cy={y(current[lastFilled] ?? 0)}
              r={4.5}
              fill="var(--series-1)"
              stroke="var(--surface-1)"
              strokeWidth={2}
            />

            {months.map((m, i) =>
              i % 2 === 0 ? (
                <text
                  key={m}
                  x={x(i)}
                  y={height - 8}
                  textAnchor={i === 0 ? "start" : i === months.length - 1 ? "end" : "middle"}
                  fontSize={10.5}
                  fill="var(--text-muted)"
                >
                  {axisLabel(m, months[Math.max(0, i - 2)])}
                </text>
              ) : null,
            )}
          </svg>
        ) : null}
        <ChartTooltip state={tip} width={width} />
      </div>
    </div>
  );
}
