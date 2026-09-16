"use client";

import { useState } from "react";
import { money, percent } from "@/lib/format";
import { ChartTooltip, type TooltipState } from "./chart-kit";

export type Slice = { id: string; label: string; value: number; color: string };

function polar(cx: number, cy: number, r: number, angle: number) {
  const a = angle - Math.PI / 2;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function ring(cx: number, cy: number, outer: number, inner: number, from: number, to: number) {
  const large = to - from > Math.PI ? 1 : 0;
  const o1 = polar(cx, cy, outer, from);
  const o2 = polar(cx, cy, outer, to);
  const i1 = polar(cx, cy, inner, to);
  const i2 = polar(cx, cy, inner, from);
  return (
    `M${o1.x},${o1.y}` +
    `A${outer},${outer} 0 ${large} 1 ${o2.x},${o2.y}` +
    `L${i1.x},${i1.y}` +
    `A${inner},${inner} 0 ${large} 0 ${i2.x},${i2.y}Z`
  );
}

/**
 * Répartition du mois par activité.
 *
 * Le total tient au centre — c'est lui qu'on lit en premier — et chaque
 * part est doublée d'une valeur chiffrée dans la liste à côté : un
 * anneau seul ne permet pas de comparer deux parts proches.
 */
export function Donut({
  slices,
  size = 176,
  thickness = 26,
  centerLabel,
  onSelect,
  selected,
}: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  onSelect?: (id: string) => void;
  selected?: string | null;
}) {
  const [tip, setTip] = useState<TooltipState>(null);
  const [hover, setHover] = useState<string | null>(null);

  const positive = slices.filter((s) => s.value > 0);
  const total = positive.reduce((s, x) => s + x.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const outer = size / 2 - 2;
  const inner = outer - thickness;

  // Gap angulaire : l'équivalent circulaire des 2px de surface entre
  // deux segments qui se touchent.
  const gap = positive.length > 1 ? 0.028 : 0;

  // Décalages cumulés calculés d'avance : le rendu ne fait plus que
  // lire des valeurs, il ne mute rien.
  const offsets = positive.reduce<number[]>(
    (acc, slice) => [...acc, acc[acc.length - 1] + (slice.value / total) * Math.PI * 2],
    [0],
  );

  const arcs = positive.map((slice, i) => {
    const from = offsets[i] + gap / 2;
    const to = offsets[i + 1] - gap / 2;
    return { slice, from, to: Math.max(from + 0.002, to), share: slice.value / total };
  });

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {total > 0 ? (
        <svg
          width={size}
          height={size}
          role="img"
          aria-label="Répartition des revenus par activité"
          onMouseLeave={() => {
            setTip(null);
            setHover(null);
          }}
        >
          {arcs.map(({ slice, from, to, share }) => {
            const dim = (selected && selected !== slice.id) || (hover && hover !== slice.id);
            const lift = hover === slice.id ? 2 : 0;
            return (
              <path
                key={slice.id}
                d={ring(cx, cy, outer + lift, inner + lift / 2, from, to)}
                fill={slice.color}
                opacity={dim ? 0.35 : 1}
                style={{
                  transition: "opacity .15s, d .15s",
                  cursor: onSelect ? "pointer" : "default",
                }}
                onMouseMove={(e) => {
                  setHover(slice.id);
                  const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                  setTip({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                    title: slice.label,
                    rows: [
                      { label: "Montant", value: money(slice.value), color: slice.color },
                      { label: "Part du mois", value: percent(share), strong: false },
                    ],
                  });
                }}
                onClick={() => onSelect?.(slice.id)}
              />
            );
          })}
          <text
            x={cx}
            y={cy - 2}
            textAnchor="middle"
            className="tnum"
            fontSize={21}
            fontWeight={600}
            fill="var(--text-primary)"
          >
            {money(total)}
          </text>
          {centerLabel ? (
            <text x={cx} y={cy + 16} textAnchor="middle" fontSize={11} fill="var(--text-muted)">
              {centerLabel}
            </text>
          ) : null}
        </svg>
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-full border-2 border-dashed text-[12px]"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          Aucun revenu
        </div>
      )}
      <ChartTooltip state={tip} width={size} />
    </div>
  );
}
