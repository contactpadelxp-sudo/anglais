"use client";

import { useState } from "react";
import { money, moneyCompact, percent } from "@/lib/format";
import {
  MOIS_INITIALE,
  daysInMonth,
  monthIndex,
  monthLabel,
  today,
  type MonthKey,
} from "@/lib/dates";
import { ChartTooltip, type TooltipState, barPath, useMeasure } from "./chart-kit";

/* ===================================================================
   Anneau d'objectif

   Une barre de progression dit « où j'en suis » ; un anneau le dit de
   plus loin, et tient dans le coin d'une carte sans voler une ligne au
   chiffre. Sans objectif défini, l'anneau reste en pointillés : la
   place est réservée, l'invitation est visible, rien ne bouge le jour
   où un objectif est posé.
   =================================================================== */

export function GoalRing({
  ratio,
  reached = false,
  className = "h-[82px] w-[82px] sm:h-[104px] sm:w-[104px]",
  onClick,
}: {
  ratio: number | null;
  reached?: boolean;
  /** La taille vient des classes : l'anneau se dessine en coordonnées
      relatives, il n'a pas besoin de connaître ses pixels. */
  className?: string;
  onClick?: () => void;
}) {
  const S = 100;
  const stroke = 10;
  const r = (S - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = ratio === null ? 0 : Math.max(0, Math.min(1, ratio));
  const color = reached ? "var(--good)" : clamped > 0.55 ? "var(--series-1)" : "var(--warning)";

  const Root = onClick ? "button" : "div";

  return (
    <Root
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`relative shrink-0 ${className}`}
      aria-label={ratio === null ? "Définir un objectif" : `${percent(ratio)} de l'objectif`}
    >
      <svg viewBox={`0 0 ${S} ${S}`} className="h-full w-full" aria-hidden>
        <circle
          cx={S / 2}
          cy={S / 2}
          r={r}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth={stroke}
          strokeDasharray={ratio === null ? "3 7" : undefined}
          strokeLinecap="round"
        />
        {ratio !== null ? (
          <circle
            cx={S / 2}
            cy={S / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - clamped)}
            transform={`rotate(-90 ${S / 2} ${S / 2})`}
            style={{ transition: "stroke-dashoffset .5s cubic-bezier(.22,1,.36,1)" }}
          />
        ) : null}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        {ratio === null ? (
          <span
            className="px-2 text-center text-[10.5px] font-medium leading-tight sm:text-[12px]"
            style={{ color: "var(--text-secondary)" }}
          >
            Définir un objectif
          </span>
        ) : (
          <>
            <span className="tnum text-[16px] font-semibold leading-none sm:text-[20px]">
              {percent(ratio)}
            </span>
            <span
              className="mt-0.5 text-[9.5px] sm:text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              de l&apos;objectif
            </span>
          </>
        )}
      </span>
    </Root>
  );
}

/* ===================================================================
   Barres mensuelles du chiffre de tête

   Une courbe lisse ment sur des données creuses : entre deux mois
   renseignés, elle dessine une pente qui n'a jamais existé. Des barres
   disent la même chose sans rien inventer, et chacune est un bouton —
   le mois se change ici autant que dans l'en-tête.
   =================================================================== */

