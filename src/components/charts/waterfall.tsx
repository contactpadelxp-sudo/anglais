"use client";

import { useMemo, useState } from "react";
import { money, moneyCompact, percent } from "@/lib/format";
import { ChartTooltip, type TooltipState, barPath, niceMax, useMeasure } from "./chart-kit";

export type WaterfallStep = {
  id: string;
  label: string;
  /** Positif pour une entrée, négatif pour une déduction. */
  deltaCents: number;
  /** Étape de total : la barre part de zéro au lieu de flotter. */
  total?: boolean;
};

const PAD = { top: 26, right: 8, bottom: 40, left: 52 };
const MAX_BAR = 24;

/**
 * Cascade : d'où part l'argent, ce qui en est retiré, ce qui reste.
 *
 * Trois couleurs seulement — ce qui entre, ce qui sort, ce qui reste —
 * validées pour les deux thèmes et en vision daltonienne. Chaque barre
 * porte sa valeur : rien ne dépend du survol.
 */
export function Waterfall({ steps, height = 260 }: { steps: WaterfallStep[]; height?: number }) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [tip, setTip] = useState<TooltipState>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  // Position de départ et d'arrivée de chaque barre, accumulées sans
  // variable mutable : le rendu ne fait que lire des valeurs déjà posées.
  const bars = useMemo(
    () =>
      steps.reduce<{ step: WaterfallStep; from: number; to: number; low: number; high: number }[]>(
        (acc, step) => {
          const previous = acc[acc.length - 1]?.to ?? 0;
          const from = step.total ? 0 : previous;
          const to = step.total ? step.deltaCents : previous + step.deltaCents;
          return [...acc, { step, from, to, low: Math.min(from, to), high: Math.max(from, to) }];
        },
        [],
      ),
    [steps],
  );

  const max = niceMax(Math.max(...bars.map((b) => b.high), 1));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const band = bars.length ? plotW / bars.length : 0;

  /*
   * Les étiquettes sous les barres ne s'enroulent pas : à cinq barres
   * sur un écran de 390 px, « Tout encaissé » et « Cotisations » se
   * chevauchaient. On rétrécit plutôt que de laisser deux mots se
   * marcher dessus — 9 px reste lisible, deux mots collés ne le sont
   * pas. En dessous, l'étiquette est coupée net.
   */
  const labelSize = band >= 72 ? 10.5 : band >= 58 ? 9.5 : 9;
  const maxChars = Math.max(4, Math.floor(band / (labelSize * 0.52)));
  const court = (t: string) => (t.length <= maxChars ? t : `${t.slice(0, maxChars - 1)}…`);
  const barW = Math.min(MAX_BAR, band * 0.52);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  const entree = "var(--series-1)";
  const sortie = "var(--series-2)";
  const reste = "var(--series-3)";
  const colorOf = (b: (typeof bars)[number], i: number) =>
    b.step.total ? (i === 0 ? entree : reste) : b.step.deltaCents >= 0 ? entree : sortie;

  const depart = bars[0]?.to ?? 0;

  return (
    <div>
      <div ref={ref} className="relative" style={{ height }}>
        {width > 0 ? (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label="Décomposition du chiffre d'affaires jusqu'au net"
            onPointerLeave={() => {
              setTip(null);
              setHovered(null);
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

            {bars.map((b, i) => {
              const cx = PAD.left + band * i + band / 2;
              const x = cx - barW / 2;
              const top = y(b.high);
              const h = Math.max(2, y(b.low) - y(b.high));
              const color = colorOf(b, i);

              return (
                <g key={b.step.id} opacity={hovered !== null && hovered !== i ? 0.55 : 1}>
                  {/* Trait de liaison : il montre que chaque barre repart
                      du niveau où la précédente s'est arrêtée. */}
                  {i > 0 && !b.step.total ? (
                    <line
                      x1={PAD.left + band * (i - 1) + band / 2 + barW / 2}
                      x2={x}
                      y1={y(bars[i - 1].to)}
                      y2={y(bars[i - 1].to)}
                      stroke="var(--axis)"
                      strokeWidth={1}
                      strokeDasharray="2 2"
                    />
                  ) : null}

                  <path
                    className="grow-y"
                    style={{ animationDelay: `${i * 60}ms` }}
                    d={barPath(x, top, barW, h, 4, b.step.total ? "top" : "none")}
                    fill={color}
                  />

                  <text
                    x={cx}
                    y={top - 8}
                    textAnchor="middle"
                    className="tnum"
                    fontSize={11}
                    fontWeight={600}
                    fill="var(--text-primary)"
                  >
                    {b.step.total ? moneyCompact(b.step.deltaCents) : moneyCompact(b.step.deltaCents)}
                  </text>

                  <text
                    x={cx}
                    y={height - 22}
                    textAnchor="middle"
                    fontSize={labelSize}
                    fill="var(--text-secondary)"
                  >
                    {court(b.step.label)}
                  </text>

                  {!b.step.total && depart > 0 ? (
                    <text
                      x={cx}
                      y={height - 8}
                      textAnchor="middle"
                      className="tnum"
                      fontSize={10}
                      fill="var(--text-muted)"
                    >
                      {percent(Math.abs(b.step.deltaCents) / depart, 1)}
                    </text>
                  ) : null}

                  <rect
                    x={PAD.left + band * i}
                    y={PAD.top}
                    width={band}
                    height={plotH}
                    fill="transparent"
                    onPointerMove={(e) => {
                      setHovered(i);
                      const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                      setTip({
                        x: e.clientX - rect.left,
                        y: PAD.top,
                        title: b.step.label,
                        rows: [
                          { label: b.step.total ? "Montant" : "Variation", value: money(b.step.deltaCents), color },
                          ...(b.step.total
                            ? []
                            : [{ label: "Reste après", value: money(b.to), strong: false }]),
                        ],
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

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {[
          ["Ce qui entre", entree],
          ["Ce qui sort", sortie],
          ["Ce qui reste", reste],
        ].map(([label, color]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-[3px]"
              style={{ background: color }}
            />
            <span className="text-[11.5px]" style={{ color: "var(--text-secondary)" }}>
              {label}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
