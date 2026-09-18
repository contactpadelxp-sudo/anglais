"use client";

import { percent } from "@/lib/format";

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
