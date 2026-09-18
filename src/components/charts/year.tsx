"use client";

import { money, moneyCompact } from "@/lib/format";
import { monthLabel, currentMonth, type MonthKey } from "@/lib/dates";

/* ===================================================================
   Le calendrier de l'année

   Il remplace une frise glissante de douze mois, et avec elle toute
   une classe de pièges : dans une frise ancrée sur le mois choisi,
   cliquer sur avril recadrait la fenêtre et faisait disparaître mai à
   septembre — plus rien à cliquer pour revenir. Ici avril est en
   deuxième rangée, première colonne. Il y sera toujours, aujourd'hui,
   dans six mois, et avec trois ans de données. Il n'y a plus de
   fenêtre à déplacer.

   Chaque case porte sa propre barre empilée par activité, toutes à la
   même échelle — le meilleur mois de l'année. La comparaison se fait
   donc entre cases, sans axe et sans lecture de chiffres.
   =================================================================== */

export type YearCell = {
  month: MonthKey;
  /** Le net réel du mois, charges comprises. C'est le nombre écrit. */
  total: number;
  /**
   * La somme des nets POSITIFS. C'est ce que la barre mesure, et la
   * somme exacte de ses segments : un mois avec une charge a un net
   * plus petit que ses segments, et mesurer la barre sur le net
   * donnerait une case dont la barre et le nombre ne disent pas la
   * même chose.
   */
  barTotal: number;
  segments: { id: string; label: string; value: number; color: string }[];
};

export function YearGrid({
  cells,
  selected,
  onSelect,
}: {
  cells: YearCell[];
  selected: MonthKey;
  onSelect: (m: MonthKey) => void;
}) {
  const now = currentMonth();
  // L'échelle se calcule sur `barTotal`, la somme des segments — pas
  // sur le net, qui peut être plus petit, voire négatif.
  const max = Math.max(...cells.map((c) => c.barTotal), 1);

  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
      {cells.map((cell) => {
        const isSelected = cell.month === selected;
        const isFuture = cell.month > now;
        const isNow = cell.month === now;

        return (
          <button
            key={cell.month}
            type="button"
            onClick={() => onSelect(cell.month)}
            aria-pressed={isSelected}
            aria-label={`${monthLabel(cell.month, "full")} : ${money(cell.total)}`}
            className="flex flex-col gap-1 rounded-[10px] px-2 py-1.5 text-left transition-colors"
            style={{
              background: isSelected ? "var(--surface-2)" : "transparent",
              // Le mois courant garde un contour même quand il n'est pas
              // choisi : c'est le repère depuis lequel on se déplace.
              boxShadow: isSelected
                ? "inset 0 0 0 1px var(--border)"
                : isNow
                  ? "inset 0 0 0 1px var(--grid)"
                  : "none",
              opacity: isFuture ? 0.4 : 1,
            }}
          >
            <span
              className="text-[10.5px] font-medium leading-none"
              style={{
                color: isSelected ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              {monthLabel(cell.month, "short")}
            </span>

            <span
              className="tnum text-[12px] font-semibold leading-none"
              style={{
                color:
                  cell.total > 0 ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              {cell.total > 0 ? moneyCompact(cell.total) : "—"}
            </span>

            {/* La barre est la seule chose à comparer d'une case à
                l'autre ; un mois vide garde son filet, sinon la grille
                paraît s'arrêter là où les revenus s'arrêtent. */}
            <span className="flex h-[7px] w-full gap-[2px] overflow-hidden rounded-full">
              {cell.barTotal > 0 && cell.segments.length > 0 ? (
                cell.segments.map((s) => (
                  <span
                    key={s.id}
                    // shrink-0 : sans lui, le mois le plus fort somme
                    // déjà 100 % de la barre, les écarts débordent, et
                    // flex comprime ses segments — l'échelle commune
                    // devient fausse précisément en haut de l'échelle.
                    className="h-full shrink-0"
                    style={{
                      // La place des écarts est retirée du TOTAL, puis
                      // la part s'applique à ce qui reste. Retrancher
                      // un nombre fixe de pixels à chaque segment
                      // écrasait les petits à zéro.
                      width: `calc((100% - ${(cell.segments.length - 1) * 2}px) * ${(
                        Math.max(0, s.value) / max
                      ).toFixed(4)})`,
                      minWidth: 2,
                      background: s.color,
                      borderRadius: 2,
                    }}
                  />
                ))
              ) : (
                <span
                  className="h-full w-full"
                  style={{
                    background: "var(--axis)",
                    opacity: 0.35,
                    borderRadius: 2,
                  }}
                />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
