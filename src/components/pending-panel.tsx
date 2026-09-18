"use client";

import { useMemo, useState } from "react";
import { useStore } from "./store";
import { Card, Button, Delta } from "./ui/kit";
import { Icon } from "./ui/icons";
import { expectedOf, indexStreams } from "@/lib/analytics";
import { money, plural } from "@/lib/format";
import { dayLabel, daysBetween, monthLabel, today } from "@/lib/dates";
import type { Entry } from "@/lib/types";

/**
 * Les encaissements qui n'ont pas encore atterri.
 *
 * Deux listes seulement : ce qui devait déjà être arrivé (à confirmer
 * ou à relancer) et ce qui est attendu plus tard. La confirmation se
 * fait par lot — on ne coche pas quinze lignes une par une.
 */
export function PendingPanel() {
  const store = useStore();
  const { pending, streamById, settle } = store;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const index = useMemo(() => indexStreams(store.streams), [store.streams]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /**
   * La sélection effective est DÉRIVÉE de la liste courante, jamais
   * seulement stockée.
   *
   * Une écriture cochée puis encaissée ailleurs (depuis la page
   * Revenus, ou dans la feuille d'édition ouverte par-dessus ce
   * panneau) quitte `pending.entries` mais restait dans `selected` :
   * le bouton « Encaisser » la redatait alors une seconde fois, au
   * jour du clic, écrasant sa vraie date d'encaissement.
   */
  const live = useMemo(
    () => pending.entries.filter((e) => selected.has(e.id)),
    [pending.entries, selected],
  );
  const liveIds = useMemo(() => live.map((e) => e.id), [live]);
  const selectedAmount = useMemo(
    () => live.reduce((s, e) => s + e.gross_cents - e.fee_cents, 0),
    [live],
  );

  return (
    <Card
      title="En attente d'encaissement"
      action={
        liveIds.length > 0 ? (
          <Button
            size="sm"
            variant="primary"
            icon={<Icon.check size={14} />}
            onClick={async () => {
              await settle(liveIds, today());
              setSelected(new Set());
            }}
          >
            Encaisser {money(selectedAmount)}
          </Button>
        ) : pending.dueNow.length > 0 ? (
          <Button
            size="sm"
            variant="outline"
            icon={<Icon.check size={14} />}
            onClick={() => settle(pending.dueNow.map((e) => e.id), today())}
          >
            Tout confirmer ({pending.dueNow.length})
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Figure label="Total en attente" value={money(pending.total)} />
          <Figure
            label="À confirmer"
            value={money(pending.dueNowAmount)}
            hint={
              pending.dueNow.length > 0
                ? plural(pending.dueNow.length, "écriture", "écritures")
                : "Rien à valider"
            }
          />
          <Figure
            label="Attendu plus tard"
            value={money(pending.upcomingAmount)}
            hint={
              pending.upcomingByMonth.length > 0
                ? `dont ${money(pending.upcomingByMonth[0].amount)} en ${monthLabel(pending.upcomingByMonth[0].month)}`
                : undefined
            }
          />
        </div>

        {pending.dueNow.length > 0 ? (
          <Group
            title="Date prévue atteinte"
            detail="Coche ce qui est bien arrivé, ou confirme tout le lot."
            entries={pending.dueNow}
            selected={selected}
            onToggle={toggle}
            streamName={(e) => streamById[e.stream_id ?? ""]?.name ?? "Sans activité"}
            streamSlot={(e) => streamById[e.stream_id ?? ""]?.color_slot ?? 1}
            dateFor={(e) => expectedOf(e, index)}
            late
          />
        ) : null}

        {pending.upcoming.length > 0 ? (
          <Group
            title="Versements attendus"
            detail="Déjà vendu, l'argent n'est pas encore tombé."
            entries={pending.upcoming}
            selected={selected}
            onToggle={toggle}
            streamName={(e) => streamById[e.stream_id ?? ""]?.name ?? "Sans activité"}
            streamSlot={(e) => streamById[e.stream_id ?? ""]?.color_slot ?? 1}
            dateFor={(e) => expectedOf(e, index)}
          />
        ) : null}
      </div>
    </Card>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-[11.5px]" style={{ color: "var(--text-secondary)" }}>
        {label}
      </p>
      <p className="mt-0.5 text-[17px] font-semibold">{value}</p>
      {hint ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Group({
  title,
  detail,
  entries,
  selected,
  onToggle,
  streamName,
  streamSlot,
  dateFor,
  late = false,
}: {
  title: string;
  detail: string;
  entries: Entry[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  streamName: (e: Entry) => string;
  streamSlot: (e: Entry) => number;
  dateFor: (e: Entry) => string;
  late?: boolean;
}) {
  const store = useStore();

  return (
    <div>
      <div className="mb-2">
        <p className="text-[12.5px] font-semibold">{title}</p>
        <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          {detail}
        </p>
      </div>
      <ul className="flex flex-col">
        {entries.map((entry, i) => {
          const expected = dateFor(entry);
          const lateness = daysBetween(expected, today());
          const isChecked = selected.has(entry.id);
          return (
            <li
              key={entry.id}
              className="flex items-center gap-3 py-2"
              style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => onToggle(entry.id)}
                aria-label={`Sélectionner ${entry.label}`}
                className="h-4 w-4 shrink-0 accent-[var(--series-1)]"
              />
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: `var(--series-${streamSlot(entry)})` }}
              />
              <button
                type="button"
                onClick={() => store.openComposer({ ...entry, id: entry.id })}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-[13px] font-medium">{entry.label}</p>
                <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                  {streamName(entry)} · vendu le {dayLabel(entry.occurred_on)}
                </p>
              </button>
              <div className="shrink-0 text-right">
                <p className="tnum text-[13px] font-semibold">
                  {money(entry.gross_cents - entry.fee_cents)}
                </p>
                <p
                  className="text-[11px]"
                  style={{
                    color: late && lateness > 14 ? "var(--critical)" : "var(--text-muted)",
                  }}
                >
                  {late
                    ? lateness > 14
                      ? `${lateness} j de retard`
                      : `prévu le ${dayLabel(expected)}`
                    : `prévu le ${dayLabel(expected)}`}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export { Delta };