export function MonthBars({
  months,
  values,
  selected,
  onSelect,
  height,
  color = "var(--series-1)",
}: {
  months: MonthKey[];
  values: number[];
  selected?: MonthKey;
  onSelect?: (m: MonthKey) => void;
  height?: number;
  color?: string;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [tip, setTip] = useState<TooltipState>(null);

  // La hauteur suit la largeur disponible : douze barres de 56 px
  // perdues dans une carte de 1 200 px ne ressemblent à rien, et la
  // même hauteur remplit correctement un téléphone.
  const H = height ?? (width > 620 ? 118 : 84);
  const labelRoom = 16;
  const plot = H - labelRoom;
  const max = Math.max(...values, 1);
  const slot = months.length > 0 ? width / months.length : 0;
  const bw = Math.min(26, Math.max(4, slot - 6));

  return (
    <div ref={ref} className="relative w-full" style={{ height: H }}>
      {width > 0 ? (
        <svg width={width} height={H} aria-hidden>
          {months.map((m, i) => {
            const v = values[i] ?? 0;
            // Un mois vide garde un trait : sans lui, le graphique
            // semble s'arrêter là où les revenus s'arrêtent.
            const h = v > 0 ? Math.max(3, (v / max) * (plot - 6)) : 2;
            const x = slot * i + (slot - bw) / 2;
            const isSel = m === selected;
            return (
              <g key={m}>
                <rect
                  x={slot * i}
                  y={0}
                  width={slot}
                  height={H}
                  fill="transparent"
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                    setTip({
                      x: e.clientX - rect.left,
                      y: 0,
                      title: monthLabel(m, "full"),
                      rows: [{ label: "Net", value: money(v), color }],
                    });
                  }}
                  onMouseLeave={() => setTip(null)}
                  onClick={() => onSelect?.(m)}
                  style={{ cursor: onSelect ? "pointer" : "default" }}
                />
                <path
                  d={barPath(x, plot - h, bw, h, Math.min(4, bw / 2))}
                  fill={v > 0 ? color : "var(--axis)"}
                  opacity={v > 0 ? (isSel ? 1 : 0.7) : 0.55}
                  pointerEvents="none"
                />
                <text
                  x={slot * i + slot / 2}
                  y={H - 4}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={isSel ? 600 : 400}
                  fill={isSel ? "var(--text-primary)" : "var(--text-muted)"}
                  pointerEvents="none"
                >
                  {MOIS_INITIALE[monthIndex(m)]}
                </text>
              </g>
            );
          })}
        </svg>
      ) : null}
      <ChartTooltip state={tip} width={width} />
    </div>
  );
}

/* ===================================================================
   Rythme du mois

   Le total d'un mois ne dit pas comment il s'est construit : quatre
   virements réguliers et une seule grosse rentrée donnent le même
   chiffre et n'annoncent pas la même chose pour le mois suivant.
   =================================================================== */

export function DayRhythm({
  month,
  amounts,
  height,
  color = "var(--series-1)",
}: {
  month: MonthKey;
  /** Montant net encaissé, indexé par jour − 1. */
  amounts: number[];
  height?: number;
  color?: string;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [tip, setTip] = useState<TooltipState>(null);

  const H = height ?? (width > 620 ? 140 : 100);
  const n = daysInMonth(month);
  const labelRoom = 15;
  const plot = H - labelRoom;
  const max = Math.max(...amounts, 1);
  const slot = width / n;
  const bw = Math.max(3, slot - 2);
  const todayKey = today();
  const currentDay = todayKey.slice(0, 7) === month ? Number(todayKey.slice(8, 10)) : null;

  return (
    <div ref={ref} className="relative w-full" style={{ height: H }}>
      {width > 0 ? (
        <svg width={width} height={H} aria-hidden>
          {Array.from({ length: n }, (_, i) => {
            const v = amounts[i] ?? 0;
            const h = v > 0 ? Math.max(3, (v / max) * (plot - 4)) : 2;
            const x = slot * i + (slot - bw) / 2;
            const isToday = currentDay === i + 1;
            return (
              <g key={i}>
                <path
                  d={barPath(x, plot - h, bw, h, Math.min(3, bw / 2))}
                  fill={v > 0 ? color : "var(--axis)"}
                  opacity={v > 0 ? 0.9 : 0.5}
                />
                {isToday ? (
                  <circle cx={x + bw / 2} cy={plot + 5} r={1.8} fill="var(--text-primary)" />
                ) : null}
                <rect
                  x={slot * i}
                  y={0}
                  width={slot}
                  height={plot}
                  fill="transparent"
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                    setTip({
                      x: e.clientX - rect.left,
                      y: 0,
                      title: `${i + 1} ${monthLabel(month)}`,
                      rows: [{ label: "Encaissé", value: money(v), color }],
                    });
                  }}
                  onMouseLeave={() => setTip(null)}
                />
              </g>
            );
          })}
          {[1, 10, 20, n].map((d) => (
            <text
              key={d}
              x={slot * (d - 1) + slot / 2}
              y={H - 3}
              textAnchor={d === 1 ? "start" : d === n ? "end" : "middle"}
              fontSize={10}
              fill="var(--text-muted)"
            >
              {d}
            </text>
          ))}
        </svg>
      ) : null}
      <ChartTooltip state={tip} width={width} />
    </div>
  );
}

