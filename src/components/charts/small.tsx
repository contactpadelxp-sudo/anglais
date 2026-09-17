"use client";

import { useId, useState } from "react";
import { money, percent } from "@/lib/format";
import { monthLabel, MOIS_INITIALE, type MonthKey } from "@/lib/dates";
import { ChartTooltip, type TooltipState, smoothPath, useMeasure } from "./chart-kit";

/* ===================================================================
   Sparkline — 12 points, la période courante accentuée.
   Pas d'axe, pas d'info-bulle : elle donne une forme, la valeur exacte
   est juste à côté dans la tuile.
   =================================================================== */

export function Sparkline({
  values,
  width = 96,
  height = 28,
  color = "var(--series-1)",
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * (width - 6) + 3,
    y: height - 4 - ((v - min) / span) * (height - 8),
  }));
  const last = pts[pts.length - 1];

  return (
    <svg width={width} height={height} aria-hidden className="shrink-0 overflow-visible">
      <path
        d={smoothPath(pts)}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.55}
      />
      <circle cx={last.x} cy={last.y} r={3.5} fill={color} stroke="var(--surface-1)" strokeWidth={2} />
    </svg>
  );
}

/* ===================================================================
   Courbe de tuile — même forme, mais fluide.

   La variante à largeur fixe ne tient pas dans une tuile de tableau de
   bord : à 390 px, le nombre occupe déjà toute la ligne et la courbe
   débordait de la carte. Ici la courbe prend toute la largeur
   disponible, sous le chiffre, et se mesure au lieu de se deviner.
   =================================================================== */

export function SparkArea({
  values,
  height = 30,
  color = "var(--series-1)",
}: {
  values: number[];
  height?: number;
  color?: string;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const gradientId = useId();

  // Le conteneur est rendu dans tous les cas : c'est lui qui donne sa
  // largeur à la mesure, et la hauteur reste réservée pour que la
  // tuile ne saute pas d'un rendu à l'autre.
  const drawable = values.length > 1 && width > 24;

  let body = null;
  if (drawable) {
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const span = max - min || 1;
    const pad = 3;
    const pts = values.map((v, i) => ({
      x: (i / (values.length - 1)) * (width - pad * 2) + pad,
      y: height - 4 - ((v - min) / span) * (height - 9),
    }));
    const line = smoothPath(pts);
    const last = pts[pts.length - 1];
    body = (
      <svg width={width} height={height} aria-hidden>
        {/* Le lavis s'éteint vers le bas : un aplat à bord franc se lit
            comme un bloc posé dans la tuile, pas comme une courbe. */}
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.18} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path
          d={`${line} L${pts[pts.length - 1].x},${height} L${pts[0].x},${height} Z`}
          fill={`url(#${gradientId})`}
        />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.75}
        />
        <circle
          cx={last.x}
          cy={last.y}
          r={3}
          fill={color}
          stroke="var(--surface-1)"
          strokeWidth={2}
        />
      </svg>
    );
  }

  return (
    <div ref={ref} className="w-full min-w-0" style={{ height }}>
      {body}
    </div>
  );
}

/* ===================================================================
   Jauge d'objectif — la piste est un pas clair du même bleu que le
   remplissage, pour que l'état se lise sur toute la largeur.
   =================================================================== */

