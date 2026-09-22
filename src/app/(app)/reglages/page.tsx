"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/components/store";
import { Button, Card, Field, Input, Segmented, Select, Sheet } from "@/components/ui/kit";
import { Icon, StreamIcon } from "@/components/ui/icons";
import { InstallHint } from "@/components/install-hint";
import { PasswordCard } from "@/components/password-card";
import { delayChecks } from "@/lib/analytics";
import { money, plural } from "@/lib/format";
import { today } from "@/lib/dates";
import type { Stream, StreamKind } from "@/lib/types";

const KINDS: { value: StreamKind; label: string; hint: string }[] = [
  { value: "resale", label: "Achat-revente", hint: "Taux de marge, coût d'achat, stock" },
  { value: "service", label: "Prestation", hint: "Montant moyen, clients, encours" },
  { value: "subscription", label: "Abonnement", hint: "Revenu récurrent mensuel" },
  { value: "benefit", label: "Allocation", hint: "Versement à date fixe" },
  { value: "other", label: "Autre", hint: "Suivi simple" },
];

export default function SettingsPage() {
  const store = useStore();
  const { streams, settings, entries } = store;
  const [editing, setEditing] = useState<Stream | null>(null);
  const [creating, setCreating] = useState(false);

  const checks = useMemo(() => delayChecks(entries, streams), [entries, streams]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[17px] font-semibold tracking-tight">Réglages</h1>

      {/* ---- Ajustements proposés par les données --------------------- */}
      {checks.length > 0 ? (
        <Card title="Délais mesurés">
          <p className="mb-3 text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
            Le délai réellement observé sur tes encaissements ne colle pas au réglage. Un délai
            juste rend les prévisions justes.
          </p>
          <ul className="flex flex-col gap-2">
            {checks.map((c) => (
              <li
                key={c.stream.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] px-3 py-2.5"
                style={{ background: "var(--surface-2)" }}
              >
                <span className="text-[12.5px]">
                  <strong>{c.stream.name}</strong>{" "}— réglé sur {c.configured} j, observé à{" "}
                  {c.observed} j sur {plural(c.sample, "encaissement", "encaissements")}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => store.updateStream(c.stream.id, { settlement_days: c.observed })}
                >
                  Ajuster à {c.observed} j
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* ---- Activités ------------------------------------------------- */}
      <Card
        title="Activités"
        action={
          <Button size="sm" icon={<Icon.plus size={14} />} onClick={() => setCreating(true)}>
            Nouvelle
          </Button>
        }
        padded={false}
      >
        <ul className="pb-2">
          {streams.map((stream) => {
            const used = entries.filter((e) => e.stream_id === stream.id).length;
            return (
              <li key={stream.id}>
                <button
                  type="button"
                  onClick={() => setEditing(stream)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-2)] sm:px-5"
                >
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
                    style={{ background: `var(--series-${stream.color_slot})`, color: "#fff" }}
                  >
                    <StreamIcon name={stream.icon} size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">
                      {stream.name}
                      {stream.archived ? (
                        <span className="ml-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                          archivée
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                      {KINDS.find((k) => k.value === stream.kind)?.label} ·{" "}
                      {stream.settlement_days === 0
                        ? "encaissement immédiat"
                        : `${stream.settlement_days} j de délai`}{" "}
                      · {plural(used, "écriture", "écritures")}
                    </p>
                  </div>
                  <Icon.right size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* ---- Préférences ----------------------------------------------- */}
      <Card title="Préférences">
        <div className="flex flex-col gap-4">
          <Field
            label="Base de calcul par défaut"
            hint="« Encaissé » compte l'argent au jour où il arrive. « Comptabilisé » le compte au jour de la vente."
          >
            <Segmented
              value={settings.default_basis}
              // Un seul appel : `setBasis` enregistre déjà le réglage.
              // Les deux ensemble écrivaient la même valeur deux fois.
              onChange={(v) => store.setBasis(v)}
              options={[
                { value: "cash", label: "Encaissé" },
                { value: "accrual", label: "Comptabilisé" },
              ]}
            />
          </Field>

        </div>
      </Card>

      <PasswordCard />
      <ExportCard />
      <InstallHint />

      {editing ? (
        <StreamSheet
          stream={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            void store.updateStream(editing.id, patch);
            setEditing(null);
          }}
          onDelete={() => {
            void store.removeStream(editing.id);
            setEditing(null);
          }}
          usage={entries.filter((e) => e.stream_id === editing.id).length}
        />
      ) : null}

      {creating ? (
        <CreateSheet
          onClose={() => setCreating(false)}
          usedSlots={streams.map((s) => s.color_slot)}
          onCreate={(name, kind, slot, days) => {
            void store.addStream(name, kind, slot, days);
            setCreating(false);
          }}
        />
      ) : null}
    </div>
  );
}

/* ===================================================================
   Export — les données t'appartiennent, elles doivent pouvoir sortir.
   =================================================================== */

function ExportCard() {
  const { entries, streamById } = useStore();

  const annees = useMemo(() => {
    const set = new Set<string>([today().slice(0, 4)]);
    for (const e of entries) set.add((e.received_on ?? e.occurred_on).slice(0, 4));
    return [...set].sort().reverse();
  }, [entries]);

  const [annee, setAnnee] = useState(() => today().slice(0, 4));

  function download(name: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Une ligne de CSV : point-virgule, guillemets doublés, BOM en tête. */
  function toCsv(header: string[], rows: (string | number)[][]) {
    const line = (cells: (string | number)[]) =>
      cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";");
    return `\ufeff${[line(header), ...rows.map(line)].join("\n")}`;
  }

  const duChoix = useMemo(
    () =>
      entries
        .filter((e) => (e.received_on ?? e.occurred_on).slice(0, 4) === annee)
        // Chronologique : un export qui change d'ordre à chaque
        // modification ne se compare pas d'une version à l'autre.
        .sort((a, b) =>
          (a.received_on ?? a.occurred_on).localeCompare(b.received_on ?? b.occurred_on),
        ),
    [entries, annee],
  );

  function csv() {
    const rows = duChoix.map((e) => [
      e.occurred_on,
      e.received_on ?? "",
      streamById[e.stream_id ?? ""]?.name ?? "",
      e.label,
      e.direction === "in" ? "revenu" : "charge",
      (e.gross_cents / 100).toFixed(2),
      (e.fee_cents / 100).toFixed(2),
      (e.cost_cents / 100).toFixed(2),
      ((e.gross_cents - e.fee_cents - e.cost_cents) / 100).toFixed(2),
      e.status,
      e.counterparty ?? "",
      e.notes ?? "",
    ]);
    download(
      `revenus-${annee}.csv`,
      toCsv(
        [
          "date_vente",
          "date_encaissement",
          "activite",
          "libelle",
          "sens",
          "brut",
          "frais",
          "cout",
          "net",
          "statut",
          "contrepartie",
          "note",
        ],
        rows,
      ),
      "text/csv;charset=utf-8",
    );
  }

  /*
   * Le total est celui des REVENUS encaissés : ni les charges, qui
   * sortent, ni les écritures annulées, qui ne comptent plus, ni les
   * ventes en attente, qui ne sont pas encore arrivées.
   */
  const encaisse = useMemo(
    () => duChoix.filter((e) => e.direction === "in" && e.status === "received"),
    [duChoix],
  );
  const total = encaisse.reduce((s, e) => s + e.gross_cents - e.fee_cents, 0);

  return (
    <Card
      title="Export"
      action={
        annees.length > 1 ? (
          <Segmented
            size="sm"
            label="Année"
            value={annee}
            onChange={setAnnee}
            options={annees.map((y) => ({ value: y, label: y }))}
          />
        ) : null
      }
    >
      <p className="text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
        {plural(encaisse.length, "revenu encaissé", "revenus encaissés")} en {annee}, soit{" "}
        {money(total)}{" "}
        net de frais. L&apos;export reprend toutes les écritures de l&apos;année, charges et
        écritures en attente comprises.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" icon={<Icon.download size={14} />} onClick={csv}>
          CSV de {annee}
        </Button>
        <Button
          size="sm"
          variant="outline"
          icon={<Icon.download size={14} />}
          onClick={() =>
            download(
              `sauvegarde-${today()}.json`,
              JSON.stringify(
                [...entries].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on)),
                null,
                2,
              ),
              "application/json",
            )
          }
        >
          Sauvegarde complète
        </Button>
      </div>

      <p className="mt-3 max-w-[72ch] text-[11.5px]" style={{ color: "var(--text-muted)" }}>
        Tes données t&apos;appartiennent et doivent pouvoir sortir. Le CSV s&apos;ouvre dans
        n&apos;importe quel tableur ; la sauvegarde JSON garde tout, dans la forme exacte où
        l&apos;app le stocke.
      </p>
    </Card>
  );
}

/* ===================================================================
   Édition d'une activité
   =================================================================== */

function StreamSheet({
  stream,
  onClose,
  onSave,
  onDelete,
  usage,
}: {
  stream: Stream;
  onClose: () => void;
  onSave: (patch: Partial<Stream>) => void;
  onDelete: () => void;
  usage: number;
}) {
  const [name, setName] = useState(stream.name);
  const [kind, setKind] = useState<StreamKind>(stream.kind);
  const [slot, setSlot] = useState(stream.color_slot);
  const [days, setDays] = useState(String(stream.settlement_days));
  const [auto, setAuto] = useState(stream.auto_settle);
  const [archived, setArchived] = useState(stream.archived);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Sheet
      open
      onClose={onClose}
      title={stream.name}
      footer={
        <>
          {confirmDelete ? (
            <>
              {/* Supprimer une activité emporte TOUTE sa comptabilité :
                  les encaissements partent avec elle, et avec eux le
                  chiffre d'affaires déjà déclaré à l'URSSAF. Archiver
                  la retire de la saisie sans toucher à l'historique —
                  c'est presque toujours ce qu'on veut. */}
              <span className="mr-auto text-[12px]" style={{ color: "var(--critical)" }}>
                {usage > 0
                  ? `${plural(usage, "écriture sera effacée", "écritures seront effacées")} — ton chiffre d'affaires déclaré avec.`
                  : "Confirmer la suppression ?"}
              </span>
              <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>
                Annuler
              </Button>
              {usage > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onSave({ archived: true });
                    onClose();
                  }}
                >
                  Archiver plutôt
                </Button>
              ) : null}
              <Button size="sm" variant="danger" onClick={onDelete}>
                Supprimer quand même
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
                Supprimer
              </Button>
              <div className="flex-1" />
              <Button
                variant="primary"
                onClick={() =>
                  onSave({
                    name: name.trim() || stream.name,
                    kind,
                    color_slot: slot,
                    settlement_days: Math.max(0, Math.min(365, Number(days) || 0)),
                    auto_settle: auto,
                    archived,
                  })
                }
              >
                Enregistrer
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nom">
          <Input data-autofocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field label="Type" hint={KINDS.find((k) => k.value === kind)?.hint}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as StreamKind)}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>

        <ColorPicker slot={slot} onChange={setSlot} />

        <Field
          label="Délai d'encaissement"
          hint="Nombre de jours entre la vente et le versement. Sert à calculer la date d'encaissement prévue."
        >
          <div className="flex items-center gap-2">
            <Input
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="max-w-[100px]"
            />
            <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              jours
            </span>
          </div>
        </Field>

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--series-1)]"
          />
          <span>
            <span className="block text-[13px] font-medium">Confirmer automatiquement</span>
            <span className="block text-[11.5px]" style={{ color: "var(--text-muted)" }}>
              À cocher quand le versement est fiable (Vinted, prélèvement, allocation). Sinon
              l&apos;encaissement attend ta validation.
            </span>
          </span>
        </label>

        {/* « archivée » s'affichait dans la liste sans qu'aucun écran ne
            permette de le devenir : le drapeau existait, le geste non. */}
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--series-1)]"
          />
          <span>
            <span className="block text-[13px] font-medium">Archiver</span>
            <span className="block text-[11.5px]" style={{ color: "var(--text-muted)" }}>
              L&apos;activité disparaît de la saisie et des filtres, mais ses écritures restent
              dans la comptabilité et dans les exports. C&apos;est ce qu&apos;on veut quand une
              activité s&apos;arrête — pas la supprimer.
            </span>
          </span>
        </label>
      </div>
    </Sheet>
  );
}

