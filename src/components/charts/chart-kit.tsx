"use client";

import { useLayoutEffect, useRef, useState } from "react";

/* ===================================================================
   Mesure du conteneur — les SVG sont rendus à la taille réelle plutôt
   qu'étirés par un viewBox, sinon le texte se déforme.
   =================================================================== */

export function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, width };
}

/* ===================================================================
   Échelles
   =================================================================== */

/**
 * Choisit un PAS rond, puis en déduit le sommet de l'axe.
 *
 * Arrondir le maximum ne suffit pas : un sommet à 5 000 divisé en
 * quatre donne 1 250 / 2 500 / 3 750, qu'aucun lecteur ne lit comme
 * des repères. On part donc du pas — 1, 2, 2,5 ou 5 fois une puissance
 * de dix — et toutes les graduations tombent juste.
 */
export function niceStep(range: number, target = 4): number {
  if (range <= 0) return 1;
  const rough = range / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/** Sommet de l'axe : le premier multiple du pas au-dessus de la valeur. */
export function niceMax(value: number, target = 4): number {
  if (value <= 0) return 100;
  const step = niceStep(value, target);
  return Math.ceil(value / step) * step;
}

export function ticksFor(max: number, target = 4): number[] {
  const step = niceStep(max, target);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
  return ticks;
}

/* ===================================================================
   Formes

   Une barre est arrondie du seul côté de la donnée et reste carrée sur
   la ligne de base : le rayon indique où se termine la valeur, il ne
   décore pas le socle.
   =================================================================== */

export function barPath(
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  side: "top" | "bottom" | "right" | "none" = "top",
) {
  const r = Math.max(0, Math.min(radius, h / 2, w / 2));
  if (h <= 0.5 || side === "none" || r === 0) {
    return `M${x},${y}h${w}v${h}h${-w}Z`;
  }
  if (side === "top") {
    return `M${x},${y + h}V${y + r}a${r},${r} 0 0 1 ${r},${-r}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}V${y + h}Z`;
  }
  if (side === "bottom") {
    return `M${x},${y}v${h - r}a${r},${r} 0 0 0 ${r},${r}h${w - 2 * r}a${r},${r} 0 0 0 ${r},${-r}V${y}Z`;
  }
  return `M${x},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}H${x}Z`;
}

/** Courbe lissée passant par tous les points (Catmull-Rom → Bézier). */
export function smoothPath(points: { x: number; y: number }[], tension = 0.32) {
  if (points.length === 0) return "";
  if (points.length < 3) {
    return points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join("");
  }
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    d +=
      `C${p1.x + ((p2.x - p0.x) * tension) / 3},${p1.y + ((p2.y - p0.y) * tension) / 3}` +
      ` ${p2.x - ((p3.x - p1.x) * tension) / 3},${p2.y - ((p3.y - p1.y) * tension) / 3}` +
      ` ${p2.x},${p2.y}`;
  }
  return d;
}

/* ===================================================================
   Info-bulle

   Elle enrichit la lecture, elle ne la conditionne jamais : toutes les
   valeurs qu'elle affiche sont aussi accessibles par les étiquettes
   directes et par la vue tableau.
   =================================================================== */

export type TooltipRow = {
  label: string;
  value: string;
  color?: string;
  strong?: boolean;
};

export type TooltipState = {
  x: number;
  y: number;
  title: string;
  rows: TooltipRow[];
  footer?: string;
} | null;

export function ChartTooltip({ state, width }: { state: TooltipState; width: number }) {
  if (!state) return null;
  const estimated = 190;
  // On bascule l'ancrage à gauche du curseur quand la bulle dépasserait.
  const flip = state.x + estimated + 16 > width;
  const left = flip ? state.x - estimated - 12 : state.x + 12;

  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 anim-fade"
      style={{
        left: Math.max(4, left),
        top: Math.max(4, state.y - 12),
        width: estimated,
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        boxShadow: "var(--shadow-pop)",
        padding: "10px 12px",
      }}
    >
      <div
        className="mb-2 text-[11px] font-medium uppercase tracking-wide"
        style={{ color: "var(--text-muted)" }}
      >
        {state.title}
      </div>
      <div className="flex flex-col gap-1.5">
        {state.rows.map((row, i) => (
          <div key={`${row.label}-${i}`} className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-center gap-1.5">
              {row.color ? (
                // Clé de série : un trait, pas un pavé. À cette densité
                // un carré plein pèse plus lourd que la donnée.
                <span
                  aria-hidden
                  className="h-0.5 w-3 shrink-0 rounded-full"
                  style={{ background: row.color }}
                />
              ) : null}
              <span
                className="truncate text-[12px]"
                style={{ color: "var(--text-secondary)" }}
              >
                {row.label}
              </span>
            </span>
            <span
              className="tnum shrink-0 text-[13px]"
              style={{
                color: "var(--text-primary)",
                fontWeight: row.strong === false ? 400 : 600,
              }}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
      {state.footer ? (
        <div
          className="mt-2 border-t pt-2 text-[11px]"
          style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}
        >
          {state.footer}
        </div>
      ) : null}
    </div>
  );
}

/* ===================================================================
   Légende — toujours présente dès deux séries, et cliquable :
   elle sert aussi de filtre.
   =================================================================== */

export type LegendItem = { id: string; label: string; color: string; value?: string };

export function Legend({
  items,
  active,
  onToggle,
}: {
  items: LegendItem[];
  active?: string | null;
  onToggle?: (id: string) => void;
}) {
  if (items.length < 2) return null;
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => {
        const dimmed = active != null && active !== item.id;
        const content = (
          <>
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ background: item.color }}
            />
            <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              {item.label}
            </span>
            {item.value ? (
              <span className="tnum text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>
                {item.value}
              </span>
            ) : null}
          </>
        );
        return (
          <li key={item.id}>
            {onToggle ? (
              <button
                type="button"
                onClick={() => onToggle(item.id)}
                className="flex items-center gap-1.5 rounded-full px-1.5 py-0.5 transition-opacity hover:opacity-100"
                style={{ opacity: dimmed ? 0.35 : 1 }}
                aria-pressed={active === item.id}
              >
                {content}
              </button>
            ) : (
              <span
                className="flex items-center gap-1.5 px-1.5 py-0.5"
                style={{ opacity: dimmed ? 0.35 : 1 }}
              >
                {content}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ===================================================================
   Vue tableau — le filet de sécurité. Trois couleurs de la palette
   passent sous 3:1 sur la surface claire ; la règle de compensation
   impose des étiquettes visibles ou un tableau. Il est ici.
   =================================================================== */

export function TableToggle({
  open,
  onToggle,
  id,
}: {
  open: boolean;
  onToggle: () => void;
  id: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={id}
      className="rounded-full px-2 py-1 text-[11px] font-medium transition-colors"
      style={{
        color: "var(--text-muted)",
        background: open ? "var(--surface-2)" : "transparent",
      }}
    >
      {open ? "Masquer le tableau" : "Voir le tableau"}
    </button>
  );
}
