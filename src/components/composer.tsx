"use client";

import { useMemo, useRef, useState } from "react";
import { useStore } from "./store";
import { Button, Field, Input, Segmented, Sheet, inputStyle } from "./ui/kit";
import { Icon } from "./ui/icons";
import { centsToInput, money, parseMoney, percent } from "@/lib/format";
import { addDays, dayLabelShort, today } from "@/lib/dates";
import { CATEGORIES, provisionOn, type FiscalCategory } from "@/lib/fiscal";
import type { EntryDraft, PaymentMethod } from "@/lib/types";

/**
 * Modes de règlement. Le livre des recettes doit porter celui de
 * chaque ligne : sans lui, l'export n'est pas opposable en contrôle.
 */
const REGLEMENTS: { value: PaymentMethod; label: string }[] = [
  { value: "virement", label: "Virement" },
  { value: "plateforme", label: "Plateforme" },
  { value: "carte", label: "Carte" },
  { value: "especes", label: "Espèces" },
  { value: "cheque", label: "Chèque" },
  { value: "autre", label: "Autre" },
];

/**
 * Saisie d'un encaissement.
 *
 * Le chemin court tient en trois gestes : l'activité, le montant, on
 * valide. La date est aujourd'hui par défaut, parce qu'on saisit un
 * virement qu'on vient de recevoir. Tout le reste — coût, frais,
 * client, date de vente distincte — est replié : on ne le déplie que
 * quand on en a besoin.
 */