/* ===================================================================
   Répartition en une ligne

   Le camembert compare des angles, ce qui demande de la place ; le
   ruban se lit de gauche à droite et tient en 16 px de haut. Les deux
   coexistent dans l'app parce qu'ils répondent sur des périodes
   différentes — le mois pour l'un, l'année pour l'autre.
   =================================================================== */

export type Slice = { id: string; label: string; value: number; color: string };

export function ShareBar({
  slices,
  selected,
  onSelect,
  height = 16,
}: {
  slices: Slice[];
  selected?: string | null;
  onSelect?: (id: string) => void;
  height?: number;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return null;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex w-full gap-[2px] overflow-hidden" style={{ height }}>
        {slices.map((s, i) => {
          const share = s.value / total;
          const dim = selected !== null && selected !== undefined && selected !== s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect?.(s.id)}
              title={`${s.label} — ${money(s.value)} (${percent(share)})`}
              aria-label={`${s.label} : ${money(s.value)}, ${percent(share)} du mois`}
              className="h-full transition-opacity"
              style={{
                // Une part minuscule doit rester visible et cliquable.
                width: `max(${(share * 100).toFixed(2)}%, 10px)`,
                background: s.color,
                opacity: dim ? 0.35 : 1,
                borderRadius:
                  i === 0
                    ? "999px 3px 3px 999px"
                    : i === slices.length - 1
                      ? "3px 999px 999px 3px"
                      : "3px",
              }}
            />
          );
        })}
      </div>

      <ShareLegend slices={slices} selected={selected} onSelect={onSelect} compact />
    </div>
  );
}

/**
 * Légende chiffrée. Elle remplace une liste de barres classées : les
 * mêmes noms, les mêmes montants, la même part — mais sans redessiner
 * une troisième fois la répartition déjà lisible à côté.
 */
export function ShareLegend({
  slices,
  selected,
  onSelect,
  compact = false,
}: {
  slices: Slice[];
  selected?: string | null;
  onSelect?: (id: string) => void;
  compact?: boolean;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return null;

  if (compact) {
    return (
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {slices.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect?.(s.id)}
            className="flex items-center gap-1.5 text-[11.5px] transition-opacity"
            style={{ opacity: selected && selected !== s.id ? 0.5 : 1 }}
          >
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: s.color }}
            />
            <span style={{ color: "var(--text-secondary)" }}>{s.label}</span>
            <span className="tnum font-semibold">{moneyCompact(s.value)}</span>
            <span className="tnum" style={{ color: "var(--text-muted)" }}>
              {percent(s.value / total)}
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col">
      {slices.map((s, i) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSelect?.(s.id)}
          className="flex w-full items-center gap-2.5 py-2 text-left transition-opacity"
          style={{
            opacity: selected && selected !== s.id ? 0.45 : 1,
            borderTop: i > 0 ? "1px solid var(--border)" : undefined,
          }}
        >
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: s.color }}
          />
          <span className="min-w-0 flex-1 truncate text-[13px]">{s.label}</span>
          <span className="tnum text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            {percent(s.value / total)}
          </span>
          <span className="tnum text-[13px] font-semibold">{money(s.value)}</span>
        </button>
      ))}
    </div>
  );
}
