"use client";

import type { Insight } from "@/lib/analytics";
import { Icon } from "./ui/icons";

const TONE = {
  good: { color: "var(--good)", glyph: Icon.up },
  warning: { color: "var(--warning)", glyph: Icon.alert },
  critical: { color: "var(--critical)", glyph: Icon.alert },
  neutral: { color: "var(--text-muted)", glyph: Icon.sparkle },
} as const;

/**
 * Les constats que l'app tire des chiffres.
 *
 * Chaque ligne porte une icône en plus de sa couleur : un état ne se
 * lit jamais à la teinte seule.
 */
export function InsightList({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) {
    return (
      <p className="py-6 text-center text-[12.5px]" style={{ color: "var(--text-muted)" }}>
        Ajoute quelques mois de revenus et les tendances apparaîtront ici.
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {insights.map((insight, i) => {
        const tone = TONE[insight.tone];
        const Glyph = tone.glyph;
        return (
          <li
            key={insight.id}
            className="flex gap-3 py-3"
            style={{
              borderTop: i === 0 ? "none" : "1px solid var(--border)",
            }}
          >
            <span className="mt-0.5 shrink-0" style={{ color: tone.color }}>
              <Glyph size={15} />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold leading-snug">{insight.title}</p>
              <p
                className="mt-0.5 text-[12px] leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {insight.detail}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