export function Composer({ initial }: { initial: EntryDraft }) {
  const store = useStore();
  const { closeComposer, saveEntry, activeStreams, streamById, removeEntry, entries } = store;

  // Le composant est remonté par une clé à chaque ouverture, donc ces
  // initialisateurs suffisent : aucun effet n'a à recopier la prop
  // dans l'état.
  const [draft, setDraft] = useState<EntryDraft | null>(initial);
  const [amount, setAmount] = useState(() => centsToInput(initial.gross_cents));
  const [cost, setCost] = useState(() => centsToInput(initial.cost_cents));
  const [fee, setFee] = useState(() => centsToInput(initial.fee_cents));
  const [more, setMore] = useState(() =>
    Boolean(
      initial.cost_cents ||
        initial.fee_cents ||
        initial.counterparty ||
        initial.notes ||
        initial.reference ||
        initial.occurred_on !== initial.received_on,
    ),
  );
  const [saving, setSaving] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  const existing = draft?.id ? entries.find((e) => e.id === draft.id) : null;
  const stream = draft?.stream_id ? streamById[draft.stream_id] : undefined;

  const patch = (p: Partial<EntryDraft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  /** Le net réellement gagné sur cette ligne, montré en direct. */
  const net = useMemo(() => {
    const gross = parseMoney(amount);
    return gross - parseMoney(fee) - parseMoney(cost);
  }, [amount, fee, cost]);

  if (!draft) return null;

  const isIncome = draft.direction === "in";
  const settled = draft.status === "received";

  /** Une date d'encaissement choisie implique que l'argent est arrivé. */
  function setReceivedOn(day: string | null) {
    if (day === null) {
      patch({
        status: "pending",
        received_on: null,
        expected_on: addDays(draft!.occurred_on, stream?.settlement_days ?? 0),
      });
    } else {
      patch({ status: "received", received_on: day, expected_on: day });
    }
  }

  /** Changer la date de vente recale la date d'encaissement prévue. */
  function setOccurredOn(day: string) {
    if (settled) patch({ occurred_on: day });
    else patch({ occurred_on: day, expected_on: addDays(day, stream?.settlement_days ?? 0) });
  }

  async function submit(andAnother: boolean) {
    if (!draft) return;
    const gross = parseMoney(amount);
    if (gross === 0) {
      amountRef.current?.focus();
      store.notify({ tone: "error", message: "Saisis un montant." });
      return;
    }
    setSaving(true);
    const ok = await saveEntry({
      ...draft,
      gross_cents: gross,
      cost_cents: parseMoney(cost),
      fee_cents: parseMoney(fee),
      label: draft.label.trim() || (stream?.name ?? "Revenu"),
    });
    setSaving(false);
    if (!ok) return;
    if (andAnother) {
      // On garde l'activité et la date, on vide le montant : la saisie
      // de plusieurs virements d'affilée ne repart pas de zéro.
      setAmount("");
      setCost("");
      setFee("");
      patch({ id: undefined, label: "", counterparty: null, notes: null });
      amountRef.current?.focus();
    } else {
      closeComposer();
    }
  }

  const quickDates = [
    { label: "Aujourd'hui", day: today() },
    { label: "Hier", day: addDays(today(), -1) },
    { label: dayLabelShort(addDays(today(), -2)), day: addDays(today(), -2) },
  ];

  /*
   * « Hier » ne déplaçait que la date d'encaissement : l'écriture
   * restait vendue AUJOURD'HUI et encaissée HIER, c'est-à-dire payée
   * avant d'avoir été vendue. Quand les deux dates sont confondues —
   * le cas de toutes les saisies rapides — le raccourci les déplace
   * ensemble. Si elles ont été séparées à la main, on n'y touche pas.
   */
  function setQuickDay(day: string) {
    const liees = draft!.occurred_on === draft!.received_on;
    if (liees) patch({ occurred_on: day, received_on: day, expected_on: day, status: "received" });
    else setReceivedOn(day);
  }

  /**
   * Ce qu'il faudra reverser sur cet encaissement, au taux réellement
   * dû ce jour-là. C'est la seule question qui se pose au moment où
   * l'argent arrive, et elle n'avait pas de réponse dans l'app.
   */
  const provision =
    isIncome && stream
      ? provisionOn(
          (stream.fiscal_category as FiscalCategory) in CATEGORIES
            ? (stream.fiscal_category as FiscalCategory)
            : "hors",
          draft.received_on ?? draft.expected_on ?? today(),
          parseMoney(amount),
          store.fiscal,
        )
      : { bps: 0, cents: 0 };

  return (
    <Sheet
      open
      onClose={closeComposer}
      title={draft.id ? "Modifier l'écriture" : isIncome ? "Ajouter un revenu" : "Ajouter une charge"}
      footer={
        <>
          {existing ? (
            <Button
              variant="danger"
              size="sm"
              icon={<Icon.trash size={15} />}
              onClick={async () => {
                await removeEntry(existing);
                closeComposer();
              }}
            >
              Supprimer
            </Button>
          ) : null}
          <div className="flex-1" />
          {!draft.id ? (
            <Button variant="outline" size="sm" disabled={saving} onClick={() => submit(true)}>
              Enregistrer et continuer
            </Button>
          ) : null}
          <Button variant="primary" disabled={saving} onClick={() => submit(false)}>
            {saving ? "…" : draft.id ? "Mettre à jour" : "Enregistrer"}
          </Button>
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-4">
        <Segmented
          label="Type d'écriture"
          value={draft.direction}
          onChange={(v) => patch({ direction: v })}
          options={[
            { value: "in", label: "Revenu" },
            { value: "out", label: "Charge" },
          ]}
        />

        {/* Activité — pastilles pleine largeur, plus rapide qu'un menu */}
        <Field label="Activité">
          <div className="flex flex-wrap gap-1.5">
            {activeStreams.map((s) => {
              const active = draft.stream_id === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() =>
                    setDraft((d) =>
                      d
                        ? {
                            ...d,
                            stream_id: s.id,
                            expected_on:
                              d.status === "received"
                                ? d.received_on
                                : addDays(d.occurred_on, s.settlement_days),
                          }
                        : d,
                    )
                  }
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-all"
                  style={{
                    background: active ? `var(--series-${s.color_slot})` : "var(--surface-2)",
                    color: active ? "#fff" : "var(--text-secondary)",
                  }}
                >
                  {!active ? (
                    <span
                      aria-hidden
                      className="h-2 w-2 rounded-full"
                      style={{ background: `var(--series-${s.color_slot})` }}
                    />
                  ) : (
                    <Icon.check size={13} />
                  )}
                  {s.name}
                </button>
              );
            })}
          </div>
        </Field>

        {/* Montant — le champ qui compte, en grand et pré-focalisé */}
        <Field label={isIncome ? "Montant encaissé" : "Montant de la charge"}>
          <div className="relative">
            <input
              ref={amountRef}
              data-autofocus
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit(false);
              }}
              placeholder="0"
              className="w-full min-w-0 px-3 py-3 pr-10 text-[26px] font-semibold outline-none transition-colors focus:border-[var(--border-strong)]"
              style={inputStyle}
            />
            <span
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[20px]"
              style={{ color: "var(--text-muted)" }}
            >
              €
            </span>
          </div>
        </Field>

        {/* Date d'encaissement */}
        <Field
          label={settled ? "Encaissé le" : "Encaissement prévu le"}
          hint={
            !settled && stream
              ? `Calculé depuis le délai habituel de ${stream.name} (${stream.settlement_days} j).`
              : undefined
          }
        >
          <div className="flex flex-wrap items-center gap-1.5">
            {settled
              ? quickDates.map((q) => (
                  <button
                    key={q.day}
                    type="button"
                    onClick={() => setQuickDay(q.day)}
                    className="rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors"
                    style={{
                      background:
                        draft.received_on === q.day ? "var(--text-primary)" : "var(--surface-2)",
                      color: draft.received_on === q.day ? "var(--surface-1)" : "var(--text-secondary)",
                    }}
                  >
                    {q.label}
                  </button>
                ))
              : null}
            <input
              type="date"
              value={(settled ? draft.received_on : draft.expected_on) ?? today()}
              onChange={(e) =>
                settled ? setReceivedOn(e.target.value) : patch({ expected_on: e.target.value })
              }
              className="min-w-0 max-w-full px-3 py-1.5 text-[12.5px] outline-none"
              style={inputStyle}
            />
          </div>
          <label className="mt-2 flex items-center gap-2 text-[12px]" style={{ color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={!settled}
              onChange={(e) => setReceivedOn(e.target.checked ? null : today())}
              className="h-4 w-4 accent-[var(--series-1)]"
            />
            Pas encore encaissé — à confirmer plus tard
          </label>
        </Field>

        <button
          type="button"
          onClick={() => setMore((m) => !m)}
          className="flex items-center gap-1 self-start text-[12px] font-medium"
          style={{ color: "var(--text-muted)" }}
        >
          {more ? <Icon.up size={13} /> : <Icon.down size={13} />}
          {more ? "Moins de détails" : "Plus de détails"}
        </button>

        {more ? (
          <div className="anim-fade flex min-w-0 flex-col gap-4">
            <Field label="Libellé" hint="Vide, il prend le nom de l'activité.">
              <Input
                value={draft.label}
                onChange={(e) => patch({ label: e.target.value })}
                placeholder={stream?.name ?? "Revenu"}
              />
            </Field>

            {isIncome ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Coût d'achat" hint="Prix payé pour l'article, sous-traitance.">
                  <Input
                    inputMode="decimal"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    placeholder="0"
                  />
                </Field>
                <Field label="Frais" hint="Commission, frais de port.">
                  <Input
                    inputMode="decimal"
                    value={fee}
                    onChange={(e) => setFee(e.target.value)}
                    placeholder="0"
                  />
                </Field>
              </div>
            ) : null}

            <Field
              label="Date de la vente"
              hint="À changer seulement si la vente date d'un autre mois que l'encaissement."
            >
              <Input
                type="date"
                value={draft.occurred_on}
                onChange={(e) => setOccurredOn(e.target.value)}
              />
            </Field>

            <Field
              label="Mode de règlement"
              hint="Mention obligatoire du livre des recettes."
            >
              <div className="flex flex-wrap gap-1.5">
                {REGLEMENTS.map((r) => {
                  const active = draft.payment_method === r.value;
                  return (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => patch({ payment_method: active ? null : r.value })}
                      className="rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors"
                      style={{
                        background: active ? "var(--text-primary)" : "var(--surface-2)",
                        color: active ? "var(--surface-1)" : "var(--text-secondary)",
                      }}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field
              label="Référence de la pièce"
              hint="Numéro de facture, de virement, de bordereau — ce qui permet de la retrouver."
            >
              <Input
                value={draft.reference ?? ""}
                onChange={(e) => patch({ reference: e.target.value || null })}
                placeholder="Facultatif"
              />
            </Field>

            <Field label="Client / contrepartie">
              <Input
                value={draft.counterparty ?? ""}
                onChange={(e) => patch({ counterparty: e.target.value || null })}
                placeholder="Facultatif"
              />
            </Field>

            <Field label="Note">
              <textarea
                value={draft.notes ?? ""}
                onChange={(e) => patch({ notes: e.target.value || null })}
                rows={2}
                placeholder="Facultatif"
                className="w-full min-w-0 resize-none px-3 py-2 text-[14px] outline-none"
                style={inputStyle}
              />
            </Field>
          </div>
        ) : null}

        {/* Récapitulatif : ce qui sera réellement compté */}
        {isIncome && (parseMoney(cost) > 0 || parseMoney(fee) > 0) ? (
          <div
            className="flex items-center justify-between rounded-[var(--radius-sm)] px-3 py-2.5 text-[12.5px]"
            style={{ background: "var(--surface-2)" }}
          >
            <span style={{ color: "var(--text-secondary)" }}>Net réellement gagné</span>
            <span className="tnum font-semibold">{money(net)}</span>
          </div>
        ) : null}

        {/* Ce qu'il faut garder de côté : la question du moment. */}
        {provision.cents > 0 ? (
          <div
            className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-[12.5px]"
            style={{ background: "color-mix(in oklab, var(--warning) 12%, var(--surface-2))" }}
          >
            <span style={{ color: "var(--text-secondary)" }}>
              À garder de côté ·{" "}
              <span className="tnum">{percent(provision.bps / 10_000, 2)}</span>
            </span>
            <span className="tnum font-semibold">{money(provision.cents)}</span>
          </div>
        ) : null}

        {/* Une écriture peut être annulée sans être effacée : une vente
            remboursée sort du chiffre d'affaires, mais sa trace reste.
            Le statut était filtré partout et écrit nulle part. */}
        {existing ? (
          <button
            type="button"
            onClick={() =>
              patch({ status: draft.status === "cancelled" ? "received" : "cancelled" })
            }
            className="self-start text-[12px] underline"
            style={{
              color: draft.status === "cancelled" ? "var(--critical)" : "var(--text-muted)",
            }}
          >
            {draft.status === "cancelled"
              ? "Écriture annulée — la remettre dans la comptabilité"
              : "Annuler cette écriture (la garder sans la compter)"}
          </button>
        ) : null}
      </div>
    </Sheet>
  );
}