function CreateSheet({
  onClose,
  onCreate,
  usedSlots,
}: {
  onClose: () => void;
  onCreate: (name: string, kind: StreamKind, slot: number, days: number) => void;
  usedSlots: number[];
}) {
  const firstFree = [1, 2, 3, 4, 5, 6, 7, 8].find((s) => !usedSlots.includes(s)) ?? 1;
  const [name, setName] = useState("");
  const [kind, setKind] = useState<StreamKind>("other");
  const [slot, setSlot] = useState(firstFree);
  const [days, setDays] = useState("0");

  return (
    <Sheet
      open
      onClose={onClose}
      title="Nouvelle activité"
      footer={
        <>
          <div className="flex-1" />
          <Button
            variant="primary"
            disabled={!name.trim()}
            onClick={() => onCreate(name.trim(), kind, slot, Number(days) || 0)}
          >
            Créer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nom">
          <Input
            data-autofocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Photographie, dropshipping…"
          />
        </Field>
        <Field label="Type" hint={KINDS.find((k) => k.value === kind)?.hint}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as StreamKind)}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
<ColorPicker slot={slot} onChange={setSlot} />
        <Field label="Délai d'encaissement" hint="En jours. Zéro si l'argent arrive le jour même.">
          <Input
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="max-w-[100px]"
          />
        </Field>
      </div>
    </Sheet>
  );
}

/**
 * L'ordre des couleurs n'est pas cosmétique : il a été choisi pour que
 * deux activités voisines restent distinguables en cas de daltonisme.
 * On choisit donc parmi ces huit emplacements, on n'invente pas de teinte.
 */
function ColorPicker({ slot, onChange }: { slot: number; onChange: (s: number) => void }) {
  return (
    <Field label="Couleur">
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            aria-label={`Couleur ${s}`}
            aria-pressed={s === slot}
            className="flex h-8 w-8 items-center justify-center rounded-[10px] transition-transform"
            style={{
              background: `var(--series-${s})`,
              color: "#fff",
              outline: s === slot ? "2px solid var(--text-primary)" : "none",
              outlineOffset: 2,
            }}
          >
            {s === slot ? <Icon.check size={15} /> : null}
          </button>
        ))}
      </div>
    </Field>
  );
}
