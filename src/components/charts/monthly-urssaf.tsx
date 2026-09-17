"use client";

import { useState } from "react";
import { axisLabel, dayLabel, monthLabel, type DayKey, type MonthKey } from "@/lib/dates";
import { money, moneyCompact } from "@/lib/format";
import { ChartTooltip, type TooltipState, barPath, niceMax, ticksFor, useMeasure } from "./chart-kit";

export type MonthlyRow = {
  month: MonthKey;
  segments: { id: string; label: string; color: string; cents: number }[];
  totalCents: number;
  underAcre: boolean;
};

const PAD = { top: 26, right: 8, bottom: 28, left: 52 };
const MAX_BAR = 24;
const GAP = 2;

/**
 * Cotisations dues mois par mois.
 *
 * Le repère de fin d'ACRE est le point de l'affichage : les taux
 * doublent d'un coup à cette date, sans dégressivité, et voir la marche
 * arriver vaut mieux que la découvrir sur un appel de cotisations.
 */
export function MonthlyUrssaf({
  rows,
  acreEndsOn,
  height = 230,
}: {
  rows: MonthlyRow[];
  acreEndsOn?: DayKey | null;
  height?: number;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [tip, setTip] = useState<TooltipState>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  const max = niceMax(Math.max(...rows.map((r) => r.totalCents), 1));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const band = rows.length ? plotW / rows.length : 0;
  const barW = Math.min(MAX_BAR, band * 0.6);
  const scale = (v: number) => (v / max) * plotH;

  // Le repère se place à la frontière entre le dernier mois couvert par
  // l'ACRE et le premier qui ne l'est plus.
  const cutIndex = acreEndsOn ? rows.findIndex((r) => `${r.month}-01` > acreEndsOn) : -1;
  const labelEvery = band > 0 ? Math.max(1, Math.ceil(34 / band)) : 1;

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {width > 0 ? (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="Cotisations dues mois par mois"
          onMouseLeave={() => {
            setTip(null);
            setHovered(null);
          }}
        >
          {ticksFor(max, 3).map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={PAD.top + plotH - scale(t)}
                y2={PAD.top + plotH - scale(t)}
                stroke={t === 0 ? "var(--axis)" : "var(--grid)"}
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={PAD.top + plotH - scale(t) + 4}
                textAnchor="end"
                className="tnum"
                fontSize={11}
                fill="var(--text-muted)"
              >
                {moneyCompact(t)}
              </text>
            </g>
          ))}

          {/* Fin de l'ACRE */}
          {cutIndex > 0 ? (
            <g>
              <line
                x1={PAD.left + band * cutIndex}
                x2={PAD.left + band * cutIndex}
                y1={PAD.top - 8}
                y2={PAD.top + plotH}
                stroke="var(--warning)"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
              <text
                x={PAD.left + band * cutIndex + 4}
                y={PAD.top - 12}
                fontSize={10}
                fontWeight={600}
                fill="var(--warning)"
              >
                fin de l&apos;ACRE
              </text>
            </g>
          ) : null}

          {rows.map((row, i) => {
            const cx = PAD.left + band * i + band / 2;
            const x = cx - barW / 2;
            let cursor = PAD.top + plotH;
            const segments = row.segments.filter((s) => s.cents > 0);

            return (
              <g key={row.month} opacity={hovered !== null && hovered !== i ? 0.55 : 1}>
                {segments.map((seg, j) => {
                  const h = scale(seg.cents);
                  const drawn = Math.max(1, h - (j < segments.length - 1 ? GAP : 0));
                  const top = cursor - h;
                  cursor -= h;
                  return (
                    <path
                      key={seg.id}
                      className="grow-y"
                      style={{ animationDelay: `${i * 25}ms` }}
                      d={barPath(x, top, barW, drawn, 4, j === segments.length - 1 ? "top" : "none")}
                      fill={seg.color}
                    />
                  );
                })}

                {i % labelEvery === 0 || i === rows.length - 1 ? (
                  <text
                    x={Math.min(Math.max(cx, PAD.left + 12), width - PAD.right - 12)}
                    y={height - 8}
                    textAnchor="middle"
                    fontSize={10.5}
                    fill="var(--text-muted)"
                  >
                    {axisLabel(row.month, rows[Math.max(0, i - labelEvery)]?.month)}
                  </text>
                ) : null}

                <rect
                  x={PAD.left + band * i}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  onMouseMove={(e) => {
                    setHovered(i);
                    const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                    setTip({
                      x: e.clientX - rect.left,
                      y: PAD.top,
                      title: monthLabel(row.month, "full"),
                      rows: [
                        ...segments.map((s) => ({
                          label: s.label,
                          value: money(s.cents),
                          color: s.color,
                        })),
                        { label: "Total dû", value: money(row.totalCents), strong: true },
                      ],
                      footer: row.underAcre
                        ? "Taux réduit par l'ACRE"
                        : acreEndsOn
                          ? `Taux plein depuis le ${dayLabel(acreEndsOn)}`
                          : undefined,
                    });
                  }}
                />
              </g>
            );
          })}
        </svg>
      ) : null}
      <ChartTooltip state={tip} width={width} />
    </div>
  );
}
