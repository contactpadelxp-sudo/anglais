"use client";

import { useMemo, useState } from "react";
import { axisLabel, dayLabel, monthLabel, type DayKey, type MonthKey } from "@/lib/dates";
import { money, moneyCompact } from "@/lib/format";
import { barPath, niceMax, ticksFor, useMeasure } from "./chart-kit";

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
 * remontent d'un coup à cette date, sans dégressivité, et voir la
 * marche arriver vaut mieux que la découvrir sur un appel.
 *
 * Aucune valeur ne dépend du survol. Le détail d'un mois est ÉCRIT,
 * au-dessus du dessin, et le mois lu se choisit en touchant sa barre —
 * un geste qui existe sur iPhone, contrairement au survol. À
 * l'ouverture, c'est le dernier mois qui porte quelque chose : celui
 * qu'on vient regarder.
 */
export function MonthlyUrssaf({
  rows,
  acreEndsOn,
  selectedMonth,
  height = 230,
}: {
  rows: MonthlyRow[];
  acreEndsOn?: DayKey | null;
  /**
   * Le mois lu à l'ouverture. La page le passe pour que le graphe
   * s'accorde au mois choisi en en-tête, et le remonte par une clé
   * quand ce mois change — sinon un choix fait à la main ici
   * l'emporterait pour toujours sur l'en-tête.
   */
  selectedMonth?: MonthKey;
  height?: number;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();

  const defaut = useMemo(() => {
    if (selectedMonth) {
      const i = rows.findIndex((r) => r.month === selectedMonth);
      if (i >= 0) return i;
    }
    for (let i = rows.length - 1; i >= 0; i -= 1) if (rows[i].totalCents > 0) return i;
    return rows.length - 1;
  }, [rows, selectedMonth]);

  const [choisi, setChoisi] = useState<number | null>(null);
  // Un index mémorisé peut sortir de la liste quand l'année change :
  // on le borne au lieu de lire `undefined`.
  const index = Math.min(choisi ?? defaut, Math.max(0, rows.length - 1));
  const lu = rows[index];

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
    <div className="flex flex-col gap-2">
      {/* ---- Le mois lu, en toutes lettres --------------------------- */}
      {lu ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-[13px] font-semibold">{monthLabel(lu.month, "full")}</span>
            <span className="tnum text-[15px] font-semibold">{money(lu.totalCents)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {lu.segments
              .filter((s) => s.cents > 0)
              .map((s) => (
                <span
                  key={s.id}
                  className="flex items-center gap-1.5 text-[11.5px]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full"
                    style={{ background: s.color }}
                  />
                  {s.label}
                  <span className="tnum font-medium" style={{ color: "var(--text-primary)" }}>
                    {money(s.cents)}
                  </span>
                </span>
              ))}
            <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
              {lu.totalCents === 0
                ? "aucun encaissement"
                : lu.underAcre
                  ? "taux réduit par l'ACRE"
                  : acreEndsOn
                    ? `taux plein depuis le ${dayLabel(acreEndsOn)}`
                    : "taux plein"}
            </span>
          </div>
        </div>
      ) : null}

      <div ref={ref} className="relative" style={{ height }}>
        {width > 0 ? (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label="Cotisations dues mois par mois"
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
                <g key={row.month}>
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
                        d={barPath(
                          x,
                          top,
                          barW,
                          drawn,
                          4,
                          j === segments.length - 1 ? "top" : "none",
                        )}
                        fill={seg.color}
                      />
                    );
                  })}

                  {/* Le mois lu porte un trait sous sa barre — une marque
                      qui ne touche pas à la teinte des parts. */}
                  {i === index ? (
                    <rect
                      x={x}
                      y={PAD.top + plotH + 3}
                      width={barW}
                      height={2.5}
                      rx={1.25}
                      fill="var(--text-primary)"
                    />
                  ) : null}

                  {i % labelEvery === 0 || i === rows.length - 1 ? (
                    <text
                      x={Math.min(Math.max(cx, PAD.left + 12), width - PAD.right - 12)}
                      y={height - 8}
                      textAnchor="middle"
                      fontSize={10.5}
                      fontWeight={i === index ? 600 : 400}
                      fill={i === index ? "var(--text-primary)" : "var(--text-muted)"}
                    >
                      {axisLabel(row.month, rows[Math.max(0, i - labelEvery)]?.month)}
                    </text>
                  ) : null}

                  {/* Cible tactile : toute la colonne, du haut du cadre au
                      bas des étiquettes. */}
                  <rect
                    x={PAD.left + band * i}
                    y={PAD.top}
                    width={band}
                    height={plotH + PAD.bottom}
                    fill="transparent"
                    style={{ cursor: "pointer" }}
                    role="button"
                    tabIndex={0}
                    aria-label={`${monthLabel(row.month, "full")} : ${money(row.totalCents)}`}
                    onClick={() => setChoisi(i)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setChoisi(i);
                      }
                    }}
                  />
                </g>
              );
            })}
          </svg>
        ) : null}
      </div>
    </div>
  );
}