export function Meter({
  ratio,
  tone = "accent",
  height = 8,
}: {
  ratio: number;
  tone?: "accent" | "good" | "warning";
  height?: number;
}) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const fill =
    tone === "good" ? "var(--good)" : tone === "warning" ? "var(--warning)" : "var(--series-1)";
  const track =
    tone === "good"
      ? "color-mix(in oklab, var(--good) 22%, var(--surface-2))"
      : tone === "warning"
        ? "color-mix(in oklab, var(--warning) 22%, var(--surface-2))"
        : "var(--seq-100)";

  return (
    <div
      className="w-full overflow-hidden rounded-full"
      style={{ height, background: track }}
      role="progressbar"
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Progression vers l'objectif"
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${clamped * 100}%`, background: fill }}
      />
    </div>
  );
}

/* ===================================================================
   Barres classées — comparaison précise entre activités.
   Chaque barre porte sa valeur au bout : rien ne dépend du survol.
   =================================================================== */

export type RankedItem = { id: string; label: string; value: number; color: string; sub?: string };

export function RankedBars({
  items,
  onSelect,
  selected,
}: {
  items: RankedItem[];
  onSelect?: (id: string) => void;
  selected?: string | null;
}) {
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  const total = items.reduce((s, i) => s + Math.max(0, i.value), 0);

  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => {
        const dim = selected != null && selected !== item.id;
        const Row = onSelect ? "button" : "div";
        return (
          <li key={item.id}>
            <Row
              {...(onSelect ? { type: "button" as const, onClick: () => onSelect(item.id) } : {})}
              className="group w-full text-left transition-opacity"
              style={{ opacity: dim ? 0.45 : 1 }}
            >
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                    style={{ background: item.color }}
                  />
                  <span className="truncate text-[13px]" style={{ color: "var(--text-secondary)" }}>
                    {item.label}
                  </span>
                </span>
                <span className="flex shrink-0 items-baseline gap-2">
                  {total > 0 ? (
                    <span className="tnum text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {percent(Math.max(0, item.value) / total)}
                    </span>
                  ) : null}
                  <span className="tnum text-[13px] font-semibold">{money(item.value)}</span>
                </span>
              </div>
              <div
                className="h-1.5 w-full overflow-hidden rounded-full"
                style={{ background: "var(--surface-2)" }}
              >
                <div
                  className="grow-x h-full rounded-full"
                  style={{
                    width: `${(Math.abs(item.value) / max) * 100}%`,
                    background: item.color,
                  }}
                />
              </div>
              {item.sub ? (
                <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {item.sub}
                </div>
              ) : null}
            </Row>
          </li>
        );
      })}
    </ul>
  );
}

/* ===================================================================
   Carte de saisonnalité — années × mois, rampe bleue à teinte unique,
   du plus clair (proche de zéro) au plus foncé.
   =================================================================== */

const RAMP = ["var(--seq-100)", "var(--seq-250)", "var(--seq-400)", "var(--seq-550)", "var(--seq-700)"];

export function Heatmap({
  years,
  valueAt,
  onSelect,
}: {
  years: number[];
  valueAt: (month: MonthKey) => number;
  onSelect?: (month: MonthKey) => void;
}) {
  const [tip, setTip] = useState<TooltipState>(null);
  const cells = years.flatMap((y) =>
    Array.from({ length: 12 }, (_, m) => {
      const key = `${y}-${String(m + 1).padStart(2, "0")}`;
      return { year: y, m, key, value: valueAt(key) };
    }),
  );
  const max = Math.max(...cells.map((c) => c.value), 1);

  function shade(value: number) {
    if (value <= 0) return "var(--surface-2)";
    const idx = Math.min(RAMP.length - 1, Math.floor((value / max) * RAMP.length));
    return RAMP[idx];
  }

  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <table className="w-full border-separate" style={{ borderSpacing: "2px" }}>
          <thead>
            <tr>
              <th />
              {MOIS_INITIALE.map((m, i) => (
                <th
                  key={i}
                  className="pb-1 text-[10px] font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {years.map((year) => (
              <tr key={year}>
                <th
                  className="pr-2 text-right text-[11px] font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  {year}
                </th>
                {Array.from({ length: 12 }, (_, m) => {
                  const key = `${year}-${String(m + 1).padStart(2, "0")}`;
                  const value = valueAt(key);
                  return (
                    <td key={key} className="p-0">
                      <button
                        type="button"
                        className="block h-7 w-full min-w-[18px] rounded-[4px] transition-transform hover:scale-110"
                        style={{ background: shade(value) }}
                        aria-label={`${monthLabel(key, "full")} : ${money(value)}`}
                        onClick={() => onSelect?.(key)}
                        onMouseMove={(e) => {
                          const host = e.currentTarget.closest(".relative") as HTMLElement;
                          const rect = host.getBoundingClientRect();
                          setTip({
                            x: e.clientX - rect.left,
                            y: e.clientY - rect.top,
                            title: monthLabel(key, "full"),
                            rows: [{ label: "Revenu net", value: money(value) }],
                          });
                        }}
                        onMouseLeave={() => setTip(null)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Rien
        </span>
        {RAMP.map((c) => (
          <span key={c} className="h-3 w-6 rounded-[3px]" style={{ background: c }} />
        ))}
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {money(max)}
        </span>
      </div>
      <ChartTooltip state={tip} width={9999} />
    </div>
  );
}
