"use client";

import { useMemo, useState } from "react";
import type { MonthBucket, Totals } from "@/lib/analytics";
import type { Stream } from "@/lib/types";
import { axisLabel, monthLabel, type MonthKey } from "@/lib/dates";
import { money, moneyCompact } from "@/lib/format";
import {
  ChartTooltip,
  Legend,
  TableToggle,
  type TooltipState,
  barPath,
  niceMax,
  ticksFor,
  useMeasure,
} from "./chart-kit";

type Metric = "net" | "revenue" | "margin";

const PAD = { top: 26, right: 8, bottom: 26, left: 48 };
const MAX_BAR = 24;
const GAP = 2;
const RADIUS = 4;
const LABEL_WIDTH = 34;

/**
 * Colonnes empilées par activité, un pas par mois.
 *
 * La colonne entière est la cible de survol : on vise un mois, pas un
 * segment de trois pixels. Un clic sélectionne le mois et recadre tout
 * le reste de la page.
 */
export function StackedMonths({
  data,
  streams,
  metric = "net",
  selected,
  onSelect,
  height = 240,
}: {
  data: MonthBucket[];
  streams: Stream[];
  metric?: Metric;
  selected?: MonthKey;
  onSelect?: (month: MonthKey) => void;
  height?: number;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [tip, setTip] = useState<TooltipState>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [focusStream, setFocusStream] = useState<string | null>(null);
  const [table, setTable] = useState(false);

  const visible = useMemo(
    () => streams.filter((s) => !focusStream || s.id === focusStream),
    [streams, focusStream],
  );

  const totals = useMemo(
    () =>
      data.map((bucket) =>
        visible.reduce((sum, s) => sum + Math.max(0, bucket.byStream[s.id]?.[metric] ?? 0), 0),
      ),
    [data, visible, metric],
  );

  const max = niceMax(Math.max(...totals, 1));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.min(MAX_BAR, band * 0.62);
  const scale = (v: number) => (v / max) * plotH;

  // Sur un écran étroit, douze libellés de mois ne tiennent pas côte à
  // côte. Deux d'entre eux comptent plus que les autres — le dernier
  // mois et le mois cadré — donc on les place en premier, puis on
  // remplit avec les autres en écartant tout ce qui les chevaucherait.
  const labelled = useMemo(() => {
    if (band <= 0 || data.length === 0) return new Set<number>();
    const every = Math.max(1, Math.ceil(LABEL_WIDTH / band));
    const selectedIndex = data.findIndex((b) => b.month === selected);
    const forced = [data.length - 1, selectedIndex].filter((i) => i >= 0);
    const chosen = new Set(forced);
    for (let i = 0; i < data.length; i += every) {
      if (forced.every((f) => Math.abs(f - i) * band >= LABEL_WIDTH)) chosen.add(i);
    }
    return chosen;
  }, [band, data, selected]);

  /** Index du libellé précédemment affiché : sert à ne rappeler
   *  l'année que lorsqu'elle change réellement à l'écran. */
  const previousLabelled = (i: number) => {
    for (let j = i - 1; j >= 0; j--) if (labelled.has(j)) return data[j].month;
    return undefined;
  };

  const legend = streams.map((s) => ({
    id: s.id,
    label: s.name,
    color: `var(--series-${s.color_slot})`,
  }));

  function showTip(i: number, clientX: number, rect: DOMRect) {
    const bucket = data[i];
    const rows = visible
      .map((s) => ({
        label: s.name,
        raw: bucket.byStream[s.id]?.[metric] ?? 0,
        color: `var(--series-${s.color_slot})`,
      }))
      .filter((r) => r.raw !== 0)
      .sort((a, b) => b.raw - a.raw)
      .map((r) => ({ label: r.label, value: money(r.raw), color: r.color }));

    setTip({
      x: clientX - rect.left,
      y: PAD.top,
      title: `${monthLabel(bucket.month)} ${bucket.month.slice(0, 4)}`,
      rows:
        rows.length > 0
          ? [...rows, { label: "Total", value: money(totals[i]), strong: true }]
          : [{ label: "Aucun revenu", value: "—", strong: false }],
      footer: onSelect ? "Clic pour cadrer la page sur ce mois" : undefined,
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Legend
          items={legend}
          active={focusStream}
          onToggle={(id) => setFocusStream((prev) => (prev === id ? null : id))}
        />
        <TableToggle open={table} onToggle={() => setTable((t) => !t)} id="stacked-table" />
      </div>

      <div ref={ref} className="relative" style={{ height }}>
        {width > 0 ? (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`Revenus par activité sur ${data.length} mois`}
            onMouseLeave={() => {
              setTip(null);
              setHovered(null);
            }}
          >
            {/* Grille : filet d'un pas hors surface, jamais en pointillés */}
            {ticksFor(max).map((t) => {
              const y = PAD.top + plotH - scale(t);
              return (
                <g key={t}>
                  <line
                    x1={PAD.left}
                    x2={width - PAD.right}
                    y1={y}
                    y2={y}
                    stroke={t === 0 ? "var(--axis)" : "var(--grid)"}
                    strokeWidth={1}
                  />
                  <text
                    x={PAD.left - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="tnum"
                    fontSize={11}
                    fill="var(--text-muted)"
                  >
                    {moneyCompact(t)}
                  </text>
                </g>
              );
            })}

            {data.map((bucket, i) => {
              const cx = PAD.left + band * i + band / 2;
              const x = cx - barW / 2;
              const isSelected = selected === bucket.month;
              const isHovered = hovered === i;

              let cursor = PAD.top + plotH;
              const segments = visible
                .map((s) => ({ stream: s, value: Math.max(0, bucket.byStream[s.id]?.[metric] ?? 0) }))
                .filter((s) => s.value > 0);

              return (
                <g key={bucket.month}>
                  {/* Le survol éclaire la colonne. Le mois cadré, lui,
                      se marque sous l'axe : un bandeau sur toute la
                      hauteur se lirait comme une barre de données. */}
                  {isHovered && !isSelected ? (
                    <rect
                      x={PAD.left + band * i + 1}
                      y={PAD.top}
                      width={Math.max(0, band - 2)}
                      height={plotH}
                      rx={6}
                      fill="var(--surface-2)"
                      opacity={0.75}
                    />
                  ) : null}
                  {segments.map((seg, j) => {
                    const h = scale(seg.value);
                    // Gap de 2px en couleur de surface entre les segments :
                    // c'est le vide qui sépare, pas un contour.
                    const drawn = Math.max(1, h - (j < segments.length - 1 ? GAP : 0));
                    const y = cursor - h;
                    cursor -= h;
                    const isTop = j === segments.length - 1;
                    return (
                      <path
                        key={seg.stream.id}
                        className="grow-y"
                        style={{ animationDelay: `${i * 22}ms` }}
                        d={barPath(x, y, barW, drawn, RADIUS, isTop ? "top" : "none")}
                        fill={`var(--series-${seg.stream.color_slot})`}
                      />
                    );
                  })}

                  {/* Étiquette directe : uniquement sur le mois cadré. */}
                  {isSelected && totals[i] > 0 ? (
                    <text
                      x={Math.min(Math.max(cx, PAD.left + 18), width - PAD.right - 18)}
                      y={PAD.top + plotH - scale(totals[i]) - 7}
                      textAnchor="middle"
                      className="tnum"
                      fontSize={11}
                      fontWeight={600}
                      fill="var(--text-primary)"
                    >
                      {moneyCompact(totals[i])}
                    </text>
                  ) : null}

                  {labelled.has(i) ? (
                    <>
                      {isSelected ? (
                        <rect
                          x={Math.min(Math.max(cx, PAD.left + 12), width - PAD.right - 12) - 21}
                          y={height - 19}
                          width={42}
                          height={16}
                          rx={8}
                          fill="var(--surface-2)"
                        />
                      ) : null}
                      <text
                        x={Math.min(Math.max(cx, PAD.left + 12), width - PAD.right - 12)}
                        y={height - 7}
                        textAnchor="middle"
                        fontSize={10.5}
                        fontWeight={isSelected ? 600 : 400}
                        fill={isSelected ? "var(--text-primary)" : "var(--text-muted)"}
                      >
                        {axisLabel(bucket.month, previousLabelled(i))}
                      </text>
                    </>
                  ) : null}

                  {/* Cible de survol : toute la colonne, largeur du pas. */}
                  <rect
                    x={PAD.left + band * i}
                    y={PAD.top}
                    width={band}
                    height={plotH}
                    fill="transparent"
                    style={{ cursor: onSelect ? "pointer" : "default" }}
                    onMouseMove={(e) => {
                      setHovered(i);
                      showTip(i, e.clientX, e.currentTarget.ownerSVGElement!.getBoundingClientRect());
                    }}
                    onClick={() => onSelect?.(bucket.month)}
                  />
                </g>
              );
            })}
          </svg>
        ) : null}
        <ChartTooltip state={tip} width={width} />
      </div>

      {table ? <MonthsTable data={data} streams={visible} metric={metric} /> : null}
    </div>
  );
}

function MonthsTable({
  data,
  streams,
  metric,
}: {
  data: MonthBucket[];
  streams: Stream[];
  metric: Metric;
}) {
  return (
    <div id="stacked-table" className="mt-4 overflow-x-auto anim-fade">
      <table className="w-full text-[12px]">
        <thead>
          <tr style={{ color: "var(--text-muted)" }}>
            <th className="px-2 py-1.5 text-left font-medium">Mois</th>
            {streams.map((s) => (
              <th key={s.id} className="px-2 py-1.5 text-right font-medium">
                {s.name}
              </th>
            ))}
            <th className="px-2 py-1.5 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.map((b) => {
            const total = streams.reduce((s, st) => s + (b.byStream[st.id]?.[metric] ?? 0), 0);
            return (
              <tr key={b.month} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="px-2 py-1.5" style={{ color: "var(--text-secondary)" }}>
                  {monthLabel(b.month, "full")}
                </td>
                {streams.map((s) => (
                  <td key={s.id} className="tnum px-2 py-1.5 text-right" style={{ color: "var(--text-secondary)" }}>
                    {b.byStream[s.id]?.[metric] ? money(b.byStream[s.id][metric] as number) : "—"}
                  </td>
                ))}
                <td className="tnum px-2 py-1.5 text-right font-semibold">{money(total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export type { Totals };
