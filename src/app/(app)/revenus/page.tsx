"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/components/store";
import { Button, Card, Empty, Input, Segmented } from "@/components/ui/kit";
import { Icon } from "@/components/ui/icons";
import { money, plural } from "@/lib/format";
import { dayLabel, monthLabel, monthOf, today, type DayKey } from "@/lib/dates";
import { dateOf, revenueOf, marginOf } from "@/lib/analytics";
import type { Entry } from "@/lib/types";

type Scope = "month" | "all";
type Kind = "all" | "in" | "out" | "pending" | "cancelled";

/**
 * Le journal des écritures.
 *
 * Les filtres sont sur une seule ligne, au-dessus de la liste, et
 * cadrent tout ce qui suit — y compris les totaux, pour qu'un chiffre
 * ne contredise jamais la liste qui le porte.
 */
export default function LedgerPage() {
  const store = useStore();
  const { entries, streamById, activeStreams, month, basis, openComposer } = store;

  const [scope, setScope] = useState<Scope>("month");
  const [kind, setKind] = useState<Kind>("all");
  const [stream, setStream] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const hasPending = useMemo(() => entries.some((e) => e.status === "pending"), [entries]);
  /*
   * Une écriture annulée disparaît de toutes les listes — c'est bien
   * ce qu'on veut, elle ne compte plus nulle part. Mais elle devenait
   * alors introuvable, et personne ne pouvait revenir sur le geste.
   * Le filtre n'apparaît que s'il y a quelque chose à montrer.
   */
  const hasCancelled = useMemo(
    () => entries.some((e) => e.status === "cancelled"),
    [entries],
  );

  /**
   * Le filtre « En attente » ne survit pas à la disparition de son
   * option : en confirmant la dernière écriture en attente depuis
   * cette page, la liste se vidait et plus aucun segment n'était
   * marqué actif — rien n'expliquait le vide.
   */
  const activeKind: Kind =
    (kind === "pending" && !hasPending) || (kind === "cancelled" && !hasCancelled)
      ? "all"
      : kind;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries
      .filter((e) => {
        // Les annulées ne se mélangent jamais aux autres : soit on les
        // regarde seules, soit on ne les voit pas.
        const annulee = e.status === "cancelled";
        if (annulee !== (activeKind === "cancelled")) return false;
        if (stream && e.stream_id !== stream) return false;
        if (activeKind === "in" && e.direction !== "in") return false;
        if (activeKind === "out" && e.direction !== "out") return false;
        if (activeKind === "pending" && e.status !== "pending") return false;
        if (scope === "month") {
          // Une écriture en attente n'a pas de date d'encaissement : on
          // la rattache au mois de sa vente pour qu'elle reste visible.
          const day = dateOf(e, basis) ?? e.occurred_on;
          if (monthOf(day) !== month) return false;
        }
        if (needle) {
          const hay = `${e.label} ${e.counterparty ?? ""} ${e.notes ?? ""} ${
            streamById[e.stream_id ?? ""]?.name ?? ""
          }`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const da = dateOf(a, basis) ?? a.occurred_on;
        const db = dateOf(b, basis) ?? b.occurred_on;
        return db.localeCompare(da);
      });
  }, [entries, stream, activeKind, scope, query, basis, month, streamById]);

  const grouped = useMemo(() => {
    const map = new Map<DayKey, Entry[]>();
    for (const e of filtered) {
      const day = dateOf(e, basis) ?? e.occurred_on;
      map.set(day, [...(map.get(day) ?? []), e]);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered, basis]);

  const totals = useMemo(() => {
    let income = 0;
    let charges = 0;
    let net = 0;
    for (const e of filtered) {
      if (e.direction === "out") {
        charges += e.gross_cents;
        net -= e.gross_cents;
      } else {
        income += revenueOf(e);
        net += marginOf(e);
      }
    }
    return { income, charges, net };
  }, [filtered]);

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Filtres : une ligne, au-dessus de tout ------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          size="sm"
          label="Période"
          value={scope}
          onChange={setScope}
          options={[
            { value: "month", label: monthLabel(month, "full") },
            { value: "all", label: "Tout" },
          ]}
        />
        <Segmented
          size="sm"
          label="Type"
          value={activeKind}
          onChange={setKind}
          options={[
            { value: "all", label: "Tout" },
            { value: "in", label: "Revenus" },
            { value: "out", label: "Charges" },
            // Un filtre qui ne peut rien filtrer n'a pas à occuper la
            // barre : il apparaît le jour où une écriture attend son
            // versement.
            ...(hasPending ? [{ value: "pending" as const, label: "En attente" }] : []),
            ...(hasCancelled ? [{ value: "cancelled" as const, label: "Annulées" }] : []),
          ]}
        />
        <div className="flex flex-wrap gap-1.5">
          {activeStreams.map((s) => {
            const active = stream === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStream(active ? null : s.id)}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-all"
                style={{
                  background: active ? `var(--series-${s.color_slot})` : "var(--surface-2)",
                  color: active ? "#fff" : "var(--text-secondary)",
                }}
              >
                {!active ? (
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: `var(--series-${s.color_slot})` }}
                  />
                ) : null}
                {s.name}
              </button>
            );
          })}
        </div>
        <div className="ml-auto w-full sm:w-[180px]">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher…"
            className="!py-1.5 !text-[12.5px]"
          />
        </div>
      </div>

      {/* ---- Totaux de la sélection ----------------------------------- */}
      <div className="grid grid-cols-3 gap-3">
        <Summary label="Encaissé" value={money(totals.income)} />
        <Summary label="Charges" value={money(totals.charges)} />
        <Summary label="Net" value={money(totals.net)} strong />
      </div>

      {/* ---- Liste ---------------------------------------------------- */}
      <Card
        title={plural(filtered.length, "écriture", "écritures")}
        action={
          <Button size="sm" icon={<Icon.plus size={14} />} onClick={() => openComposer()}>
            Ajouter
          </Button>
        }
        padded={false}
      >
        {grouped.length === 0 ? (
          <Empty
            title="Aucune écriture ne correspond"
            detail={
              scope === "month"
                ? "Élargis à « Tout », change de mois dans l'en-tête, ou ajoute un encaissement."
                : "Retire un filtre ou ajoute une écriture."
            }
            action={
              <Button
                variant="primary"
                icon={<Icon.plus size={16} />}
                onClick={() => openComposer()}
              >
                Ajouter un revenu
              </Button>
            }
          />
        ) : (
          <div className="pb-2">
            {grouped.map(([day, dayEntries]) => {
              const dayNet = dayEntries.reduce(
                (s, e) => s + (e.direction === "out" ? -e.gross_cents : marginOf(e)),
                0,
              );
              return (
                <div key={day}>
                  <div
                    className="sticky top-[56px] z-10 flex items-baseline justify-between px-4 py-1.5 backdrop-blur-sm sm:px-5"
                    style={{
                      background: "color-mix(in oklab, var(--surface-1) 90%, transparent)",
                      color: "var(--text-muted)",
                    }}
                  >
                    <span className="text-[11px] font-medium uppercase tracking-wide">
                      {dayLabel(day)}
                    </span>
                    <span className="tnum text-[11.5px] font-semibold">{money(dayNet)}</span>
                  </div>
                  <ul>
                    {dayEntries.map((entry) => (
                      <EntryRow key={entry.id} entry={entry} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function Summary({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="card p-3">
      <p className="text-[11.5px]" style={{ color: "var(--text-secondary)" }}>
        {label}
      </p>
      <p className={`tnum mt-0.5 ${strong ? "text-[18px] font-semibold" : "text-[16px] font-medium"}`}>
        {value}
      </p>
    </div>
  );
}

function EntryRow({ entry }: { entry: Entry }) {
  const { streamById, openComposer, settle } = useStore();
  const stream = streamById[entry.stream_id ?? ""];
  const isOut = entry.direction === "out";
  const amount = isOut ? -entry.gross_cents : revenueOf(entry);
  const margin = marginOf(entry);

  return (
    <li>
      <div className="group flex w-full items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--surface-2)] sm:px-5">
        <span
          aria-hidden
          className="h-7 w-1 shrink-0 rounded-full"
          style={{ background: stream ? `var(--series-${stream.color_slot})` : "var(--axis)" }}
        />
        <button
          type="button"
          onClick={() => openComposer({ ...entry, id: entry.id })}
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate text-[13.5px] font-medium">{entry.label}</p>
          <p className="truncate text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            {stream?.name ?? "Sans activité"}
            {entry.counterparty ? ` · ${entry.counterparty}` : ""}
            {entry.cost_cents > 0 ? ` · ${money(entry.cost_cents)} d'achat` : ""}
            {entry.status === "pending" ? " · en attente" : ""}
            {entry.status === "cancelled" ? " · annulée" : ""}
          </p>
        </button>

        {entry.status === "pending" ? (
          /* Toujours visible, jamais au survol : sur iPhone il n'y a
             pas de survol, et ce bouton était transparent en
             permanence — on ne pouvait le toucher qu'à l'aveugle.
             44 px de cible, comme partout ailleurs. */
          <button
            type="button"
            onClick={() => settle([entry.id], today())}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--surface-2)]"
            aria-label={`Marquer « ${entry.label || "cette écriture"} » comme encaissé aujourd'hui`}
            style={{ color: "var(--good)" }}
          >
            <Icon.check size={18} />
          </button>
        ) : null}

        <div className="shrink-0 text-right">
          <p
            className="tnum text-[13.5px] font-semibold"
            style={{ color: isOut ? "var(--critical)" : undefined }}
          >
            {money(amount)}
          </p>
          {entry.cost_cents > 0 && !isOut ? (
            <p className="tnum text-[11px]" style={{ color: "var(--text-muted)" }}>
              net {money(margin)}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}
